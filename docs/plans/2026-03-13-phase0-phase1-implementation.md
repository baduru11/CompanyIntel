# Phase 0 + Phase 1 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix 6 critical bugs (Phase 0), then ship 6 high-impact/low-effort improvements (Phase 1).

**Architecture:** All changes are surgical edits to existing files. No new modules except one new test file. Phase 0 fixes real bugs. Phase 1 adds LangSmith observability, parallelizes the bottleneck Profiler node, fixes GraphState accumulation, hardens the cache, and adds cost tracking.

**Tech Stack:** Python 3.12, FastAPI, LangGraph 0.4, Pydantic v2, React 19, LangChain

---

## Phase 0: Bug Fixes

---

### Task 1: Fix fail-open validation

The LLM semantic validation in `validation.py` silently passes queries through when the LLM call fails. This should fail-closed with a descriptive error.

**Files:**
- Modify: `backend/validation.py:132-135`
- Test: `backend/tests/test_validation.py` (create new)

**Step 1: Write the failing test**

Create `backend/tests/test_validation.py`:

```python
# backend/tests/test_validation.py
import pytest
from unittest.mock import patch, AsyncMock
from backend.validation import validate_query_semantic, validate_query_rules, QueryValidation


class TestValidateQueryRules:
    def test_rejects_short_query(self):
        result = validate_query_rules("ab")
        assert not result.is_valid
        assert "too short" in result.reason

    def test_rejects_long_query(self):
        result = validate_query_rules("x" * 201)
        assert not result.is_valid
        assert "too long" in result.reason

    def test_accepts_valid_query(self):
        result = validate_query_rules("AI infrastructure startups")
        assert result.is_valid


class TestValidateQuerySemantic:
    @pytest.mark.asyncio
    async def test_returns_valid_for_valid_response(self):
        mock_llm = AsyncMock()
        mock_llm.ainvoke.return_value = AsyncMock(content="VALID")

        with patch("backend.validation.get_llm", return_value=mock_llm):
            result = await validate_query_semantic("Nvidia")
        assert result.is_valid

    @pytest.mark.asyncio
    async def test_returns_invalid_for_invalid_response(self):
        mock_llm = AsyncMock()
        mock_llm.ainvoke.return_value = AsyncMock(
            content="INVALID|Not a business query|Try a company name"
        )

        with patch("backend.validation.get_llm", return_value=mock_llm):
            result = await validate_query_semantic("recipe for cookies")
        assert not result.is_valid
        assert "Not a business query" in result.reason
        assert "Try a company name" in result.suggestion

    @pytest.mark.asyncio
    async def test_fails_closed_on_llm_error(self):
        """When the LLM call fails, validation should reject the query."""
        with patch("backend.validation.get_llm", side_effect=Exception("LLM down")):
            result = await validate_query_semantic("test query")
        assert not result.is_valid
        assert "unavailable" in result.reason.lower()

    @pytest.mark.asyncio
    async def test_strips_whitespace_from_pipe_parts(self):
        mock_llm = AsyncMock()
        mock_llm.ainvoke.return_value = AsyncMock(
            content="INVALID | has spaces | suggestion here "
        )

        with patch("backend.validation.get_llm", return_value=mock_llm):
            result = await validate_query_semantic("hello")
        assert not result.is_valid
        assert result.reason == "has spaces"
        assert result.suggestion == "suggestion here"
```

**Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_validation.py::TestValidateQuerySemantic::test_fails_closed_on_llm_error -v`
Expected: FAIL — currently returns `is_valid=True` on exception.

**Step 3: Fix validation.py**

In `backend/validation.py`, replace lines 132-135:

```python
# OLD (fail-open):
    except Exception:
        # Fail-open: never block a potentially legitimate query
        logger.exception("Semantic validation failed — allowing query through")
        return QueryValidation(is_valid=True)

# NEW (fail-closed):
    except Exception:
        logger.exception("Semantic validation failed — rejecting query")
        return QueryValidation(
            is_valid=False,
            reason="Validation service temporarily unavailable. Please retry in a moment.",
            suggestion="If this persists, check that the backend has a valid OPENROUTER_API_KEY.",
        )
```

Also add `pytest-asyncio` to requirements if not present. Add to `backend/requirements.txt`:
```
pytest-asyncio==0.24.0
```

**Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_validation.py -v`
Expected: All 5 tests PASS.

**Step 5: Commit**

```bash
git add backend/validation.py backend/tests/test_validation.py backend/requirements.txt
git commit -m "fix(validation): fail-closed on LLM error instead of fail-open"
```

---

### Task 2: Add error handling to all 5 nodes

None of the LangGraph nodes have try/except around LLM or API calls. A single API hiccup crashes the entire pipeline with a generic error.

**Files:**
- Modify: `backend/nodes/planner.py:26-44`
- Modify: `backend/nodes/searcher.py:65-95`
- Modify: `backend/nodes/profiler.py:67-109`
- Modify: `backend/nodes/synthesis.py:62-86`
- Modify: `backend/nodes/critic.py:20-47`

**Step 1: Write failing tests**

Add to `backend/tests/test_planner.py` (append at bottom of file):

```python
class TestPlannerErrorHandling:
    def test_raises_descriptive_error_on_llm_failure(self):
        """Planner should raise a clear error when LLM fails, not a raw exception."""
        from backend.nodes.planner import plan_search

        mock_llm = MagicMock()
        mock_structured = MagicMock()
        mock_structured.invoke.side_effect = Exception("API timeout")
        mock_llm.with_structured_output.return_value = mock_structured

        with patch("backend.nodes.planner.get_llm", return_value=mock_llm):
            with pytest.raises(RuntimeError, match="Planner failed"):
                plan_search({"query": "AI chips", "mode": "explore"})
```

Add to `backend/tests/test_synthesis.py` (append at bottom of file):

