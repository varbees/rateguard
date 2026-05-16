from __future__ import annotations

from base64 import urlsafe_b64encode
from csv import writer as csv_writer
from dataclasses import dataclass
from hashlib import sha256
from io import StringIO
from pathlib import Path
from tarfile import TarFile, open as tar_open
from typing import Iterable
from zipfile import ZIP_DEFLATED, ZipFile

NAME = "rateguard"
VERSION = "0.1.0"
TAG = "py3-none-any"
ROOT = Path(__file__).resolve().parent
DIST_INFO = f"{NAME}-{VERSION}.dist-info"
WHEEL_NAME = f"{NAME}-{VERSION}-{TAG}.whl"
SDIST_NAME = f"{NAME}-{VERSION}.tar.gz"


@dataclass(slots=True)
class _WheelFile:
    path: str
    content: bytes


def _metadata_text() -> str:
	return "\n".join(
		[
			"Metadata-Version: 2.1",
			"Name: rateguard",
			"Version: 0.1.0",
			"Summary: Python middleware SDK for RateGuard",
			"Requires-Dist: cachetools>=5.0",
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
			"Requires-Dist: openai; extra == 'dev'",
			"Requires-Dist: anthropic; extra == 'dev'",
			"",
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


def _wheel_files() -> list[_WheelFile]:
    files = [
        _WheelFile(f"{NAME}.pth", _editable_pth_text().encode("utf-8")),
        _WheelFile(f"{DIST_INFO}/METADATA", _metadata_text().encode("utf-8")),
        _WheelFile(f"{DIST_INFO}/WHEEL", _wheel_text().encode("utf-8")),
        _WheelFile(f"{DIST_INFO}/top_level.txt", _top_level_text().encode("utf-8")),
    ]
    files.append(_WheelFile(f"{DIST_INFO}/RECORD", _record_text(files).encode("utf-8")))
    return files


def _write_wheel(wheel_directory: str) -> str:
    wheel_path = Path(wheel_directory) / WHEEL_NAME
    with ZipFile(wheel_path, "w", compression=ZIP_DEFLATED) as archive:
        for file in _wheel_files():
            archive.writestr(file.path, file.content)
    return wheel_path.name


def build_wheel(wheel_directory: str, config_settings: dict[str, object] | None = None, metadata_directory: str | None = None) -> str:
    return _write_wheel(wheel_directory)


def build_editable(wheel_directory: str, config_settings: dict[str, object] | None = None, metadata_directory: str | None = None) -> str:
    return _write_wheel(wheel_directory)


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
        for path in ROOT.joinpath("rateguard").rglob("*"):
            if path.is_dir():
                continue
            arcname = f"{NAME}-{VERSION}/{path.relative_to(ROOT).as_posix()}"
            archive.add(path, arcname=arcname)
    return sdist_path.name


def _add_sdist_file(archive: TarFile, relative_path: str) -> None:
    path = ROOT / relative_path
    if path.exists():
        archive.add(path, arcname=f"{NAME}-{VERSION}/{relative_path}")
