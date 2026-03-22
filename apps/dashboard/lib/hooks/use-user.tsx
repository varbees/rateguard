'use client';

import { createContext, useContext, ReactNode } from 'react';
import useSWR from 'swr';
import { apiClient, type User as ApiUser } from '@/lib/api';

export type User = ApiUser;

interface UserContextValue {
  user: User | undefined;
  isLoading: boolean;
  isError: any;
  mutate: () => void;
  hasAccess: () => boolean;
}

const UserContext = createContext<UserContextValue | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
  const { data, error, isLoading, mutate } = useSWR<User>(
    'current-user',
    () => apiClient.getCurrentUser(),
    {
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
    }
  );

  const hasAccess = () => Boolean(data);

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
