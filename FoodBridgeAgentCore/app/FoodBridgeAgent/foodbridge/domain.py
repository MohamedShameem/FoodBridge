"""Deterministic safety and ranking rules used by the Strands tools."""

from dataclasses import asdict, dataclass


@dataclass(frozen=True)
class Recipient:
    id: str
    name: str
    area: str
    distance_km: float
    capacity: int
    refrigerated: bool
    reliability: int


RECIPIENTS = (
    Recipient("partner-1", "Bayt Al Khair Community Pantry", "Salmiya", 2.4, 80, True, 96),
    Recipient("partner-2", "Hope Table Food Bank", "Hawally", 5.1, 140, True, 93),
    Recipient("partner-3", "Neighborhood Fridge Collective", "Shaab", 7.8, 45, False, 88),
    Recipient("partner-4", "Al Noor Family Centre", "Jabriya", 8.6, 110, True, 91),
)


def rank_recipients(meals: int, refrigerated: bool) -> list[dict]:
    """Return safe, capacity-qualified recipients ordered by a transparent score."""
    if meals < 1:
        raise ValueError("meals must be positive")
    eligible = [recipient for recipient in RECIPIENTS if recipient.capacity >= meals and (not refrigerated or recipient.refrigerated)]
    ranked = sorted(eligible, key=lambda recipient: (recipient.distance_km * 3) - recipient.reliability)
    return [asdict(recipient) | {"match_score": max(0, round(100 - recipient.distance_km - (100 - recipient.reliability) / 2))} for recipient in ranked]
