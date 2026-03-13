# Pipeline Optimization & Quality Fixes Implementation Plan

> **Status: COMPLETED** (2026-03-13) — All 12 tasks implemented, 189 tests passing, frontend builds clean.

**Goal:** Cut deep-dive pipeline from ~58min/264K tokens to ~12-15min/60-80K tokens, and fix 9 data quality + UI bugs.

**Architecture:** Kill retry loop (linear pipeline), parallelize synthesis into per-section LLM calls, pass structured arrays from profiler directly to report. Frontend: add markdown rendering, clickable citations, company logos, news sorting, funding dedup.

**Tech Stack:** Python/LangGraph (backend), React/Tailwind (frontend), html2pdf.js (PDF), react-markdown (new dep for markdown rendering), Clearbit/Google favicon APIs (logos).

---

## Workstream A: Pipeline Optimization

### Task 1: Kill Retry Loop — Make Pipeline Linear

**Files:**
- Modify: `backend/graph.py:49-81`
- Modify: `backend/nodes/critic.py:39-78`
- Modify: `backend/nodes/planner.py:51-56`
- Modify: `backend/models.py:199-201`
- Modify: `backend/main.py:292`

**Step 1: Remove retry logic from graph.py**

Replace the entire `should_retry` function and conditional edges with a simple linear edge:

```python
# backend/graph.py — remove should_retry function (lines 49-54) entirely

# In _build_graph(), replace lines 72-79:
# OLD:
#     graph.add_conditional_edges(
#         "critic",
#         should_retry,
#         {
#             "planner": "planner",
#             "end": END,
#         },
#     )
# NEW:
    graph.add_edge("critic", END)
```

Also remove unused imports: remove `Literal` from typing import, remove `should_retry` references.

**Step 2: Remove retry logic from critic.py**

In `critique()` function (lines 39-78), remove all retry decision logic. The function should just return the critic report without `retry_count` or `retry_targets`:

```python
def critique(state: dict) -> dict:
    llm = get_llm()

    report = state["report"]
    raw_signals = state.get("raw_signals", [])

    report_text = report.model_dump_json(indent=2) if hasattr(report, "model_dump_json") else str(report)
    raw_text = "\n".join(
        f"[{s.source}] {s.url}"
        for s in raw_signals[:100]
    ) if raw_signals else "No raw signals available"

    try:
        critic_report = invoke_structured(llm, CriticReport, [
            SystemMessage(content=CRITIC_SYSTEM),
            HumanMessage(content=f"Report:\n{report_text}\n\nRaw source URLs:\n{raw_text}")
        ])
    except Exception as exc:
        logger.error("Critic LLM call failed: %s", exc)
        raise RuntimeError(f"Critic failed: {exc}") from exc

    # Derive low_confidence_sections from section_scores
    if not critic_report.low_confidence_sections and critic_report.section_scores:
        critic_report.low_confidence_sections = [
            section for section, score in critic_report.section_scores.items()
            if score < 0.4
        ]

    critic_report.should_retry = False

    return {"critic_report": critic_report}
```

Note: Also trimmed raw_text to only send URLs (not snippets) to reduce token waste.

**Step 3: Remove retry logic from planner.py**

Remove lines 51-58 (the `retry_context` block):

```python
def plan_search(state: dict) -> dict:
    llm = get_llm()

    query = state["query"]
    mode = state["mode"]
    prompt = EXPLORE_PROMPT if mode == "explore" else DEEP_DIVE_PROMPT

    try:
        plan = invoke_structured(llm, SearchPlan, [
            SystemMessage(content=prompt),
            HumanMessage(content=f"Query: {query}")
        ])
    except Exception as exc:
        logger.error("Planner LLM call failed for query=%s: %s", query, exc)
        raise RuntimeError(f"Planner failed: {exc}") from exc

    return {"search_plan": plan}
```

**Step 4: Clean up AgentState and models**

In `backend/graph.py`, remove `retry_count` and `retry_targets` from `AgentState`:

```python
class AgentState(TypedDict, total=False):
    query: str
    mode: str
    search_plan: SearchPlan
    raw_signals: list[RawCompanySignal]
    company_profiles: list[CompanyProfile]
    report: Union[ExploreReport, DeepDiveReport]
    critic_report: CriticReport
    status_events: Annotated[list[StatusEvent], operator.add]
```

In `backend/models.py`, remove `should_retry`, `retry_queries`, and `low_confidence_sections` from `CriticReport` (lines 199-201) — but keep `should_retry` as always-False for backward compat with cached data:

Actually, keep the fields in the model for backward compatibility with existing cached reports. Just ensure `should_retry` is always False.

In `backend/main.py` line 292, remove the comment about NODE_ORDER if it references retries.

**Step 5: Run tests**

Run: `cd /c/Users/badur/baduru/02_Projects/PrivateCompany && python -m pytest backend/tests/ -v`

**Step 6: Commit**

```bash
git add backend/graph.py backend/nodes/critic.py backend/nodes/planner.py backend/models.py backend/main.py
git commit -m "perf: remove retry loop — make pipeline linear (planner→searcher→profiler→synthesis→critic→END)"
```

---

### Task 2: Reduce Profiler Waste

**Files:**
- Modify: `backend/nodes/profiler.py:119,128,183`
- Modify: `backend/nodes/searcher.py:183`

