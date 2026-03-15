# backend/graph.py
"""LangGraph state graph definitions for explore and deep-dive pipelines.

Both graphs share the same topology with optional critic-driven retries:
    Planner -> Searcher -> Profiler -> Synthesis -> Critic -> (retry?) -> Planner
                                                           -> (done)  -> END

Max 2 retries to prevent infinite loops.
"""
from __future__ import annotations

import logging
import operator
from typing import Annotated, Union

from langgraph.graph import END, START, StateGraph

from backend.models import (
    CompanyProfile,
    CriticReport,
    DeepDiveReport,
    ExploreReport,
    RawCompanySignal,
    SearchPlan,
    StatusEvent,
)
from backend.nodes.critic import critique
from backend.nodes.planner import plan_search
from backend.nodes.profiler import profile
from backend.nodes.searcher import search
from backend.nodes.synthesis import synthesize

from typing import TypedDict

logger = logging.getLogger(__name__)

MAX_RETRIES = 2


class AgentState(TypedDict, total=False):
    """Shared state flowing through every node in the graph."""

    query: str
    mode: str
    search_plan: SearchPlan
    raw_signals: list[RawCompanySignal]
    company_profiles: list[CompanyProfile]
    report: Union[ExploreReport, DeepDiveReport]
    report_id: str
    critic_report: CriticReport
    status_events: Annotated[list[StatusEvent], operator.add]
    search_iteration: int


def _should_retry(state: dict) -> str:
    """Conditional edge: decide whether to retry (loop back to planner) or finish."""
    critic_report = state.get("critic_report")
    iteration = state.get("search_iteration", 0)

    if (
        critic_report
        and getattr(critic_report, "should_retry", False)
        and iteration < MAX_RETRIES
    ):
        logger.info(
            "Critic recommends retry (iteration %d/%d)", iteration + 1, MAX_RETRIES
        )
        return "retry"
    return "end"


def _increment_iteration(state: dict) -> dict:
    """Tiny node that bumps search_iteration and emits a retry status event."""
    new_iter = state.get("search_iteration", 0) + 1
    return {
        "search_iteration": new_iter,
        "status_events": [
            StatusEvent(
                node="system",
                status="retrying",
                detail=f"Retrying search (attempt {new_iter}/{MAX_RETRIES}) — critic found gaps",
            )
        ],
    }


def _build_graph() -> StateGraph:
    """Construct (but do not compile) the shared 5-node state graph with retry loop."""
    graph = StateGraph(AgentState)

    graph.add_node("planner", plan_search)
    graph.add_node("searcher", search)
    graph.add_node("profiler", profile)
    graph.add_node("synthesis", synthesize)
    graph.add_node("critic", critique)
    graph.add_node("retry_gate", _increment_iteration)

    graph.add_edge(START, "planner")
    graph.add_edge("planner", "searcher")
    graph.add_edge("searcher", "profiler")
    graph.add_edge("profiler", "synthesis")
    graph.add_edge("synthesis", "critic")

    # Conditional edge from critic: retry or finish
    graph.add_conditional_edges(
        "critic",
        _should_retry,
        {"retry": "retry_gate", "end": END},
    )
    # retry_gate loops back to planner for new search terms
    graph.add_edge("retry_gate", "planner")

    return graph


def build_explore_graph(checkpointer=None):
    """Compile the explore-mode graph.

    Usage::

        graph = build_explore_graph()
        result = graph.invoke({"query": "AI healthcare startups", "mode": "explore"})
    """
    graph = _build_graph()
    return graph.compile(checkpointer=checkpointer)


def build_deep_dive_graph(checkpointer=None):
    """Compile the deep-dive-mode graph.

    Usage::

        graph = build_deep_dive_graph()
        result = graph.invoke({"query": "Acme Corp", "mode": "deep_dive"})
    """
    graph = _build_graph()
    return graph.compile(checkpointer=checkpointer)
