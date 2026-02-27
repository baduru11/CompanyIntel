# backend/main.py
"""FastAPI application with SSE streaming for the Private Company Intelligence Agent.

Endpoints:
    GET  /health      - Health check
    GET  /api/history - List cached reports
    POST /api/query   - Run an explore or deep-dive query (SSE stream or cached)
"""
from __future__ import annotations

import asyncio
import json
import logging
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator
from sse_starlette.sse import EventSourceResponse, ServerSentEvent

from backend.cache import CacheManager
from backend.config import get_settings
from backend.graph import build_deep_dive_graph, build_explore_graph
from backend.streaming import format_sse

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Fixture loading for offline / demo mode
# ---------------------------------------------------------------------------
FIXTURES_DIR = Path(__file__).parent / "fixtures"

FIXTURE_MAP: dict[tuple[str, str], str] = {
    ("explore", "ai inference chips"): "explore_ai_inference_chips.json",
    ("explore", "digital health saas"): "explore_digital_health_saas.json",
    ("deep_dive", "nvidia"): "deep_dive_nvidia.json",
    ("deep_dive", "mistral ai"): "deep_dive_mistral_ai.json",
    ("deep_dive", "recursion pharmaceuticals"): "deep_dive_recursion_pharma.json",
}


def get_fixture(mode: str, query: str) -> dict | None:
    """Return fixture data for a known demo query, or None."""
    key = (mode, query.strip().lower())
    filename = FIXTURE_MAP.get(key)
    if filename:
        path = FIXTURES_DIR / filename
        if path.exists():
            return json.loads(path.read_text(encoding="utf-8"))
    return None


app = FastAPI(
    title="Private Company Intelligence Agent",
    version="0.1.0",
)

# CORS — allow all origins for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Shared instances
# ---------------------------------------------------------------------------
settings = get_settings()
cache = CacheManager(base_dir=settings.cache_dir)


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------
class QueryRequest(BaseModel):
    query: str = Field(..., min_length=1)
    mode: Literal["explore", "deep_dive"]

    @field_validator("query")
    @classmethod
    def query_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("query must not be blank")
        return v.strip()


class CachedResponse(BaseModel):
    cached: bool = True
    data: dict


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.get("/api/history")
async def history():
    """Return a list of all cached reports, newest first."""
    return cache.list_reports()


@app.post("/api/query")
async def query(req: QueryRequest):
    """Run an explore or deep-dive query.

    If the result is already cached, return it as a plain JSON response.
    Otherwise stream SSE events while the LangGraph agent runs.
    """
    # --- Fixture hit (offline / demo mode) ---------------------------------
    fixture = get_fixture(req.mode, req.query)
    if fixture is not None:
        return CachedResponse(data=fixture)

    # --- Cache hit ----------------------------------------------------------
    cached = cache.get_report(req.mode, req.query)
    if cached is not None:
        return CachedResponse(data=cached)

    # --- Cache miss: stream via SSE ----------------------------------------
    async def event_generator():
        try:
            # Pick the right graph builder
            if req.mode == "explore":
                graph = build_explore_graph()
            else:
                graph = build_deep_dive_graph()

            # Emit "start" event
            yield ServerSentEvent(
                data=json.dumps({"node": "system", "status": "running", "detail": f"Starting {req.mode} pipeline"}),
                event="status",
            )

            # Run the synchronous graph.invoke() in a thread pool so we
            # don't block the event loop.
            result = await asyncio.to_thread(
                graph.invoke,
                {"query": req.query, "mode": req.mode},
            )

            # Relay any status_events the graph accumulated
            for evt in result.get("status_events", []):
                yield ServerSentEvent(
                    data=json.dumps(evt if isinstance(evt, dict) else evt.model_dump()),
                    event="status",
                )

            # Build the final payload
            report = result.get("report")
            report_data = report.model_dump() if report else {}
            critic = result.get("critic_report")
            critic_data = critic.model_dump() if critic else {}

            final_payload = {
                "report": report_data,
                "critic": critic_data,
                "query": req.query,
                "mode": req.mode,
            }

            # Cache the result
            cache.set_report(req.mode, req.query, final_payload)

            # Emit "complete" event
            yield ServerSentEvent(
                data=json.dumps(final_payload),
                event="complete",
            )
        except Exception as exc:
            logger.exception("Error running %s pipeline", req.mode)
            yield ServerSentEvent(
                data=json.dumps({"error": str(exc)}),
                event="error",
            )

    return EventSourceResponse(event_generator())
