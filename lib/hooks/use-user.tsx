/**
 * useUser Hook
 * 
 * Provides user context and plan information throughout the app.
 */

'use client';

import { createContext, useContext, ReactNode } from 'react';
import useSWR from 'swr';

interface PlanLimits {
  maxApis: number;
  requestsPerMonth: number;
  tokensPerMonth: number;
}

interface CurrentUsage {
  apiCount: number;
  requestsThisMonth: number;
  tokensThisMonth: number;
}

export interface User {
  id: string;
  email: string;
  name: string;
  plan: 'free' | 'pro' | 'enterprise';
  planLimits: PlanLimits;
  currentUsage: CurrentUsage;
  billingStatus: 'active' | 'past_due' | 'cancelled';
  trialEndsAt?: string;
  token: string; // JWT for WebSocket auth
}

interface UserContextValue {
  user: User | undefined;
  isLoading: boolean;
  isError: any;
  mutate: () => void;
  hasAccess: (requiredPlan: 'pro' | 'enterprise') => boolean;
}

const UserContext = createContext<UserContextValue | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
  const { data, error, isLoading, mutate } = useSWR<User>('/api/v1/dashboard/user', {
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
  });

  const hasAccess = (requiredPlan: 'pro' | 'enterprise'): boolean => {
    if (!data) return false;
    if (requiredPlan === 'pro') {
      return ['pro', 'enterprise'].includes(data.plan);
    }
    if (requiredPlan === 'enterprise') {
      return data.plan === 'enterprise';
    }
    return true;
  };

  return (
    <UserContext.Provider
      value={{
        user: data,
        isLoading,
        isError: error,
        mutate,
        hasAccess,
      }}
    >
      {children}
    </UserContext.Provider>
  );
}

export function useUser(): UserContextValue {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
}
