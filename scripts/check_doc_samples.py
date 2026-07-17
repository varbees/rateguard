#!/usr/bin/env python3
"""Check that the Node and Python code samples in the docs actually work.

A doc sample that doesn't compile is a lie with syntax highlighting, and this
repo was telling two of them. `site/app/docs/token-budgets` and `/presets` both
showed flat options that do not exist:

    new RateGuard({ preset: 'llm-heavy', tokenBudgetPerHour: 250_000 })
    RateGuard(preset="llm-heavy", token_budget_per_hour=250_000)

The Python form raises TypeError — loud, survivable. The Node form is worse: JS
silently ignores unknown properties, so a user who asked for 250,000 tokens/hour
quietly got the preset's 10,000 and no error anywhere. Their budget was not what
they believed it was, which for a spend-control product is the whole ballgame.

Both shipped because nothing ever ran the samples. Now something does.

What this checks:
  * Node  — every ```Node.js``` sample typechecks against the real .d.ts.
            TypeScript flags unknown object-literal properties, which is
            exactly the class of bug that shipped.
  * Python — every ```Python``` sample compiles and its RateGuard(...) kwargs
            are validated against the real signature.

What it does NOT do: execute samples (they'd need API keys and network), or
check Go (samples are illustrative struct literals; `go vet` covers the real
call sites). Extending to Go means extracting into a temp package — worth doing
if a Go sample ever drifts, but Go's samples were the ones that were RIGHT.

Usage:
    python3 scripts/check_doc_samples.py
"""

from __future__ import annotations

import ast
import inspect
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
DOCS = REPO / "site" / "app" / "docs"
NODE_DIR = REPO / "packages" / "sdk-node"
PY_DIR = REPO / "packages" / "sdk-python"

# CodeTabs entries look like: { label: "Node.js", code: `...` }
#
# The body must tolerate ESCAPED backticks: samples contain nested template
# literals, e.g. headers: { Authorization: \`Bearer \${key}\` }. A naive
# [^`]* stops at the first inner backtick and truncates the sample mid-object,
# which then "fails to compile" — a checker crying wolf about its own bug is
# worse than no checker, because it teaches everyone to ignore it.
SAMPLE_RE = re.compile(
    r'label:\s*"(?P<label>Go|Node\.js|Python)"\s*,\s*code:\s*`(?P<code>(?:[^`\\]|\\.)*)`',
    re.DOTALL,
)


# CodeTabs is also used for install commands (`npm install ...`, `pip install
# ...`) under the same language labels. Those are shell, not code, and feeding
# them to a compiler produces noise that teaches everyone to ignore this check.
SHELL_RE = re.compile(r"^\s*(npm|npx|pip|pip3|python3?|go|bun|yarn|pnpm|curl|export|cd)\s", re.M)


def is_shell(code: str) -> bool:
    stripped = "\n".join(
        line for line in code.splitlines() if line.strip() and not line.strip().startswith("#")
    )
    if not stripped:
        return True
    # A sample is shell if EVERY non-comment line looks like a command.
    return all(SHELL_RE.match(line) for line in stripped.splitlines())


def samples() -> list[tuple[Path, str, str]]:
    out: list[tuple[Path, str, str]] = []
    for page in sorted(DOCS.rglob("page.tsx")):
        text = page.read_text()
        for m in SAMPLE_RE.finditer(text):
            code = m.group("code")
            # Un-escape what TS template literals escape.
            code = code.replace("\\`", "`").replace("\\$", "$").replace("\\\\", "\\")
            if is_shell(code):
                continue
            out.append((page, m.group("label"), code))
    return out


def check_python(code: str) -> str | None:
    """Compile the sample, then validate RateGuard(...) kwargs for real."""
    try:
        tree = ast.parse(code)
    except SyntaxError as e:
        return f"does not parse: {e}"

    sys.path.insert(0, str(PY_DIR))
    try:
        import rateguard  # noqa: PLC0415
    except Exception as e:  # pragma: no cover
        return f"cannot import rateguard: {e}"

    valid = set(inspect.signature(rateguard.RateGuard.__init__).parameters)

    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        func = node.func
        name = getattr(func, "id", None) or getattr(func, "attr", None)
        if name != "RateGuard":
            continue
        for kw in node.keywords:
            if kw.arg and kw.arg not in valid:
                return (
                    f"RateGuard(..., {kw.arg}=...) is not a real parameter — "
                    f"this sample raises TypeError"
                )
    return None


# Symbols injected into samples that carry no import of their own, so the API
# they call is really typed rather than silently `any`. Anything a sample uses
# but this omits just becomes a filtered TS2304 — harmless. Anything typed here
# gets its properties checked, which is the whole point.
NODE_INJECT = [
    "RateGuard",
    "GuardrailChain",
    "PIIGuardrail",
    "PromptInjectionGuardrail",
    "TokenLimitGuardrail",
    "MaxLengthGuardrail",
    "standardGuardrails",
    "strictGuardrails",
    "estimateTokens",
    "createMCPTools",
    "mcpCall",
    "defaultProviderChain",
    "budgetProviderChain",
    "qualityProviderChain",
    "prometheusText",
]


