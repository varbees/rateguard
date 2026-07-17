#!/usr/bin/env python3
"""Parity guard — mechanizes agent rule 3 across the three SDKs.

Rule 3 says a feature landing in Go must land in Node and Python in the next
commit. Until now that rule was enforced by an agent remembering it, which is
not a mechanism. The SSE usage bug (e6eba43) is what a memory-enforced rule
costs: Go extracted streaming usage correctly, Node and Python silently did
not, and no test anywhere compared the three SDKs' surfaces or behaviour. It
shipped, stayed green, and only real provider bytes caught it.

This script extracts each SDK's PUBLIC SURFACE, normalizes the naming
conventions away, and diffs the three sets.

── What this can and cannot prove (read before trusting it) ──

It proves a NAME exists in all three SDKs. It does NOT prove the name behaves
identically — that is what conformance/*.json vectors are for, and the SSE bug
was a BEHAVIOUR break, not a name break. Both layers are needed:

    parity_guard.py  →  "does Node have estimate_tokens at all?"
    conformance/     →  "does Node's estimate_tokens return what Go's does?"

Nothing here would have caught the SSE bug. It catches the other half: a
feature added to one SDK and forgotten in the others. Do not oversell it.

── Why a manifest and not a plain diff ──

The first cut of this script diffed all three surfaces and demanded they match.
It reported 194 asymmetries, nearly all of them noise: Go idiomatically keeps
internals unexported (144 public symbols), TypeScript exports every interface
(201), Python sits between (157). Those gaps are the languages, not the rule.
Baselining 194 "exceptions" would have produced a file nobody reads and a gate
nobody trusts.

Rule 3 is about FEATURES, not symbol names. So the gate is a manifest: the set
of capabilities that must resolve in all three SDKs, seeded from the symbols
that ALREADY agree. That makes it a ratchet — parity achieved is parity locked,
and a new feature must be added to the manifest, which is the forcing function.

The full diff survives as `--report`, because it is genuinely useful for a human
hunting drift — it is what found `ContainsSQLInjection` (Go-only) and the
`CachedLLMResponse`/`CachedResponse` naming split. It is a report, not a gate.

── What this can and cannot prove (again, because it matters) ──

Names, not behaviour. The manifest proves Node HAS estimate_tokens; only
conformance/*.json proves Node's estimate_tokens RETURNS what Go's does.

Usage:
    python3 scripts/parity_guard.py              # gate: manifest must resolve in all 3
    python3 scripts/parity_guard.py --report     # full asymmetry diff (human review)
    python3 scripts/parity_guard.py --seed       # seed manifest from current agreement
    python3 scripts/parity_guard.py --show       # print the normalized surfaces
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
GO_DIR = REPO / "packages" / "sdk-go"
NODE_DIR = REPO / "packages" / "sdk-node"
PY_DIR = REPO / "packages" / "sdk-python"
MANIFEST = REPO / "scripts" / "parity-manifest.json"

# Go's `func NewFoo(...) *Foo` is the language's constructor idiom; Node and
# Python spell the same thing `new Foo()` / `Foo()`. Normalizing NewFoo -> foo
# makes the constructor collide with its own type, which is correct: they are
# the same public capability wearing different clothes.
GO_CONSTRUCTOR = re.compile(r"^New([A-Z]\w*)$")


def snake(name: str) -> str:
    """CamelCase / camelCase / snake_case -> snake_case.

    Handles acronym runs: MCPTool -> mcp_tool, not m_c_p_tool. HTTPEmitter ->
    http_emitter. Without this every acronym-bearing symbol reads as a false
    asymmetry.
    """
    if not name:
        return name
    s = re.sub(r"([A-Z]+)([A-Z][a-z])", r"\1_\2", name)   # MCPTool -> MCP_Tool
    s = re.sub(r"([a-z\d])([A-Z])", r"\1_\2", s)          # fooBar -> foo_Bar
    return s.replace("-", "_").lower()


def run(cmd: list[str], cwd: Path) -> str:
    proc = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    if proc.returncode != 0:
        sys.exit(f"parity_guard: `{' '.join(cmd)}` failed in {cwd}:\n{proc.stderr}")
    return proc.stdout


def go_surface() -> set[str]:
    """Top-level exported types, funcs, consts and vars from `go doc -all`."""
    out = run(["go", "doc", "-all", "."], GO_DIR)
    names: set[str] = set()
    types: set[str] = set()
    in_block = False  # inside a grouped `const (` / `var (` block

    for line in out.splitlines():
        # Grouped declarations indent their members, so the flat `^const Name`
        # regex below never sees them — that silently dropped every preset and
        # event-type constant (Go read 124 symbols vs Node's 201, which is what
        # exposed this).
        if re.match(r"^(?:const|var) \($", line):
            in_block = True
            continue
        if in_block:
            if line.startswith(")"):
                in_block = False
                continue
            m = re.match(r"^\s+([A-Z]\w*)\s*(?:[A-Za-z_*\[\].\w]+\s*)?=", line)
            if m:
                names.add(m.group(1))
            continue

        # `func Name(...)` — top level. `func (r *T) Name(...)` — a method;
        # methods are part of a type's surface, not the package's, so skip.
        m = re.match(r"^func ([A-Z]\w*)\(", line)
        if m:
            names.add(m.group(1))
            continue
        m = re.match(r"^type ([A-Z]\w*)\b", line)
        if m:
            names.add(m.group(1))
            types.add(m.group(1))
            continue
        # `var Version = ...`, `const DefaultX = ...`
        m = re.match(r"^(?:var|const) ([A-Z]\w*)\b", line)
        if m:
            names.add(m.group(1))

    # Collapse Go's NewFoo constructor onto its type.
    collapsed: set[str] = set()
    for n in names:
        m = GO_CONSTRUCTOR.match(n)
        if m and m.group(1) in types:
            collapsed.add(snake(m.group(1)))
        else:
            collapsed.add(snake(n))
    return collapsed


def node_surface() -> set[str]:
    """Values AND types, via the TypeScript checker (see node_surface.mjs).

    Reading `Object.keys()` off the built module was the obvious approach and
    it was wrong: TypeScript erases `interface`/`type` at runtime, so ~80
    exports (EnforcementEvent, TokenUsage, every options type) looked "missing
    from node" when Node exports them perfectly well. That is the surface a
    Node USER sees, so that is what we must compare.
    """
    return {snake(n) for n in json.loads(run(["node", "scripts/node_surface.mjs"], REPO))}


def python_surface() -> set[str]:
    """Everything in rateguard.__all__."""
    script = "import json, rateguard; print(json.dumps(list(rateguard.__all__)))"
    return {snake(n) for n in json.loads(run([sys.executable, "-c", script], PY_DIR))}


def load_manifest() -> list[str]:
    if not MANIFEST.exists():
        sys.exit(f"parity_guard: {MANIFEST} missing — seed it with `--seed`")
    return list(json.loads(MANIFEST.read_text())["capabilities"])


def compute_asymmetry(go: set[str], node: set[str], py: set[str]) -> dict[str, str]:
    """Map every non-universal symbol to which SDKs carry it."""
    out: dict[str, str] = {}
    for name in sorted(go | node | py):
        have = [lang for lang, s in (("go", go), ("node", node), ("python", py)) if name in s]
        if len(have) != 3:
            out[name] = "+".join(have)
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--seed", action="store_true", help="seed the manifest from current agreement")
    ap.add_argument("--report", action="store_true", help="print the full asymmetry diff")
    ap.add_argument("--show", action="store_true", help="print normalized surfaces and exit")
    args = ap.parse_args()

    go, node, py = go_surface(), node_surface(), python_surface()
    print(f"surfaces: go={len(go)} node={len(node)} python={len(py)}")

    if args.show:
        for lang, s in (("go", go), ("node", node), ("python", py)):
            print(f"\n── {lang} ({len(s)}) ──")
            print("\n".join(sorted(s)))
        return 0

    if args.report:
        current = compute_asymmetry(go, node, py)
        print(f"\n{len(current)} asymmetric symbol(s) — informational, NOT a gate.")
        print("Most are idiomatic. Look for: a real feature missing a side, or a drifted name.\n")
        for name, langs in sorted(current.items()):
            missing = [l for l in ("go", "node", "python") if l not in langs.split("+")]
            print(f"    {name:<45} in {langs:<14} missing: {'+'.join(missing)}")
        return 0

    universal = go & node & py

    if args.seed:
        MANIFEST.write_text(
            json.dumps(
                {
                    "note": (
                        "Capabilities that MUST resolve in all three SDKs — the mechanized form "
                        "of agent rule 3. Seeded from the symbols that already agreed, so parity "
                        "achieved is parity locked. ADD A LINE when you add a cross-language "
                        "feature; the guard fails if a listed capability loses a side. "
                        "Names only — behaviour parity is conformance/*.json's job. "
                        "`--report` shows the full (noisy, idiomatic) diff for drift hunting."
                    ),
                    "capabilities": sorted(universal),
                },
                indent=2,
            )
            + "\n"
        )
        print(f"seeded {len(universal)} capabilities -> {MANIFEST.relative_to(REPO)}")
        return 0

    manifest = load_manifest()
    broken = {
        cap: "+".join(l for l, s in (("go", go), ("node", node), ("python", py)) if cap in s)
        for cap in manifest
        if cap not in universal
    }

    if not broken:
        print(f"✓ parity OK — {len(manifest)} capabilities present in all three SDKs")
        gained = universal - set(manifest)
        if gained:
            print(f"\n  {len(gained)} symbol(s) newly agree across all three but aren't in the")
            print("  manifest. If they're real capabilities, lock them in with --seed:")
            for n in sorted(gained):
                print(f"    + {n}")
        return 0

    print(f"\n✗ {len(broken)} capability(ies) LOST parity — rule 3 violated:\n")
    for cap, langs in sorted(broken.items()):
        missing = [l for l in ("go", "node", "python") if l not in langs.split("+")]
        where = langs if langs else "NONE"
        print(f"    {cap:<45} in {where:<14} MISSING FROM {'+'.join(missing)}")
    print("\nImplement the missing side, or remove the capability from the manifest\n"
          "if it was genuinely withdrawn everywhere.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