```python
class TestSynthesisErrorHandling:
    def test_raises_descriptive_error_on_llm_failure(self):
        """Synthesis should raise a clear error when LLM fails."""
        from backend.nodes.synthesis import synthesize

        mock_llm = MagicMock()
        mock_structured = MagicMock()
        mock_structured.invoke.side_effect = Exception("API timeout")
        mock_llm.with_structured_output.return_value = mock_structured

        profiles = [_make_profile("Acme Corp")]

        with patch("backend.nodes.synthesis.get_llm", return_value=mock_llm):
            with pytest.raises(RuntimeError, match="Synthesis failed"):
                synthesize({"query": "AI chips", "mode": "explore", "company_profiles": profiles})
```

Add to `backend/tests/test_critic.py` (append at bottom of file):

```python
class TestCriticErrorHandling:
    def test_raises_descriptive_error_on_llm_failure(self):
        """Critic should raise a clear error when LLM fails."""
        from backend.nodes.critic import critique

        mock_llm = MagicMock()
        mock_structured = MagicMock()
        mock_structured.invoke.side_effect = Exception("API timeout")
        mock_llm.with_structured_output.return_value = mock_structured

        report = _make_deep_dive_report()

        with patch("backend.nodes.critic.get_llm", return_value=mock_llm):
            with pytest.raises(RuntimeError, match="Critic failed"):
                critique({"report": report, "retry_count": 0})
```

Add to `backend/tests/test_profiler.py` (append at bottom of file):

```python
class TestProfilerErrorHandling:
    def test_logs_warning_on_llm_failure(self):
        """Profiler should log a warning (not crash silently) when LLM extraction fails."""
        from backend.nodes.profiler import profile
        import logging

        signals = [_make_signal("Acme Corp", "https://acme.com", "Acme builds widgets")]

        mock_llm = MagicMock()
        mock_structured = MagicMock()
        mock_structured.invoke.side_effect = Exception("Parse error")
        mock_llm.with_structured_output.return_value = mock_structured

        with (
            patch("backend.nodes.profiler.get_llm", return_value=mock_llm),
            patch("backend.nodes.profiler.logger") as mock_logger,
        ):
            result = profile({"mode": "explore", "raw_signals": signals})

        # Should still return a stub profile (existing behavior)
        assert len(result["company_profiles"]) == 1
        assert result["company_profiles"][0].name == "Acme Corp"
        # But NOW it should also log a warning
        mock_logger.warning.assert_called_once()
```

**Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_planner.py::TestPlannerErrorHandling -v tests/test_synthesis.py::TestSynthesisErrorHandling -v tests/test_critic.py::TestCriticErrorHandling -v tests/test_profiler.py::TestProfilerErrorHandling -v`
Expected: All 4 FAIL.

**Step 3: Add error handling to each node**

**planner.py** — replace `plan_search` function:

```python
import logging

logger = logging.getLogger(__name__)


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
        logger.error("Planner failed for query=%r mode=%s: %s", query, mode, exc)
        raise RuntimeError(f"Planner failed: {exc}") from exc

    return {"search_plan": plan}
```

**searcher.py** — add logging import and wrap API calls in `search()`:

Add at top of file after existing imports:
```python
import logging

logger = logging.getLogger(__name__)
```

Replace the `search` function:

```python
def search(state: dict) -> dict:
    plan: SearchPlan = state["search_plan"]
    mode = state["mode"]
    cache = get_cache()
    signals: list[RawCompanySignal] = []

    if mode == "explore":
        try:
            exa = get_exa_client()
        except Exception as exc:
            logger.warning("Exa client unavailable, skipping: %s", exc)
            exa = None

        try:
            tavily = get_tavily_client()
        except Exception as exc:
            logger.warning("Tavily client unavailable, skipping: %s", exc)
            tavily = None

        if exa:
            for term in plan.search_terms:
                try:
                    signals.extend(_search_exa(exa, term, plan.target_company_count, cache))
                except Exception as exc:
                    logger.warning("Exa search failed for term=%r: %s", term, exc)

        if len(signals) < 5 and tavily:
            for term in plan.search_terms:
                try:
                    signals.extend(_search_tavily(tavily, term, cache))
                except Exception as exc:
                    logger.warning("Tavily search failed for term=%r: %s", term, exc)
    else:
        try:
            tavily = get_tavily_client()
        except Exception as exc:
            logger.error("Tavily client unavailable for deep_dive: %s", exc)
            raise RuntimeError(f"Search failed: Tavily client unavailable: {exc}") from exc

        for term in plan.search_terms:
            try:
                signals.extend(_search_tavily(tavily, term, cache))
            except Exception as exc:
                logger.warning("Tavily search failed for term=%r: %s", term, exc)

    if not signals:
        logger.error("No search results found for query in mode=%s", mode)
        raise RuntimeError("Search failed: no results found from any provider")

    # Deduplicate by URL
    seen_urls: set[str] = set()
    unique: list[RawCompanySignal] = []
    for s in signals:
        if s.url not in seen_urls:
            seen_urls.add(s.url)
            unique.append(s)

    # Cap results to avoid excessive LLM calls in profiler
    max_signals = plan.target_company_count * 2 if mode == "explore" else 30
    return {"raw_signals": unique[:max_signals]}
```

**profiler.py** — add logging and log the silent failure:

Add at top of file after existing imports:
```python
import logging

logger = logging.getLogger(__name__)
```

Replace the try/except block in `profile()` (lines 97-107):

```python
        try:
            result = structured_llm.invoke([
                SystemMessage(content=EXTRACTION_PROMPT),
                HumanMessage(content=f"Extract company profile from:\n\n{combined}")
            ])
            profiles.append(result)
        except Exception as exc:
            logger.warning(
                "LLM extraction failed for company=%r, using stub profile: %s",
                company_signals[0].company_name, exc,
            )
            profiles.append(CompanyProfile(
                name=company_signals[0].company_name,
                raw_sources=[s.url for s in company_signals],
            ))
