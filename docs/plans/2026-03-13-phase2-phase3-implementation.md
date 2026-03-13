# Phase 2 + Phase 3 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship 5 Phase 2 improvements (targeted retry, citations, confidence UX, checkpointing, SSE tests) and 2 Phase 3 items (token streaming, LangSmith eval harness).

**Architecture:** Phase 2 makes the pipeline smarter (targeted retries), more trustworthy (citations), and more resilient (checkpointing). Phase 3 improves UX (streaming) and quality assurance (eval harness). All changes build on the Phase 0+1 foundation.

**Tech Stack:** Python 3.12, FastAPI, LangGraph 0.4, Pydantic v2, React 19, Tailwind CSS, langgraph-checkpoint-sqlite

**Prerequisite:** Phase 0+1 complete. P2-1 (parallel search) already committed.

---

## Phase 2

---

### Task 1: Low-confidence banner in Deep Dive reports

SectionNav already has confidence color dots. This task adds a summary warning banner.

**Files:**
- Modify: `frontend/src/components/deep-dive/DeepDiveView.jsx`

**Step 1: Add the banner component**

In `DeepDiveView.jsx`, find the line `<div className="p-4 space-y-6 max-w-6xl">` (around line 181). Insert the banner BEFORE that div, after the closing `</div>` of the sticky header:

```jsx
          {/* Low-confidence warning banner */}
          {(() => {
            const lowConfSections = navSections.filter(
              (s) => s.confidence !== null && s.confidence < 0.4
            );
            if (lowConfSections.length === 0) return null;
            return (
              <div className="mx-4 mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3">
                <p className="text-sm font-medium text-amber-400">
                  {lowConfSections.length} section{lowConfSections.length > 1 ? "s" : ""} with low confidence
                </p>
                <p className="mt-1 text-xs text-amber-400/70">
                  {lowConfSections.map((s) => s.title).join(", ")} — data may be incomplete or unverified
                </p>
              </div>
            );
          })()}
```

**Step 2: Verify build**

Run: `cd frontend && npm run build`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add frontend/src/components/deep-dive/DeepDiveView.jsx
git commit -m "feat(frontend): add low-confidence sections warning banner in deep dive reports"
```

---

### Task 2: Richer Critic retry with targeted re-search

Currently the Critic triggers a full pipeline retry. Change it to identify WHICH sections have low confidence and pass targeted re-search instructions back to Searcher.

**Files:**
- Modify: `backend/models.py` — update `CriticReport` model
- Modify: `backend/graph.py` — add `retry_targets` to `AgentState`, update `should_retry`
- Modify: `backend/nodes/critic.py` — populate `low_confidence_sections`
- Modify: `backend/nodes/searcher.py` — read `retry_targets` for focused search
- Modify: `backend/nodes/planner.py` — use `retry_targets` for focused plan
- Test: `backend/tests/test_critic.py` — update retry tests
- Test: `backend/tests/test_graph.py` — update should_retry tests

**Step 1: Write failing tests**

Append to `backend/tests/test_critic.py`:

```python
class TestCriticTargetedRetry:
    def test_populates_low_confidence_sections(self):
        """Critic should list sections with confidence < 0.4."""
        from backend.nodes.critic import critique

        critic_report = CriticReport(
            overall_confidence=0.5,
            section_scores={
                "overview": 0.8,
                "funding": 0.3,
                "key_people": 0.2,
                "product_technology": 0.7,
                "recent_news": 0.6,
                "competitors": 0.35,
                "red_flags": 0.5,
            },
            verifications=[],
            gaps=["funding details", "leadership team"],
            should_retry=False,
            low_confidence_sections=["funding", "key_people", "competitors"],
        )

        assert critic_report.low_confidence_sections == ["funding", "key_people", "competitors"]

    def test_should_retry_true_when_low_confidence_sections_exist(self):
        """should_retry should be True when 3+ sections are below 0.4."""
        report = CriticReport(
            overall_confidence=0.4,
            section_scores={
                "overview": 0.8,
                "funding": 0.2,
                "key_people": 0.3,
                "product_technology": 0.3,
                "recent_news": 0.6,
                "competitors": 0.5,
                "red_flags": 0.5,
            },
            low_confidence_sections=["funding", "key_people", "product_technology"],
            should_retry=True,
        )
        assert report.should_retry is True
        assert len(report.low_confidence_sections) == 3
