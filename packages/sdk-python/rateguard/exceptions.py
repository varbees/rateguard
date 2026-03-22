from __future__ import annotations


class RateGuardException(Exception):
    """RateGuard request rejection exception."""

    def __init__(self, message: str, *, status: int, retry_after: int = 0) -> None:
        super().__init__(message)
        self.status = status
        self.retry_after = retry_after

