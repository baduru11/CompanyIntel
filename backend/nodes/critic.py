# backend/nodes/critic.py
from __future__ import annotations
import logging
from langchain_core.messages import SystemMessage, HumanMessage
from backend.config import get_llm, invoke_structured
from backend.models import CriticReport, ExploreReport, DeepDiveReport

logger = logging.getLogger(__name__)

CRITIC_SYSTEM = """You are a rigorous fact-checker for investor due diligence reports.
You receive a synthesized report AND the raw source data (URL + content snippet) it was built from.

Your job:
1. Cross-check every claim in the report against the raw source snippets provided.
   If a claim's content appears in or is reasonably supported by a source snippet, mark it 'verified'.
2. Flag claims that don't appear in ANY source snippet as 'unverified'.
3. Flag contradictory data from different sources as 'conflicting'.
4. Score each section's confidence (0.0-1.0) based on how well its claims are supported
   by the source snippets. Use this scale:
   - 0.8-1.0: Most claims directly supported by source snippets
   - 0.6-0.8: Key claims supported, some minor details unverifiable
   - 0.4-0.6: Mix of supported and unsupported claims
   - 0.2-0.4: Most claims lack source support
   - 0.0-0.2: No source support or section is empty/stub
   Score ALL sections: overview, funding, key_people, product_technology,
   recent_news, competitors, red_flags, market_opportunity, business_model,
   competitive_advantages, traction, risks, governance.
5. List specific data gaps — missing competitor data, missing LinkedIn/Crunchbase
   links, missing market size, missing revenue/traction signals.
6. If more than 3 major sections have confidence < 0.4, recommend retry with specific queries.

IMPORTANT: A section that has substantial content derived from source snippets should score
at least 0.5. Do NOT give low confidence (< 0.3) to sections that clearly contain
source-backed information. Reserve very low scores for sections with fabricated or
completely unsupported content.

7. Verify that each citation [N] maps to a valid source URL in the raw data.
8. Check competitor_entries: flag if fewer than 3 competitors as a gap.
9. Check people_entries: flag missing LinkedIn URLs or background info as gaps."""


def _evaluate_explore_retry(report: ExploreReport, query: str) -> tuple[bool, list[str]]:
    """Decide if an explore report needs a retry and generate targeted queries."""
    reasons = []
    retry_queries = []

    companies = report.companies or []
    num_companies = len(companies)

    # Too few companies found
    if num_companies < 8:
        reasons.append(f"only {num_companies} companies (need 8+)")
        retry_queries.append(f"more {query} companies startups funded")

    # Low average confidence
    if companies:
        avg_confidence = sum(c.confidence for c in companies) / len(companies)
        if avg_confidence < 0.5:
            reasons.append(f"average confidence {avg_confidence:.2f} < 0.5")
            retry_queries.append(f"{query} market landscape 2025")

    # More than half have no funding data
    if companies:
        no_funding = sum(1 for c in companies if not c.funding_total)
        if no_funding > len(companies) / 2:
            reasons.append(f"{no_funding}/{len(companies)} companies lack funding data")
            retry_queries.append(f"{query} startups funding raised venture capital 2024 2025")
            retry_queries.append(f"{query} companies crunchbase funding rounds")

    should_retry = len(reasons) > 0
    if should_retry:
        logger.info("Explore retry recommended: %s", "; ".join(reasons))

    return should_retry, retry_queries


def _evaluate_deep_dive_retry(
    report: DeepDiveReport, section_scores: dict[str, float], query: str
) -> tuple[bool, list[str]]:
    """Decide if a deep-dive report needs a retry and generate targeted queries."""
    reasons = []
    retry_queries = []

    # Count sections with confidence < 0.4
    low_sections = [s for s, score in section_scores.items() if score < 0.4]
    if len(low_sections) >= 3:
        reasons.append(f"{len(low_sections)} sections below 0.4 confidence: {low_sections}")
        for section in low_sections[:3]:
            retry_queries.append(f"{query} {section.replace('_', ' ')} details 2025")

    # Key sections missing or very low confidence
    key_sections = ["overview", "funding", "key_people"]
    for key in key_sections:
        score = section_scores.get(key, 0.0)
        section_obj = getattr(report, key, None)
        section_missing = section_obj is None or (
            hasattr(section_obj, "content") and not section_obj.content.strip()
        )
        if section_missing or score < 0.3:
            reasons.append(f"key section '{key}' is missing or has confidence {score:.2f}")
            retry_queries.append(f"{query} {key.replace('_', ' ')} information")

    should_retry = len(reasons) > 0
    if should_retry:
        logger.info("Deep-dive retry recommended: %s", "; ".join(reasons))

    return should_retry, retry_queries


def critique(state: dict) -> dict:
    llm = get_llm()

    report = state["report"]
    raw_signals = state.get("raw_signals", [])
    search_iteration = state.get("search_iteration", 0)

    report_text = report.model_dump_json(indent=2) if hasattr(report, "model_dump_json") else str(report)
    # Include truncated snippets so the critic can verify claims against actual content.
    # Cap at 60 signals with 500-char snippets to stay within token budget (~30k tokens).
    raw_text = "\n\n".join(
        f"[{s.source}] {s.url}\n{s.snippet[:600]}"
        for s in raw_signals[:60]
    ) if raw_signals else "No raw signals available"

    try:
        critic_report = invoke_structured(llm, CriticReport, [
            SystemMessage(content=CRITIC_SYSTEM),
            HumanMessage(content=f"Report:\n{report_text}\n\nRaw sources:\n{raw_text}")
        ])
    except Exception as exc:
        logger.error("Critic LLM call failed: %s", exc)
        # Degrade gracefully — the report is already complete from synthesis.
        # Losing the critic is far better than losing the entire pipeline result.
        critic_report = CriticReport(overall_confidence=0.0)

    # Derive low_confidence_sections from section_scores if the LLM didn't populate it
    if not critic_report.low_confidence_sections and critic_report.section_scores:
        critic_report.low_confidence_sections = [
            section for section, score in critic_report.section_scores.items()
            if score < 0.4
        ]

    # Evaluate whether a retry is warranted based on report quality
    query = state.get("query", "")
    if isinstance(report, ExploreReport):
        should_retry, retry_queries = _evaluate_explore_retry(report, query)
    elif isinstance(report, DeepDiveReport):
        should_retry, retry_queries = _evaluate_deep_dive_retry(
            report, critic_report.section_scores, query
        )
    else:
        should_retry, retry_queries = False, []

    critic_report.should_retry = should_retry
    if retry_queries:
        critic_report.retry_queries = retry_queries

    return {"critic_report": critic_report}
