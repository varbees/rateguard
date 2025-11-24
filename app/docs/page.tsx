import { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Introduction | RateGuard Documentation",
  description: "Introduction to the RateGuard documentation.",
};

export default function DocsIntroductionPage() {
  return (
    <div className="prose prose-lg max-w-none prose-headings:text-foreground prose-p:text-foreground prose-li:text-foreground prose-a:text-primary hover:prose-a:text-primary/80 prose-strong:text-foreground prose-code:text-foreground">
      <h1>Welcome to the RateGuard Documentation</h1>
      <p>
        This documentation provides a comprehensive guide to using and
        integrating with RateGuard, our intelligent API rate limiting and proxy
        service.
      </p>

      <h2>Getting Started</h2>
      <p>
        If you&apos;re new here, we recommend starting with the following
        guides:
      </p>
      <ul>
        <li>
          <Link href="/docs/authentication">Authentication</Link>
        </li>
        <li>
          <Link href="/docs/guides/rate-limiting">Rate Limiting Guide</Link>
        </li>
      </ul>

      <h2>Features</h2>
      <p>
        Explore RateGuard&apos;s intelligent features that make API management
        effortless:
      </p>
      <ul>
        <li>
          <Link href="/docs/features/transparent-proxy">
            <strong>Transparent Proxy</strong>
          </Link>{" "}
          - Seamlessly forwards requests to upstream APIs with rate limiting and
          analytics
        </li>
        <li>
          <Link href="/docs/features/queue-management">
            <strong>Queue Management</strong>
          </Link>{" "}
          - Automatically queues requests instead of rejecting them when rate
          limits are hit
        </li>
        <li>
          <Link href="/docs/features/rate-limit-discovery">
            <strong>Rate Limit Discovery</strong>
          </Link>{" "}
          - Automatically learns API limits from 429 responses and provides
          smart suggestions
        </li>
      </ul>

      <h2>API Reference</h2>
      <p>
        For detailed information about our API endpoints, please see the{" "}
        <Link href="/docs/api-reference">API Reference</Link>.
      </p>
    </div>
  );
}
