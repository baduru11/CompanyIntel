# backend/nodes/profiler.py
from __future__ import annotations
import httpx
from backend.models import RawCompanySignal, CompanyProfile
from backend.config import get_llm

EXTRACTION_PROMPT = """Extract structured company data from these sources.
Only include information explicitly present in the source text.
If data is missing, leave the field as null. Never guess or infer.
For each field you populate, set the corresponding source_url to where you found it."""


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
    structured_llm = llm.with_structured_output(CompanyProfile)

    grouped = _group_signals_by_company(signals)
    profiles: list[CompanyProfile] = []

    for company_key, company_signals in grouped.items():
        snippets = "\n\n".join(
            f"Source: {s.url}\n{s.snippet}" for s in company_signals
        )

        extra_content = ""
        if mode == "deep_dive":
            urls = list({s.url for s in company_signals})[:3]
            for url in urls:
                page = crawl_page(url)
                if page:
                    extra_content += f"\n\n--- Full page: {url} ---\n{page[:3000]}"

        combined = f"{snippets}{extra_content}"

        try:
            result = structured_llm.invoke([
                {"role": "system", "content": EXTRACTION_PROMPT},
                {"role": "user", "content": f"Extract company profile from:\n\n{combined}"}
            ])
            profiles.append(result)
        except Exception:
            profiles.append(CompanyProfile(
                name=company_signals[0].company_name,
                raw_sources=[s.url for s in company_signals],
            ))

    return {"company_profiles": profiles}
