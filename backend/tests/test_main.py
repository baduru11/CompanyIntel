# backend/tests/test_main.py
"""Tests for the FastAPI application endpoints.

Focuses on non-SSE endpoints (health, history, validation) since the
FastAPI TestClient has limited SSE support.
"""
from __future__ import annotations

import json
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from backend.main import app, cache

client = TestClient(app)


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------
class TestHealthCheck:
    def test_health_returns_ok(self):
        resp = client.get("/health")
        assert resp.status_code == 200
        assert resp.json() == {"status": "ok"}


# ---------------------------------------------------------------------------
# History endpoint
# ---------------------------------------------------------------------------
class TestHistoryEndpoint:
    def test_history_returns_list(self):
        resp = client.get("/api/history")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_history_returns_cached_reports(self):
        """When reports exist in cache, they should be returned."""
        fake_reports = [
            {"mode": "explore", "query": "AI startups", "cached_at": "2025-01-01T00:00:00", "filename": "test.json"}
        ]
        with patch.object(cache, "list_reports", return_value=fake_reports):
            resp = client.get("/api/history")
            assert resp.status_code == 200
            data = resp.json()
            assert len(data) == 1
            assert data[0]["query"] == "AI startups"


# ---------------------------------------------------------------------------
# Query endpoint — validation
# ---------------------------------------------------------------------------
class TestQueryValidation:
    def test_rejects_empty_query(self):
        resp = client.post("/api/query", json={"query": "", "mode": "explore"})
        assert resp.status_code == 422

    def test_rejects_blank_query(self):
        resp = client.post("/api/query", json={"query": "   ", "mode": "explore"})
        assert resp.status_code == 422

    def test_rejects_invalid_mode(self):
        resp = client.post("/api/query", json={"query": "test", "mode": "invalid"})
        assert resp.status_code == 422

    def test_rejects_missing_query(self):
        resp = client.post("/api/query", json={"mode": "explore"})
        assert resp.status_code == 422

    def test_rejects_missing_mode(self):
        resp = client.post("/api/query", json={"query": "test"})
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Query endpoint — cache hit
# ---------------------------------------------------------------------------
class TestQueryCacheHit:
    def test_returns_cached_result_on_hit(self):
        cached_data = {
            "report": {"query": "AI startups", "sector": "AI"},
            "critic": {"overall_confidence": 0.9},
            "query": "AI startups",
            "mode": "explore",
            "_cached_at": "2025-01-01T00:00:00",
            "_mode": "explore",
            "_query": "AI startups",
        }
        with patch.object(cache, "get_report", return_value=cached_data):
            resp = client.post("/api/query", json={"query": "AI startups", "mode": "explore"})
            assert resp.status_code == 200
            body = resp.json()
            assert body["cached"] is True
            assert body["data"]["query"] == "AI startups"


# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------
class TestCORS:
    def test_cors_headers_present(self):
        resp = client.options(
            "/health",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "GET",
            },
        )
        # When allow_credentials=True, Starlette echoes the request origin
        # instead of returning a literal "*".
        allowed = resp.headers.get("access-control-allow-origin")
        assert allowed in ("*", "http://localhost:3000")
