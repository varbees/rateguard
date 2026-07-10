import type { ReactNode } from "react";

export default function FeatureCard({
  title,
  desc,
  micro,
}: {
  title: string;
  desc: string;
  micro: ReactNode;
}) {
  return (
    <div className="h-full rounded-lg border border-[var(--border)] bg-[var(--card)] p-5 transition-colors hover:border-[var(--muted)]">
      <div className="mb-4 flex h-10 w-10 items-center justify-center">{micro}</div>
      <h3 className="font-display font-semibold mb-2">{title}</h3>
      <p className="text-sm leading-relaxed text-[var(--muted)]">{desc}</p>
    </div>
  );
}
