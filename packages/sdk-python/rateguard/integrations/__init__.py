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
- ``rateguard.integrations.litellm_adapter`` — wrap ``litellm.completion``
  to enforce token budgets from the response (the CrewAI hook). Exposed
  ergonomically as ``RateGuard.wrap_completion`` / ``wrap_acompletion``.
  Unlike the others this imports nothing at module load — it meters whatever
  litellm hands back, so it needs no litellm import of its own.
"""