```

Append to `backend/tests/test_graph.py`:

```python
class TestTargetedRetry:
    def test_should_retry_uses_low_confidence_sections(self):
        """should_retry returns 'searcher' when low_confidence_sections is non-empty."""
        from backend.graph import should_retry

        mock_critic = MagicMock()
        mock_critic.should_retry = True
        mock_critic.low_confidence_sections = ["funding", "key_people"]

        state = {"critic_report": mock_critic, "retry_count": 0}
        assert should_retry(state) == "searcher"

    def test_should_retry_ends_when_no_low_confidence(self):
        """should_retry returns 'end' when low_confidence_sections is empty."""
        from backend.graph import should_retry

        mock_critic = MagicMock()
        mock_critic.should_retry = False
        mock_critic.low_confidence_sections = []

        state = {"critic_report": mock_critic, "retry_count": 0}
        assert should_retry(state) == "end"
```

**Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_critic.py::TestCriticTargetedRetry tests/test_graph.py::TestTargetedRetry -v`
Expected: FAIL — `low_confidence_sections` field doesn't exist yet.

**Step 3: Update CriticReport model**

In `backend/models.py`, add `low_confidence_sections` field to `CriticReport`:

```python
class CriticReport(BaseModel):
    overall_confidence: float = Field(ge=0.0, le=1.0)
    section_scores: dict[str, float] = {}
    verifications: list[CriticVerification] = []
    gaps: list[str] = []
    should_retry: bool = False
    retry_queries: list[str] = []
    low_confidence_sections: list[str] = []
```

**Step 4: Add `retry_targets` to AgentState**

In `backend/graph.py`, add to `AgentState`:

```python
class AgentState(TypedDict, total=False):
    query: str
    mode: str
    search_plan: SearchPlan
    raw_signals: list[RawCompanySignal]
    company_profiles: list[CompanyProfile]
    report: Union[ExploreReport, DeepDiveReport]
    critic_report: CriticReport
    retry_count: int
    retry_targets: list[str]
    status_events: Annotated[list[StatusEvent], operator.add]
```

**Step 5: Update Critic node to populate low_confidence_sections and set retry_targets**

In `backend/nodes/critic.py`, after the LLM call, add logic to derive `low_confidence_sections` from `section_scores` if the LLM didn't populate it, and set `retry_targets`:

```python
    # Derive low_confidence_sections from section_scores if not populated by LLM
    if not critic_report.low_confidence_sections and critic_report.section_scores:
        critic_report.low_confidence_sections = [
            section for section, score in critic_report.section_scores.items()
            if score < 0.4
        ]

    # Set should_retry based on low_confidence_sections count
    if len(critic_report.low_confidence_sections) >= 3 and retry_count < 1:
        critic_report.should_retry = True
    elif retry_count >= 1:
        critic_report.should_retry = False

    return {
        "critic_report": critic_report,
        "retry_count": retry_count + (1 if critic_report.should_retry else 0),
        "retry_targets": critic_report.low_confidence_sections if critic_report.should_retry else [],
    }
```

**Step 6: Update Planner to use retry_targets**

In `backend/nodes/planner.py`, update the retry context to use `retry_targets` if available:

```python
    retry_context = ""
    if state.get("retry_count", 0) > 0:
        targets = state.get("retry_targets", [])
        if targets:
            retry_context = f"\n\nPrevious search had low confidence in these sections: {', '.join(targets)}. Generate search terms specifically targeting these topics."
        elif state.get("critic_report"):
            gaps = state["critic_report"].gaps
            retry_context = f"\n\nPrevious search had gaps: {', '.join(gaps)}. Focus on filling these."
```

