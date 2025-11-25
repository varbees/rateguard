"use client";

import { Check, X, Minus } from "lucide-react";

export function Comparison() {
  return (
    <section className="py-24 bg-muted/30">
      <div className="container px-4 md:px-6">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl">
            RateGuard vs. The Other Guys
          </h2>
          <p className="mt-4 text-muted-foreground md:text-xl">
            Don't settle for "good enough" when you can have "actually works."
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse min-w-[600px]">
            <thead>
              <tr>
                <th className="p-4 text-left w-1/3">Feature</th>
                <th className="p-4 text-center w-1/3 bg-primary/5 rounded-t-xl border-t border-x border-primary/20">
                  <span className="text-primary font-bold text-xl">RateGuard</span>
                </th>
                <th className="p-4 text-center w-1/3 text-muted-foreground">
                  Other SaaS
                </th>
              </tr>
            </thead>
            <tbody>
              {[
                { feature: "Real Billing Integration", us: true, them: false, note: "They just count requests" },
                { feature: "True Concurrency Limits", us: true, them: false, note: "They guess based on avg latency" },
                { feature: "Queue Analytics", us: true, them: false, note: "Black box" },
                { feature: "API Key Vault", us: true, them: true, note: "But ours is encrypted better" },
                { feature: "Dwight Schrute Bot", us: true, them: false, note: "They have a boring chatbot" },
                { feature: "Vaporware Modules", us: false, them: true, note: "Coming soon™" },
              ].map((row, i) => (
                <tr key={i} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                  <td className="p-4 font-medium">{row.feature}</td>
                  <td className="p-4 text-center bg-primary/5 border-x border-primary/20">
                    {row.us ? (
                      <Check className="w-6 h-6 text-green-500 mx-auto" />
                    ) : (
                      <X className="w-6 h-6 text-red-500 mx-auto" />
                    )}
                  </td>
                  <td className="p-4 text-center text-muted-foreground">
                    {row.them ? (
                      <Check className="w-6 h-6 text-green-500 mx-auto opacity-50" />
                    ) : (
                      <div className="flex flex-col items-center">
                        <X className="w-6 h-6 text-red-500 mx-auto opacity-50" />
                        <span className="text-xs mt-1">{row.note}</span>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              <tr>
                <td className="p-4"></td>
                <td className="p-4 bg-primary/5 rounded-b-xl border-b border-x border-primary/20 text-center">
                  <span className="font-bold text-primary">Winner</span>
                </td>
                <td className="p-4 text-center text-muted-foreground">
                  Participant
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