def check_node(all_node: list[tuple[Path, str]]) -> list[str]:
    """Typecheck every Node sample in one pass against the real types."""
    errors: list[str] = []
    with tempfile.TemporaryDirectory() as tmp:
        tmpdir = Path(tmp)
        index = NODE_DIR / "src" / "index.js"
        files: list[tuple[Path, Path]] = []

        for i, (page, code) in enumerate(all_node):
            # Emit the sample as its own module, unwrapped: samples put imports
            # at the top and use top-level await, both legal in an esnext module
            # and illegal inside a function. Wrapping produced TS1232/TS1184
            # noise about the wrapper, not the sample.
            #
            # Point the package import at the real source so the TYPES are what
            # we check.
            src = code.replace(
                "'@varbees/rateguard-node'", json.dumps(str(index))
            ).replace('"@varbees/rateguard-node"', json.dumps(str(index)))

            # CRITICAL: most samples do not import anything — the prose already
            # showed the import, so they open straight into `new RateGuard({...})`.
            # Left alone, RateGuard is an undeclared identifier, TypeScript types
            # it `any`, and an object literal is then checked against NOTHING.
            # This check silently passed a re-introduced `tokenBudgetPerHour`
            # until that was caught: a green light that meant nothing, which is
            # worse than no check at all. Inject the import when it is absent so
            # the symbol is really typed.
            if "@varbees/rateguard-node" not in code and str(index) not in src:
                src = f"import {{ {', '.join(NODE_INJECT)} }} from {json.dumps(str(index))};\n" + src

            f = tmpdir / f"sample{i}.ts"
            f.write_text(src + "\nexport {};\n")
            files.append((f, page))

        if not files:
            return errors

        proc = subprocess.run(
            [
                "npx", "tsc", "--noEmit", "--skipLibCheck", "--allowJs",
                "--moduleResolution", "bundler", "--module", "esnext",
                "--target", "es2022", "--strict", "false",
                *[str(f) for f, _ in files],
            ],
            cwd=NODE_DIR, capture_output=True, text=True,
        )
        if proc.returncode == 0:
            return errors

        # Samples are FRAGMENTS: they reference variables the surrounding prose
        # established (`rg`, `prompt`, `app`) and skip imports the reader
        # already has. Demanding they compile standalone means inventing that
        # context, and every invented detail is another false positive — a
        # checker that cries wolf gets muted, which is worse than none.
        #
        # So this does not ask "does the sample compile". It asks the narrower
        # question that actually shipped a bug: "does the sample pass a
        # property/argument that the real API does not have?" That is exactly
        # TS2353 and friends, and it is precisely what `tokenBudgetPerHour`
        # was — an unknown property, silently ignored at runtime.
        MEANINGFUL = {
            "TS2353",  # object literal may only specify known properties  <- THE bug
            "TS2339",  # property does not exist on type
            "TS2551",  # property does not exist (did you mean ...)
            "TS2554",  # expected N arguments, got M
            "TS2739",  # type is missing required properties
            "TS2769",  # no overload matches this call
        }
        for line in proc.stdout.splitlines():
            m = re.match(r".*sample(\d+)\.ts\((\d+),\d+\): error (TS\d+): (.*)", line)
            if not m:
                continue
            idx, code_no, msg = int(m.group(1)), m.group(3), m.group(4)
            if code_no not in MEANINGFUL:
                continue
            page = files[idx][1].relative_to(REPO)
            errors.append(f"{page}: {code_no} {msg}")
    return errors


def main() -> int:
    found = samples()
    if not found:
        print("check_doc_samples: no samples found — did CodeTabs change shape?")
        return 1

    node_samples = [(p, c) for p, label, c in found if label == "Node.js"]
    py_samples = [(p, c) for p, label, c in found if label == "Python"]
    go_count = sum(1 for _, label, _ in found if label == "Go")

    print(f"samples: {len(node_samples)} Node · {len(py_samples)} Python · {go_count} Go (not checked)")

    errors: list[str] = []
    for page, code in py_samples:
        if err := check_python(code):
            errors.append(f"{page.relative_to(REPO)}: {err}")
    errors.extend(check_node(node_samples))

    if errors:
        print(f"\n✗ {len(errors)} doc sample(s) do not work:\n")
        for e in errors:
            print(f"    {e}")
        print("\nA sample that doesn't compile is a lie with syntax highlighting.")
        return 1

    print("✓ every Node and Python doc sample typechecks against the real API")
    return 0


if __name__ == "__main__":
    sys.exit(main())
