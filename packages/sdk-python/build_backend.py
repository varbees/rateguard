from __future__ import annotations

from base64 import urlsafe_b64encode
from csv import writer as csv_writer
from dataclasses import dataclass
from hashlib import sha256
from io import BytesIO, StringIO
from pathlib import Path
from tarfile import TarFile, TarInfo, open as tar_open
from typing import Iterable
from zipfile import ZIP_DEFLATED, ZipFile

DIST_NAME = "varbees-rateguard"
NORMALIZED_NAME = DIST_NAME.replace("-", "_")
IMPORT_PACKAGE = "rateguard"
# Kept in sync with pyproject.toml's [project] version by hand — this build
# backend has no TOML parser (py3.10 predates stdlib tomllib, and adding a
# dependency just to read one field violates the zero-dependency rule this
# file itself exists to follow). Confirmed diverged from pyproject.toml once
# already (stuck at 0.1.0 while pyproject.toml moved to 0.2.0) — check both
# on every version bump.
VERSION = "0.2.0"
TAG = "py3-none-any"
ROOT = Path(__file__).resolve().parent
REPO_ROOT = ROOT.parent.parent
LICENSE_FILE = REPO_ROOT / "LICENSE"
DIST_INFO = f"{NORMALIZED_NAME}-{VERSION}.dist-info"
WHEEL_NAME = f"{NORMALIZED_NAME}-{VERSION}-{TAG}.whl"
SDIST_ROOT = f"{NORMALIZED_NAME}-{VERSION}"
SDIST_NAME = f"{SDIST_ROOT}.tar.gz"


@dataclass(slots=True)
class _WheelFile:
    path: str
    content: bytes


def _metadata_text() -> str:
    return "\n".join(
        [
            "Metadata-Version: 2.1",
            f"Name: {DIST_NAME}",
            f"Version: {VERSION}",
            "Summary: Python middleware SDK for RateGuard",
            "Requires-Python: >=3.10",
            "License: MIT",
            "License-File: LICENSE",
            "Description-Content-Type: text/markdown",
            "Project-URL: Homepage, https://github.com/varbees/rateguard/tree/main/packages/sdk-python",
            "Project-URL: Repository, https://github.com/varbees/rateguard",
            "Project-URL: Issues, https://github.com/varbees/rateguard/issues",
            "Provides-Extra: fastapi",
            "Requires-Dist: fastapi>=0.100.0; extra == 'fastapi'",
            "Requires-Dist: starlette>=0.27.0; extra == 'fastapi'",
            "Provides-Extra: flask",
            "Requires-Dist: flask>=2.0.0; extra == 'flask'",
            "Provides-Extra: django",
            "Requires-Dist: django>=4.0; extra == 'django'",
            "Provides-Extra: dev",
            "Requires-Dist: pytest; extra == 'dev'",
            "Requires-Dist: pytest-asyncio; extra == 'dev'",
            "Requires-Dist: httpx; extra == 'dev'",
            "Requires-Dist: anyio; extra == 'dev'",
            "Requires-Dist: mypy; extra == 'dev'",
            "Requires-Dist: openai; extra == 'dev'",
            "Requires-Dist: anthropic; extra == 'dev'",
            "Requires-Dist: redis; extra == 'dev'",
            "Provides-Extra: attestation",
            "Requires-Dist: cryptography>=41.0.0; extra == 'attestation'",
            "",
            _read_readme(),
        ]
    )


def _wheel_text() -> str:
    return "\n".join(
        [
            "Wheel-Version: 1.0",
            "Generator: rateguard-build-backend",
            "Root-Is-Purelib: true",
            f"Tag: {TAG}",
            "",
        ]
    )


def _top_level_text() -> str:
    return "rateguard\n"


def _editable_pth_text() -> str:
    return f"{ROOT.as_posix()}\n"


def _record_text(files: Iterable[_WheelFile]) -> str:
    buffer = StringIO()
    csv = csv_writer(buffer, lineterminator="\n")
    for file in files:
        digest = urlsafe_b64encode(sha256(file.content).digest()).rstrip(b"=").decode("ascii")
        csv.writerow([file.path, f"sha256={digest}", str(len(file.content))])
    csv.writerow([f"{DIST_INFO}/RECORD", "", ""])
    return buffer.getvalue()


def _package_files() -> list[_WheelFile]:
    files: list[_WheelFile] = []
    for path in sorted(ROOT.joinpath(IMPORT_PACKAGE).rglob("*")):
        if _skip_package_path(path):
            continue
        arcname = path.relative_to(ROOT).as_posix()
        files.append(_WheelFile(arcname, path.read_bytes()))
    return files


