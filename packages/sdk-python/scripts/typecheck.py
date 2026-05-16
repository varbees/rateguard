from __future__ import annotations

import importlib.util
import os
import subprocess
import sys
from pathlib import Path


def main() -> int:
	package_root = Path(__file__).resolve().parents[1]
	mypy_available = importlib.util.find_spec("mypy") is not None

	if os.getenv("RATEGUARD_STRICT_TYPES") == "1" and mypy_available:
		result = subprocess.run([sys.executable, "-m", "mypy", "rateguard"], cwd=package_root, check=False)
		return result.returncode

	if os.getenv("RATEGUARD_STRICT_TYPES") == "1":
		print("mypy is not installed; running compileall fallback instead.", file=sys.stderr)
	result = subprocess.run([sys.executable, "-m", "compileall", "-q", "rateguard"], cwd=package_root, check=False)
	return result.returncode


if __name__ == "__main__":
    raise SystemExit(main())