**Step 7: Update Searcher to focus on retry_targets**

In `backend/nodes/searcher.py`, at the start of `search()`, check for retry_targets and filter search terms:

```python
def search(state: dict) -> dict:
    plan: SearchPlan = state["search_plan"]
    mode = state["mode"]
    cache = get_cache()
    signals: list[RawCompanySignal] = []

    # On retry, only use the new targeted search terms (skip cache for freshness)
    retry_targets = state.get("retry_targets", [])
    if retry_targets:
        logger.info("Targeted retry for sections: %s", retry_targets)
```

The rest of the search logic stays the same — the Planner already generates targeted search terms when retry_targets is set.

**Step 8: Run all tests**

Run: `cd backend && python -m pytest tests/test_critic.py tests/test_graph.py tests/test_searcher.py tests/test_planner.py -v`
Expected: All PASS.

**Step 9: Commit**

```bash
git add backend/models.py backend/graph.py backend/nodes/critic.py backend/nodes/planner.py backend/nodes/searcher.py backend/tests/test_critic.py backend/tests/test_graph.py
git commit -m "feat(critic): targeted retry with low_confidence_sections instead of full pipeline retry"
```

---

### Task 3: Source provenance chain with Citation model

Add inline citations to reports so every claim traces back to a specific source URL + snippet.

**Files:**
- Modify: `backend/models.py` — add `Citation` model, add `citations` to reports
- Modify: `backend/nodes/synthesis.py` — update prompts to emit `[1]` markers
- Modify: `backend/nodes/critic.py` — verify citations exist in source pool
- Test: `backend/tests/test_models.py` — test Citation model
- Test: `backend/tests/test_synthesis.py` — test citation prompt

**Step 1: Write failing test for Citation model**

Append to `backend/tests/test_models.py`:

```python
class TestCitationModel:
    def test_citation_valid(self):
        from backend.models import Citation
        c = Citation(id=1, url="https://example.com", snippet="test snippet")
        assert c.id == 1
        assert c.url == "https://example.com"

    def test_deep_dive_report_accepts_citations(self):
        from backend.models import Citation, DeepDiveReport, DeepDiveSection
        section = DeepDiveSection(title="Overview", content="Test [1]", confidence=0.8)
        report = DeepDiveReport(
            query="Test",
            company_name="Test Co",
            overview=section,
            funding=section,
            key_people=section,
            product_technology=section,
            recent_news=section,
            competitors=section,
            red_flags=section,
            citations=[Citation(id=1, url="https://example.com", snippet="test")],
        )
        assert len(report.citations) == 1
```

**Step 2: Add Citation model to models.py**

After `StatusEvent` class, add:

```python
class Citation(BaseModel):
    id: int
    url: str
    snippet: str = ""
    extracted_at: Optional[str] = None
```

Add `citations: list[Citation] = []` to both `ExploreReport` and `DeepDiveReport`.

For `ExploreReport`:
```python
class ExploreReport(BaseModel):
    query: str
    sector: str
    companies: list[ExploreCompany]
    sub_sectors: list[str]
    summary: str
    citations: list[Citation] = []
```

For `DeepDiveReport`, add after `red_flag_entries`:
```python
    citations: list[Citation] = []
```

**Step 3: Update Synthesis prompts**

In `backend/nodes/synthesis.py`, add to the end of both `EXPLORE_SYSTEM` and `DEEP_DIVE_SYSTEM` prompts:

For `EXPLORE_SYSTEM`, add before the closing `"""`:
```
CITATIONS: For every factual claim, include an inline citation marker like [1], [2], etc.
Populate the 'citations' array with corresponding entries: {id, url, snippet}.
The snippet should be the exact text from the source that supports the claim.
```

For `DEEP_DIVE_SYSTEM`, add before the closing `"""`:
```
CITATIONS: For every factual claim in section content, include inline citation markers [1], [2], etc.
Populate the 'citations' array with corresponding entries: {id, url, snippet}.
The snippet should be the exact text from the source that supports the claim.
Each citation id must be unique across the entire report.
```

