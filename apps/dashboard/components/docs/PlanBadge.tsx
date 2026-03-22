import { Badge } from "@/components/ui/badge";
import { Crown, Shield, Zap } from "lucide-react";

type Preset = "starter" | "standard" | "strict";

interface PresetBadgeProps {
  presets: Preset[];
  className?: string;
}

const presetConfig = {
  starter: {
    label: "Starter",
    icon: Shield,
    className: "bg-slate-500/10 text-slate-400 border-slate-500/20",
  },
  standard: {
    label: "Standard",
    icon: Zap,
    className: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  },
  strict: {
    label: "Strict",
    icon: Crown,
    className: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  },
};

export function PresetBadge({ presets, className = "" }: PresetBadgeProps) {
  return (
    <div className={`flex items-center gap-2 flex-wrap ${className}`}>
      {presets.map((preset) => {
        const config = presetConfig[preset];
        const Icon = config.icon;
        return (
          <Badge
            key={preset}
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

export const PlanBadge = PresetBadge;