def _skip_package_path(path: Path) -> bool:
    if path.is_dir():
        return True
    if "__pycache__" in path.parts:
        return True
    return path.suffix in {".pyc", ".pyo"}


def _dist_info_files() -> list[_WheelFile]:
    files = [
        _WheelFile(f"{DIST_INFO}/METADATA", _metadata_text().encode("utf-8")),
        _WheelFile(f"{DIST_INFO}/WHEEL", _wheel_text().encode("utf-8")),
        _WheelFile(f"{DIST_INFO}/top_level.txt", _top_level_text().encode("utf-8")),
    ]
    if LICENSE_FILE.exists():
        files.append(_WheelFile(f"{DIST_INFO}/licenses/LICENSE", LICENSE_FILE.read_bytes()))
    return files


def _wheel_files(*, editable: bool) -> list[_WheelFile]:
    files = [
        *([_WheelFile(f"{NORMALIZED_NAME}.pth", _editable_pth_text().encode("utf-8"))] if editable else _package_files()),
        *_dist_info_files(),
    ]
    files.append(_WheelFile(f"{DIST_INFO}/RECORD", _record_text(files).encode("utf-8")))
    return files


def _write_wheel(wheel_directory: str, *, editable: bool) -> str:
    wheel_path = Path(wheel_directory) / WHEEL_NAME
    with ZipFile(wheel_path, "w", compression=ZIP_DEFLATED) as archive:
        for file in _wheel_files(editable=editable):
            archive.writestr(file.path, file.content)
    return wheel_path.name


def build_wheel(wheel_directory: str, config_settings: dict[str, object] | None = None, metadata_directory: str | None = None) -> str:
    return _write_wheel(wheel_directory, editable=False)


def build_editable(wheel_directory: str, config_settings: dict[str, object] | None = None, metadata_directory: str | None = None) -> str:
    return _write_wheel(wheel_directory, editable=True)


def get_requires_for_build_wheel(config_settings: dict[str, object] | None = None) -> list[str]:
    return []


def get_requires_for_build_editable(config_settings: dict[str, object] | None = None) -> list[str]:
    return []


def prepare_metadata_for_build_wheel(metadata_directory: str, config_settings: dict[str, object] | None = None) -> str:
    return _prepare_metadata(metadata_directory)


def prepare_metadata_for_build_editable(metadata_directory: str, config_settings: dict[str, object] | None = None) -> str:
    return _prepare_metadata(metadata_directory)


def _prepare_metadata(metadata_directory: str) -> str:
    dist_info_dir = Path(metadata_directory) / DIST_INFO
    dist_info_dir.mkdir(parents=True, exist_ok=True)
    (dist_info_dir / "METADATA").write_text(_metadata_text(), encoding="utf-8")
    (dist_info_dir / "WHEEL").write_text(_wheel_text(), encoding="utf-8")
    (dist_info_dir / "top_level.txt").write_text(_top_level_text(), encoding="utf-8")
    return DIST_INFO


def build_sdist(sdist_directory: str, config_settings: dict[str, object] | None = None) -> str:
    sdist_path = Path(sdist_directory) / SDIST_NAME
    with tar_open(sdist_path, "w:gz") as archive:
        _add_sdist_file(archive, "pyproject.toml")
        _add_sdist_file(archive, "README.md")
        _add_sdist_file(archive, "build_backend.py")
        _add_sdist_file(archive, "LICENSE", source_path=LICENSE_FILE)
        _add_sdist_bytes(archive, "PKG-INFO", _metadata_text().encode("utf-8"))
        for path in ROOT.joinpath(IMPORT_PACKAGE).rglob("*"):
            if _skip_package_path(path):
                continue
            arcname = f"{SDIST_ROOT}/{path.relative_to(ROOT).as_posix()}"
            archive.add(path, arcname=arcname)
    return sdist_path.name


def _add_sdist_file(archive: TarFile, relative_path: str, *, source_path: Path | None = None) -> None:
    path = source_path or ROOT / relative_path
    if path.exists():
        archive.add(path, arcname=f"{SDIST_ROOT}/{relative_path}")


def _add_sdist_bytes(archive: TarFile, relative_path: str, content: bytes) -> None:
    info = TarInfo(f"{SDIST_ROOT}/{relative_path}")
    info.size = len(content)
    archive.addfile(info, BytesIO(content))


def _read_readme() -> str:
    path = ROOT / "README.md"
    if not path.exists():
        return ""
    return path.read_text(encoding="utf-8").strip()
