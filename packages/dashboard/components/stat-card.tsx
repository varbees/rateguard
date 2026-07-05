import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AnimatedNumber } from "@/components/animated-number";
import type { LucideIcon } from "lucide-react";

export function StatCard({
  label,
  value,
  numericValue,
  decimals = 0,
  sub,
  icon: Icon,
}: {
  label: string;
  value: string;
  numericValue?: number;
  decimals?: number;
  sub?: string;
  icon: LucideIcon;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="font-mono text-2xl font-semibold tabular-nums">
          {numericValue !== undefined ? <AnimatedNumber value={numericValue} decimals={decimals} /> : value}
        </div>
        {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}
