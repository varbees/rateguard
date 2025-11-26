import { Badge } from "@/components/ui/badge";
import { Crown, Shield, Zap } from "lucide-react";

type Plan = "free" | "pro" | "business";

interface PlanBadgeProps {
  plans: Plan[];
  className?: string;
}

const planConfig = {
  free: {
    label: "Free",
    icon: Shield,
    className: "bg-slate-500/10 text-slate-400 border-slate-500/20",
  },
  pro: {
    label: "Pro",
    icon: Zap,
    className: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  },
  business: {
    label: "Business",
    icon: Crown,
    className: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  },
};

export function PlanBadge({ plans, className = "" }: PlanBadgeProps) {
  return (
    <div className={`flex items-center gap-2 flex-wrap ${className}`}>
      {plans.map((plan) => {
        const config = planConfig[plan];
        const Icon = config.icon;
        return (
          <Badge
            key={plan}
            variant="outline"
            className={`${config.className} flex items-center gap-1.5`}
          >
            <Icon className="w-3 h-3" />
            {config.label}
          </Badge>
        );
      })}
    </div>
  );
}
