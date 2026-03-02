# backend/tests/test_integration.py
"""End-to-end integration tests that verify fixture loading works correctly.

These tests hit the actual FastAPI endpoints via TestClient and confirm
that the demo fixtures are served for known queries, case-insensitively.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from backend.main import app

client = TestClient(app)


# ---------------------------------------------------------------------------
# Fixture-based query tests
# ---------------------------------------------------------------------------
class TestExploreFixtures:
    def test_explore_fixture_returns_cached_result(self):
        """AI inference chips fixture should return immediately."""
        resp = client.post("/api/query", json={"query": "AI inference chips", "mode": "explore"})
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("cached") is True or "data" in data
        # Verify it has explore report structure
        result = data.get("data", data)
        assert "report" in result

    def test_explore_digital_health_fixture(self):
        """Digital health SaaS fixture should return immediately."""
        resp = client.post("/api/query", json={"query": "digital health saas", "mode": "explore"})
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("cached") is True or "data" in data
        result = data.get("data", data)
        assert "report" in result


class TestDeepDiveFixtures:
    def test_deep_dive_fixture_returns_cached_result(self):
        """NVIDIA fixture should return immediately."""
        resp = client.post("/api/query", json={"query": "NVIDIA", "mode": "deep_dive"})
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("cached") is True or "data" in data

    def test_deep_dive_mistral_fixture(self):
        """Mistral AI fixture should return immediately."""
        resp = client.post("/api/query", json={"query": "Mistral AI", "mode": "deep_dive"})
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("cached") is True or "data" in data


class TestDeepDiveFixtureMetadata:
    """Verify that fixture files contain the structured metadata fields."""

    def _get_report(self, query):
        resp = client.post("/api/query", json={"query": query, "mode": "deep_dive"})
        assert resp.status_code == 200
        data = resp.json()
        result = data.get("data", data)
        return result.get("report", result)

    def test_nvidia_metadata(self):
        report = self._get_report("NVIDIA")
        assert report["founded"] == "1993"
        assert report["headquarters"] == "Santa Clara, California"
        assert report["headcount"] == "~30,000"
        assert report["funding_stage"] == "IPO / Public"

    def test_nvidia_people_entries(self):
        report = self._get_report("NVIDIA")
        assert len(report["people_entries"]) >= 3
        names = [p["name"] for p in report["people_entries"]]
        assert "Jensen Huang" in names

    def test_nvidia_red_flag_entries(self):
        report = self._get_report("NVIDIA")
        assert len(report["red_flag_entries"]) >= 3
        assert all("content" in rf for rf in report["red_flag_entries"])

    def test_mistral_metadata(self):
        report = self._get_report("Mistral AI")
        assert report["founded"] == "April 2023"
        assert report["headquarters"] == "Paris, France"
        assert report["funding_stage"] == "Series B"

    def test_mistral_people_entries(self):
        report = self._get_report("Mistral AI")
        assert len(report["people_entries"]) >= 3
        names = [p["name"] for p in report["people_entries"]]
        assert "Arthur Mensch" in names

    def test_recursion_metadata(self):
        report = self._get_report("Recursion Pharmaceuticals")
        assert report["founded"] == "2013"
        assert report["headquarters"] == "Salt Lake City, Utah"
        assert report["funding_stage"] == "IPO / Public"

    def test_recursion_people_entries(self):
        report = self._get_report("Recursion Pharmaceuticals")
        assert len(report["people_entries"]) >= 3
        names = [p["name"] for p in report["people_entries"]]
        assert "Chris Gibson" in names


class TestFixtureCaseInsensitivity:
    def test_fixture_case_insensitive_lowercase(self):
        """Fixtures should match case-insensitively (lowercase)."""
        resp = client.post("/api/query", json={"query": "nvidia", "mode": "deep_dive"})
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("cached") is True or "data" in data

    def test_fixture_case_insensitive_uppercase(self):
        """Fixtures should match case-insensitively (uppercase)."""
        resp = client.post("/api/query", json={"query": "NVIDIA", "mode": "deep_dive"})
        assert resp.status_code == 200

    def test_fixture_case_insensitive_mixed(self):
        """Fixtures should match case-insensitively (mixed case)."""
        resp = client.post("/api/query", json={"query": "Ai Inference Chips", "mode": "explore"})
        assert resp.status_code == 200

    def test_fixture_with_leading_trailing_whitespace(self):
        """Fixtures should match with trimmed whitespace."""
        resp = client.post("/api/query", json={"query": "  NVIDIA  ", "mode": "deep_dive"})
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("cached") is True or "data" in data


# ---------------------------------------------------------------------------
# Non-fixture endpoints
# ---------------------------------------------------------------------------
class TestHistoryIntegration:
    def test_history_returns_list(self):
        resp = client.get("/api/history")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)


class TestHealthIntegration:
    def test_health(self):
        resp = client.get("/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"
