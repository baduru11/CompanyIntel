# backend/nodes/profiler.py
from __future__ import annotations
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
import httpx
from langchain_core.messages import SystemMessage, HumanMessage
from backend.models import RawCompanySignal, CompanyProfile
from backend.config import get_llm, invoke_structured

logger = logging.getLogger(__name__)

EXTRACTION_PROMPT = """Extract structured company data from the provided sources.
Only include information explicitly stated in the source text. Never guess or infer.

You MUST attempt to extract ALL of the following fields:

CORE FIELDS:
- name: The company's official name
- description: A 2-3 sentence summary of what the company does
- website: The company's primary website URL
- linkedin_url: The company's LinkedIn profile URL (e.g. "https://linkedin.com/company/...")
  IMPORTANT: Search carefully for LinkedIn URLs in the source text. Look for patterns like
  "linkedin.com/company/" or "linkedin.com/in/".
- crunchbase_url: The company's Crunchbase page URL (e.g. "https://crunchbase.com/organization/...")
- funding_total: Total funding raised (e.g. "$1.2B", "$50M"). Set funding_source_url too.
- funding_stage: Current stage (e.g. "Series B", "IPO / Public", "Seed").
  Set funding_stage_source_url too.
- key_investors: List of investor names (e.g. ["Sequoia Capital", "a16z"])
- founding_year: Year founded as integer (e.g. 2018). Set founding_year_source_url too.
  IMPORTANT: Also look for the month of founding. If found, note it in the description
  or in a format like "Founded in March 2018" somewhere in the data you extract.
- headcount_estimate: Approximate employees as string (e.g. "~500", "200-300")
- headquarters: City and region (e.g. "San Francisco, California")
- core_product: Main product or service (1-2 sentences)
- core_technology: Key technology used or developed (1-2 sentences)
- sub_sector: The company's specific sub-sector within its industry
- raw_sources: List of all source URLs used

PEOPLE (key_people): List of dicts with:
  - "name", "title", "background" (career history, prior roles)
  - "linkedin_url": CRITICAL — always include if found. Look for "linkedin.com/in/" patterns.
  - Prior exits/acquisitions, domain expertise years, and notable affiliations.
  Example: [{"name": "Jane Doe", "title": "CEO", "background": "Previously VP at Google",
             "linkedin_url": "https://linkedin.com/in/janedoe"}]

NEWS (recent_news): List of dicts with "title", "date", "snippet"
  IMPORTANT: Use ISO-like date format (YYYY-MM-DD or YYYY-MM). Sort by date descending (newest first).
  Example: [{"title": "Company raises $50M", "date": "2024-03-15", "snippet": "..."}]

COMPETITOR ANALYSIS (competitors_mentioned): List of dicts with:
  - "name": competitor company name
  - "description": what the competitor does (1-2 sentences)
  - "funding": their funding if mentioned — CRITICAL: always include if mentioned in any source
  - "funding_stage": their funding stage if mentioned
  - "differentiator": how they differ from the target company
  - "overlap": where they compete/overlap with the target company
  - "website": competitor's website URL if found
  Example: [{"name": "Rival Inc", "description": "AI chip maker",
             "funding": "$200M Series C", "funding_stage": "Series C",
             "differentiator": "Focused on edge devices", "overlap": "Both target ML inference",
             "website": "https://rival.com"}]

DUE DILIGENCE FIELDS:
- market_tam: Total addressable market size if mentioned (e.g. "$50B by 2030"). Set market_tam_source_url.
- business_model: How the company makes money (e.g. "SaaS subscription", "hardware sales + licensing")
- revenue_indicators: Any revenue signals (ARR, MRR, revenue growth, customer count, contract values)
- customer_signals: Customer names, testimonials, case studies, or adoption metrics mentioned
- competitive_advantages: Moat, IP, patents, network effects, switching costs mentioned
- regulatory_environment: Any regulatory risks, compliance requirements, or legal issues mentioned

If a field's data is not in the sources, leave it null or empty. For each factual field
you populate, set the corresponding source_url field to where you found it."""


def crawl_page(url: str, timeout: float = 30.0) -> str | None:
    """Extract page content using Crawl4AI, fallback to Jina Reader."""
    try:
        from crawl4ai import WebCrawler
        crawler = WebCrawler()
        result = crawler.run(url=url)
        if result and result.markdown:
            return result.markdown
    except Exception:
        pass

    # Fallback: Jina Reader
    try:
        jina_url = f"https://r.jina.ai/{url}"
        resp = httpx.get(jina_url, timeout=timeout, follow_redirects=True)
        if resp.status_code == 200 and len(resp.text) > 100:
            return resp.text
    except Exception:
        pass

    return None


def _group_signals_by_company(signals: list[RawCompanySignal]) -> dict[str, list[RawCompanySignal]]:
    """Group raw signals by normalized company name (case-insensitive, stripped)."""
    groups: dict[str, list[RawCompanySignal]] = {}
    for s in signals:
        key = s.company_name.strip().lower()
        groups.setdefault(key, []).append(s)
    return groups


def profile(state: dict) -> dict:
    """Profile node: extract structured CompanyProfile objects from raw signals.

    - Explore mode: Lightweight profiling using Tavily snippets only (no Crawl4AI).
    - Deep Dive mode: Full extraction using Crawl4AI (primary) -> Jina Reader (fallback)
      -> Tavily snippets (last resort).
    """
    mode = state["mode"]
    signals = state["raw_signals"]
    llm = get_llm()

    grouped = _group_signals_by_company(signals)
    profiles: list[CompanyProfile] = []

    for company_key, company_signals in grouped.items():
        snippets = "\n\n".join(
            f"Source: {s.url}\n{s.snippet}" for s in company_signals
        )

        extra_content = ""
        if mode == "deep_dive":
            urls = list({s.url for s in company_signals})[:3]

            with ThreadPoolExecutor(max_workers=5) as pool:
                future_to_url = {pool.submit(crawl_page, url): url for url in urls}
                for future in as_completed(future_to_url):
                    url = future_to_url[future]
                    try:
                        page = future.result()
                        if page:
                            extra_content += f"\n\n--- Full page: {url} ---\n{page[:3000]}"
                    except Exception as exc:
                        logger.warning("Crawl failed for %s: %s", url, exc)

        combined = f"{snippets}{extra_content}"

        try:
            result = invoke_structured(llm, CompanyProfile, [
                SystemMessage(content=EXTRACTION_PROMPT),
                HumanMessage(content=f"Extract company profile from:\n\n{combined}")
            ])
            # LLM may return empty name — fill from signal data
            if not result.name:
                result.name = company_signals[0].company_name
            profiles.append(result)
        except Exception as exc:
            logger.warning("LLM extraction failed for company=%s: %s", company_key, exc)
            profiles.append(CompanyProfile(
                name=company_signals[0].company_name,
                raw_sources=[s.url for s in company_signals],
            ))

    return {"company_profiles": profiles}