**Step 4: Update Critic to verify citations**

In `backend/nodes/critic.py`, add to `CRITIC_SYSTEM` prompt (append before the closing `"""`):

```
7. Verify that each citation [N] in the report maps to a valid source URL in the raw data.
   Flag citations that reference URLs not present in the source pool as 'unverified'.
```

**Step 5: Run tests**

Run: `cd backend && python -m pytest tests/test_models.py tests/test_synthesis.py tests/test_critic.py -v`
Expected: All PASS.

**Step 6: Commit**

```bash
git add backend/models.py backend/nodes/synthesis.py backend/nodes/critic.py backend/tests/test_models.py
git commit -m "feat(citations): add Citation model and inline source provenance to reports"
```

---

### Task 4: SqliteSaver checkpointing

Add LangGraph checkpointing so interrupted runs can resume from the last completed node.

**Files:**
- Modify: `backend/requirements.txt` — add langgraph-checkpoint-sqlite
- Modify: `backend/graph.py` — add checkpointer to compile()
- Modify: `backend/main.py` — pass thread_id in config, emit it via SSE
- Test: `backend/tests/test_graph.py` — test compilation with checkpointer

**Step 1: Add dependency**

Add to `backend/requirements.txt`:
```
langgraph-checkpoint-sqlite>=2.0.0
```

Also add to `backend/requirements-dev.txt` (it includes requirements.txt via -r).

**Step 2: Write failing test**

Append to `backend/tests/test_graph.py`:

```python
class TestCheckpointing:
    def test_graph_compiles_with_checkpointer(self):
        """Graph should compile successfully with SqliteSaver checkpointer."""
        try:
            from langgraph.checkpoint.sqlite import SqliteSaver
        except ImportError:
            pytest.skip("langgraph-checkpoint-sqlite not installed")

        from backend.graph import _build_graph
        graph = _build_graph()
        with SqliteSaver.from_conn_string(":memory:") as checkpointer:
            compiled = graph.compile(checkpointer=checkpointer)
            assert compiled is not None
```

**Step 3: Update graph.py build functions**

```python
def build_explore_graph(checkpointer=None):
    """Compile the explore-mode graph."""
    graph = _build_graph()
    return graph.compile(checkpointer=checkpointer)


def build_deep_dive_graph(checkpointer=None):
    """Compile the deep-dive-mode graph."""
    graph = _build_graph()
    return graph.compile(checkpointer=checkpointer)
```

**Step 4: Update main.py to use checkpointer and thread_id**

Add imports at top of `backend/main.py`:
```python
import uuid
```

In the `event_generator()`, add checkpointer setup:

```python
    async def event_generator():
        try:
            # Set up checkpointer for resilience
            checkpointer = None
            try:
                from langgraph.checkpoint.sqlite import SqliteSaver
                checkpointer = SqliteSaver.from_conn_string("checkpoints.db")
            except ImportError:
                logger.info("SqliteSaver not available, running without checkpointing")

            thread_id = str(uuid.uuid4())

            if req.mode == "explore":
                graph = build_explore_graph(checkpointer=checkpointer)
            else:
                graph = build_deep_dive_graph(checkpointer=checkpointer)
```

And update the `graph.astream()` config to include thread_id:

```python
            async for chunk in graph.astream(
                {"query": req.query, "mode": req.mode},
                stream_mode="updates",
                config={
                    "configurable": {"thread_id": thread_id},
                    "metadata": {
                        "mode": req.mode,
                        "query": req.query,
                    }
                },
            ):
```

Add `thread_id` to the SSE start event:

```python
            yield ServerSentEvent(
                data=json.dumps({"node": "system", "status": "running", "detail": f"Starting {req.mode} pipeline", "thread_id": thread_id}),
                event="status",
            )
```

**Step 5: Install dependency and run tests**

Run: `cd backend && pip install langgraph-checkpoint-sqlite>=2.0.0 && python -m pytest tests/test_graph.py -v`
Expected: All PASS.

**Step 6: Commit**

