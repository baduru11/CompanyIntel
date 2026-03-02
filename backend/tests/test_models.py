# backend/tests/test_models.py
import pytest
from pydantic import ValidationError
from backend.models import (
    SearchPlan, RawCompanySignal, CompanyProfile,
    ExploreReport, DeepDiveReport, CriticVerification,
    CriticReport, StatusEvent, ExploreCompany,
    DeepDiveSection, FundingRound, NewsItem, CompetitorEntry,
    PersonEntry, RedFlag
)

def test_company_profile_requires_source_for_funding():
    """If funding_total is set, funding_source_url must exist."""
    with pytest.raises(ValidationError):
        CompanyProfile(
            name="TestCo",
            funding_total="$10M",
            funding_source_url=None,
            funding_confidence=0.8
        )

def test_company_profile_allows_missing_funding():
    """If funding_total is None, no source needed."""
    profile = CompanyProfile(name="TestCo")
    assert profile.funding_total is None
    assert profile.funding_confidence == 0.0

def test_company_profile_valid_with_source():
    profile = CompanyProfile(
        name="TestCo",
        funding_total="$10M",
        funding_source_url="https://example.com",
        funding_confidence=0.9
    )
    assert profile.name == "TestCo"

def test_confidence_score_bounded():
    with pytest.raises(ValidationError):
        CompanyProfile(name="TestCo", funding_confidence=1.5)

def test_search_plan_structure():
    plan = SearchPlan(
        search_terms=["AI chips", "inference hardware"],
        target_company_count=15,
        sub_sectors=["GPU", "ASIC", "FPGA"]
    )
    assert len(plan.search_terms) == 2

def test_status_event_structure():
    event = StatusEvent(node="searcher", status="running", detail="Searching...")
    assert event.node == "searcher"

def test_explore_company():
    c = ExploreCompany(name="TestCo", sub_sector="GPU", funding_numeric=10.0)
    assert c.confidence == 0.0

def test_deep_dive_section():
    s = DeepDiveSection(title="Overview", content="Test", confidence=0.8, source_urls=["https://x.com"])
    assert s.source_count == 0  # default

def test_funding_round():
    r = FundingRound(stage="Series A", amount="$10M", investors=["a16z"])
    assert len(r.investors) == 1

def test_news_item_sentiment():
    n = NewsItem(title="Good news", snippet="Things are good", sentiment="positive")
    assert n.sentiment == "positive"

def test_critic_report():
    c = CriticReport(overall_confidence=0.75, gaps=["missing headcount"])
    assert c.should_retry is False

def test_raw_company_signal():
    s = RawCompanySignal(company_name="Test", url="https://test.com", snippet="desc", source="tavily")
    assert s.source == "tavily"


def test_person_entry():
    p = PersonEntry(name="Jane Doe", title="CEO", background="Founded the company")
    assert p.name == "Jane Doe"
    assert p.source_url is None


def test_person_entry_minimal():
    p = PersonEntry(name="John")
    assert p.title is None
    assert p.background is None


def test_red_flag_defaults():
    r = RedFlag(content="Supply chain risk")
    assert r.severity == "medium"
    assert r.confidence == 0.5
    assert r.source_urls == []


def test_red_flag_full():
    r = RedFlag(
        content="Export controls",
        severity="high",
        confidence=0.9,
        source_urls=["https://example.com"]
    )
    assert r.severity == "high"
    assert len(r.source_urls) == 1


def test_red_flag_confidence_bounded():
    with pytest.raises(ValidationError):
        RedFlag(content="Bad", confidence=1.5)


def test_deep_dive_report_metadata_defaults():
    """New metadata fields default to None, structured arrays default to empty."""
    sec = DeepDiveSection(title="T", content="C", confidence=0.5)
    r = DeepDiveReport(
        query="test", company_name="TestCo",
        overview=sec, funding=sec, key_people=sec,
        product_technology=sec, recent_news=sec,
        competitors=sec, red_flags=sec
    )
    assert r.founded is None
    assert r.headquarters is None
    assert r.headcount is None
    assert r.funding_stage is None
    assert r.people_entries == []
    assert r.red_flag_entries == []


def test_deep_dive_report_with_metadata():
    """Metadata fields can be populated."""
    sec = DeepDiveSection(title="T", content="C", confidence=0.5)
    r = DeepDiveReport(
        query="test", company_name="TestCo",
        founded="2020", headquarters="NYC",
        headcount="~50", funding_stage="Series A",
        overview=sec, funding=sec, key_people=sec,
        product_technology=sec, recent_news=sec,
        competitors=sec, red_flags=sec,
        people_entries=[PersonEntry(name="Alice", title="CTO")],
        red_flag_entries=[RedFlag(content="Risk A", severity="low")]
    )
    assert r.founded == "2020"
    assert r.headquarters == "NYC"
    assert len(r.people_entries) == 1
    assert len(r.red_flag_entries) == 1
