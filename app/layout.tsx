import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { GlobalLayout } from "@/components/layout/GlobalLayout";

export const metadata: Metadata = {
  title: "RateGuard - Intelligent API Rate Limiting & Transparent Proxy",
  description:
    "Control every API request with intelligent rate limiting, transparent proxy, and real-time analytics. Scale without limits. Production-ready with 99.9% uptime.",
  keywords: [
    "API rate limiting",
    "transparent proxy",
    "API management",
    "rate limiter",
    "API gateway",
    "request queuing",
    "API analytics",
  ],
  authors: [{ name: "RateGuard Team" }],
  creator: "RateGuard",
  publisher: "RateGuard",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://rateguard.dev",
    title: "RateGuard - Intelligent API Rate Limiting",
    description:
      "Control every API request with intelligent rate limiting and transparent proxy. Scale without limits.",
    siteName: "RateGuard",
  },
  twitter: {
    card: "summary_large_image",
    title: "RateGuard - Intelligent API Rate Limiting",
    description:
      "Control every API request with intelligent rate limiting and transparent proxy.",
    creator: "@rateguard",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-mono antialiased">
        <Providers>
          <GlobalLayout>{children}</GlobalLayout>
        </Providers>
      </body>
    </html>
  );
}
