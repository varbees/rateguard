import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { GlobalLayout } from "@/components/layout/GlobalLayout";

export const metadata: Metadata = {
  title: "RateGuard - Middleware-First API Protection",
  description:
    "Embeddable middleware, self-hosted control plane, and realtime observability for API protection, token budgets, and circuit breaking.",
  keywords: [
    "middleware",
    "API protection",
    "token budgets",
    "rate limiter",
    "observability",
    "webhooks",
    "OpenAPI",
  ],
  authors: [{ name: "varbees" }],
  creator: "varbees",
  publisher: "varbees",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://rateguard.dev",
    title: "RateGuard - Middleware-First API Protection",
    description:
      "Embeddable middleware and self-hosted control plane for API protection, token budgets, and realtime observability.",
    siteName: "RateGuard",
  },
  twitter: {
    card: "summary_large_image",
    title: "RateGuard - Middleware-First API Protection",
    description:
      "Embeddable middleware and self-hosted control plane for API protection, token budgets, and realtime observability.",
    creator: "@varbees",
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
        {/* Structured product metadata for search engines */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              name: "RateGuard",
              applicationCategory: "DeveloperApplication",
              operatingSystem: "Any",
              url: "https://rateguard.dev",
              description:
                "RateGuard is middleware-first API protection for rate limiting, token budgets, circuit breaking, realtime event delivery, and observability.",
              featureList: [
                "In-process middleware SDKs",
                "Self-hosted control plane",
                "Policy presets and route overrides",
                "Token budgets and guardrails",
                "Circuit breakers and retries",
                "WebSocket and SSE event delivery",
                "OpenAPI and generated clients",
                "OpenTelemetry traces and metrics",
              ],
              author: {
                "@type": "Organization",
                name: "RateGuard Team",
                url: "https://rateguard.dev",
              },
              softwareVersion: "2.0",
              applicationSubCategory: "API Protection, Middleware, Observability",
            }),
          }}
        />
        {/* Additional Organization Schema */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Organization",
              name: "RateGuard",
              url: "https://rateguard.dev",
              logo: "https://rateguard.dev/logo.png",
              description:
                "Middleware-first API protection platform with SDKs, realtime observability, and a self-hosted control plane.",
              sameAs: [
                "https://github.com/rateguard",
                "https://twitter.com/rateguard",
              ],
              contactPoint: {
                "@type": "ContactPoint",
                contactType: "Customer Support",
                email: "support@rateguard.dev",
              },
            }),
          }}
        />
        {/* FAQ Schema for better search visibility */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "FAQPage",
              mainEntity: [
                {
                  "@type": "Question",
                  name: "How does RateGuard fit into existing applications?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "RateGuard is designed to run in-process or alongside your application, so you can add rate limiting, token budgets, and circuit breaking without rerouting traffic.",
                  },
                },
                {
                  "@type": "Question",
                  name: "Does RateGuard support realtime events?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "Yes. The control plane exposes WebSocket and SSE event streams, plus replay endpoints for catch-up after disconnects.",
                  },
                },
                {
                  "@type": "Question",
                  name: "Can I self-host RateGuard?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "Yes. The product is built around a self-hosted control plane and embeddable middleware deployment model.",
                  },
                },
                {
                  "@type": "Question",
                  name: "Is my data safe?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "RateGuard is designed to keep request payload handling in your application path while storing observability metadata, telemetry, and policy state needed for enforcement.",
                  },
                },
              ],
            }),
          }}
        />
        <Providers>
          <GlobalLayout>{children}</GlobalLayout>
        </Providers>
      </body>
    </html>
  );
}