```bash
git add backend/requirements.txt backend/requirements-dev.txt backend/graph.py backend/main.py backend/tests/test_graph.py
git commit -m "feat(checkpointing): add SqliteSaver for graph state persistence and resume"
```

---

### Task 5: SSE endpoint tests

The most user-facing and fragile part of the system is currently untested.

**Files:**
- Create: `backend/tests/test_sse.py`

**Step 1: Write SSE endpoint tests**

Create `backend/tests/test_sse.py`:

```python
# backend/tests/test_sse.py
"""Tests for SSE streaming endpoints using fixture/cached queries."""
import json
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from backend.main import app


@pytest.fixture
def client():
    return TestClient(app)


class TestSSEFixtureQueries:
    """Test SSE behavior for fixture (offline demo) queries which return cached JSON."""

    def test_fixture_query_returns_json_not_sse(self, client):
        """Fixture queries should return immediate JSON, not SSE stream."""
        resp = client.post("/api/query", json={"query": "Nvidia", "mode": "deep_dive"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["cached"] is True
        assert "data" in data

    def test_fixture_explore_returns_json(self, client):
        """Explore fixture queries should return immediate JSON."""
        resp = client.post("/api/query", json={"query": "AI inference chips", "mode": "explore"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["cached"] is True

    def test_cache_hit_returns_json(self, client):
        """Cached reports should return immediate JSON."""
        mock_cache = MagicMock()
        mock_cache.get_report.return_value = {"report": {"test": True}, "_mode": "explore", "_query": "test"}

        with patch("backend.main.cache", mock_cache):
            with patch("backend.main.get_fixture", return_value=None):
                resp = client.post("/api/query", json={"query": "cached query", "mode": "explore"})

        assert resp.status_code == 200
        data = resp.json()
        assert data["cached"] is True


class TestSSEValidation:
    """Test validation behavior on /api/query endpoint."""

    def test_empty_query_rejected(self, client):
        """Empty query should be rejected with 422."""
        resp = client.post("/api/query", json={"query": "", "mode": "explore"})
        assert resp.status_code == 422

    def test_short_query_rejected(self, client):
        """Very short query should be rejected by Tier 2 validation."""
        resp = client.post("/api/query", json={"query": "ab", "mode": "explore"})
        assert resp.status_code == 422

    def test_invalid_mode_rejected(self, client):
        """Invalid mode should be rejected."""
        resp = client.post("/api/query", json={"query": "test query", "mode": "invalid"})
        assert resp.status_code == 422


class TestHistoryEndpoint:
    """Test history and report CRUD endpoints."""

    def test_history_returns_list(self, client):
        """GET /api/history should return a list."""
        resp = client.get("/api/history")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_missing_report_returns_404(self, client):
        """GET /api/report/{filename} for non-existent file returns 404."""
        resp = client.get("/api/report/nonexistent.json")
        assert resp.status_code == 404

    def test_delete_missing_report_returns_404(self, client):
        """DELETE /api/report/{filename} for non-existent file returns 404."""
        resp = client.delete("/api/report/nonexistent.json")
        assert resp.status_code == 404
```

**Step 2: Run tests**

Run: `cd backend && python -m pytest tests/test_sse.py -v`
Expected: All PASS.

**Step 3: Commit**

```bash
git add backend/tests/test_sse.py
git commit -m "test(sse): add endpoint tests for fixture queries, validation, and CRUD"
```

---

## Phase 3

---

### Task 6: Token streaming from Synthesis

Stream LLM output token-by-token during Synthesis so users see the report appear progressively instead of waiting for full generation.

**Files:**
- Modify: `backend/nodes/synthesis.py` — add streaming variant
- Modify: `backend/main.py` — emit token events during synthesis node
- Modify: `frontend/src/hooks/useAgentQuery.js` — handle "token" SSE events

**Step 1: Add streaming support to Synthesis node**

The challenge: `with_structured_output()` doesn't support token streaming. Solution: run structured output as before, but ALSO stream raw text from a parallel LLM call for the UX, then use the structured output as the actual result.

