from __future__ import annotations

from configparser import ConfigParser


class ParseError(Exception):
    pass


class SectionWrapper(dict):
    pass


class IniConfig:
    def __init__(self, path: str) -> None:
        parser = ConfigParser()
        try:
            with open(path, encoding="utf-8") as handle:
                parser.read_file(handle)
        except Exception as exc:  # pragma: no cover - defensive shim
            raise ParseError(str(exc)) from exc
        self.sections = {name: SectionWrapper(parser.items(name)) for name in parser.sections()}

    def __contains__(self, key: str) -> bool:
        return key in self.sections

    def __getitem__(self, key: str) -> SectionWrapper:
        return self.sections[key]
