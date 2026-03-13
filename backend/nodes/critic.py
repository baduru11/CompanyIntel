# backend/nodes/critic.py
from __future__ import annotations
import logging
from langchain_core.messages import SystemMessage, HumanMessage
from backend.config import get_llm
from backend.models import CriticReport

logger = logging.getLogger(__name__)

CRITIC_SYSTEM = """You are a rigorous fact-checker for competitive intelligence reports.
You receive a synthesized report AND the raw source data it was built from.

Your job:
1. Cross-check every claim in the report against the raw sources
2. Flag claims that don't appear in any source as 'unverified'
3. Flag contradictory data from different sources as 'conflicting'
4. Score each section's confidence (0.0-1.0) based on source coverage
5. List specific data gaps
6. If more than 3 major sections have confidence < 0.4, recommend a retry with specific search queries

Be strict. An unverified claim is worse than 'Data not available'.

7. Verify that each citation [N] in the report maps to a valid source URL in the raw data.
   Flag citations that reference URLs not present in the source pool as 'unverified'."""


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
        logger.error("Critic LLM call failed: %s", exc)
        raise RuntimeError(f"Critic failed: {exc}") from exc

    # Derive low_confidence_sections from section_scores if the LLM didn't populate it
    if not critic_report.low_confidence_sections and critic_report.section_scores:
        critic_report.low_confidence_sections = [
            section for section, score in critic_report.section_scores.items()
            if score < 0.4
        ]

    # Decide whether to retry based on low-confidence sections
    if retry_count >= 1:
        critic_report.should_retry = False
    elif len(critic_report.low_confidence_sections) >= 3:
        critic_report.should_retry = True

    retry_targets = critic_report.low_confidence_sections if critic_report.should_retry else []

    return {
        "critic_report": critic_report,
        "retry_count": retry_count + (1 if critic_report.should_retry else 0),
        "retry_targets": retry_targets,
    }