Actually, a simpler approach: don't change the synthesis node at all. Instead, in `main.py`, when the synthesis node completes, stream the report content section-by-section as SSE events. This gives progressive display without any LLM changes.

In `backend/main.py`, after detecting the synthesis node completion in the `event_generator()`, emit section-level events:

```python
                    # After synthesis completes, stream report sections
                    if node_name == "synthesis" and isinstance(output, dict) and "report" in output:
                        report_obj = output["report"]
                        if hasattr(report_obj, "model_dump"):
                            report_dict = report_obj.model_dump()
                            # Stream each top-level section as it "appears"
                            for key in ["overview", "funding", "key_people", "product_technology", "recent_news", "competitors", "red_flags"]:
                                if key in report_dict and report_dict[key]:
                                    yield ServerSentEvent(
                                        data=json.dumps({"section": key, "content": report_dict[key]}),
                                        event="section",
                                    )
```

In `frontend/src/hooks/useAgentQuery.js`, add handling for the "section" event type in the SSE parser:

```javascript
              if (eventType === "section") {
                setEvents((prev) => [...prev, { ...data, type: "section", timestamp: new Date().toISOString() }]);
              }
```

**Step 2: Verify build**

Run backend: `cd backend && python -c "from backend.main import app; print('OK')"`
Run frontend: `cd frontend && npm run build`
Expected: Both pass.

**Step 3: Commit**

```bash
git add backend/main.py frontend/src/hooks/useAgentQuery.js
git commit -m "feat(streaming): emit section-level SSE events after synthesis for progressive display"
```

---

### Task 7: LangSmith eval harness (pytest)

Create a pytest fixture that runs the full graph against fixture datasets and asserts confidence scores meet minimum thresholds. This becomes a regression suite for prompt changes.

**Files:**
- Create: `backend/tests/test_eval.py`

**Step 1: Write the eval harness**

Create `backend/tests/test_eval.py`:

