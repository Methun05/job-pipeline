"""
Run-level API usage tracker — module-level singleton.

Accumulates API call counts and fallback events during a pipeline run.
Call reset() at the start of each run, to_dict() at the end to persist.

Usage:
    from pipeline import tracker
    tracker.record_call("exa")
    tracker.record_fallback("exa_key1", "exa_key2", "quota", "exa_finder")
"""
from datetime import datetime, timezone
from collections import defaultdict

# Per-service call counts
_calls: dict[str, int] = defaultdict(int)

# Which key is currently active per service (e.g. "key1", "key2")
_key_in_use: dict[str, str] = {}

# Chronological log of fallback events
_fallback_events: list[dict] = []


def reset():
    """Call once at the start of each pipeline run."""
    _calls.clear()
    _key_in_use.clear()
    _fallback_events.clear()


def record_call(service: str):
    """Increment the call counter for a service."""
    _calls[service] += 1


def record_key(service: str, key_label: str):
    """Record which key is currently active (e.g. "key1", "key2")."""
    _key_in_use[service] = key_label


def record_fallback(from_: str, to: str, reason: str, context: str = ""):
    """
    Log a fallback event.

    Args:
        from_:   Source being abandoned (e.g. "exa_key1", "exa", "apollo")
        to:      Source being tried next  (e.g. "exa_key2", "tavily", "hunter")
        reason:  Why fallback triggered  (e.g. "quota", "no_results", "error")
        context: Which function/step     (e.g. "find_company_linkedin", "twitter_finder")
    """
    _fallback_events.append({
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "from":      from_,
        "to":        to,
        "reason":    reason,
        "context":   context,
    })
    print(f"[Tracker] Fallback: {from_} → {to} ({reason}) in {context}")


def to_dict() -> dict:
    """Return all tracking data for persisting to pipeline_runs."""
    # Build structured api_usage per service
    services = ["exa", "tavily", "hunter", "apollo", "gemini", "brave"]
    api_usage = {}
    for svc in services:
        entry: dict = {"calls": _calls.get(svc, 0)}
        if svc in _key_in_use:
            entry["key_in_use"] = _key_in_use[svc]
        api_usage[svc] = entry

    return {
        "api_usage":       api_usage,
        "fallback_events": list(_fallback_events),
    }
