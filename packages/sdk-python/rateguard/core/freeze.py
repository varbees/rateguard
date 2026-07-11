"""Runtime kill switch.

Freezing a scope makes every matching outbound LLM call halt immediately with a
synthesized 403, until it is unfrozen. Trip it from code (RateGuard.freeze) or
from ops tooling (POST /admin/freeze) and every affected agent stops spending at
once, no redeploy. The empty string freezes everything; a customer id freezes
just that customer (matched against the X-RateGuard-Customer header). Mirrors
Go's FreezeController; the EU AI Act Article 14 interrupt hook, in-process.
"""

from __future__ import annotations


class FreezeController:
    def __init__(self) -> None:
        self._global = False
        self._customers: set[str] = set()

    def freeze(self, scope: str) -> None:
        """Halt outbound calls for a scope. Empty scope freezes everything."""
        if scope == "":
            self._global = True
        else:
            self._customers.add(scope)

    def unfreeze(self, scope: str) -> None:
        """Lift a freeze. Empty scope lifts the global freeze only."""
        if scope == "":
            self._global = False
        else:
            self._customers.discard(scope)

    def halts(self, customer: str) -> bool:
        """Whether a call attributed to ``customer`` must be halted."""
        return self._global or (bool(customer) and customer in self._customers)

    def is_frozen(self, scope: str) -> bool:
        """Whether a scope is frozen. Empty scope reports the global freeze only."""
        if scope == "":
            return self._global
        return self._global or scope in self._customers

    def frozen_scopes(self) -> list[str]:
        """Active freezes: ``*`` for a global freeze, ``customer=<id>`` per customer."""
        scopes: list[str] = ["*"] if self._global else []
        scopes.extend(f"customer={c}" for c in self._customers)
        return scopes
