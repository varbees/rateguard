import { create } from "zustand";
import { User, APIConfig, DashboardStats, UsageStats } from "./api";

interface DashboardStore {
  // Auth State (JWT in cookies - no localStorage persistence)
  user: User | null;
  isAuthenticated: boolean;

  // Actions
  setUser: (user: User) => void;
  clearAuth: () => void;

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
  // UI State
  isSidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
}

export const useDashboardStore = create<DashboardStore>((set) => ({
  // Initial State (no localStorage - auth via JWT cookies)
  user: null,
  isAuthenticated: false,
  stats: null,
  usage: null,
  apis: [],
  isSidebarCollapsed: true, // Default to collapsed for icon-only view

  // Auth Actions
  setUser: (user: User) => {
    set({ user, isAuthenticated: true });
  },
  clearAuth: () => {
    set({
      user: null,
      isAuthenticated: false,
      stats: null,
      usage: null,
      apis: [],
    });
  },

  // UI Actions
  toggleSidebar: () => set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),
  setSidebarCollapsed: (collapsed: boolean) => set({ isSidebarCollapsed: collapsed }),

  // Data Actions
  setStats: (stats: DashboardStats) => set({ stats }),
  setUsage: (usage: UsageStats) => set({ usage }),
  setAPIs: (apis: APIConfig[]) => set({ apis }),
  addAPI: (api: APIConfig) => set((state) => ({ apis: [...state.apis, api] })),
  updateAPI: (api: APIConfig) =>
    set((state) => ({
      apis: state.apis.map((a) => (a.id === api.id ? api : a)),
    })),
  removeAPI: (id: string) =>
    set((state) => ({
      apis: state.apis.filter((a) => a.id !== id),
    })),
}));