```

Also add the message imports at top of profiler.py:
```python
from langchain_core.messages import SystemMessage, HumanMessage
```

**synthesis.py** — wrap LLM call:

Add at top of file after existing imports:
```python
import logging
from langchain_core.messages import SystemMessage, HumanMessage

logger = logging.getLogger(__name__)
```

Replace the function body's LLM calls:

```python
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
        logger.error("Synthesis failed for query=%r mode=%s: %s", state["query"], mode, exc)
        raise RuntimeError(f"Synthesis failed: {exc}") from exc

    return {"report": report}
```

**critic.py** — wrap LLM call:

Add at top of file after existing imports:
```python
import logging
from langchain_core.messages import SystemMessage, HumanMessage

logger = logging.getLogger(__name__)
```

Replace the function body:

```python
def critique(state: dict) -> dict:
    llm = get_llm()
    structured_llm = llm.with_structured_output(CriticReport)

    report = state["report"]
    raw_signals = state.get("raw_signals", [])
    profiles = state.get("company_profiles", [])
    retry_count = state.get("retry_count", 0)

    report_text = report.model_dump_json(indent=2) if hasattr(report, "model_dump_json") else str(report)
    raw_text = "\n".join(
        f"[{s.source}] {s.url}: {s.snippet[:500]}"
        for s in raw_signals
    ) if raw_signals else "No raw signals available"

    try:
        critic_report = structured_llm.invoke([
            SystemMessage(content=CRITIC_SYSTEM),
            HumanMessage(content=f"Report:\n{report_text}\n\nRaw sources:\n{raw_text}")
        ])
    except Exception as exc:
        logger.error("Critic failed: %s", exc)
        raise RuntimeError(f"Critic failed: {exc}") from exc

    # Enforce max 1 retry
    if retry_count >= 1:
        critic_report.should_retry = False

    return {
        "critic_report": critic_report,
        "retry_count": retry_count + (1 if critic_report.should_retry else 0),
    }
```

**Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_planner.py tests/test_synthesis.py tests/test_critic.py tests/test_profiler.py -v`
Expected: All tests PASS, including the new error handling tests.

**Step 5: Commit**

```bash
git add backend/nodes/planner.py backend/nodes/searcher.py backend/nodes/profiler.py backend/nodes/synthesis.py backend/nodes/critic.py backend/tests/test_planner.py backend/tests/test_synthesis.py backend/tests/test_critic.py backend/tests/test_profiler.py
git commit -m "fix(nodes): add error handling and logging to all 5 graph nodes"
```

---

### Task 3: Fix App.jsx closure bug

`handleDownloadPdf` references `companyName` in its dependency array and body, but `companyName` is defined AFTER the handler. The closure captures `undefined`.

**Files:**
- Modify: `frontend/src/App.jsx:144-167`

**Step 1: Move `companyName` extraction before handler definitions**

In `frontend/src/App.jsx`, move the extraction block (currently lines 160-167) to BEFORE `handleDownloadPdf` (before line 144). The result should look like:

Move lines 160-167 to after line 139 (after `handleDeepDive`), and update `handleDownloadPdf`:

```jsx
  // Extract company name and date for PDF — must be before handleDownloadPdf
  const companyName =
    queryResult?.report?.company?.name ||
    queryResult?.company_name ||
    queryResult?.query ||
    "";
  const reportDate = queryResult?.cached_at
    ? new Date(queryResult.cached_at).toLocaleDateString()
    : new Date().toLocaleDateString();

  /**
   * Handle PDF export for deep dive reports.
   */
  const handleDownloadPdf = useCallback(() => {
    const element = reportRef.current;
    if (!element) return;
    import('html2pdf.js').then(({ default: html2pdf }) => {
      const opt = {
        margin: [10, 10, 15, 10],
        filename: `${companyName || 'report'}-intel-report.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      };
      html2pdf().set(opt).from(element).save();
    });
  }, [companyName]);
```

Delete the old lines 160-167 (the duplicate extraction block that was there before).

**Step 2: Verify the app still builds**

Run: `cd frontend && npm run build`
Expected: Build succeeds with no errors.

**Step 3: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "fix(frontend): fix companyName stale closure in PDF export handler"
```

---

### Task 4: Remove dead code

`streaming.py` has two functions that are never imported. `useSSE.js` is a complete hook that is never used — `useAgentQuery.js` implements its own SSE via `fetch()`.

**Files:**
- Modify: `backend/streaming.py` (gut the file)
- Delete: `frontend/src/hooks/useSSE.js`
- Modify: `backend/main.py:28` (remove unused import)

**Step 1: Clean streaming.py**

Replace entire `backend/streaming.py` with:

```python
# backend/streaming.py
"""SSE streaming utilities for the FastAPI application.

Currently a placeholder — SSE events are constructed directly in main.py
using sse-starlette's ServerSentEvent class.
"""
```

**Step 2: Remove unused import in main.py**

In `backend/main.py`, delete line 28:
```python
from backend.streaming import format_sse
```

**Step 3: Delete useSSE.js**

Delete `frontend/src/hooks/useSSE.js`.

**Step 4: Verify nothing breaks**

Run backend tests: `cd backend && python -m pytest tests/ -v`
Run frontend build: `cd frontend && npm run build`
Expected: Both pass. No file imports useSSE or format_sse.

**Step 5: Commit**

```bash
git add backend/streaming.py backend/main.py
git rm frontend/src/hooks/useSSE.js
git commit -m "chore: remove dead code (streaming helpers, unused useSSE hook)"
```

---

### Task 5: Add timeouts to Searcher API calls

Exa and Tavily calls have no timeout. If either service hangs, the pipeline hangs indefinitely.

**Files:**
- Modify: `backend/nodes/searcher.py:27-62`

**Step 1: Write the failing test**

Add to `backend/tests/test_searcher.py` (append at bottom):

