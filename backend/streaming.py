# backend/streaming.py
"""SSE streaming utilities for the FastAPI application.

Provides helpers for formatting Server-Sent Events and generating
heartbeat pings to keep connections alive.
"""
from __future__ import annotations

import asyncio
import json


async def heartbeat_generator(interval: float = 15.0):
    """Yield heartbeat SSE events at a fixed interval to keep connection alive."""
    while True:
        await asyncio.sleep(interval)
        yield {"event": "heartbeat", "data": json.dumps({})}


def format_sse(event_type: str, data: dict) -> dict:
    """Format a dict payload as an SSE-compatible dict for sse-starlette.

    Returns a dict with 'event' and 'data' keys that EventSourceResponse
    can serialize and send.
    """
    return {"event": event_type, "data": json.dumps(data)}
