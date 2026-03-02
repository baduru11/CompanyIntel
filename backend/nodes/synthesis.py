# backend/nodes/synthesis.py
from __future__ import annotations
from backend.config import get_llm
from backend.models import CompanyProfile, ExploreReport, DeepDiveReport

EXPLORE_SYSTEM = """You are a competitive intelligence analyst. Given company profiles,
create a structured competitive landscape report.
CRITICAL: Only include information from the provided data. Write 'Data not available' for missing fields. Never guess."""

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
state 'Data not available' in that section. Never infer, guess, or use your own knowledge."""


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
        structured_llm = llm.with_structured_output(ExploreReport)
        report = structured_llm.invoke([
            {"role": "system", "content": EXPLORE_SYSTEM},
            {"role": "user", "content": f"Query: {state['query']}\n\nCompany profiles:\n{profiles_text}"}
        ])
    else:
        structured_llm = llm.with_structured_output(DeepDiveReport)
        report = structured_llm.invoke([
            {"role": "system", "content": DEEP_DIVE_SYSTEM},
            {"role": "user", "content": f"Company: {state['query']}\n\nCollected data:\n{profiles_text}"}
        ])

    return {"report": report}
