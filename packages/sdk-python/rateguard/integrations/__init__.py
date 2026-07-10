"""Optional framework integrations.

Each module in this package imports its framework at module import time
and raises a helpful ImportError when it isn't installed. The core
``rateguard`` package NEVER imports anything from here — installing
RateGuard stays zero-dependency; installing a framework unlocks its
adapter.

Available:
- ``rateguard.integrations.pipecat_adapter`` — Pipecat FrameProcessor
  enforcing a RealtimeSessionGuard inside a voice pipeline.
- ``rateguard.integrations.livekit_adapter`` — LiveKit Agents
  metrics-event hook feeding a RealtimeSessionGuard.
"""
