import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Lock, Zap, Check } from "lucide-react";

interface LimitReachedStateProps {
  currentCount: number;
  maxCount: number;
  presetName: string;
}

export function LimitReachedState({
  currentCount,
  maxCount,
  presetName,
}: LimitReachedStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-20 h-20 bg-yellow-100 dark:bg-yellow-900/20 rounded-2xl flex items-center justify-center mb-6">
        <Lock className="w-10 h-10 text-yellow-600 dark:text-yellow-500" />
      </div>

      <h2 className="text-2xl font-bold mb-3">You&apos;ve reached a guardrail</h2>
      <p className="text-muted-foreground max-w-md mb-2">
        Your current policy preset includes {maxCount} API proxies. You&apos;re currently
        using all {currentCount}.
      </p>
      <p className="text-sm text-muted-foreground mb-8">
        Review the active guardrail preset or delete an unused project to create a new one.
      </p>
      <p className="text-xs text-muted-foreground mb-8">
        Active preset: {presetName}
      </p>

      <div className="flex flex-col sm:flex-row gap-3">
        <Button size="lg" asChild>
          <Link href="/dashboard/budget">
            <Zap className="h-5 w-5 mr-2" />
            Review Guardrails
          </Link>
        </Button>
        <Button
          size="lg"
          variant="outline"
          onClick={() => window.history.back()}
        >
          View Existing APIs
        </Button>
      </div>

      <div className="mt-12 p-6 border rounded-lg max-w-md text-left bg-card">
        <p className="font-semibold mb-4">Current Guardrails Include:</p>
        <ul className="space-y-2">
          <li className="flex items-start gap-2">
            <Check className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
            <span className="text-sm">Policy presets with bounded API counts</span>
          </li>
          <li className="flex items-start gap-2">
            <Check className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
            <span className="text-sm">Real-time WebSocket analytics</span>
          </li>
          <li className="flex items-start gap-2">
            <Check className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
            <span className="text-sm">Bulk actions & advanced filters</span>
          </li>
          <li className="flex items-start gap-2">
            <Check className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
            <span className="text-sm">30-day usage history</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
