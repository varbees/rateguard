"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { ThemeProvider } from "next-themes";
import { WebSocketProvider } from "@/lib/websocket/context";
import { queryClient } from "@/lib/api";
import { Toaster } from "@/components/ui/sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute="class"
        defaultTheme="dark"
        enableSystem
        disableTransitionOnChange
      >
        <WebSocketProvider>
          {children}
          <Toaster />
          <ReactQueryDevtools initialIsOpen={false} />
        </WebSocketProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
