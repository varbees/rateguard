import { create } from "zustand";
import { persist } from "zustand/middleware";
import { APIConfig, DashboardStats, UsageStats } from "./api";

interface DashboardStore {
  // Auth State
  apiKey: string | null;
  isAuthenticated: boolean;
  setApiKey: (key: string) => void;
  clearAuth: () => void;

  // Dashboard Data
  stats: DashboardStats | null;
  usage: UsageStats | null;
  apis: APIConfig[];

  // Actions
  setStats: (stats: DashboardStats) => void;
  setUsage: (usage: UsageStats) => void;
  setAPIs: (apis: APIConfig[]) => void;
  addAPI: (api: APIConfig) => void;
  updateAPI: (api: APIConfig) => void;
  removeAPI: (id: string) => void;
}

export const useDashboardStore = create<DashboardStore>()(
  persist(
    (set) => ({
      // Initial State
      apiKey: null,
      isAuthenticated: false,
      stats: null,
      usage: null,
      apis: [],

      // Auth Actions
      setApiKey: (key: string) => set({ apiKey: key, isAuthenticated: true }),
      clearAuth: () =>
        set({
          apiKey: null,
          isAuthenticated: false,
          stats: null,
          usage: null,
          apis: [],
        }),

      // Data Actions
      setStats: (stats: DashboardStats) => set({ stats }),
      setUsage: (usage: UsageStats) => set({ usage }),
      setAPIs: (apis: APIConfig[]) => set({ apis }),
      addAPI: (api: APIConfig) =>
        set((state) => ({ apis: [...state.apis, api] })),
      updateAPI: (api: APIConfig) =>
        set((state) => ({
          apis: state.apis.map((a) => (a.id === api.id ? api : a)),
        })),
      removeAPI: (id: string) =>
        set((state) => ({
          apis: state.apis.filter((a) => a.id !== id),
        })),
    }),
    {
      name: "rateguard-dashboard",
      partialize: (state) => ({
        apiKey: state.apiKey,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
