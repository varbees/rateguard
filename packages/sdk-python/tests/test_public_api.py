from __future__ import annotations

import re
from pathlib import Path

import rateguard

PYPROJECT = Path(__file__).resolve().parents[1] / "pyproject.toml"

# Documented concepts must be reachable from the package entry point
# (AGENTS.md rule 9): a module that exists but isn't exported isn't a feature.
NODE_PARITY_EXPORTS = [
    "BoundedCache",
    "PreflightDecision",
    "RateGuardRuntime",
    "classify_error_type",
    "genai_span_name",
]


def test_all_names_resolve() -> None:
    for name in rateguard.__all__:
        assert getattr(rateguard, name, None) is not None, name


def test_node_parity_exports_present() -> None:
    for name in NODE_PARITY_EXPORTS:
        assert name in rateguard.__all__, name


def test_version_matches_pyproject() -> None:
    match = re.search(r'^version = "([^"]+)"$', PYPROJECT.read_text(encoding="utf-8"), re.MULTILINE)
    assert match is not None
    assert rateguard.__version__ == match.group(1)
