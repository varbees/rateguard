import { Metadata } from "next";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "Terms of Service - RateGuard",
  description: "Terms of Service for RateGuard API Gateway and Rate Limiter",
};

export default function TermsPage() {
  return (
    <div className="animate-fade-in-up">
      <div className="mb-8">
        <Badge variant="outline" className="mb-4">
          Last Updated: November 30, 2025
        </Badge>
        <h1 className="text-4xl font-bold mb-4">Terms of Service</h1>
        <p className="text-xl text-muted-foreground">
          Please read these terms carefully before using our service.
        </p>
      </div>

      <div className="space-y-12">
        <section>
          <h2>1. Agreement to Terms</h2>
          <p>
            By accessing or using the RateGuard website and services (collectively,
            the &quot;Service&quot;), you agree to be bound by these Terms of Service
            (&quot;Terms&quot;). If you disagree with any part of the terms, then you may not
            access the Service.
          </p>
        </section>

        <section>
          <h2>2. Description of Service</h2>
          <p>
            RateGuard provides an API gateway, rate limiting, and analytics platform
            for developers. We act as a proxy between your applications and third-party
            API providers.
          </p>
        </section>

        <section>
          <h2>3. User Accounts</h2>
          <p>
            When you create an account with us, you must provide information that is
            accurate, complete, and current at all times. Failure to do so
            constitutes a breach of the Terms, which may result in immediate
            termination of your account on our Service.
          </p>
          <p>
            You are responsible for safeguarding the password and API keys that you
            use to access the Service and for any activities or actions under your
            password or keys.
          </p>
        </section>

        <section>
          <h2>4. Acceptable Use</h2>
          <p>You agree not to use the Service:</p>
          <ul>
            <li>
              In any way that violates any applicable national or international law
              or regulation.
            </li>
            <li>
              To transmit, or procure the sending of, any advertising or promotional
              material, including any &quot;junk mail&quot;, &quot;chain letter,&quot; &quot;spam,&quot; or any
              other similar solicitation.
            </li>
            <li>
              To impersonate or attempt to impersonate the Company, a Company
              employee, another user, or any other person or entity.
            </li>
            <li>
              To engage in any other conduct that restricts or inhibits anyone&apos;s use
              or enjoyment of the Service, or which, as determined by us, may harm
              the Company or users of the Service or expose them to liability.
            </li>
          </ul>
        </section>

        <section>
          <h2>5. Payment and Subscription</h2>
          <p>
            Some parts of the Service are billed on a subscription basis
            (&quot;Subscription(s)&quot;). You will be billed in advance on a recurring and
            periodic basis (such as monthly or annually).
          </p>
          <p>
            <strong>Refunds:</strong> Refunds are handled on a case-by-case basis.
            Please contact support if you believe you have been billed in error.
          </p>
          <p>
            <strong>Cancellation:</strong> You may cancel your Subscription at any
            time. Your access to paid features will continue until the end of your
            current billing period.
          </p>
        </section>

        <section>
          <h2>6. Intellectual Property</h2>
          <p>
            The Service and its original content, features, and functionality are
            and will remain the exclusive property of RateGuard and its licensors.
            The Service is protected by copyright, trademark, and other laws of both
            the United States and foreign countries.
          </p>
        </section>

        <section>
          <h2>7. Termination</h2>
          <p>
            We may terminate or suspend your account immediately, without prior
            notice or liability, for any reason whatsoever, including without
            limitation if you breach the Terms. Upon termination, your right to use
            the Service will immediately cease.
          </p>
        </section>

        <section>
          <h2>8. Limitation of Liability</h2>
          <p>
            In no event shall RateGuard, nor its directors, employees, partners,
            agents, suppliers, or affiliates, be liable for any indirect,
            incidental, special, consequential or punitive damages, including
            without limitation, loss of profits, data, use, goodwill, or other
            intangible losses, resulting from your access to or use of or inability
            to access or use the Service.
          </p>
        </section>

        <section>
          <h2>9. Governing Law</h2>
          <p>
            These Terms shall be governed and construed in accordance with the laws
            of the jurisdiction in which RateGuard operates, without regard to its
            conflict of law provisions.
          </p>
        </section>

        <section>
          <h2>10. Changes</h2>
          <p>
            We reserve the right, at our sole discretion, to modify or replace these
            Terms at any time. If a revision is material we will try to provide at
            least 30 days notice prior to any new terms taking effect. What
            constitutes a material change will be determined at our sole discretion.
          </p>
        </section>

        <section>
          <h2>11. Contact Us</h2>
          <p>
            If you have any questions about these Terms, please contact us at{" "}
            <a href="mailto:support@rateguard.dev">support@rateguard.dev</a>.
          </p>
        </section>
      </div>
    </div>
  );
}