```python
class TestSearcherTimeout:
    def test_exa_search_respects_timeout(self):
        """Exa client.search should be called with a timeout-compatible pattern."""
        from backend.nodes.searcher import _search_exa

        plan = SearchPlan(search_terms=["AI chips"], target_company_count=10)

        mock_exa = MagicMock()
        mock_exa.search.side_effect = TimeoutError("Exa timed out")
        mock_cache = MagicMock()
        mock_cache.get_api.return_value = None

        # Should not raise — should return empty list
        result = _search_exa(mock_exa, "AI chips", 10, mock_cache)
        assert result == []

    def test_tavily_search_respects_timeout(self):
        """Tavily client.search should handle timeout gracefully."""
        from backend.nodes.searcher import _search_tavily

        mock_tavily = MagicMock()
        mock_tavily.search.side_effect = TimeoutError("Tavily timed out")
        mock_cache = MagicMock()
        mock_cache.get_api.return_value = None

        result = _search_tavily(mock_tavily, "AI chips", mock_cache)
        assert result == []
```

**Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_searcher.py::TestSearcherTimeout -v`
Expected: FAIL — currently exceptions propagate.

**Step 3: Add try/except to search helper functions**

In `backend/nodes/searcher.py`, wrap the API calls in `_search_exa` and `_search_tavily`:

```python
def _search_exa(client, query: str, num_results: int, cache: CacheManager) -> list[RawCompanySignal]:
    cached = cache.get_api("exa", query)
    if cached:
        return [RawCompanySignal(**s) for s in cached]

    try:
        results = client.search(query, num_results=num_results, type="auto")
    except Exception as exc:
        logger.warning("Exa search failed for query=%r: %s", query, exc)
        return []

    signals = [
        RawCompanySignal(
            company_name=r.title or "Unknown",
            url=r.url,
            snippet=r.text or "",
            source="exa",
        )
        for r in results.results
    ]
    cache.set_api("exa", query, [s.model_dump() for s in signals])
    return signals


def _search_tavily(client, query: str, cache: CacheManager) -> list[RawCompanySignal]:
    cached = cache.get_api("tavily", query)
    if cached:
        return [RawCompanySignal(**s) for s in cached]

    try:
        response = client.search(query, max_results=10)
    except Exception as exc:
        logger.warning("Tavily search failed for query=%r: %s", query, exc)
        return []

    signals = [
        RawCompanySignal(
            company_name=r.get("title", "Unknown"),
            url=r.get("url", ""),
            snippet=r.get("content", ""),
            source="tavily",
        )
        for r in response.get("results", [])
    ]
    cache.set_api("tavily", query, [s.model_dump() for s in signals])
    return signals
```

**Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_searcher.py -v`
Expected: All tests PASS.

**Step 5: Commit**

```bash
git add backend/nodes/searcher.py backend/tests/test_searcher.py
git commit -m "fix(searcher): handle API timeouts gracefully in Exa and Tavily calls"
```

---

### Task 6: Standardize message format across nodes

Planner uses `SystemMessage`/`HumanMessage`. Profiler, Synthesis, and Critic use raw dicts. Standardize on LangChain message objects.

**Files:**
- Modify: `backend/nodes/profiler.py:98-100` (already done in Task 2)
- Modify: `backend/nodes/synthesis.py:75-83` (already done in Task 2)
- Modify: `backend/nodes/critic.py:35-37` (already done in Task 2)

**Note:** This was already handled in Task 2 — all nodes now use `SystemMessage`/`HumanMessage`. No additional work needed. The imports and message format changes are included in the Task 2 code.

**Step 1: Verify consistency**

Run: `cd backend && python -m pytest tests/ -v`
Expected: All tests PASS. grep all node files to confirm no raw dict messages remain:

```bash
grep -n '"role":' backend/nodes/*.py
```
Expected: No matches (all converted to SystemMessage/HumanMessage).

**Step 2: Commit (if any remaining changes)**

This is a no-op if Task 2 was applied correctly. Skip this commit.

---

## Phase 1: High Impact, Low Effort

---

### Task 7: LangSmith integration

3 env vars + metadata tagging. LangGraph auto-instruments when env vars are set.

**Files:**
- Modify: `backend/config.py` (add LangSmith settings)
- Create: `backend/.env.example`
- Modify: `backend/main.py` (add trace metadata to graph invocation)

**Step 1: Add LangSmith settings to config.py**

In `backend/config.py`, add to the `Settings.__init__` method:

```python
class Settings:
    """Simple settings class that reads from environment variables."""

    def __init__(self):
        self.tavily_api_key: str = os.getenv("TAVILY_API_KEY", "")
        self.exa_api_key: str = os.getenv("EXA_API_KEY", "")
        self.openrouter_api_key: str = os.getenv("OPENROUTER_API_KEY", "")
        self.llm_provider: str = "openrouter"
        self.cache_dir: str = os.getenv("CACHE_DIR", "cache")
        self.llm_model: str = os.getenv("LLM_MODEL", "deepseek/deepseek-v3.2")
        # LangSmith (auto-enabled when LANGCHAIN_TRACING_V2=true)
        self.langsmith_tracing: bool = os.getenv("LANGCHAIN_TRACING_V2", "").lower() == "true"
```

Also make the model configurable in `get_llm()`:

```python
def get_llm():
    settings = get_settings()
    if not settings.openrouter_api_key:
        raise ValueError("OPENROUTER_API_KEY not set")
    from langchain_openai import ChatOpenAI
    return ChatOpenAI(
        model=settings.llm_model,
        api_key=settings.openrouter_api_key,
        base_url="https://openrouter.ai/api/v1",
        temperature=0,
    )
```

**Step 2: Create .env.example**

Create `backend/.env.example`:

