import { Metadata } from "next";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "Privacy Policy - RateGuard",
  description: "Privacy Policy for RateGuard API Gateway and Rate Limiter",
};

export default function PrivacyPage() {
  return (
    <div className="animate-fade-in-up">
      <div className="mb-8">
        <Badge variant="outline" className="mb-4">
          Last Updated: November 30, 2025
        </Badge>
        <h1 className="text-4xl font-bold mb-4">Privacy Policy</h1>
        <p className="text-xl text-muted-foreground">
          We believe in transparency and protecting your data.
        </p>
      </div>

      <div className="space-y-12">
        <section>
          <h2>1. Introduction</h2>
          <p>
            Welcome to RateGuard (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;). We are committed to
            protecting your privacy and ensuring the security of your personal
            information. This Privacy Policy explains how we collect, use, disclose,
            and safeguard your information when you visit our website or use our API
            gateway services (the &quot;Service&quot;).
          </p>
        </section>

        <section>
          <h2>2. Information We Collect</h2>
          <h3>2.1 Personal Information</h3>
          <p>
            We may collect personal information that you voluntarily provide to us
            when you register for the Service, specifically:
          </p>
          <ul>
            <li>Email address</li>
            <li>Password (hashed and salted)</li>
            <li>Billing information (processed by our payment providers)</li>
          </ul>

          <h3>2.2 Usage Data & API Traffic</h3>
          <p>
            When you use our Service to proxy API requests, we collect metadata
            about your traffic to provide analytics and rate limiting services:
          </p>
          <ul>
            <li>IP addresses (for geo-location and security)</li>
            <li>Request timestamps and latency</li>
            <li>HTTP methods and endpoint paths</li>
            <li>Response status codes</li>
            <li>
              <strong>Note:</strong> We do NOT store the body/payload of your API
              requests or responses. We operate as a transparent proxy.
            </li>
          </ul>
        </section>

        <section>
          <h2>3. How We Use Your Information</h2>
          <p>We use the information we collect to:</p>
          <ul>
            <li>Provide, operate, and maintain our Service</li>
            <li>Process your transactions and manage your subscription</li>
            <li>Send you emails regarding your account or order</li>
            <li>Detect and prevent fraudulent or malicious activity</li>
            <li>Comply with legal obligations</li>
          </ul>
        </section>

        <section>
          <h2>4. Data Storage and Security</h2>
          <p>
            We implement appropriate technical and organizational security measures
            to protect your data. Your password is hashed using bcrypt. API keys are
            encrypted at rest using AES-256-GCM.
          </p>
          <p>
            We retain your personal information only for as long as is necessary for
            the purposes set out in this Privacy Policy.
          </p>
        </section>

        <section>
          <h2>5. Third-Party Service Providers</h2>
          <p>
            We may share your data with the following third-party vendors to
            facilitate our Service:
          </p>
          <ul>
            <li>
              <strong>Stripe / Razorpay:</strong> For payment processing. We do not
              store your credit card details.
            </li>
            <li>
              <strong>Cloudflare / Vercel / Render:</strong> For hosting and content
              delivery.
            </li>
          </ul>
        </section>

        <section>
          <h2>6. International Data Transfers</h2>
          <p>
            Your information, including personal data, may be transferred to — and
            maintained on — computers located outside of your state, province,
            country, or other governmental jurisdiction where the data protection
            laws may differ than those from your jurisdiction.
          </p>
          <p>
            If you are located in India, your payment data is processed locally via
            Razorpay in compliance with RBI regulations.
          </p>
        </section>

        <section>
          <h2>7. Your Data Rights (GDPR / CCPA / DPDP)</h2>
          <p>Depending on your location, you may have the right to:</p>
          <ul>
            <li>Access the personal data we hold about you</li>
            <li>Request correction of inaccurate data</li>
            <li>Request deletion of your data (&quot;Right to be Forgotten&quot;)</li>
            <li>Object to processing of your data</li>
          </ul>
          <p>
            To exercise these rights, please contact us at{" "}
            <a href="mailto:support@rateguard.dev">support@rateguard.dev</a>.
          </p>
        </section>

        <section>
          <h2>8. Cookies</h2>
          <p>
            We use cookies to maintain your session and for essential site
            functionality. You can instruct your browser to refuse all cookies or to
            indicate when a cookie is being sent. However, if you do not accept
            cookies, you may not be able to use some portions of our Service.
          </p>
        </section>

        <section>
          <h2>9. Contact Us</h2>
          <p>
            If you have any questions about this Privacy Policy, please contact us:
          </p>
          <ul>
            <li>By email: support@rateguard.dev</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
