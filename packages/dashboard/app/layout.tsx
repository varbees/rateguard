import type { Metadata } from "next";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import { Providers } from "@/components/providers";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "RateGuard Control Center",
  description: "Live budget, rate limit, circuit breaker, and loop detection state for a running RateGuard instance, with runtime policy tweaks.",
  robots: "noindex, nofollow",
};

// Runs before hydration so the dark theme (this dashboard's default) applies
// on first paint instead of flashing light, then swapping.
const noFlashScript = `
  try {
    var stored = localStorage.getItem('rateguard-theme');
    var dark = stored ? stored === 'dark' : true;
    document.documentElement.classList.toggle('dark', dark);
  } catch (e) {}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn("font-sans dark", geist.variable)} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: noFlashScript }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
