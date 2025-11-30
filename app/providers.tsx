"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { ThemeProvider } from "next-themes";
import { WebSocketProvider } from "@/lib/websocket/context";
import { UserProvider, useUser } from "@/lib/hooks/use-user";
import { queryClient } from "@/lib/api";
import { Toaster } from "@/components/ui/sonner";

/**
 * Wrapper that only enables WebSocket for authenticated users
 * Prevents unnecessary connection attempts on public pages (landing, pricing, etc.)
 */
function AuthenticatedWebSocketProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isLoading } = useUser();

  // Only enable WebSocket if user is authenticated
  // Don't enable while loading to prevent premature connection attempts
  const isAuthenticated = !isLoading && !!user;

  return (
    <WebSocketProvider enabled={isAuthenticated}>{children}</WebSocketProvider>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute="class"
        defaultTheme="dark"
        enableSystem
        disableTransitionOnChange
      >
        <UserProvider>
          <AuthenticatedWebSocketProvider>
            {children}
            <Toaster />
            <ReactQueryDevtools initialIsOpen={false} />
          </AuthenticatedWebSocketProvider>
        </UserProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
