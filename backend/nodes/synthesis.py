# backend/nodes/synthesis.py
from __future__ import annotations
import logging
from langchain_core.messages import SystemMessage, HumanMessage
from backend.config import get_llm
from backend.models import CompanyProfile, ExploreReport, DeepDiveReport

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

DEEP_DIVE_SYSTEM = """You are a competitive intelligence analyst. Given company profile data,
create a detailed intelligence report.

INPUT FIELD MAPPING — The input uses CompanyProfile field names. Map them as follows:
- Input "founding_year" (int) → Output "founded" (string, e.g. "1993", "April 2023")
- Input "headquarters" → Output "headquarters" (same)
- Input "headcount_estimate" → Output "headcount" (e.g. "~30,000", "600-700")
- Input "funding_stage" → Output "funding_stage" (same)
- Input "funding_total" → mention in the funding section prose and in funding_rounds
- Input "key_investors" → mention in funding section and funding_rounds investors
- Input "key_people" (list of dicts) → Output "people_entries" [{name, title, background, source_url}]
- Input "recent_news" (list of dicts) → Output "news_items" [{title, date, source_url, snippet, sentiment}]
- Input "core_product" / "core_technology" → use in the product_technology section prose
- Input "description" → use in the overview section prose

METADATA FIELDS (always populate these from the input data):
- founded: founding year or date as a string
- headquarters: city and region
- headcount: employee estimate
- funding_stage: current stage (e.g. "Series B", "IPO / Public")

SECTIONS: Overview, Funding History, Key People, Product/Technology, Recent News,
Competitors, Red Flags.
Write substantive prose for each section's "content" field — at least 2-3 paragraphs.
Set confidence based on how much source data supports each section.

STRUCTURED ARRAYS (populate alongside the prose sections):
- funding_rounds: list of {date, stage, amount, investors, source_url}
  amount should be a string like "$10M", "$640M", "$2B"
- people_entries: list of {name, title, background, source_url} for key people
- news_items: list of {title, date, source_url, snippet, sentiment}
- competitor_entries: list of {name, description, funding, differentiator}
- red_flag_entries: list of {content, severity (low/medium/high), confidence, source_urls}

CRITICAL: Only include information from the provided data. If data is missing, explicitly
state 'Data not available' in that section. Never infer, guess, or use your own knowledge.

CITATIONS: For every factual claim in section content, include inline citation markers [1], [2], etc.
Populate the 'citations' array with corresponding entries: {id, url, snippet}.
The snippet should be the exact text from the source that supports the claim.
Each citation id must be unique across the entire report."""


def synthesize(state: dict) -> dict:
    llm = get_llm()
    mode = state["mode"]
    profiles = state["company_profiles"]

    profiles_text = "\n\n".join(
        p.model_dump_json(indent=2) if hasattr(p, "model_dump_json")
        else str(p)
        for p in profiles
    )

    try:
        if mode == "explore":
            structured_llm = llm.with_structured_output(ExploreReport)
            report = structured_llm.invoke([
                SystemMessage(content=EXPLORE_SYSTEM),
                HumanMessage(content=f"Query: {state['query']}\n\nCompany profiles:\n{profiles_text}")
            ])
        else:
            structured_llm = llm.with_structured_output(DeepDiveReport)
            report = structured_llm.invoke([
                SystemMessage(content=DEEP_DIVE_SYSTEM),
                HumanMessage(content=f"Company: {state['query']}\n\nCollected data:\n{profiles_text}")
            ])
    except Exception as exc:
        logger.error("Synthesis LLM call failed for query=%s mode=%s: %s", state['query'], mode, exc)
        raise RuntimeError(f"Synthesis failed: {exc}") from exc

    return {"report": report}
