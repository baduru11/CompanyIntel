# backend/tests/test_planner.py
import pytest
from unittest.mock import MagicMock, patch
from backend.models import SearchPlan


def test_planner_explore_returns_search_plan():
    from backend.nodes.planner import plan_search
    mock_llm = MagicMock()
    mock_llm.with_structured_output.return_value = MagicMock(
        invoke=MagicMock(return_value=SearchPlan(
            search_terms=["AI inference chips", "custom silicon AI"],
            target_company_count=15,
            sub_sectors=["GPU", "ASIC", "FPGA"]
        ))
    )
    state = {"query": "AI inference chips", "mode": "explore", "retry_count": 0}
    with patch("backend.nodes.planner.get_llm", return_value=mock_llm):
        result = plan_search(state)
    assert "search_plan" in result
    assert len(result["search_plan"].search_terms) > 0


def test_planner_deep_dive_returns_search_plan():
    from backend.nodes.planner import plan_search
    mock_llm = MagicMock()
    mock_llm.with_structured_output.return_value = MagicMock(
        invoke=MagicMock(return_value=SearchPlan(
            search_terms=["NVIDIA funding", "NVIDIA investors", "NVIDIA news 2024"],
            target_company_count=1,
            sub_sectors=[]
        ))
    )
    state = {"query": "NVIDIA", "mode": "deep_dive", "retry_count": 0}
    with patch("backend.nodes.planner.get_llm", return_value=mock_llm):
        result = plan_search(state)
    assert result["search_plan"].target_company_count == 1


def test_planner_includes_retry_context():
    """When retry_count > 0 and critic_report has gaps, planner should include gap info."""
    from backend.nodes.planner import plan_search
    from backend.models import CriticReport

    mock_llm = MagicMock()
    mock_llm.with_structured_output.return_value = MagicMock(
        invoke=MagicMock(return_value=SearchPlan(
            search_terms=["NVIDIA headcount", "NVIDIA employees"],
            target_company_count=1,
            sub_sectors=[]
        ))
    )
    critic = CriticReport(
        overall_confidence=0.4,
        gaps=["headcount data missing", "key people not found"],
        should_retry=True,
    )
    state = {"query": "NVIDIA", "mode": "deep_dive", "retry_count": 1, "critic_report": critic}
    with patch("backend.nodes.planner.get_llm", return_value=mock_llm):
        result = plan_search(state)
    assert "search_plan" in result
