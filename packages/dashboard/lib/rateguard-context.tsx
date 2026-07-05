"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { RateGuardClient, type AdminState, type Policy } from "@/lib/api";
import { extractCounters, parsePrometheusText, type CumulativeCounters } from "@/lib/metrics";

const POLL_MS = 3000;
const HISTORY_LIMIT = 200; // ~10 min at 3s/poll

export type HistoryPoint = {
  t: number;
  requestsTotal: number;
  tokensConsumedTotal: number;
  rateLimitHitsTotal: number;
  tokenBudgetExhaustedTotal: number;
  requestsPerSec: number;
  tokensPerSec: number;
};

type ConnectionStatus = "connecting" | "connected" | "error";

type RateGuardContextValue = {
  target: string;
  setTarget: (v: string) => void;
  reqKey: string;
  setReqKey: (v: string) => void;
  state: AdminState | null;
  policy: Policy | null;
  counters: CumulativeCounters | null;
  history: HistoryPoint[];
  status: ConnectionStatus;
  error: string | null;
  client: RateGuardClient;
  refresh: () => Promise<void>;
  applyPolicyPatch: (patch: Record<string, number | string>) => Promise<void>;
};

const RateGuardContext = createContext<RateGuardContextValue | null>(null);

const TARGET_STORAGE_KEY = "rateguard-dashboard-target";
const REQKEY_STORAGE_KEY = "rateguard-dashboard-key";

// Read persisted connection settings synchronously on first render (not in
// an effect) so a hard page reload doesn't flash the default instance
// before immediately switching to whatever the user last configured.
function initialTarget() {
  if (typeof window === "undefined") return "http://localhost:8080";
  return localStorage.getItem(TARGET_STORAGE_KEY) ?? "http://localhost:8080";
}
function initialReqKey() {
  if (typeof window === "undefined") return "demo:demo:demo:demo:demo";
  return localStorage.getItem(REQKEY_STORAGE_KEY) ?? "demo:demo:demo:demo:demo";
}

export function RateGuardProvider({ children }: { children: React.ReactNode }) {
  const [target, setTargetState] = useState(initialTarget);
  const [reqKey, setReqKeyState] = useState(initialReqKey);

  const setTarget = (v: string) => {
    setTargetState(v);
    try {
      localStorage.setItem(TARGET_STORAGE_KEY, v);
    } catch {
      /* private mode */
    }
  };
  const setReqKey = (v: string) => {
    setReqKeyState(v);
    try {
      localStorage.setItem(REQKEY_STORAGE_KEY, v);
    } catch {
      /* private mode */
    }
  };
  const [state, setState] = useState<AdminState | null>(null);
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [counters, setCounters] = useState<CumulativeCounters | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [error, setError] = useState<string | null>(null);

  const clientRef = useRef(new RateGuardClient(target));
  clientRef.current.baseUrl = target;
  const lastCountersRef = useRef<CumulativeCounters | null>(null);
  const lastTimeRef = useRef<number>(Date.now());
  const smoothedRequestsPerSecRef = useRef(0);
  const smoothedTokensPerSecRef = useRef(0);

  const poll = useCallback(async () => {
    const client = clientRef.current;
    try {
      const [nextState, nextPolicy, metricsText] = await Promise.all([
        client.getState(reqKey || "default"),
        client.getPolicy(),
        client.getMetricsText(),
      ]);
      const nextCounters = extractCounters(parsePrometheusText(metricsText));
      const now = Date.now();
      const elapsedSec = Math.max(0.5, (now - lastTimeRef.current) / 1000);
      const prev = lastCountersRef.current;

      // Exponential smoothing (not just the raw delta/elapsed derivative)
      // so the live line moves fluidly poll-to-poll instead of snapping
      // between spiky instantaneous rates.
      const EMA_ALPHA = 0.35;
      const rawRequestsPerSec = prev ? Math.max(0, (nextCounters.requestsTotal - prev.requestsTotal) / elapsedSec) : 0;
      const rawTokensPerSec = prev ? Math.max(0, (nextCounters.tokensConsumedTotal - prev.tokensConsumedTotal) / elapsedSec) : 0;
      smoothedRequestsPerSecRef.current = prev
        ? EMA_ALPHA * rawRequestsPerSec + (1 - EMA_ALPHA) * smoothedRequestsPerSecRef.current
        : rawRequestsPerSec;
      smoothedTokensPerSecRef.current = prev
        ? EMA_ALPHA * rawTokensPerSec + (1 - EMA_ALPHA) * smoothedTokensPerSecRef.current
        : rawTokensPerSec;

      setHistory((h) => {
        const point: HistoryPoint = {
          t: now,
          requestsTotal: nextCounters.requestsTotal,
          tokensConsumedTotal: nextCounters.tokensConsumedTotal,
          rateLimitHitsTotal: nextCounters.rateLimitHitsTotal,
          tokenBudgetExhaustedTotal: nextCounters.tokenBudgetExhaustedTotal,
          requestsPerSec: smoothedRequestsPerSecRef.current,
          tokensPerSec: smoothedTokensPerSecRef.current,
        };
        const next = [...h, point];
        return next.length > HISTORY_LIMIT ? next.slice(next.length - HISTORY_LIMIT) : next;
      });

      lastCountersRef.current = nextCounters;
      lastTimeRef.current = now;

      setState(nextState);
      setPolicy(nextPolicy);
      setCounters(nextCounters);
      setStatus("connected");
      setError(null);
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "Could not reach this instance");
    }
  }, [reqKey]);

  useEffect(() => {
    setStatus("connecting");
    setHistory([]);
    lastCountersRef.current = null;
    smoothedRequestsPerSecRef.current = 0;
    smoothedTokensPerSecRef.current = 0;
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => clearInterval(id);
  }, [poll, target]);

  async function applyPolicyPatch(patch: Record<string, number | string>) {
    await clientRef.current.patchPolicy(patch);
    await poll();
  }

  return (
    <RateGuardContext.Provider
      value={{
        target,
        setTarget,
        reqKey,
        setReqKey,
        state,
        policy,
        counters,
        history,
        status,
        error,
        client: clientRef.current,
        refresh: poll,
        applyPolicyPatch,
      }}
    >
      {children}
    </RateGuardContext.Provider>
  );
}

export function useRateGuard() {
  const ctx = useContext(RateGuardContext);
  if (!ctx) throw new Error("useRateGuard must be used within RateGuardProvider");
  return ctx;
}