```python
# backend/tests/test_eval.py
"""LangSmith-compatible evaluation harness using fixture datasets.

Runs structured assertions against the 5 pre-built fixture datasets to catch
regressions in report quality, confidence scoring, and data completeness.
"""
import json
import pytest
from pathlib import Path

FIXTURES_DIR = Path(__file__).resolve().parent.parent / "fixtures"


def _load_fixture(filename: str) -> dict:
    path = FIXTURES_DIR / filename
    assert path.exists(), f"Fixture not found: {path}"
    return json.loads(path.read_text(encoding="utf-8"))


class TestExploreFixtureQuality:
    """Validate explore fixture data meets minimum quality bar."""

    @pytest.mark.parametrize("fixture_file", [
        "explore_ai_inference_chips.json",
        "explore_digital_health_saas.json",
    ])
    def test_has_minimum_companies(self, fixture_file):
        data = _load_fixture(fixture_file)
        report = data.get("report", data)
        companies = report.get("companies", [])
        assert len(companies) >= 5, f"Expected at least 5 companies, got {len(companies)}"

    @pytest.mark.parametrize("fixture_file", [
        "explore_ai_inference_chips.json",
        "explore_digital_health_saas.json",
    ])
    def test_companies_have_required_fields(self, fixture_file):
        data = _load_fixture(fixture_file)
        report = data.get("report", data)
        for company in report.get("companies", []):
            assert company.get("name"), "Company missing name"
            assert company.get("sub_sector"), "Company missing sub_sector"
            assert company.get("description"), "Company missing description"

    @pytest.mark.parametrize("fixture_file", [
        "explore_ai_inference_chips.json",
        "explore_digital_health_saas.json",
    ])
    def test_has_summary(self, fixture_file):
        data = _load_fixture(fixture_file)
        report = data.get("report", data)
        summary = report.get("summary", "")
        assert len(summary) > 50, f"Summary too short: {len(summary)} chars"


class TestDeepDiveFixtureQuality:
    """Validate deep dive fixture data meets minimum quality bar."""

    @pytest.mark.parametrize("fixture_file", [
        "deep_dive_nvidia.json",
        "deep_dive_mistral_ai.json",
        "deep_dive_recursion_pharma.json",
    ])
    def test_has_all_sections(self, fixture_file):
        data = _load_fixture(fixture_file)
        report = data.get("report", data)
        required = ["overview", "funding", "key_people", "product_technology",
                     "recent_news", "competitors", "red_flags"]
        for section in required:
            assert section in report, f"Missing section: {section}"
            section_data = report[section]
            if isinstance(section_data, dict):
                assert section_data.get("content"), f"Section {section} has no content"

    @pytest.mark.parametrize("fixture_file", [
        "deep_dive_nvidia.json",
        "deep_dive_mistral_ai.json",
        "deep_dive_recursion_pharma.json",
    ])
    def test_has_metadata(self, fixture_file):
        data = _load_fixture(fixture_file)
        report = data.get("report", data)
        assert report.get("company_name"), "Missing company_name"

    @pytest.mark.parametrize("fixture_file", [
        "deep_dive_nvidia.json",
        "deep_dive_mistral_ai.json",
        "deep_dive_recursion_pharma.json",
    ])
    def test_confidence_scores_reasonable(self, fixture_file):
        data = _load_fixture(fixture_file)
        critic = data.get("critic", data.get("critic_report", {}))
        if not critic or not critic.get("section_scores"):
            pytest.skip("No critic scores in fixture")
        scores = critic["section_scores"]
        for section, score in scores.items():
            assert 0.0 <= score <= 1.0, f"Score out of range for {section}: {score}"
        avg = sum(scores.values()) / len(scores)
        assert avg >= 0.3, f"Average confidence too low: {avg:.2f}"


class TestFixtureDataIntegrity:
    """Cross-cutting data integrity checks."""

    @pytest.mark.parametrize("fixture_file,mode", [
        ("explore_ai_inference_chips.json", "explore"),
        ("explore_digital_health_saas.json", "explore"),
        ("deep_dive_nvidia.json", "deep_dive"),
        ("deep_dive_mistral_ai.json", "deep_dive"),
        ("deep_dive_recursion_pharma.json", "deep_dive"),
    ])
    def test_fixture_is_valid_json(self, fixture_file, mode):
        data = _load_fixture(fixture_file)
        assert isinstance(data, dict)
        # Should have either report key or be the report itself
        report = data.get("report", data)
        assert isinstance(report, dict)
```

**Step 2: Run eval harness**

Run: `cd backend && python -m pytest tests/test_eval.py -v`
Expected: All PASS (fixtures contain real demo data).

**Step 3: Commit**

```bash
git add backend/tests/test_eval.py
git commit -m "test(eval): add fixture-based quality regression harness for reports"
```

---

## Verification Checklist

After all 7 tasks:

```bash
# Full backend test suite
cd backend && python -m pytest tests/ -v

# Frontend build
cd frontend && npm run build

# Verify new models
python -c "from backend.models import Citation, CriticReport; print('Models OK')"

# Verify checkpointing
python -c "from backend.graph import build_explore_graph; print('Graph OK')"

# Count total tests
cd backend && python -m pytest tests/ --co -q | tail -1
```

---

## Summary

| Task | Type | Files Changed | Estimated Time |
|------|------|---------------|----------------|
| P2 T1: Low-confidence banner | Frontend | DeepDiveView.jsx | 10 min |
| P2 T2: Targeted Critic retry | Backend | models, graph, critic, planner, searcher, 2 test files | 45 min |
| P2 T3: Citation model | Backend | models, synthesis, critic, test_models | 30 min |
| P2 T4: SqliteSaver | Backend | requirements, graph, main, test_graph | 20 min |
| P2 T5: SSE tests | Backend | test_sse.py (new) | 15 min |
| P3 T6: Section streaming | Full-stack | main.py, useAgentQuery.js | 20 min |
| P3 T7: Eval harness | Backend | test_eval.py (new) | 15 min |
| **Total** | | | **~2.5 hours** |
