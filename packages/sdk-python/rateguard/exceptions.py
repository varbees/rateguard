from __future__ import annotations

from datetime import datetime, timezone

class RateGuardException(Exception):
    """RateGuard request rejection exception."""

    def __init__(self, message: str, *, status: int, retry_after: int = 0) -> None:
        super().__init__(message)
        self.status = status
        self.retry_after = retry_after


def _format_retry_after_iso(retry_after_at_ms: float | None) -> str:
    if retry_after_at_ms is None:
        return "unknown"
    return datetime.fromtimestamp(retry_after_at_ms / 1000.0, tz=timezone.utc).isoformat().replace("+00:00", "Z")


class BudgetExceeded(RateGuardException):
    """Human-readable token-budget rejection."""

    def __init__(
        self,
        *,
        used: int,
        limit: int,
        window: str,
        retry_after_ms: int,
        retry_after_at_ms: float | None = None,
    ) -> None:
        self.used = used
        self.limit = limit
        self.window = window
        self.retry_after_ms = retry_after_ms
        self.retry_after_at_ms = retry_after_at_ms
        retry_after_iso = _format_retry_after_iso(retry_after_at_ms)
        super().__init__(
            f"Budget exhausted: {used:,} / {limit:,} tokens used this {window}.\n"
            f"Retry after: {retry_after_iso}",
            status=429,
            retry_after=retry_after_ms,
        )

    @classmethod
    def from_decision(
        cls,
        *,
        used: int,
        limit: int,
        window: str,
        retry_after_ms: int,
        retry_after_at_ms: float | None = None,
    ) -> "BudgetExceeded":
        return cls(
            used=used,
            limit=limit,
            window=window,
            retry_after_ms=retry_after_ms,
            retry_after_at_ms=retry_after_at_ms,
        )
