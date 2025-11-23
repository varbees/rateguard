import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { APIConfig, DashboardStats, UsageStats, apiClient } from "./api";

interface DashboardStore {
  // Auth State
  apiKey: string | null;
  isAuthenticated: boolean;
  _hasHydrated: boolean;

  // Actions
  setApiKey: (key: string) => void;
  clearAuth: () => void;
  setHasHydrated: (state: boolean) => void;

  // Dashboard Data
  stats: DashboardStats | null;
  usage: UsageStats | null;
  apis: APIConfig[];

  // Data Actions
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
      _hasHydrated: false,
      stats: null,
      usage: null,
      apis: [],

      // Auth Actions
      setApiKey: (key: string) => {
        // Sync with APIClient
        apiClient.setApiKey(key);
        set({ apiKey: key, isAuthenticated: true });
      },
      clearAuth: () => {
        // Sync with APIClient
        apiClient.clearApiKey();
        set({
          apiKey: null,
          isAuthenticated: false,
          stats: null,
          usage: null,
          apis: [],
        });
      },
      setHasHydrated: (state: boolean) => set({ _hasHydrated: state }),

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
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        apiKey: state.apiKey,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        // Sync API client with persisted state after hydration
        if (state?.apiKey) {
          apiClient.setApiKey(state.apiKey);
        }
        state?.setHasHydrated(true);
      },
    }
  )
);
