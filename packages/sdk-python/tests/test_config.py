from __future__ import annotations

import pytest

from rateguard.config import derive_ws_url


def test_derive_ws_url_rejects_invalid_control_plane_url() -> None:
    with pytest.raises(ValueError, match="Invalid RateGuard control_plane_url"):
        derive_ws_url("control.example")
