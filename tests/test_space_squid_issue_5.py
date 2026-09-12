"""Smoke test for the candidate scaffold: verifies it imports and agrees with its own declared requirement (no fabricated behaviour)."""
from __future__ import annotations

from angel_fixes.space_squid_issue_5 import REQUIREMENT, candidate_summary

def test_candidate_is_self_consistent():
    result = candidate_summary()
    assert result["requirement"] == REQUIREMENT