**Step 1: Reduce max URLs crawled from 5→3 and page content from 5000→3000**

In `backend/nodes/profiler.py`, change line 119:
```python
# OLD: urls = list({s.url for s in company_signals})[:5]
urls = list({s.url for s in company_signals})[:3]
```

Change line 128:
```python
# OLD: extra_content += f"\n\n--- Full page: {url} ---\n{page[:5000]}"
extra_content += f"\n\n--- Full page: {url} ---\n{page[:3000]}"
```

**Step 2: Reduce max signals from 30→20 for deep_dive**

In `backend/nodes/searcher.py`, change line 183:
```python
# OLD: max_signals = plan.target_company_count * 2 if mode == "explore" else 30
max_signals = plan.target_company_count * 2 if mode == "explore" else 20
```

**Step 3: Reduce search terms from 12-15 to 8-10**

In `backend/nodes/planner.py`, update `DEEP_DIVE_PROMPT` to request 8-10 terms:

```python
DEEP_DIVE_PROMPT = """You are a competitive intelligence research planner for investor due diligence.
Given a company name, generate 8-10 specific search terms to find comprehensive intelligence.
Include the company name in every search term. Cover these categories:

CORE INTELLIGENCE:
- "{company} funding rounds investors valuation"
- "{company} founders leadership team executives"
- "{company} headquarters employees headcount founding date"
- "{company} product technology platform"
- "{company} latest news announcements 2024 2025 2026"

COMPETITOR & MARKET ANALYSIS:
- "{company} competitors alternatives market landscape"
- "{company} market size TAM total addressable market"

DUE DILIGENCE:
- "{company} revenue customers growth traction business model"
- "{company} competitive advantages moat differentiation"
- "{company} regulatory risks concerns controversies"

Replace {company} with the actual company name.
Generate 8-10 search terms. Quality over quantity."""
```

**Step 4: Run tests**

Run: `cd /c/Users/badur/baduru/02_Projects/PrivateCompany && python -m pytest backend/tests/ -v`

**Step 5: Commit**

```bash
git add backend/nodes/profiler.py backend/nodes/searcher.py backend/nodes/planner.py
git commit -m "perf: reduce profiler waste — fewer URLs, shorter pages, fewer search terms"
```

---

### Task 3: Parallel Synthesis — Split Into Per-Section LLM Calls

**Files:**
- Modify: `backend/nodes/synthesis.py` (major rewrite for deep_dive path)
- Modify: `backend/models.py` (add `SectionProse` model)

**Step 1: Add SectionProse model**

In `backend/models.py`, add after the `DeepDiveSection` class (after line 101):

```python
class SectionProse(BaseModel):
    """Output schema for a single section's parallel LLM call."""
    content: str
    confidence: float = Field(ge=0.0, le=1.0, default=0.5)
    source_urls: list[str] = []
    source_count: int = 0
```

**Step 2: Rewrite synthesis.py for parallel deep-dive**

Replace the `synthesize` function with parallel section generation:

```python
# backend/nodes/synthesis.py
from __future__ import annotations
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from langchain_core.messages import SystemMessage, HumanMessage
from backend.config import get_llm, invoke_structured
from backend.models import (
    CompanyProfile, ExploreReport, DeepDiveReport, DeepDiveSection,
    SectionProse, FundingRound, PersonEntry, NewsItem, CompetitorEntry,
    RedFlag, RiskEntry, Citation,
)

logger = logging.getLogger(__name__)

EXPLORE_SYSTEM = """You are a competitive intelligence analyst. Given company profiles,
create a structured competitive landscape report.

INPUT FIELD MAPPING — populate each company with:
- name: company name
- sub_sector: specific technology/market niche
- funding_total: string like "$720M", "Public (IPO 1999)"
- funding_numeric: number in millions (0 for public companies)
- funding_stage: e.g. "Seed", "Series A", "Series B", "Series C+", "IPO / Public"
- founding_year: integer year
- headquarters: city, state/country
- key_investors: list of investor names
- description: 2-3 sentence company description
- confidence: 0.0-1.0 based on source coverage
- source_count: number of sources used

CRITICAL: Only include information from the provided data. Write 'Data not available' for missing fields. Never guess.

CITATIONS: For every factual claim, include an inline citation marker like [1], [2], etc.
Populate the 'citations' array with corresponding entries: {id, url, snippet}.
The snippet should be the exact text from the source that supports the claim."""

# Per-section prompts for parallel synthesis
_SECTION_PROMPTS = {
    "overview": """Write a comprehensive overview of this company for investor due diligence.
Cover: what the company does, its mission, market position, and key value proposition.
Write 2-3 substantive paragraphs using markdown formatting (use **bold** for key terms, bullet lists where appropriate).
CRITICAL: Only use information from the provided data. Never guess.""",

    "funding": """Write a detailed funding history analysis for investor due diligence.
Cover: total funding raised, funding trajectory, key investors, and what the funding signals about company health.
Write 2-3 substantive paragraphs using markdown formatting.
CRITICAL: Only use information from the provided data. Never guess.""",

    "key_people": """Write an analysis of the leadership team for investor due diligence.
Cover: key executives, their backgrounds, relevant experience, and team strengths/gaps.
Write 2-3 substantive paragraphs using markdown formatting.
CRITICAL: Only use information from the provided data. Never guess.""",

    "product_technology": """Write a product and technology analysis for investor due diligence.
Cover: core product/platform, technology stack, technical differentiation, and product-market fit signals.
Structure with markdown: use **bold** for key terms, use bullet points for feature lists, use ### subheadings if covering multiple products.
CRITICAL: Only use information from the provided data. Never guess.""",

    "market_opportunity": """Write a market opportunity analysis for investor due diligence.
Cover: TAM/SAM/SOM, market growth trends, market dynamics, and where this company fits.
Structure with markdown: use **bold** for key metrics, bullet points for market drivers.
CRITICAL: Only use information from the provided data. If no market data available, say so.""",

    "business_model": """Write a business model analysis for investor due diligence.
Cover: revenue model, pricing strategy, unit economics signals, and monetization approach.
Structure with markdown: use **bold** for key terms, bullet points for revenue streams.
CRITICAL: Only use information from the provided data. If no business model data available, say so.""",

    "competitive_advantages": """Write a competitive advantages / moat analysis for investor due diligence.
Cover: IP/patents, network effects, switching costs, data advantages, brand, and regulatory moats.
Structure with markdown: use **bold** for moat types, bullet points for each advantage.
CRITICAL: Only use information from the provided data. If no competitive advantage data available, say so.""",

    "traction": """Write a traction analysis for investor due diligence.
Cover: revenue signals, customer growth, key contracts, adoption metrics, and growth trajectory.
Structure with markdown: use **bold** for key metrics, bullet points for traction signals.
CRITICAL: Only use information from the provided data. If no traction data available, say so.""",

    "recent_news": """Write a recent news summary for investor due diligence.
Cover: key announcements, partnerships, product launches, and market developments.
Write 2-3 paragraphs using markdown formatting.
CRITICAL: Only use information from the provided data. Never guess.""",

    "competitors": """Write a competitive landscape analysis for investor due diligence.
Cover: key competitors, how they compare, market positioning, and competitive dynamics.
Write 2-3 substantive paragraphs using markdown formatting.
CRITICAL: Only use information from the provided data. Never guess.""",

    "red_flags": """Write a red flags assessment for investor due diligence.
Cover: any concerns, controversies, legal issues, team risks, or market risks identified.
If no red flags found, state that clearly.
Write using markdown formatting.
CRITICAL: Only use information from the provided data. Never guess.""",

    "risks": """Write a risk assessment for investor due diligence.
Cover: regulatory, market, technology, team, financial, and competitive risks.
Structure with markdown: use ### subheadings per risk category, bullet points for specific risks.
CRITICAL: Only use information from the provided data. If limited risk data available, say so.""",
}

# Metadata extraction prompt (lightweight, runs once)
_METADATA_PROMPT = """Extract metadata and structured arrays from the company profile data.
Return a JSON object with these fields:

METADATA:
- company_name: string
- founded: string (e.g. "March 2023", "2018") — include month if available
- headquarters: string
- headcount: string (e.g. "~500", "200-300")
- funding_stage: string
- linkedin_url: string or null
- crunchbase_url: string or null

STRUCTURED ARRAYS (extract directly from profile data):
- funding_rounds: [{date, stage, amount, investors: [string], source_url}]
  IMPORTANT: Deduplicate funding rounds. If two rounds have the same amount and overlapping investors,
  keep only the one with the more specific date. Never list the same round twice.
- people_entries: [{name, title, background, source_url, linkedin_url, prior_exits: [string], domain_expertise_years: int, notable_affiliations: [string]}]
  IMPORTANT: Always include linkedin_url if found in sources. Search for "linkedin.com/in/" patterns.
- news_items: [{title, date, source_url, snippet, sentiment: "positive"|"neutral"|"negative"}]
  IMPORTANT: Sort by date descending (most recent first). Use ISO-like date format (YYYY-MM-DD or YYYY-MM).
- competitor_entries: [{name, description, funding, funding_stage, differentiator, overlap, website, source_url}]
  IMPORTANT: Include funding amount for each competitor if mentioned in sources.
- red_flag_entries: [{content, severity: "low"|"medium"|"high", confidence: 0.0-1.0, source_urls: [string]}]
- risk_entries: [{category: "regulatory"|"market"|"technology"|"team"|"financial"|"competitive", content, severity, confidence, source_urls}]
- citations: [{id: int, url: string, snippet: string}]

CRITICAL: Only include information from the provided data. Never guess.
Deduplicate all arrays — same person, same funding round, same news item should appear only once."""


def _generate_section(llm, section_key: str, profiles_text: str, company_name: str) -> tuple[str, SectionProse]:
    """Generate a single section's prose via LLM. Returns (section_key, SectionProse)."""
    prompt = _SECTION_PROMPTS.get(section_key, "")
    if not prompt:
        return section_key, SectionProse(content="No data available.", confidence=0.0)

    try:
        result = invoke_structured(llm, SectionProse, [
            SystemMessage(content=prompt),
            HumanMessage(content=f"Company: {company_name}\n\nCollected data:\n{profiles_text}")
        ])
        return section_key, result
    except Exception as exc:
        logger.warning("Section %s generation failed: %s", section_key, exc)
        return section_key, SectionProse(content="Data not available due to processing error.", confidence=0.0)


class MetadataAndArrays(BaseModel):
    """Schema for metadata + structured arrays extraction."""
    company_name: str = ""
    founded: Optional[str] = None
    headquarters: Optional[str] = None
    headcount: Optional[str] = None
    funding_stage: Optional[str] = None
    linkedin_url: Optional[str] = None
    crunchbase_url: Optional[str] = None
    funding_rounds: list[FundingRound] = []
    people_entries: list[PersonEntry] = []
    news_items: list[NewsItem] = []
    competitor_entries: list[CompetitorEntry] = []
    red_flag_entries: list[RedFlag] = []
    risk_entries: list[RiskEntry] = []
    citations: list[Citation] = []


def synthesize(state: dict) -> dict:
    llm = get_llm()
    mode = state["mode"]
    profiles = state["company_profiles"]

    profiles_text = "\n\n".join(
        p.model_dump_json(indent=2) if hasattr(p, "model_dump_json")
        else str(p)
        for p in profiles
    )

    if mode == "explore":
        try:
            report = invoke_structured(llm, ExploreReport, [
                SystemMessage(content=EXPLORE_SYSTEM),
                HumanMessage(content=f"Query: {state['query']}\n\nCompany profiles:\n{profiles_text}")
            ])
        except Exception as exc:
            logger.error("Synthesis LLM call failed for query=%s mode=%s: %s", state['query'], mode, exc)
            raise RuntimeError(f"Synthesis failed: {exc}") from exc
        return {"report": report}

    # --- Deep-dive: parallel synthesis ---
    company_name = state["query"]

    # 1. Extract metadata + structured arrays (one LLM call)
    try:
        meta = invoke_structured(llm, MetadataAndArrays, [
            SystemMessage(content=_METADATA_PROMPT),
            HumanMessage(content=f"Company: {company_name}\n\nCollected data:\n{profiles_text}")
        ])
    except Exception as exc:
        logger.error("Metadata extraction failed: %s", exc)
        meta = MetadataAndArrays(company_name=company_name)

    # 2. Generate all prose sections in parallel
    section_keys = [
        "overview", "funding", "key_people", "product_technology",
        "market_opportunity", "business_model", "competitive_advantages",
        "traction", "recent_news", "competitors", "red_flags", "risks",
    ]

    section_results: dict[str, SectionProse] = {}

    with ThreadPoolExecutor(max_workers=6) as pool:
        futures = {
            pool.submit(_generate_section, llm, key, profiles_text, company_name): key
            for key in section_keys
        }
        for future in as_completed(futures):
            key = futures[future]
            try:
                _, prose = future.result()
                section_results[key] = prose
            except Exception as exc:
                logger.warning("Section %s failed: %s", key, exc)
                section_results[key] = SectionProse(content="Data not available.", confidence=0.0)

    # 3. Assemble DeepDiveReport
    def _to_section(key: str) -> DeepDiveSection:
        prose = section_results.get(key, SectionProse(content="No data available.", confidence=0.0))
        return DeepDiveSection(
            title=key.replace("_", " ").title(),
            content=prose.content,
            confidence=prose.confidence,
            source_urls=prose.source_urls,
            source_count=prose.source_count,
        )

    def _to_optional_section(key: str):
        prose = section_results.get(key)
        if not prose or not prose.content or prose.content.strip().lower() in ("", "data not available.", "no data available."):
            return None
        return _to_section(key)

    report = DeepDiveReport(
        query=state["query"],
        company_name=meta.company_name or company_name,
        founded=meta.founded,
        headquarters=meta.headquarters,
        headcount=meta.headcount,
        funding_stage=meta.funding_stage,
        linkedin_url=meta.linkedin_url,
        crunchbase_url=meta.crunchbase_url,
        overview=_to_section("overview"),
        funding=_to_section("funding"),
        funding_rounds=meta.funding_rounds,
        key_people=_to_section("key_people"),
        people_entries=meta.people_entries,
        product_technology=_to_section("product_technology"),
        recent_news=_to_section("recent_news"),
        news_items=meta.news_items,
        competitors=_to_section("competitors"),
        competitor_entries=meta.competitor_entries,
        red_flags=_to_section("red_flags"),
        red_flag_entries=meta.red_flag_entries,
        market_opportunity=_to_optional_section("market_opportunity"),
        business_model=_to_optional_section("business_model"),
        competitive_advantages=_to_optional_section("competitive_advantages"),
        traction=_to_optional_section("traction"),
        risks=_to_optional_section("risks"),
        risk_entries=meta.risk_entries,
        citations=meta.citations,
    )

    return {"report": report}
```

