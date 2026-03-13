# CompanyIntel Improvement Roadmap

**Date:** 2026-03-13
**Status:** Approved

---

## Phase 0: Bug Fixes (Do First)

Critical issues found during codebase audit. Fix before any feature work.

### 0.1 Fail-open validation (validation.py)

**Problem:** Lines 132-135 — if the LLM semantic validation call fails, the query passes through unvalidated (`is_valid=True`). This defeats the purpose of validation.

**Fix:** Change to fail-closed. Return `is_valid=False` with reason "Validation service unavailable, please retry" on LLM error. Add logging.

### 0.2 Add error handling to all 5 nodes

**Problem:** None of the LangGraph nodes (planner, searcher, profiler, synthesis, critic) have try/except around LLM or API calls. Any failure crashes the entire pipeline with a generic error.

**Fix:** Wrap all LLM calls in try/except. On failure:
- Log the error with node name, query, and mode
- For Planner/Synthesis/Critic: raise a descriptive error (these are fatal)
- For Profiler: already has fallback stubs, but add logging so silent failures are visible
- For Searcher: add timeout parameter to Exa/Tavily client calls

### 0.3 Fix App.jsx closure bug

**Problem:** `companyName` in `handleDownloadPdf` is extracted after the handler is defined, creating a stale closure.

**Fix:** Move `companyName` extraction before handler definitions, or compute it inside the handler.

### 0.4 Remove dead code

- `streaming.py`: `heartbeat_generator()` and `format_sse()` are never imported or called
- `frontend/src/hooks/useSSE.js`: Never imported anywhere — `useAgentQuery` implements its own SSE handling via `fetch()`

**Action:** Delete `heartbeat_generator` and `format_sse` from streaming.py. Delete useSSE.js entirely.

### 0.5 Add timeouts to Searcher API calls

**Problem:** Exa and Tavily calls in searcher.py have no timeout. If either service hangs, the pipeline hangs indefinitely.

**Fix:** Pass `timeout=15` (seconds) to both API clients. Add a try/except that returns empty results on timeout rather than crashing.

### 0.6 Standardize message format across nodes

**Problem:** Planner uses `SystemMessage`/`HumanMessage` (LangChain native). Profiler, Synthesis, and Critic use raw dicts `{"role": "...", "content": "..."}`.

**Fix:** Standardize all nodes on `SystemMessage`/`HumanMessage` for consistency and clarity.

---

## Phase 1: High Impact, Low Effort

### 1.1 LangSmith integration

**Effort:** ~15 minutes
**Impact:** Full observability for every LLM call, node execution, and graph trace

**Changes:**
- Add to `backend/.env.example`:
  ```
  LANGCHAIN_TRACING_V2=true
  LANGCHAIN_API_KEY=your-key
  LANGCHAIN_PROJECT=companyintel
  ```
- Add `LANGCHAIN_ENDPOINT` to Settings in config.py (optional)
- Tag traces by mode and query using `config={"metadata": {"mode": mode, "query": query}}`
- No code changes needed — LangGraph auto-instruments when env vars are set

### 1.2 ~~Profiler parallelism (asyncio.gather)~~ — DONE (via ThreadPoolExecutor)

> **Completed (2026-03-13):** Profiler already uses `ThreadPoolExecutor` for parallel URL crawling.
> Additionally, max URLs reduced from 5→3 and page content from 5000→3000 chars.

### 1.3 GraphState accumulation fix

**Effort:** ~10 minutes
**Impact:** Prevents silent state overwrite bugs

**Changes in graph.py:**
- Import `operator` and `Annotated` from `typing`
- For any list fields that accumulate across nodes (e.g., `status_events`), use:
  ```python
  status_events: Annotated[list[StatusEvent], operator.add]
  ```
- This ensures LangGraph merges lists instead of replacing them

### 1.4 Cache TTL + file locking

**Effort:** ~1 hour
**Impact:** Fixes race conditions on concurrent requests; prevents stale data

**Changes in cache.py:**
- Add `fcntl.flock()` (or `msvcrt.locking` on Windows) around file read/write operations
- Add `_cache_ttl` parameter (default 7 days)
- On `get_report()`: check `_cached_at` timestamp, return None if expired
- Add try/except around all file I/O with logging
- Add `default=str` warning — replace with explicit serialization

### 1.5 Cost tracking in report metadata

**Effort:** ~30 minutes
**Impact:** Users see estimated cost per query in History Dashboard

**Changes:**
- LangSmith auto-tracks token usage per trace
- Add `estimated_cost_usd: float | None` field to report metadata in cache.py
- Calculate cost based on model pricing (DeepSeek: ~$0.14/M input, $0.28/M output)
- Surface in frontend History cards as a subtle label

### 1.6 LangSmith trace link in frontend

**Effort:** ~10 minutes
**Impact:** One-click debugging from agent log to full LangSmith trace

**Changes:**
- Pass `run_id` from LangGraph execution through SSE events
- Add `<a href="https://smith.langchain.com/runs/{run_id}">View trace</a>` link in AgentLog component
- Only show in dev/staging (check `VITE_ENV` or similar)

---

## Phase 2: High Impact, Medium Effort

### 2.1 ~~Parallel search inside Searcher node~~ — DONE

> **Completed (2026-03-13):** Searcher runs 3 providers (Tavily, Exa, Serper) in parallel
> via `ThreadPoolExecutor(max_workers=3)`. Results merged and deduplicated by URL.

### 2.2 ~~Richer Critic retry with targeted re-search~~ — SUPERSEDED

