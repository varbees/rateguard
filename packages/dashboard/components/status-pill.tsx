import { cn } from "@/lib/utils";

const TONE_STYLES: Record<string, string> = {
  good: "bg-[color-mix(in_oklch,var(--color-status-good)_16%,transparent)] text-[var(--color-status-good)]",
  warning: "bg-[color-mix(in_oklch,var(--color-status-warning)_18%,transparent)] text-[var(--color-status-warning)]",
  critical: "bg-[color-mix(in_oklch,var(--color-status-critical)_16%,transparent)] text-[var(--color-status-critical)]",
  neutral: "bg-muted text-muted-foreground",
};

export function StatusPill({
  label,
  tone,
  className,
}: {
  label: string;
  tone: "good" | "warning" | "critical" | "neutral";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
        TONE_STYLES[tone],
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}
