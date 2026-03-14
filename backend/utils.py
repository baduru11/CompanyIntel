"""Utility functions for data cleaning and deduplication."""
from __future__ import annotations
from backend.models import FundingRound
import re


def _parse_amount(amt: str | None) -> float:
    """Parse a funding amount string like '$3.4M' into a numeric value."""
    if not amt:
        return 0.0
    m = re.match(r"\$?\s*~?\s*([\d,.]+)\s*(T|B|M|K)?", amt, re.IGNORECASE)
    if not m:
        return 0.0
    num = float(m.group(1).replace(",", ""))
    suffix = (m.group(2) or "").upper()
    multipliers = {"T": 1e12, "B": 1e9, "M": 1e6, "K": 1e3}
    return num * multipliers.get(suffix, 1)


def _investor_set(r: FundingRound) -> set[str]:
    """Lowercase investor names for comparison."""
    return {inv.lower().strip() for inv in r.investors if inv and inv.strip()}


def _amounts_similar(a: float, b: float, tolerance: float = 0.30) -> bool:
    """Check if two amounts are within tolerance (30%) of each other."""
    if a == 0 and b == 0:
        return True
    if a == 0 or b == 0:
        return False
    return abs(a - b) / max(a, b) <= tolerance


def _investor_overlap(set_a: set[str], set_b: set[str]) -> float:
    """Fraction of the smaller set that appears in the larger set."""
    if not set_a or not set_b:
        return 0.0
    return len(set_a & set_b) / min(len(set_a), len(set_b))


def _stages_compatible(s1: str | None, s2: str | None) -> bool:
    """Two stages match if either is empty/unknown or they're equal."""
    a = (s1 or "").lower().strip()
    b = (s2 or "").lower().strip()
    if not a or not b or a == "unknown" or b == "unknown":
        return True
    return a == b


def _richness(r: FundingRound) -> int:
    """Score how much data a round has — prefer richer entries on merge."""
    score = 0
    if r.date:
        score += len(r.date)  # longer date = more specific
    if r.amount:
        score += 2
    if r.stage and r.stage.lower() != "unknown":
        score += 1
    score += len(r.investors)
    if r.lead_investor:
        score += 1
    if r.source_url:
        score += 1
    return score


def deduplicate_funding_rounds(rounds: list[FundingRound]) -> list[FundingRound]:
    """Deduplicate funding rounds using fuzzy amount + investor overlap.

    Two rounds are considered duplicates if their stages are compatible AND:
      - amounts are within 30% of each other, OR
      - >=50% investor overlap (by the smaller investor list).

    On merge, keeps the richer entry and unions the investor lists.
    """
    if not rounds:
        return rounds

    unique: list[FundingRound] = []

    for r in rounds:
        amt = _parse_amount(r.amount)
        inv = _investor_set(r)

        match_idx = -1
        for i, existing in enumerate(unique):
            existing_amt = _parse_amount(existing.amount)
            existing_inv = _investor_set(existing)

            if not _stages_compatible(r.stage, existing.stage):
                continue

            amounts_close = _amounts_similar(amt, existing_amt)
            investors_match = _investor_overlap(inv, existing_inv) >= 0.5

            if amounts_close or investors_match:
                match_idx = i
                break

        if match_idx >= 0:
            winner = unique[match_idx]
            loser = r
            if _richness(r) > _richness(winner):
                winner, loser = r, winner
                unique[match_idx] = winner

            # Merge investors from both rounds
            existing_names = {name.lower().strip() for name in winner.investors}
            for inv_name in loser.investors:
                if inv_name and inv_name.lower().strip() not in existing_names:
                    winner.investors.append(inv_name)
                    existing_names.add(inv_name.lower().strip())

            # Fill gaps from loser
            if not winner.lead_investor and loser.lead_investor:
                winner.lead_investor = loser.lead_investor
            if not winner.date and loser.date:
                winner.date = loser.date
            if not winner.stage or winner.stage.lower() == "unknown":
                if loser.stage and loser.stage.lower() != "unknown":
                    winner.stage = loser.stage
            if not winner.source_url and loser.source_url:
                winner.source_url = loser.source_url
            if not winner.pre_money_valuation and loser.pre_money_valuation:
                winner.pre_money_valuation = loser.pre_money_valuation
            if not winner.post_money_valuation and loser.post_money_valuation:
                winner.post_money_valuation = loser.post_money_valuation
        else:
            unique.append(r)

    return unique