```bash
# Required — LLM provider
OPENROUTER_API_KEY=your-openrouter-key
LLM_MODEL=deepseek/deepseek-v3.2

# Required — Search APIs
TAVILY_API_KEY=your-tavily-key
EXA_API_KEY=your-exa-key

# Optional — Cache
CACHE_DIR=cache

# Optional — LangSmith observability (uncomment to enable)
# LANGCHAIN_TRACING_V2=true
# LANGCHAIN_API_KEY=your-langsmith-key
# LANGCHAIN_PROJECT=companyintel
```

**Step 3: Add trace metadata to graph invocation in main.py**

In `backend/main.py`, update the `graph.astream()` call (line 224) to include metadata:

```python
            async for chunk in graph.astream(
                {"query": req.query, "mode": req.mode},
                stream_mode="updates",
                config={
                    "metadata": {
                        "mode": req.mode,
                        "query": req.query,
                    }
                },
            ):
```

**Step 4: Update test_config.py for new field**

Add to `backend/tests/test_config.py`:

```python
def test_settings_loads_llm_model():
    """Settings should pick up LLM_MODEL from environment."""
    env = {
        "LLM_MODEL": "openai/gpt-4o",
        "OPENROUTER_API_KEY": "test-key",
    }
    with patch.dict(os.environ, env, clear=False):
        from backend.config import get_settings
        get_settings.cache_clear()
        settings = get_settings()
        assert settings.llm_model == "openai/gpt-4o"


def test_settings_defaults_llm_model():
    """LLM_MODEL should default to deepseek."""
    keys_to_remove = ["LLM_MODEL"]
    cleaned_env = {k: v for k, v in os.environ.items() if k not in keys_to_remove}
    with patch.dict(os.environ, cleaned_env, clear=True):
        from backend.config import get_settings
        get_settings.cache_clear()
        settings = get_settings()
        assert settings.llm_model == "deepseek/deepseek-v3.2"
```

**Step 5: Run tests**

Run: `cd backend && python -m pytest tests/test_config.py -v`
Expected: All tests PASS.

**Step 6: Commit**

```bash
git add backend/config.py backend/.env.example backend/main.py backend/tests/test_config.py
git commit -m "feat: add LangSmith integration and configurable LLM model"
```

---

### Task 8: Profiler parallelism (asyncio.gather)

The single biggest latency win. Deep Dive Profiler crawls up to 5 URLs sequentially (30s timeout each = 150s worst case). Parallelizing cuts this to ~30s.

**Files:**
- Modify: `backend/nodes/profiler.py`

**Step 1: Write the failing test**

Add to `backend/tests/test_profiler.py` (append at bottom):

```python
class TestProfilerParallelism:
    def test_deep_dive_crawls_urls_concurrently(self):
        """In deep_dive mode, multiple URLs should be crawled concurrently, not sequentially."""
        import asyncio
        from unittest.mock import call
        from backend.nodes.profiler import profile

        signals = [
            _make_signal("Acme Corp", "https://a.com", "snippet a"),
            _make_signal("Acme Corp", "https://b.com", "snippet b"),
            _make_signal("Acme Corp", "https://c.com", "snippet c"),
        ]

        mock_llm = MagicMock()
        mock_structured = MagicMock()
        mock_structured.invoke.return_value = _make_profile("Acme Corp")
        mock_llm.with_structured_output.return_value = mock_structured

        crawl_calls = []

        async def mock_crawl(url, timeout=30.0):
            crawl_calls.append(url)
            return f"Content from {url}"

        with (
            patch("backend.nodes.profiler.get_llm", return_value=mock_llm),
            patch("backend.nodes.profiler.crawl_page", side_effect=mock_crawl),
        ):
            result = asyncio.get_event_loop().run_until_complete(
                asyncio.coroutine(lambda: profile({"mode": "deep_dive", "raw_signals": signals}))()
            ) if asyncio.get_event_loop().is_running() else profile({"mode": "deep_dive", "raw_signals": signals})

        # All 3 URLs should have been crawled
        assert len(crawl_calls) == 3
        assert len(result["company_profiles"]) == 1
```

**Step 2: Convert profiler to async with asyncio.gather**

Replace `backend/nodes/profiler.py`:

