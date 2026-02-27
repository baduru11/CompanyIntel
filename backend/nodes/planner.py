# backend/nodes/planner.py
from __future__ import annotations
from langchain_core.messages import SystemMessage, HumanMessage
from backend.config import get_llm
from backend.models import SearchPlan

EXPLORE_PROMPT = """You are a competitive intelligence research planner.
Given a sector query, generate a search plan to discover 10-20 companies in this space.
Output search terms that will find companies, their funding, and key details.
Include sub-sector categories to organize the landscape."""

DEEP_DIVE_PROMPT = """You are a competitive intelligence research planner.
Given a company name, generate a search plan to find detailed intelligence:
funding history, key investors, leadership team, product details, recent news, competitors, and red flags.
Output specific search terms for each information category."""


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

    plan = structured_llm.invoke([
        SystemMessage(content=prompt),
        HumanMessage(content=f"Query: {query}{retry_context}")
    ])

    return {"search_plan": plan}
