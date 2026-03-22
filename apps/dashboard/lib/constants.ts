r;
/**
 * Landing page constants
 * Centralized content, features, and configuration data
 */

import {
  Shield,
  Zap,
  BarChart3,
  Lock,
  Globe,
  Users,
  Code2,
  Settings,
  CheckCircle,
  Activity,
  type LucideIcon,
} from "lucide-react";
import r from "react-syntax-highlighter/dist/esm/languages/hljs/r";

// Hero section content
export const HERO_CONTENT = {
  headline: "Control Every API Request. Scale Without Limits.",
  subheadline:
    "Middleware-first API protection with intelligent rate limiting and real-time analytics. Embed it directly or use the proxy path when you need it.",
  trustBadges: ["Production-Ready", "99.9% Uptime", "SOC 2 Compliant"],
  cta: {
    primary: "Open Quickstart",
    secondary: "View Documentation",
  },
};

// Value Proposition - Real Features & Benefits
export const VALUE_METRICS = [
  {
    metric: "0 Code Changes",
    description: "Embed middleware or use the proxy path - that's it",
  },
  {
    metric: "99.9% Success Rate",
    description: "Automatic queuing eliminates 429 errors",
  },
  {
    metric: "30s Queue Window",
    description: "Requests never lost, always delivered",
  },
  {
    metric: "Multi-Tier Rate Limits",
    description: "Per-second, hourly, daily, monthly controls",
  },
] as const;

// Features (6 core capabilities)
export interface Feature {
  icon: LucideIcon;
  title: string;
  description: string;
  gradient: string;
  monetizationValue: string;
}

export const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  INR: "₹",
  EUR: "€",
};

export const APP_NAME = "RateGuard";

export const FEATURES: Feature[] = [
  {
    icon: Globe,
    title: "Middleware Integration",
    description:
      "Embed RateGuard in-process or use the proxy path for existing clients.",
    gradient: "from-blue-500 to-cyan-500",
    monetizationValue: "Reduces integration time from days to minutes",
  },
  {
    icon: Activity,
    title: "Intelligent Request Queuing",
    description:
      "Never reject requests. Automatically queue and wait up to 30 seconds when rate limits are hit. Requests are always delivered, never lost.",
    gradient: "from-purple-500 to-pink-500",
    monetizationValue: "Eliminates 429 errors, increases success rate to 99.9%",
  },
  {
    icon: Zap,
    title: "Multi-Tier Rate Limiting",
    description:
      "Control rates per-second, hourly, daily, and monthly. Redis-backed distributed limits scale across multiple instances.",
    gradient: "from-green-500 to-emerald-500",
    monetizationValue: "Prevents API abuse, protects infrastructure costs",
  },
  {
    icon: BarChart3,
    title: "Real-Time Analytics & Monitoring",
    description:
      "Live dashboards showing request volume, queue times, success rates, response times, and cost per API. Streaming updates.",
    gradient: "from-orange-500 to-red-500",
    monetizationValue: "Visibility into API usage and optimization",
  },
  {
    icon: Lock,
    title: "Secure Credential Management",
    description:
      "Store API keys encrypted. RateGuard injects credentials automatically. Your users never see or manage secrets.",
    gradient: "from-yellow-500 to-orange-500",
    monetizationValue: "Eliminates credential exposure, reduces security risks",
  },
  {
    icon: Users,
    title: "Automatic Retry with Backoff",
    description:
      "Respects Retry-After headers. Exponential backoff on failures. Up to 3 retry attempts with intelligent waiting.",
    gradient: "from-indigo-500 to-purple-500",
    monetizationValue: "Increases reliability without client-side retry logic",
  },
];

// How It Works (3 steps)
export interface HowItWorksStep {
  step: number;
  title: string;
  description: string;
  icon: LucideIcon;
  code: {
    language: string;
    snippet: string;
  };
}