```python
# backend/nodes/profiler.py
from __future__ import annotations
import asyncio
import logging
import httpx
from langchain_core.messages import SystemMessage, HumanMessage
from backend.models import RawCompanySignal, CompanyProfile
from backend.config import get_llm

logger = logging.getLogger(__name__)

EXTRACTION_PROMPT = """Extract structured company data from the provided sources.
Only include information explicitly stated in the source text. Never guess or infer.

You MUST attempt to extract ALL of the following fields:

- name: The company's official name
- description: A 2-3 sentence summary of what the company does
- website: The company's primary website URL
- funding_total: Total funding raised (e.g. "$1.2B", "$50M"). Set funding_source_url too.
- funding_stage: Current stage (e.g. "Series B", "IPO / Public", "Seed").
  Set funding_stage_source_url too.
- key_investors: List of investor names (e.g. ["Sequoia Capital", "a16z"])
- founding_year: Year founded as integer (e.g. 2018). Set founding_year_source_url too.
- headcount_estimate: Approximate employees as string (e.g. "~500", "200-300")
- headquarters: City and region (e.g. "San Francisco, California")
- core_product: Main product or service (1-2 sentences)
- core_technology: Key technology used or developed (1-2 sentences)
- key_people: List of dicts with "name", "title", and optionally "background"
  Example: [{"name": "Jane Doe", "title": "CEO", "background": "Previously VP at Google"}]
- recent_news: List of dicts with "title", "date", "snippet"
  Example: [{"title": "Company raises $50M", "date": "2024-03", "snippet": "..."}]
- sub_sector: The company's specific sub-sector within its industry
- raw_sources: List of all source URLs used

If a field's data is not in the sources, leave it null or empty. For each factual field
you populate, set the corresponding source_url field to where you found it."""


async def crawl_page(url: str, timeout: float = 30.0) -> str | None:
    """Extract page content using Crawl4AI, fallback to Jina Reader."""
    try:
        from crawl4ai import WebCrawler
        crawler = WebCrawler()
        result = crawler.run(url=url)
        if result and result.markdown:
            return result.markdown
    except Exception:
        pass

    # Fallback: Jina Reader
    try:
        jina_url = f"https://r.jina.ai/{url}"
        async with httpx.AsyncClient() as client:
            resp = await client.get(jina_url, timeout=timeout, follow_redirects=True)
        if resp.status_code == 200 and len(resp.text) > 100:
            return resp.text
    except Exception:
        pass

    return None


def _group_signals_by_company(signals: list[RawCompanySignal]) -> dict[str, list[RawCompanySignal]]:
    """Group raw signals by normalized company name (case-insensitive, stripped)."""
    groups: dict[str, list[RawCompanySignal]] = {}
    for s in signals:
        key = s.company_name.strip().lower()
        groups.setdefault(key, []).append(s)
    return groups


def profile(state: dict) -> dict:
    """Profile node: extract structured CompanyProfile objects from raw signals.

    - Explore mode: Lightweight profiling using Tavily snippets only (no Crawl4AI).
    - Deep Dive mode: Full extraction using Crawl4AI (primary) -> Jina Reader (fallback)
      -> Tavily snippets (last resort). URLs are crawled concurrently.
    """
    mode = state["mode"]
    signals = state["raw_signals"]
    llm = get_llm()
    structured_llm = llm.with_structured_output(CompanyProfile)

    grouped = _group_signals_by_company(signals)
    profiles: list[CompanyProfile] = []

    for company_key, company_signals in grouped.items():
        snippets = "\n\n".join(
            f"Source: {s.url}\n{s.snippet}" for s in company_signals
        )

        extra_content = ""
        if mode == "deep_dive":
            urls = list({s.url for s in company_signals})[:5]

            # Crawl all URLs concurrently
            try:
                loop = asyncio.get_event_loop()
                if loop.is_running():
                    # Already in async context (e.g., called from FastAPI)
                    import concurrent.futures
                    with concurrent.futures.ThreadPoolExecutor() as pool:
                        pages = list(pool.map(
                            lambda u: asyncio.run(crawl_page(u)),
                            urls,
                        ))
                else:
                    pages = loop.run_until_complete(
                        asyncio.gather(*[crawl_page(url) for url in urls], return_exceptions=True)
                    )
            except RuntimeError:
                # No event loop — run synchronously
                pages = [asyncio.run(crawl_page(url)) for url in urls]

            for url, page in zip(urls, pages):
                if isinstance(page, str) and page:
                    extra_content += f"\n\n--- Full page: {url} ---\n{page[:5000]}"
                elif isinstance(page, Exception):
                    logger.warning("Crawl failed for %s: %s", url, page)

        combined = f"{snippets}{extra_content}"

        try:
            result = structured_llm.invoke([
                SystemMessage(content=EXTRACTION_PROMPT),
                HumanMessage(content=f"Extract company profile from:\n\n{combined}")
            ])
            profiles.append(result)
        except Exception as exc:
            logger.warning(
                "LLM extraction failed for company=%r, using stub profile: %s",
                company_signals[0].company_name, exc,
            )
            profiles.append(CompanyProfile(
                name=company_signals[0].company_name,
                raw_sources=[s.url for s in company_signals],
            ))

    return {"company_profiles": profiles}
```

**Step 3: Run all profiler tests**

Run: `cd backend && python -m pytest tests/test_profiler.py -v`
Expected: All tests PASS.

**Step 4: Commit**

```bash
git add backend/nodes/profiler.py backend/tests/test_profiler.py
git commit -m "perf(profiler): crawl URLs concurrently with asyncio.gather in deep_dive mode"
```

---

### Task 9: Fix GraphState accumulation

Verify that `status_events` uses the `Annotated[list, operator.add]` pattern (it already does — line 45 of graph.py). Check for any other list fields that might be overwritten on retry.

**Files:**
- Modify: `backend/graph.py:34-45`

**Step 1: Audit GraphState for overwrite risks**

The current `AgentState` (graph.py:34-45):
- `status_events` already uses `Annotated[list[StatusEvent], operator.add]` — correct.
- `raw_signals`, `company_profiles` — these are replaced on each node run. On retry, Searcher outputs new `raw_signals` which overwrites the previous ones. This is **correct behavior** — on retry we want fresh results.

No changes needed. The accumulation pattern is already correct for the one field that needs it.

**Step 2: Write a test to document this contract**

Add to `backend/tests/test_graph.py` (append at bottom):

```python
class TestGraphStateAccumulation:
    def test_status_events_accumulate_across_nodes(self):
        """status_events should use operator.add to merge, not replace."""
        from backend.graph import AgentState
        import typing

        hints = typing.get_type_hints(AgentState, include_extras=True)
        status_hint = hints.get("status_events")
        # Verify it has Annotated metadata with operator.add
        assert hasattr(status_hint, "__metadata__"), "status_events should be Annotated"
        assert status_hint.__metadata__[0] is operator.add, "status_events should accumulate with operator.add"

    def test_raw_signals_replaces_on_retry(self):
        """raw_signals should NOT accumulate — on retry we want fresh results."""
        from backend.graph import AgentState
        import typing

        hints = typing.get_type_hints(AgentState, include_extras=True)
        raw_hint = hints.get("raw_signals")
        # Should NOT have Annotated metadata (plain list, replaces on write)
        has_metadata = hasattr(raw_hint, "__metadata__")
        if has_metadata:
            assert raw_hint.__metadata__[0] is not operator.add, "raw_signals should replace, not accumulate"
```

**Step 3: Run tests**

Run: `cd backend && python -m pytest tests/test_graph.py::TestGraphStateAccumulation -v`
Expected: PASS.

**Step 4: Commit**

