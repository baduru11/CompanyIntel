# backend/nodes/planner.py
from __future__ import annotations
import logging
from langchain_core.messages import SystemMessage, HumanMessage
from backend.config import get_llm, get_settings, invoke_structured
from backend.models import SearchPlan

logger = logging.getLogger(__name__)

EXPLORE_PROMPT = """You are a competitive intelligence research planner.
Given a sector query, generate 14-16 search terms to discover 10-20 REAL companies/startups in this space.

CRITICAL RULE: The FULL sector phrase from the query MUST appear in EVERY search term.
Never decompose "AI coding assistants" into just "AI" or "coding" alone.
A search term like "AI startups funding 2024" is WRONG because it drops the sector qualifier.
Every term must keep the full sector phrase or a precise synonym.

SEARCH TERM STRATEGY — include a mix of:

1. COMPANY LIST DISCOVERY (4-5 terms): Target listicles and curated rankings
   - "top [full sector phrase] companies 2025"
   - "best [full sector phrase] tools comparison 2025"
   - "[full sector phrase] startups to watch 2025 2026"
   - "[full sector phrase] market map landscape competitors"
   - "[full sector phrase] alternatives ranked"

2. NAMED COMPETITOR QUERIES (2-3 terms): Use well-known companies in this sector to find all others
   - "[well-known company in sector] alternatives competitors 2025"
   - "[company A] vs [company B] vs [company C] comparison"
   Think: what's the most famous product in this sector? Use it to find all competitors.

3. FUNDING & FINANCIALS (3-4 terms): Find funding data for companies
   - "[full sector phrase] startups funding raised 2024 2025"
   - "[full sector phrase] companies raised million crunchbase"
   - "[full sector phrase] startup valuations venture capital"

4. TRACTION & ADOPTION (2-3 terms): Distinguish real products from side projects
   - "[full sector phrase] users reviews downloads G2 Capterra"
   - "[full sector phrase] enterprise adoption customers"

5. COMPETITIVE LANDSCAPE (2-3 terms): Find comparison articles
   - "[full sector phrase] competitive landscape analysis 2025"
   - "[full sector phrase] comparison vs alternatives"

DO NOT generate:
- Generic terms that drop the sector qualifier (e.g., "AI startups" when query is "AI coding assistants")
- Technology explanation queries ("how AI coding works")
- News/trend queries that return articles about the technology, not about companies

Include sub-sector categories to organize the landscape.
Generate 14-16 search terms total. Focus on finding FUNDED companies with REAL products."""

DEEP_DIVE_PROMPT = """You are a competitive intelligence research planner for investor due diligence.
Given a company name, generate 14-16 specific search terms to find comprehensive intelligence.
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

GOVERNANCE & PEOPLE:
- "{company} board of directors advisors board members governance"

CORPORATE ACTIVITY:
- "{company} acquisitions acquired companies M&A mergers"
- "{company} partnerships strategic partners customers clients key accounts"

INTELLECTUAL PROPERTY:
- "{company} patents intellectual property filings inventions"

FINANCIAL ESTIMATES:
- "{company} revenue ARR annual revenue estimate valuation fundraise"

WORKFORCE:
- "{company} employee count headcount growth hiring linkedin"

Replace {company} with the actual company name.
Generate 14-16 search terms. Quality over quantity."""


def plan_search(state: dict) -> dict:
    llm = get_llm(get_settings().extraction_model)

    query = state["query"]
    mode = state["mode"]
    search_iteration = state.get("search_iteration", 0)
    prompt = EXPLORE_PROMPT if mode == "explore" else DEEP_DIVE_PROMPT

    # Build the user message — on retries, add context to generate different terms
    user_content = f"Query: {query}"

    if search_iteration > 0:
        # Gather previous search terms to avoid duplicates
        prev_plan = state.get("search_plan")
        prev_terms = prev_plan.search_terms if prev_plan else []
        prev_terms_str = ", ".join(f'"{t}"' for t in prev_terms) if prev_terms else "none"

        # Gather retry hints from the critic
        critic_report = state.get("critic_report")
        retry_hints = ""
        if critic_report and getattr(critic_report, "retry_queries", None):
            hints_str = ", ".join(f'"{q}"' for q in critic_report.retry_queries)
            retry_hints = f"\nHint queries targeting gaps: {hints_str}"

        user_content += (
            f"\n\nIMPORTANT: This is retry #{search_iteration}. "
            f"Previous searches found insufficient data. "
            f"Generate DIFFERENT, more specific search terms. "
            f"Do NOT reuse these previous terms: {prev_terms_str}"
            f"{retry_hints}"
        )
        logger.info("Planner retry #%d for query=%s", search_iteration, query)

    try:
        plan = invoke_structured(llm, SearchPlan, [
            SystemMessage(content=prompt),
            HumanMessage(content=user_content)
        ])
    except Exception as exc:
        logger.error("Planner LLM call failed for query=%s: %s", query, exc)
        raise RuntimeError(f"Planner failed: {exc}") from exc

    return {"search_plan": plan}
