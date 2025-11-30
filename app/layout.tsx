import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { GlobalLayout } from "@/components/layout/GlobalLayout";

export const metadata: Metadata = {
  title: "RateGuard - The All-in-One API Gateway for AI Developers",
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
  authors: [{ name: "varbees" }],
  creator: "varbees",
  publisher: "varbees",
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
        {/* Enhanced JSON-LD for GEO (Generative Engine Optimization) */}
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
              offers: [
                {
                  "@type": "Offer",
                  name: "Free Plan",
                  price: "0",
                  priceCurrency: "USD",
                  description: "100K requests/month with basic rate limiting",
                },
                {
                  "@type": "Offer",
                  name: "Starter Plan",
                  price: "29",
                  priceCurrency: "USD",
                  description:
                    "1M requests/month with advanced rate limiting and priority support",
                },
                {
                  "@type": "Offer",
                  name: "Pro Plan",
                  price: "79",
                  priceCurrency: "USD",
                  description:
                    "10M requests/month with 99.99% SLA and dedicated support",
                },
              ],
              description:
                "RateGuard is a distributed rate limiter with concurrent aggregator technology. Protect your APIs with sub-2ms latency, geo-aware currency detection, and enterprise-grade concurrency control. No database locks, no bottlenecks.",
              aggregateRating: {
                "@type": "AggregateRating",
                ratingValue: "4.9",
                ratingCount: "120",
                bestRating: "5",
              },
              featureList: [
                "5-tier rate limiting (fixed window, sliding window, token bucket, leaky bucket, panic mode)",
                "Concurrent Aggregator with CRDT-inspired distributed counters",
                "Sub-2ms latency overhead",
                "Transparent proxy - drop-in replacement",
                "Automated billing with Stripe & Razorpay",
                "Geo-currency detection",
                "Real-time usage analytics",
                "End-to-end encryption",
                "100k+ RPS throughput",
                "Global edge node deployment",
              ],
              author: {
                "@type": "Organization",
                name: "RateGuard Team",
                url: "https://rateguard.dev",
              },
              softwareVersion: "2.0",
              applicationSubCategory:
                "API Management, Rate Limiting, API Gateway",
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
                "Distributed rate limiting platform with concurrent aggregator technology for API protection and management.",
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
                  name: "How does the concurrent aggregation work?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "RateGuard uses a distributed counter system that syncs across nodes using a CRDT-inspired approach. It ensures that requests from multiple regions are counted accurately without locking your database, providing global consistency without latency penalties.",
                  },
                },
                {
                  "@type": "Question",
                  name: "What about latency?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "RateGuard adds less than 2ms of overhead. The system is optimized for sub-millisecond latency using distributed edge nodes and asynchronous counter synchronization.",
                  },
                },
                {
                  "@type": "Question",
                  name: "Can I self-host RateGuard?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "Yes! RateGuard offers on-premise deployment options with the Enterprise plan, giving you full control over your infrastructure.",
                  },
                },
                {
                  "@type": "Question",
                  name: "Is my data safe?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "RateGuard only stores metadata (counts, keys). Your actual request payloads pass through the transparent proxy and are never stored. All data is encrypted at rest and in transit.",
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
