# backend/nodes/searcher.py
from __future__ import annotations
import logging
from backend.models import RawCompanySignal, SearchPlan
from backend.config import get_settings
from backend.cache import CacheManager

logger = logging.getLogger(__name__)

_cache: CacheManager | None = None


def get_cache() -> CacheManager:
    global _cache
    if _cache is None:
        _cache = CacheManager(get_settings().cache_dir)
    return _cache


def get_exa_client():
    from exa_py import Exa
    return Exa(api_key=get_settings().exa_api_key)


def get_tavily_client():
    from tavily import TavilyClient
    return TavilyClient(api_key=get_settings().tavily_api_key)


def _search_exa(client, query: str, num_results: int, cache: CacheManager) -> list[RawCompanySignal]:
    cached = cache.get_api("exa", query)
    if cached:
        return [RawCompanySignal(**s) for s in cached]

    try:
        results = client.search(query, num_results=num_results, type="auto")
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
    except Exception as exc:
        logger.warning("Exa search failed for query=%s: %s", query, exc)
        return []


def _search_tavily(client, query: str, cache: CacheManager) -> list[RawCompanySignal]:
    cached = cache.get_api("tavily", query)
    if cached:
        return [RawCompanySignal(**s) for s in cached]

    try:
        response = client.search(query, max_results=10)
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
    except Exception as exc:
        logger.warning("Tavily search failed for query=%s: %s", query, exc)
        return []


def search(state: dict) -> dict:
    plan: SearchPlan = state["search_plan"]
    mode = state["mode"]
    cache = get_cache()
    signals: list[RawCompanySignal] = []

    if mode == "explore":
        exa = None
        try:
            exa = get_exa_client()
        except Exception as exc:
            logger.warning("Failed to create Exa client: %s", exc)

        tavily = None
        try:
            tavily = get_tavily_client()
        except Exception as exc:
            logger.warning("Failed to create Tavily client: %s", exc)

        if exa is not None:
            for term in plan.search_terms:
                signals.extend(_search_exa(exa, term, plan.target_company_count, cache))

        if len(signals) < 5 and tavily is not None:
            for term in plan.search_terms:
                signals.extend(_search_tavily(tavily, term, cache))
    else:
        try:
            tavily = get_tavily_client()
        except Exception as exc:
            raise RuntimeError(f"Search failed: cannot create Tavily client: {exc}") from exc
        for term in plan.search_terms:
            signals.extend(_search_tavily(tavily, term, cache))

    if not signals:
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