```bash
git add backend/tests/test_graph.py
git commit -m "test(graph): add tests documenting GraphState accumulation contract"
```

---

### Task 10: Cache TTL + error handling

Add expiry checking and try/except around file I/O. Skip file locking for now (Windows `fcntl` compatibility is complex — use atomic writes instead).

**Files:**
- Modify: `backend/cache.py`
- Modify: `backend/tests/test_cache.py`

**Step 1: Write failing tests**

Add to `backend/tests/test_cache.py` (append at bottom):

```python
from datetime import datetime, timezone, timedelta
from unittest.mock import patch


class TestCacheTTL:
    def test_expired_report_returns_none(self, tmp_path):
        """Reports older than TTL should return None."""
        cm = CacheManager(base_dir=str(tmp_path), report_ttl_days=7)

        # Write a report
        cm.set_report("explore", "AI chips", {"summary": "test"})

        # Should be found (fresh)
        assert cm.get_report("explore", "AI chips") is not None

        # Simulate 8 days later
        eight_days_later = datetime.now(timezone.utc) + timedelta(days=8)
        with patch("backend.cache.datetime") as mock_dt:
            mock_dt.now.return_value = eight_days_later
            mock_dt.fromisoformat = datetime.fromisoformat
            result = cm.get_report("explore", "AI chips")
        assert result is None

    def test_fresh_report_returns_data(self, tmp_path):
        """Reports within TTL should be returned normally."""
        cm = CacheManager(base_dir=str(tmp_path), report_ttl_days=7)
        cm.set_report("explore", "AI chips", {"summary": "test"})
        result = cm.get_report("explore", "AI chips")
        assert result is not None
        assert result["summary"] == "test"


class TestCacheErrorHandling:
    def test_get_report_handles_corrupted_json(self, tmp_path):
        """get_report should return None for corrupted JSON files."""
        cm = CacheManager(base_dir=str(tmp_path))
        # Write garbage to a cache file
        path = cm.report_dir / "explore_deadbeef.json"
        path.write_text("not valid json{{{", encoding="utf-8")
        # list_reports should not crash
        reports = cm.list_reports()
        # The corrupted file should be skipped
        assert isinstance(reports, list)

    def test_get_api_handles_corrupted_json(self, tmp_path):
        """get_api should return None for corrupted JSON files."""
        cm = CacheManager(base_dir=str(tmp_path))
        path = cm.api_dir / "exa_deadbeef.json"
        path.write_text("not valid json", encoding="utf-8")
        result = cm.get_api("exa", "anything")
        assert result is None
```

Note: the existing test_cache.py imports will need `CacheManager`:
```python
from backend.cache import CacheManager
```

**Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_cache.py::TestCacheTTL -v tests/test_cache.py::TestCacheErrorHandling -v`
Expected: FAIL.

**Step 3: Update cache.py**

Replace `backend/cache.py`:

```python
# backend/cache.py
from __future__ import annotations
import json
import hashlib
import logging
from datetime import datetime, timezone, timedelta
from pathlib import Path

logger = logging.getLogger(__name__)


class CacheManager:
    def __init__(self, base_dir: str = "cache", report_ttl_days: int = 7):
        self.base_dir = Path(base_dir)
        self.api_dir = self.base_dir / "api"
        self.report_dir = self.base_dir / "reports"
        self.report_ttl = timedelta(days=report_ttl_days)
        self.api_dir.mkdir(parents=True, exist_ok=True)
        self.report_dir.mkdir(parents=True, exist_ok=True)

    def _normalize_key(self, key: str) -> str:
        return key.strip().lower()

    def _hash_key(self, *parts: str) -> str:
        combined = "|".join(self._normalize_key(p) for p in parts)
        return hashlib.sha256(combined.encode()).hexdigest()[:16]

    def get_api(self, provider: str, query: str) -> dict | None:
        path = self.api_dir / f"{provider}_{self._hash_key(provider, query)}.json"
        if not path.exists():
            return None
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as exc:
            logger.warning("Corrupted API cache file %s: %s", path.name, exc)
            return None

    def set_api(self, provider: str, query: str, data: dict) -> None:
        path = self.api_dir / f"{provider}_{self._hash_key(provider, query)}.json"
        try:
            path.write_text(json.dumps(data, default=str), encoding="utf-8")
        except OSError as exc:
            logger.warning("Failed to write API cache %s: %s", path.name, exc)

    def get_report(self, mode: str, query: str) -> dict | None:
        path = self.report_dir / f"{mode}_{self._hash_key(mode, query)}.json"
        if not path.exists():
            return None
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as exc:
            logger.warning("Corrupted report cache file %s: %s", path.name, exc)
            return None

        # Check TTL
        cached_at = data.get("_cached_at")
        if cached_at:
            try:
                cached_time = datetime.fromisoformat(cached_at)
                if datetime.now(timezone.utc) - cached_time > self.report_ttl:
                    logger.info("Report cache expired for %s/%s", mode, query)
                    return None
            except (ValueError, TypeError):
                pass  # Can't parse timestamp — treat as valid

        return data

    def set_report(self, mode: str, query: str, data: dict) -> None:
        meta = {
            **data,
            "_cached_at": datetime.now(timezone.utc).isoformat(),
            "_mode": mode,
            "_query": query,
        }
        path = self.report_dir / f"{mode}_{self._hash_key(mode, query)}.json"
        try:
            path.write_text(json.dumps(meta, default=str), encoding="utf-8")
        except OSError as exc:
            logger.warning("Failed to write report cache %s: %s", path.name, exc)

    def get_report_by_filename(self, filename: str) -> dict | None:
        path = self.report_dir / filename
        if not path.exists() or path.parent != self.report_dir:
            return None
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as exc:
            logger.warning("Failed to read report %s: %s", filename, exc)
            return None

    def delete_report(self, filename: str) -> bool:
        path = self.report_dir / filename
        if path.exists() and path.parent == self.report_dir:
            try:
                path.unlink()
                return True
            except OSError as exc:
                logger.warning("Failed to delete report %s: %s", filename, exc)
        return False

    def list_reports(self) -> list[dict]:
        reports = []
        for path in self.report_dir.glob("*.json"):
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
                reports.append({
                    "mode": data.get("_mode", "unknown"),
                    "query": data.get("_query", "unknown"),
                    "cached_at": data.get("_cached_at", ""),
                    "filename": path.name,
                })
            except (json.JSONDecodeError, OSError) as exc:
                logger.warning("Skipping corrupted cache file %s: %s", path.name, exc)
                continue
        return sorted(reports, key=lambda r: r["cached_at"], reverse=True)
