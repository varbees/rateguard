from __future__ import annotations

import importlib.util
import subprocess
import sys
from pathlib import Path


def main() -> int:
    package_root = Path(__file__).resolve().parents[1]
    mypy_available = importlib.util.find_spec("mypy") is not None

    if mypy_available:
        result = subprocess.run([sys.executable, "-m", "mypy", "rateguard"], cwd=package_root, check=False)
        return result.returncode

    print("mypy is not installed in this environment; running compileall fallback instead.", file=sys.stderr)
    result = subprocess.run([sys.executable, "-m", "compileall", "-q", "rateguard"], cwd=package_root, check=False)
    return result.returncode


if __name__ == "__main__":
    raise SystemExit(main())