> **Superseded (2026-03-13):** Retry loop removed entirely in pipeline optimization.
> Pipeline is now linear: Planner → Searcher → Profiler → Synthesis (parallel) → Critic → END.
> Quality improvements come from better prompts and parallel synthesis instead of re-running the pipeline.

### 2.3 ~~Source provenance chain with Citation model~~ — DONE

> **Completed (2026-03-13):** Citations implemented end-to-end.
> - `Citation` model in models.py with id, url, snippet fields
> - Synthesis generates `[1]`, `[2]` inline markers in prose
> - Frontend `CitationText` component renders markers as clickable popovers
> - `MarkdownProse` component integrates citations within markdown rendering

### 2.4 ~~Confidence visualization improvements~~ — DONE

> **Completed (2026-03-13):** All three changes shipped:
> - Low confidence warning banner at top of Deep Dive reports
> - Confidence badges with source popovers (ConfidenceBadge + SourcePopover)
> - Color-coded section borders and SectionNav dots (green/amber/red)

### 2.5 SqliteSaver checkpointing

**Effort:** ~1 hour
**Impact:** Interrupted runs can resume from last completed node

**Changes:**
- `pip install langgraph-checkpoint-sqlite`
- In graph.py: pass `checkpointer=SqliteSaver.from_conn_string("checkpoints.db")` to `graph.compile()`
- Key checkpoints by `(query, mode)` as thread_id
- Pass thread_id through SSE so frontend can trigger resume

### 2.6 SSE endpoint tests

**Effort:** ~3 hours
**Impact:** Most user-facing and fragile part of the system is currently untested

**Changes:**
- Add `test_sse.py` using `httpx.AsyncClient` with stream=True
- Test full SSE event sequence for both explore and deep_dive modes
- Verify event ordering matches `NODE_ORDER`
- Test error events, heartbeat behavior, and stream termination

---

## Phase 3: Ambitious Portfolio Pieces

### 3.1 Token streaming from Synthesis

**Effort:** ~6 hours
**Impact:** Users see report text appear word-by-word instead of waiting for full generation

**Challenge:** `with_structured_output()` doesn't support token streaming (outputs JSON that's useless until complete). Options:
1. Stream raw text, parse structured output at the end
2. Switch Synthesis to free-text with a separate parsing step

**Approach:** Option 1. Use `astream_events` with `on_chat_model_stream` to stream tokens to SSE, then parse the complete JSON at the end for the structured report.

### 3.2 Critic evaluation dataset via LangSmith

**Effort:** ~3 hours
**Impact:** Regression suite for prompt changes; measures whether Critic catches hallucinations

**Prerequisite:** LangSmith integration (1.1) + ~50 real queries for data volume

**Changes:**
- Set up LangSmith dataset capturing `(raw_sources, synthesized_claims, critic_verdict)` tuples
- Add a LangSmith evaluator that scores Critic accuracy
- Run evals on prompt changes before deploying

### 3.3 LangSmith eval harness (pytest)

**Effort:** ~4 hours
**Impact:** Automated quality gate — CI blocks if confidence scores regress

**Changes:**
- pytest fixture that runs full graph against 5 fixture datasets
- Assert average confidence scores meet minimum threshold (e.g., 0.6)
- Assert no section scores below 0.3
- Run on PR merges to main

### 3.4 Resume on failure

**Effort:** ~4 hours
**Impact:** Failed Deep Dive queries resume from last checkpoint instead of restarting

**Prerequisite:** SqliteSaver (2.5)

**Changes:**
- Pass `thread_id` through SSE events to frontend
- Frontend stores `thread_id` on failure
- "Retry" button sends `thread_id` back to `/api/query`
- Backend calls `graph.astream(None, config={"configurable": {"thread_id": tid}})` to resume
- Verify CompanyProfile serializes cleanly to SQLite (raw HTML from Crawl4AI may need truncation)

---

## Items Cut From Original Plan

| Item | Reason |
|------|--------|
| Subgraph decomposition (1b) | Mode branching is already clean. No benefit at current scale. Revisit if a 3rd mode is added. |
| Human-in-the-loop (1e) | Wrong for this product — value prop is automation. SSE is one-directional; would need full architecture redesign. |
| Cross-session memory (3c) | Premature. Cache handles repeat queries. Temporal reasoning ("what changed?") requires infra for speculative value. |
| Field-level ConfidentValue\<T\> (4b) | Changes every Pydantic model. LLMs can't self-calibrate per-field confidence reliably. Section-level from Critic is better. |
| Resume UI (7a) | Depends on human-in-the-loop which was cut. |

---

## Dependency Check

### New packages needed:
| Package | Phase | Purpose | Version Conflicts |
|---------|-------|---------|-------------------|
| `langsmith` | 1.1 | Tracing & observability | None — already a transitive dep of `langchain-core` |
| `langgraph-checkpoint-sqlite` | 2.5 | Dev checkpointing | Requires `langgraph>=0.4.0` (already met) |
| `langgraph-checkpoint-postgres` | Future (prod) | Production checkpointing | Requires `asyncpg` or `psycopg` |

### Packages to remove:
| Package | Reason |
|---------|--------|
| `langchain-anthropic==0.3.0` | Never imported in any backend code |
| `langchain-google-genai==2.1.0` | Never imported in any backend code |

### Move to dev dependencies:
| Package | Reason |
|---------|--------|
| `pytest==8.3.0` | Should not be in production requirements |

---

## Estimated Timeline

| Phase | Items | Effort |
|-------|-------|--------|
| Phase 0 | 6 bug fixes | ~4-6 hours |
| Phase 1 | 6 improvements | ~3-4 hours |
| Phase 2 | 6 improvements | ~16-20 hours |
| Phase 3 | 4 improvements | ~17-20 hours |