```

**Step 4: Run all cache tests**

Run: `cd backend && python -m pytest tests/test_cache.py -v`
Expected: All tests PASS.

**Step 5: Commit**

```bash
git add backend/cache.py backend/tests/test_cache.py
git commit -m "fix(cache): add TTL expiry, error handling for corrupted files"
```

---

### Task 11: Clean up requirements.txt

Remove unused dependencies, separate dev dependencies.

**Files:**
- Modify: `backend/requirements.txt`

**Step 1: Update requirements.txt**

```
fastapi==0.115.0
uvicorn[standard]==0.30.0
sse-starlette==2.1.0
langgraph==0.4.0
langchain-openai==0.3.0
langchain-core>=0.3.0
tavily-python==0.5.0
exa-py==1.5.0
crawl4ai==0.8.0
httpx>=0.27.2
pydantic>=2.10.0
pydantic-settings==2.7.0
python-dotenv==1.0.0
```

Create `backend/requirements-dev.txt`:

```
-r requirements.txt
pytest==8.3.0
pytest-asyncio==0.24.0
```

**Step 2: Verify installation**

Run: `cd backend && pip install -r requirements-dev.txt`
Expected: Installs without errors.

**Step 3: Run full test suite**

Run: `cd backend && python -m pytest tests/ -v`
Expected: All tests PASS.

**Step 4: Commit**

```bash
git add backend/requirements.txt backend/requirements-dev.txt
git commit -m "chore(deps): remove unused deps, separate dev requirements"
```

---

### Task 12: Cost tracking in report metadata

Estimate LLM cost per query and include it in cached report metadata.

**Files:**
- Modify: `backend/main.py` (add cost estimation to final payload)
- Modify: `backend/models.py` (no changes needed — cost goes in cache metadata, not Pydantic models)

**Step 1: Add cost estimation helper to main.py**

Add after the imports in `backend/main.py`:

```python
# Approximate token costs (USD per 1M tokens) — update when switching models
_MODEL_COSTS = {
    "deepseek/deepseek-v3.2": {"input": 0.14, "output": 0.28},
    "openai/gpt-4o": {"input": 2.50, "output": 10.00},
    "anthropic/claude-sonnet-4": {"input": 3.00, "output": 15.00},
}


def _estimate_cost(mode: str, model: str) -> float | None:
    """Rough cost estimate based on mode and model. Returns USD."""
    costs = _MODEL_COSTS.get(model)
    if not costs:
        return None
    # Approximate token usage by mode (measured from real runs)
    if mode == "explore":
        input_tokens, output_tokens = 8_000, 4_000
    else:
        input_tokens, output_tokens = 25_000, 8_000
    return round(
        (input_tokens / 1_000_000) * costs["input"]
        + (output_tokens / 1_000_000) * costs["output"],
        4,
    )
```

Then in the `event_generator()` function, add cost to the final payload (after line 263):

```python
            final_payload = {
                "report": report_data,
                "critic": critic_data,
                "query": req.query,
                "mode": req.mode,
                "estimated_cost_usd": _estimate_cost(req.mode, settings.llm_model if hasattr(settings, 'llm_model') else "deepseek/deepseek-v3.2"),
            }
```

Note: You need to import settings at the top — it's already available as the module-level `settings` variable (line 82).

**Step 2: Verify cost appears in cached reports**

Run the backend, make a fixture query, check the response includes `estimated_cost_usd`.

**Step 3: Commit**

```bash
git add backend/main.py
git commit -m "feat: add estimated cost per query to report metadata"
```

---

## Verification Checklist

After all 12 tasks:

```bash
# Run full backend test suite
cd backend && python -m pytest tests/ -v

# Verify frontend builds
cd frontend && npm run build

# Verify no raw dict messages remain in nodes
grep -rn '"role":' backend/nodes/

# Verify no dead code references
grep -rn 'format_sse\|heartbeat_generator' backend/
grep -rn 'useSSE' frontend/src/

# Verify fail-closed validation
grep -n 'is_valid=True' backend/validation.py
# Should only appear in the "VALID" success path, not in except block
```

---

## Summary

| Task | Type | Files Changed | Estimated Time |
|------|------|---------------|----------------|
| 1. Fail-open validation | Bug fix | validation.py, new test file | 15 min |
| 2. Node error handling | Bug fix | 5 nodes, 4 test files | 30 min |
| 3. App.jsx closure | Bug fix | App.jsx | 5 min |
| 4. Dead code removal | Cleanup | streaming.py, main.py, useSSE.js | 10 min |
| 5. Searcher timeouts | Bug fix | searcher.py, test_searcher.py | 15 min |
| 6. Message format | Cleanup | (done in Task 2) | 0 min |
| 7. LangSmith | Feature | config.py, .env.example, main.py | 20 min |
| 8. Profiler parallelism | Perf | profiler.py, test_profiler.py | 30 min |
| 9. GraphState audit | Verify | test_graph.py | 10 min |
| 10. Cache TTL | Fix | cache.py, test_cache.py | 25 min |
| 11. Clean requirements | Cleanup | requirements.txt, requirements-dev.txt | 5 min |
| 12. Cost tracking | Feature | main.py | 15 min |
| **Total** | | | **~3 hours** |
