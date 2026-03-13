# backend/nodes/planner.py
from __future__ import annotations
import logging
from langchain_core.messages import SystemMessage, HumanMessage
from backend.config import get_llm
from backend.models import SearchPlan

logger = logging.getLogger(__name__)

EXPLORE_PROMPT = """You are a competitive intelligence research planner.
Given a sector query, generate a search plan to discover 10-20 companies in this space.
Output search terms that will find companies, their funding, and key details.
Include sub-sector categories to organize the landscape."""

DEEP_DIVE_PROMPT = """You are a competitive intelligence research planner.
Given a company name, generate 6-8 specific search terms to find detailed intelligence.
Include the company name in every search term. Cover these categories:
- "{company} funding rounds investors valuation"
- "{company} founders leadership team executives"
- "{company} headquarters employees headcount"
- "{company} product technology platform"
- "{company} latest news announcements 2024 2025"
- "{company} competitors alternatives market"
- "{company} controversies risks concerns"
- "{company} Crunchbase OR PitchBook OR LinkedIn"
Replace {company} with the actual company name."""


def plan_search(state: dict) -> dict:
    llm = get_llm()
    structured_llm = llm.with_structured_output(SearchPlan)

    query = state["query"]
    mode = state["mode"]
    prompt = EXPLORE_PROMPT if mode == "explore" else DEEP_DIVE_PROMPT

    retry_context = ""
    if state.get("retry_count", 0) > 0 and state.get("critic_report"):
        gaps = state["critic_report"].gaps
        retry_context = f"\n\nPrevious search had gaps: {', '.join(gaps)}. Focus on filling these."

    try:
        plan = structured_llm.invoke([
            SystemMessage(content=prompt),
            HumanMessage(content=f"Query: {query}{retry_context}")
        ])
    except Exception as exc:
        logger.error("Planner LLM call failed for query=%s: %s", query, exc)
        raise RuntimeError(f"Planner failed: {exc}") from exc

    return {"search_plan": plan}