Note: The `MetadataAndArrays` class needs this import at the top:
```python
from typing import Optional
```

**Step 3: Run tests**

Run: `cd /c/Users/badur/baduru/02_Projects/PrivateCompany && python -m pytest backend/tests/ -v`

**Step 4: Commit**

```bash
git add backend/nodes/synthesis.py backend/models.py
git commit -m "perf: parallel synthesis — split deep-dive into per-section LLM calls + metadata extraction"
```

---

### Task 4: Update Profiler Prompt for Better Data Quality

**Files:**
- Modify: `backend/nodes/profiler.py:12-63`

**Step 1: Update EXTRACTION_PROMPT for founded month, better LinkedIn extraction, competitor funding**

Update the prompt to emphasize:
- Founded date should include month+year when available
- LinkedIn URLs are critical
- Competitor funding is critical

```python
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
```

**Step 2: Run tests**

Run: `cd /c/Users/badur/baduru/02_Projects/PrivateCompany && python -m pytest backend/tests/ -v`

**Step 3: Commit**

```bash
git add backend/nodes/profiler.py
git commit -m "feat: improve profiler prompt — founded month, LinkedIn URLs, competitor funding"
```

---

## Workstream B: Quality + UI Fixes

### Task 5: Founded Date — Include Month

**Files:**
- Modify: `backend/models.py:38` (add `founding_month` field to CompanyProfile)
- Modify: `backend/nodes/synthesis.py` (already handled in Task 3's `_METADATA_PROMPT`)

**Step 1: Add founding_month to CompanyProfile**

In `backend/models.py`, after line 38 (`founding_year`), add:

```python
    founding_month: Optional[str] = None  # e.g. "March", "2023-03"
```

**Step 2: Update the metadata prompt (already done in Task 3)**

The `_METADATA_PROMPT` in Task 3 already says: `founded: string (e.g. "March 2023", "2018") — include month if available`

**Step 3: Commit**

```bash
git add backend/models.py
git commit -m "feat: add founding_month field to CompanyProfile for month-level precision"
```

---

### Task 6: Funding Deduplication

**Files:**
- Modify: `backend/nodes/synthesis.py` (already handled in Task 3's `_METADATA_PROMPT`)
- Create: `backend/utils.py` (dedup helper)
- Modify: `frontend/src/components/deep-dive/FundingChart.jsx:55-75`

**Step 1: Add backend dedup utility**

Create `backend/utils.py`:

```python
"""Utility functions for data cleaning and deduplication."""
from __future__ import annotations
from backend.models import FundingRound


def deduplicate_funding_rounds(rounds: list[FundingRound]) -> list[FundingRound]:
    """Deduplicate funding rounds by matching on amount + stage.

    If two rounds have the same parsed amount and same stage,
    keep the one with the more specific date.
    """
    if not rounds:
        return rounds

    def _parse_amount(amt: str | None) -> float:
        if not amt:
            return 0
        import re
        m = re.match(r"\$?\s*~?\s*([\d,.]+)\s*(T|B|M|K)?", amt, re.IGNORECASE)
        if not m:
            return 0
        num = float(m.group(1).replace(",", ""))
        suffix = (m.group(2) or "").upper()
        multipliers = {"T": 1e12, "B": 1e9, "M": 1e6, "K": 1e3}
        return num * multipliers.get(suffix, 1)

    def _date_specificity(d: str | None) -> int:
        """More specific dates get higher scores."""
        if not d:
            return 0
        return len(d)  # "2025-06-23" > "2025-06" > "2025"

    seen: dict[str, FundingRound] = {}
    for r in rounds:
        amt = _parse_amount(r.amount)
        key = f"{amt:.0f}_{(r.stage or '').lower().strip()}"
        if key in seen:
            existing = seen[key]
            if _date_specificity(r.date) > _date_specificity(existing.date):
                seen[key] = r
        else:
            seen[key] = r

    return list(seen.values())
```

**Step 2: Use dedup in synthesis**

In `backend/nodes/synthesis.py`, after the metadata extraction call in the `synthesize` function, add:

```python
    from backend.utils import deduplicate_funding_rounds
    meta.funding_rounds = deduplicate_funding_rounds(meta.funding_rounds)
```

**Step 3: Add frontend dedup as safety net**

In `frontend/src/components/deep-dive/FundingChart.jsx`, add dedup in the `useMemo` (after line 57):

```javascript
const chartData = useMemo(() => {
    if (!fundingRounds.length) return [];

    // Deduplicate by amount + stage
    const deduped = [];
    const seen = new Set();
    for (const round of fundingRounds) {
      const amt = parseAmount(round.amount);
      const key = `${amt}_${(round.stage || "").toLowerCase().trim()}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(round);
      }
    }

    const sorted = [...deduped].sort(
      (a, b) => new Date(a.date) - new Date(b.date)
    );
    // ... rest stays the same
