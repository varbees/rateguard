"""The packaging metadata must say what pyproject.toml says.

This package uses a custom zero-dependency PEP 517 backend (build_backend.py)
that HARDCODES its METADATA rather than reading pyproject.toml. So there are two
sources of truth for dependencies, and they silently diverged: pyproject.toml
listed one `dev` extra while pip installed another.

The cost was invisible locally and total on a clean machine. `pip install -e
'.[dev]'` did not install fastapi, starlette, or cryptography, so a contributor
following the README could not run the test suite at all — 4 collection errors.
Every dev box had those packages from somewhere else, so the suite passed here
and collapsed on the first clean CI runner.

pyproject.toml is what a human reads. build_backend.py is what pip obeys. When
they disagree, the documentation is a lie and the lie is undetectable without a
fresh environment. This test is that fresh environment's opinion, run every time.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

import pytest

# tomllib is 3.11+, and this package's declared floor is 3.10 — which the CI
# matrix tests, and which this file promptly broke. The check is about repo
# metadata, not runtime behaviour, so it is identical on every interpreter:
# one matrix leg running it is full coverage. Skipping beats adding a tomli
# dependency to a package whose whole point is having none.
tomllib = pytest.importorskip(
    "tomllib", reason="tomllib is 3.11+; the 3.13 matrix leg runs this check"
)

ROOT = Path(__file__).resolve().parent.parent


def _pyproject_extras() -> dict[str, set[str]]:
    data = tomllib.loads((ROOT / "pyproject.toml").read_text())
    out: dict[str, set[str]] = {}
    for extra, reqs in data["project"]["optional-dependencies"].items():
        out[extra] = {_name(r) for r in reqs}
    return out


def _backend_extras() -> dict[str, set[str]]:
    """Parse the Requires-Dist lines the backend hardcodes."""
    sys.path.insert(0, str(ROOT))
    import build_backend  # noqa: PLC0415

    text = build_backend._metadata_text() if hasattr(build_backend, "_metadata_text") else ""
    if not text:
        # Fall back to reading the source: the metadata is a literal list.
        text = (ROOT / "build_backend.py").read_text()

    out: dict[str, set[str]] = {}
    for m in re.finditer(r"Requires-Dist:\s*([^;\"']+);\s*extra\s*==\s*'([a-z]+)'", text):
        req, extra = m.group(1), m.group(2)
        out.setdefault(extra, set()).add(_name(req))
    return out


def _name(requirement: str) -> str:
    """Strip version specifiers: 'fastapi>=0.100.0' -> 'fastapi'."""
    return re.split(r"[<>=!~\[ ]", requirement.strip(), maxsplit=1)[0].lower()


def test_every_extra_matches_between_pyproject_and_backend() -> None:
    pyproject = _pyproject_extras()
    backend = _backend_extras()

    assert backend, "could not parse any Requires-Dist from build_backend.py"

    missing_in_backend = set(pyproject) - set(backend)
    assert not missing_in_backend, (
        f"pyproject declares extras the backend never emits: {sorted(missing_in_backend)} — "
        f"pip would install nothing for them"
    )

    for extra, declared in pyproject.items():
        emitted = backend.get(extra, set())
        if declared != emitted:
            only_pyproject = sorted(declared - emitted)
            only_backend = sorted(emitted - declared)
            pytest.fail(
                f"extra '{extra}' disagrees between the file humans read and the metadata "
                f"pip obeys.\n"
                f"  in pyproject.toml but NOT installed by pip: {only_pyproject}\n"
                f"  installed by pip but NOT in pyproject.toml: {only_backend}\n"
                f"build_backend.py hardcodes its METADATA and never reads pyproject.toml, "
                f"so both must be edited together."
            )


def test_dev_extra_can_actually_run_this_suite() -> None:
    """Whatever these tests import, `dev` must provide.

    fastapi was missing for an unknown length of time and nobody could tell,
    because every dev box already had it.
    """
    third_party = set()
    for path in (ROOT / "tests").rglob("*.py"):
        text = path.read_text()

        # Modules behind pytest.importorskip are DELIBERATELY optional — the
        # test skips itself when they are absent, which is the correct handling
        # for an integration nobody should be forced to install (pipecat,
        # livekit). Those are not the dev extra's job; a module that is merely
        # imported at module scope is, because its absence is a collection
        # error that stops the whole suite.
        optional = {
            m.group(1).split(".")[0]
            for m in re.finditer(r'importorskip\(\s*["\']([a-z0-9_.]+)', text)
        }

        for m in re.finditer(r"^\s*(?:from|import)\s+([a-z_][a-z0-9_]*)", text, re.M):
            if m.group(1) not in optional:
                third_party.add(m.group(1))

    # Stdlib and first-party imports are not the dev extra's job.
    ignore = {
        "rateguard", "tests", "build_backend",
        "__future__", "abc", "asyncio", "base64", "collections", "contextlib", "dataclasses",
        "datetime", "enum", "functools", "hashlib", "hmac", "importlib", "inspect", "io",
        "json", "logging", "math", "os", "pathlib", "queue", "random", "re", "socket",
        "struct", "subprocess", "sys", "tempfile", "threading", "time", "tomllib", "types",
        "typing", "unittest", "urllib", "uuid", "warnings", "wsgiref", "concurrent", "copy",
        "itertools", "secrets", "shutil", "statistics", "string", "textwrap", "traceback",
        "csv", "http", "gc", "signal", "platform", "operator", "decimal", "binascii",
    }
    needed = {m for m in third_party if m not in ignore}

    dev = _pyproject_extras()["dev"]
    # pytest imports itself; anyio/pytest-asyncio arrive via pytest plugins.
    aliases = {"pytest_asyncio": "pytest-asyncio"}
    unmet = {m for m in needed if aliases.get(m, m) not in dev}

    assert not unmet, (
        f"tests import {sorted(unmet)}, which `pip install -e '.[dev]'` does not provide. "
        f"A contributor following the README cannot run this suite. Add them to BOTH "
        f"pyproject.toml and build_backend.py."
    )