export const HOW_IT_WORKS_STEPS: HowItWorksStep[] = [
  {
    step: 1,
    title: "Configure Your API",
    description:
      "Add your target API URL and guardrails through our dashboard or API.",
    icon: Settings,
    code: {
      language: "bash",
      snippet: `curl -X POST https://api.rateguard.dev/apis \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -d '{
    "name": "OpenAI API",
    "target_url": "https://api.openai.com",
    "rate_limit": "60/minute"
  }'`,
    },
  },
  {
    step: 2,
    title: "Get Your Compatibility URL",
    description:
      "Receive a unique proxy URL that routes requests through RateGuard.",
    icon: Globe,
    code: {
      language: "json",
      snippet: `{
  "id": "api_abc123",
  "proxy_url": "https://proxy.rateguard.dev/abc123",
  "status": "active",
  "rate_limit": "60/minute"
}`,
    },
  },
  {
    step: 3,
    title: "Start Making Requests",
    description:
      "Replace your API URL with the proxy URL. RateGuard handles the rest.",
    icon: Code2,
    code: {
      language: "javascript",
      snippet: `// Before
const response = await fetch('https://api.openai.com/v1/chat');

// After - just change the URL!
const response = await fetch('https://proxy.rateguard.dev/abc123/v1/chat');`,
    },
  },
];

// Code Example (Before/After)
export const CODE_EXAMPLE = {
  before: {
    title: "Without RateGuard",
    language: "javascript",
    code: `// Direct API call - no protection
async function callAPI() {
  try {
    const response = await fetch('https://api.service.com/endpoint', {
      headers: { 'Authorization': 'Bearer sk-...' }
    });
    const data = await response.json();
    return data;
  } catch (error) {
    // Rate limit errors cause failures
    console.error('API call failed:', error);
  }
}`,
  },
  after: {
    title: "With RateGuard",
    language: "javascript",
    code: `// Protected API call with automatic queuing
async function callAPI() {
  try {
    const response = await fetch('https://proxy.rateguard.dev/abc123/endpoint', {
      headers: { 'Authorization': 'Bearer sk-...' }
    });
    const data = await response.json();
    return data; // Always succeeds!
  } catch (error) {
    // Automatic retries + rate limit handling
    console.error('API call failed:', error);
  }
}`,
  },
};

// Tech stack badges
export const TECH_STACK = [
  { name: "Go + Fiber", color: "bg-cyan-500" },
  { name: "PostgreSQL", color: "bg-blue-600" },
  { name: "Redis", color: "bg-red-600" },
  { name: "Docker", color: "bg-blue-500" },
  { name: "React", color: "bg-cyan-400" },
  { name: "TypeScript", color: "bg-blue-700" },
  { name: "Next.js", color: "bg-slate-900" },
  { name: "Tailwind CSS", color: "bg-cyan-600" },
] as const;

// CTA Section
export const CTA_SECTION = {
  headline: "Ready to Guard Your APIs?",
  subheadline:
    "Join teams that trust RateGuard to manage API rate limits and observability.",
  placeholder: "Enter your email",
  button: "Get Started Free",
};

// Footer links
export const FOOTER_LINKS = {
  product: [
    { label: "Features", href: "#features" },
    { label: "Documentation", href: "/docs" },
    { label: "API Reference", href: "/docs/api" },
  ],
  company: [
    { label: "About", href: "/about" },
    { label: "Blog", href: "/blog" },
    { label: "Careers", href: "/careers" },
    { label: "Contact", href: "/contact" },
  ],
  resources: [
    { label: "GitHub", href: "https://github.com/rateguard" },
    { label: "API Status", href: "https://status.rateguard.dev" },
    { label: "Support", href: "/support" },
    { label: "Community", href: "/community" },
  ],
  legal: [
    { label: "Privacy Policy", href: "/privacy" },
    { label: "Terms of Service", href: "/terms" },
    { label: "Security", href: "/security" },
  ],
} as const;

export const FOOTER_COPYRIGHT = "© 2025 RateGuard. All rights reserved.";
export const FOOTER_TAGLINE = "Built with ❤️ and Go";

// Social media links
export const SOCIAL_LINKS = [
  { name: "GitHub", href: "https://github.com/rateguard", icon: "github" },
  { name: "Twitter", href: "https://twitter.com/rateguard", icon: "twitter" },
  {
    name: "LinkedIn",
    href: "https://linkedin.com/company/rateguard",
    icon: "linkedin",
  },
  { name: "Discord", href: "https://discord.gg/rateguard", icon: "discord" },
] as const;