```

**Step 4: Run tests**

Run: `cd /c/Users/badur/baduru/02_Projects/PrivateCompany && python -m pytest backend/tests/ -v`

**Step 5: Commit**

```bash
git add backend/utils.py backend/nodes/synthesis.py frontend/src/components/deep-dive/FundingChart.jsx
git commit -m "fix: deduplicate funding rounds by amount+stage in both backend and frontend"
```

---

### Task 7: Clickable Citations

**Files:**
- Create: `frontend/src/components/shared/CitationText.jsx`
- Modify: `frontend/src/components/deep-dive/DeepDiveView.jsx` (use CitationText in prose sections)

**Step 1: Create CitationText component**

Create `frontend/src/components/shared/CitationText.jsx`:

```jsx
import { useMemo } from "react";
import { Popover, PopoverTrigger, PopoverContent } from "../ui/popover";
import { ExternalLink } from "lucide-react";

/**
 * Renders text with inline citation markers [1], [2] as clickable popovers.
 * Citations array maps id → {url, snippet}.
 */
export default function CitationText({ text, citations = [] }) {
  const citationMap = useMemo(() => {
    const map = {};
    for (const c of citations) {
      map[c.id] = c;
    }
    return map;
  }, [citations]);

  if (!text) return null;

  // Split text on citation patterns like [1], [2], [1][2]
  const parts = text.split(/(\[\d+\])/g);

  return (
    <>
      {parts.map((part, i) => {
        const match = part.match(/^\[(\d+)\]$/);
        if (match) {
          const id = parseInt(match[1], 10);
          const citation = citationMap[id];
          if (citation) {
            return (
              <Popover key={i}>
                <PopoverTrigger asChild>
                  <button
                    className="inline-flex items-center justify-center min-w-[1.25rem] h-[1.1rem] px-1 text-[10px] font-semibold rounded bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 transition-colors cursor-pointer align-super leading-none"
                  >
                    {id}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-80 rounded-xl" align="start">
                  <div className="space-y-2">
                    <a
                      href={citation.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 underline underline-offset-2 break-all transition-colors"
                    >
                      <ExternalLink className="h-3 w-3 shrink-0" />
                      <span className="line-clamp-2">{citation.url}</span>
                    </a>
                    {citation.snippet && (
                      <p className="text-xs text-[hsl(var(--muted-foreground))] leading-relaxed">
                        {citation.snippet}
                      </p>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            );
          }
          // Citation not found in map — render as plain superscript
          return (
            <sup key={i} className="text-[10px] text-[hsl(var(--muted-foreground))]">
              [{id}]
            </sup>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}
```

**Step 2: Use CitationText in DeepDiveView prose sections**

In `frontend/src/components/deep-dive/DeepDiveView.jsx`:

Add import at top:
```jsx
import CitationText from "../shared/CitationText";
```

Replace all plain-text prose `<div>` blocks with `CitationText`. The pattern to find and replace is:

```jsx
// OLD (lines 440-443, 460-462, 475-477, 490-492, 505-507, and similar):
<div className="text-sm text-[hsl(var(--muted-foreground))] leading-relaxed whitespace-pre-line">
  {textContent}
</div>

// NEW:
<div className="text-sm text-[hsl(var(--muted-foreground))] leading-relaxed whitespace-pre-line">
  <CitationText text={textContent} citations={report.citations || []} />
</div>
```

Apply this to these sections:
- Product/Technology (line 441): `{productText}` → `<CitationText text={productText} citations={report.citations || []} />`
- Market Opportunity (line 461): `{textOf(report.market_opportunity)}` → same pattern
- Business Model (line 476): `{textOf(report.business_model)}` → same pattern
- Competitive Advantages (line 491): `{textOf(report.competitive_advantages)}` → same pattern
- Traction (line 506): `{textOf(report.traction)}` → same pattern
- Funding text (line 347): `{fundingText}` → same pattern
- Overview description (line 321): `{description}` → same pattern
- Competitors text (line 552): `{competitorsText}` → same pattern
- News text (line 533): `{newsText}` → same pattern
- Red flags text (line 643): `{redFlagsText}` → same pattern
- Risks text (line 575): `{risksText}` → same pattern

**Step 3: Commit**

```bash
git add frontend/src/components/shared/CitationText.jsx frontend/src/components/deep-dive/DeepDiveView.jsx
git commit -m "feat: make inline citations [1][2] clickable with source popovers"
```

---

### Task 8: Company Logo

**Files:**
- Modify: `backend/models.py:156-164` (add `logo_url` to DeepDiveReport)
- Modify: `frontend/src/components/deep-dive/DeepDiveView.jsx:246-249` (show logo)
- Modify: `frontend/src/lib/exportPdf.js:224` (show logo in PDF)

**Step 1: Add logo_url to DeepDiveReport**

In `backend/models.py`, after line 164 (`crunchbase_url`), add:

```python
    logo_url: Optional[str] = None
```

**Step 2: Generate logo_url from company website in synthesis**

In the `synthesize` function in `backend/nodes/synthesis.py`, after assembling the report, add logo URL:

```python
    # Generate logo URL from company website
    website = None
    for p in profiles:
        if hasattr(p, 'website') and p.website:
            website = p.website
            break

    if website:
        import re
        domain_match = re.match(r'https?://(?:www\.)?([^/]+)', website)
        if domain_match:
            domain = domain_match.group(1)
            report.logo_url = f"https://logo.clearbit.com/{domain}"
```

**Step 3: Show logo in frontend header**

In `frontend/src/components/deep-dive/DeepDiveView.jsx`, replace the Building2 icon block (lines 247-249):

```jsx
{/* OLD: */}
<div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500/15 to-blue-600/5 flex items-center justify-center border border-blue-500/20">
  <Building2 className="w-4 h-4 text-blue-400" />
</div>

{/* NEW: */}
{report.logo_url ? (
  <img
    src={report.logo_url}
    alt={`${companyName} logo`}
    className="w-9 h-9 rounded-xl border border-[hsl(var(--border))] object-contain bg-white"
    onError={(e) => {
      // Fallback to Google favicon, then to Building2 icon
      if (e.target.src.includes("clearbit")) {
        const domain = new URL(e.target.src).pathname.slice(1);
        e.target.src = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
      } else {
        e.target.style.display = "none";
        e.target.nextElementSibling.style.display = "flex";
      }
    }}
  />
) : null}
<div
  className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500/15 to-blue-600/5 flex items-center justify-center border border-blue-500/20"
  style={{ display: report.logo_url ? "none" : "flex" }}
>
  <Building2 className="w-4 h-4 text-blue-400" />
</div>
```

**Step 4: Show logo in PDF export**

In `frontend/src/lib/exportPdf.js`, update the header (around line 224):

```javascript
// OLD:
<h1 style="font-size:24px;font-weight:800;color:#0f172a;margin:0 0 4px 0;">${esc(companyName)}</h1>

// NEW:
<div style="display:flex;align-items:center;gap:12px;">
  ${report.logo_url ? `<img src="${esc(report.logo_url)}" alt="" style="width:36px;height:36px;border-radius:8px;border:1px solid #e5e7eb;object-fit:contain;background:white;" onerror="this.style.display='none'" />` : ""}
  <h1 style="font-size:24px;font-weight:800;color:#0f172a;margin:0;">${esc(companyName)}</h1>
</div>
```

**Step 5: Commit**

```bash
git add backend/models.py backend/nodes/synthesis.py frontend/src/components/deep-dive/DeepDiveView.jsx frontend/src/lib/exportPdf.js
git commit -m "feat: add company logo via Clearbit with Google favicon fallback"
```

---

### Task 9: Sort News Latest First

**Files:**
- Modify: `frontend/src/components/deep-dive/DeepDiveView.jsx:208`

**Step 1: Sort newsItems by date descending**

Change line 208 to sort after extracting:

```jsx
// OLD:
const newsItems = report.news_items || (Array.isArray(report.news) ? report.news : []) || (Array.isArray(report.recent_news) ? report.recent_news : []);

// NEW:
const newsItems = (report.news_items || (Array.isArray(report.news) ? report.news : []) || (Array.isArray(report.recent_news) ? report.recent_news : []))
  .slice()
  .sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return new Date(b.date) - new Date(a.date);
  });
```

**Step 2: Commit**

```bash
git add frontend/src/components/deep-dive/DeepDiveView.jsx
git commit -m "fix: sort news items by date descending (latest first)"
```

---

### Task 10: Markdown Rendering for Prose Sections

**Files:**
- Install: `react-markdown` package
- Create: `frontend/src/components/shared/MarkdownProse.jsx`
- Modify: `frontend/src/components/deep-dive/DeepDiveView.jsx` (use MarkdownProse)

**Step 1: Install react-markdown**

Run: `cd /c/Users/badur/baduru/02_Projects/PrivateCompany/frontend && npm install react-markdown`

**Step 2: Create MarkdownProse component**

Create `frontend/src/components/shared/MarkdownProse.jsx`:

```jsx
import ReactMarkdown from "react-markdown";
import CitationText from "./CitationText";

/**
 * Renders markdown content with proper styling for report sections.
 * Also handles inline citations [1][2] within text nodes.
 */
export default function MarkdownProse({ content, citations = [] }) {
  if (!content) return null;

  return (
    <div className="prose-report text-sm text-[hsl(var(--muted-foreground))] leading-relaxed">
      <ReactMarkdown
        components={{
          h3: ({ children }) => (
            <h3 className="text-sm font-semibold text-[hsl(var(--foreground))] mt-4 mb-2">
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-sm font-medium text-[hsl(var(--foreground))] mt-3 mb-1.5">
              {children}
            </h4>
          ),
          p: ({ children }) => (
            <p className="mb-3 leading-relaxed">
              {renderWithCitations(children, citations)}
            </p>
          ),
          ul: ({ children }) => (
            <ul className="list-disc pl-5 mb-3 space-y-1">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal pl-5 mb-3 space-y-1">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="leading-relaxed">
              {renderWithCitations(children, citations)}
            </li>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-[hsl(var(--foreground))]">
              {children}
            </strong>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

/**
 * Process children to replace citation patterns [N] with CitationText.
 */
function renderWithCitations(children, citations) {
  if (!citations.length) return children;

  // Only process string children
  return Array.isArray(children)
    ? children.map((child, i) =>
        typeof child === "string" ? (
          <CitationText key={i} text={child} citations={citations} />
        ) : (
          child
        )
      )
    : typeof children === "string"
    ? <CitationText text={children} citations={citations} />
    : children;
}
```

**Step 3: Add minimal CSS for prose-report**

In `frontend/src/index.css`, add:

```css
.prose-report h3 + p {
  margin-top: 0.25rem;
}
```

**Step 4: Replace plain text divs with MarkdownProse in DeepDiveView**

In `frontend/src/components/deep-dive/DeepDiveView.jsx`:

Add import:
```jsx
import MarkdownProse from "../shared/MarkdownProse";
```

Replace all prose section `<div className="...whitespace-pre-line">{text}</div>` with `<MarkdownProse>`:

```jsx
// Product / Technology (lines 440-443):
// OLD:
<div className="text-sm text-[hsl(var(--muted-foreground))] leading-relaxed whitespace-pre-line">
  {productText}
</div>
// NEW:
<MarkdownProse content={productText} citations={report.citations || []} />

// Market Opportunity (lines 460-462): same pattern with textOf(report.market_opportunity)
// Business Model (lines 475-477): same pattern with textOf(report.business_model)
// Competitive Advantages (lines 490-492): same pattern with textOf(report.competitive_advantages)
// Traction (lines 505-507): same pattern with textOf(report.traction)
// Funding text (line 346-348): same pattern with fundingText
// Overview description (line 320-322): same pattern with description
// Competitors text (line 551-553): same pattern with competitorsText
// People text fallback (line 422-424): same pattern with peopleText
// News text fallback (line 532-534): same pattern with newsText
// Red flags text fallback (line 642-644): same pattern with redFlagsText
// Risks text (line 573-576): same pattern with risksText
```

Note: If you already added `CitationText` in Task 7, replace those `CitationText` usages with `MarkdownProse` instead (which includes citation support). Task 7's standalone `CitationText` is still used by `MarkdownProse` internally.

**Step 5: Commit**

```bash
git add frontend/src/components/shared/MarkdownProse.jsx frontend/src/components/deep-dive/DeepDiveView.jsx frontend/src/index.css
git commit -m "feat: render prose sections as markdown with headers, bullets, and bold"
```

---

### Task 11: PDF Text Selectable

**Files:**
- Modify: `frontend/src/lib/exportPdf.js:270-282`

**Step 1: Switch from html2canvas to jsPDF text mode**

The current `html2canvas` approach rasterizes text into images. Fix by disabling canvas rendering and using the `enableLinks` option:

In `frontend/src/lib/exportPdf.js`, replace the html2pdf config (lines 272-280):

```javascript
// OLD:
await html2pdf()
  .set({
    margin: [12, 12, 16, 12],
    filename: `${companyName || "report"}-intel-report.pdf`,
    image: { type: "jpeg", quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    pagebreak: { mode: ["avoid-all", "css", "legacy"] },
  })
  .from(container.firstElementChild)
  .save();

// NEW:
await html2pdf()
  .set({
    margin: [12, 12, 16, 12],
    filename: `${companyName || "report"}-intel-report.pdf`,
    image: { type: "jpeg", quality: 0.98 },
    html2canvas: {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
    },
    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    pagebreak: { mode: ["avoid-all", "css", "legacy"] },
    enableLinks: true,
  })
  .from(container.firstElementChild)
  .save();
```

**IMPORTANT NOTE:** `html2pdf.js` inherently rasterizes via canvas — `enableLinks` only adds link overlays. For truly selectable text, the best approach is to add a CSS print layer. Add to the container styles:

```javascript
// In exportPdf.js, update the container element styles:
container.style.cssText = "position:fixed;left:-9999px;top:0;width:210mm;background:white;-webkit-print-color-adjust:exact;";
```

And update the sectionHtml function to remove `white-space:pre-line` (which can cause issues):

```javascript
function sectionHtml(title, content, confidence) {
  const confBadge =
    confidence != null
      ? `<span style="font-size:11px;color:#888;margin-left:8px;">(confidence: ${Math.round(confidence * 100)}%)</span>`
      : "";
  const body = content
    ? `<div style="line-height:1.7;color:#333;">${esc(content)}</div>`
    : `<div style="color:#999;font-style:italic;">No data available.</div>`;
  return `
    <div style="margin-bottom:28px;page-break-inside:avoid;">
      <h2 style="font-size:16px;font-weight:700;color:#111;margin:0 0 8px 0;padding-bottom:6px;border-bottom:1px solid #e5e7eb;">
        ${esc(title)}${confBadge}
      </h2>
      ${body}
    </div>`;
}
```

If true text selection is critical, consider migrating from `html2pdf.js` to `jspdf` + `jspdf-autotable` which generates native PDF text. This is a larger change — flag for a future task if the above doesn't fully solve it.

**Step 2: Commit**

```bash
git add frontend/src/lib/exportPdf.js
git commit -m "fix: improve PDF text selectability — enable links, remove pre-line wrapping"
```

---

## Post-Implementation Verification

### Task 12: End-to-End Test

**Step 1: Run all backend tests**

Run: `cd /c/Users/badur/baduru/02_Projects/PrivateCompany && python -m pytest backend/tests/ -v`

**Step 2: Start backend and frontend**

Run backend: `cd /c/Users/badur/baduru/02_Projects/PrivateCompany && uvicorn backend.main:app --reload`
Run frontend: `cd /c/Users/badur/baduru/02_Projects/PrivateCompany/frontend && npm run dev`

**Step 3: Test with a known company (e.g., "Cluely")**

Verify:
- [ ] Pipeline runs without retry (linear: planner→searcher→profiler→synthesis→critic→done)
- [ ] Founded date shows month (e.g., "June 2024" not just "2024")
- [ ] No duplicate funding rounds in chart/table
- [ ] Chart shows correct amounts (not doubled)
- [ ] Citations `[1][2]` are clickable with source popovers
- [ ] Company logo shows in header
- [ ] News sorted latest first
- [ ] Competitors have funding info where available
- [ ] Key people have LinkedIn links where available
- [ ] Product/Tech, Market, Business Model, Competitive Advantages have structured formatting (headers, bullets)
- [ ] PDF export has selectable text
- [ ] Total pipeline time < 15 minutes
- [ ] Total tokens < 100K

**Step 4: Final commit with all fixes**

```bash
git add -A
git commit -m "chore: end-to-end verification complete — pipeline optimization + quality fixes"
```
