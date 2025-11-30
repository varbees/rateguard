"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Header } from "@/components/landing/Header";
import { Footer } from "@/components/layout/Footer";
import { cn } from "@/lib/utils";
import { Shield, FileText, Lock, ArrowLeft } from "lucide-react";

const legalLinks = [
  {
    href: "/legal/privacy",
    label: "Privacy Policy",
    icon: Lock,
  },
  {
    href: "/legal/terms",
    label: "Terms of Service",
    icon: FileText,
  },
];

export default function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-background flex flex-col font-sans selection:bg-primary/20">
      <Header />

      <main className="flex-1 container mx-auto px-4 py-12 md:py-20">
        <div className="flex flex-col lg:flex-row gap-12">
          {/* Sidebar Navigation */}
          <aside className="lg:w-64 flex-shrink-0">
            <div className="sticky top-24 space-y-8">
              <div className="space-y-2">
                <Link
                  href="/"
                  className="inline-flex items-center text-sm text-muted-foreground hover:text-primary transition-colors mb-4"
                >
                  <ArrowLeft className="w-4 h-4 mr-1" />
                  Back to Home
                </Link>
                <h3 className="font-bold text-lg px-3 mb-2">Legal Center</h3>
                <nav className="space-y-1">
                  {legalLinks.map((link) => {
                    const Icon = link.icon;
                    const isActive = pathname === link.href;
                    return (
                      <Link
                        key={link.href}
                        href={link.href}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-all duration-200",
                          isActive
                            ? "bg-primary/10 text-primary"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        )}
                      >
                        <Icon className="w-4 h-4" />
                        {link.label}
                      </Link>
                    );
                  })}
                </nav>
              </div>

              <div className="bg-muted/30 rounded-lg p-4 border border-border">
                <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-primary" />
                  Trust & Security
                </h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  RateGuard is committed to protecting your data and ensuring
                  compliance with global standards including GDPR and CCPA.
                </p>
              </div>
            </div>
          </aside>

          {/* Main Content */}
          <div className="flex-1 min-w-0">
            <div className="prose prose-slate dark:prose-invert max-w-none prose-headings:font-bold prose-headings:tracking-tight prose-a:text-primary prose-a:no-underline hover:prose-a:underline prose-img:rounded-xl">
              {children}
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
