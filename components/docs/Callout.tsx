import * as React from "react";
import { AlertCircle, AlertTriangle, Info, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CalloutProps {
  type?: "default" | "warning" | "danger" | "success";
  title?: string;
  children: React.ReactNode;
  className?: string;
}

const calloutVariants = {
  default: {
    container:
      "border-blue-200 bg-blue-50 dark:border-blue-900/50 dark:bg-blue-950/30",
    icon: "text-blue-600 dark:text-blue-400",
    title: "text-blue-900 dark:text-blue-100",
    content: "text-blue-800 dark:text-blue-200",
    Icon: Info,
  },
  warning: {
    container:
      "border-yellow-200 bg-yellow-50 dark:border-yellow-900/50 dark:bg-yellow-950/30",
    icon: "text-yellow-600 dark:text-yellow-400",
    title: "text-yellow-900 dark:text-yellow-100",
    content: "text-yellow-800 dark:text-yellow-200",
    Icon: AlertTriangle,
  },
  danger: {
    container:
      "border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/30",
    icon: "text-red-600 dark:text-red-400",
    title: "text-red-900 dark:text-red-100",
    content: "text-red-800 dark:text-red-200",
    Icon: AlertCircle,
  },
  success: {
    container:
      "border-green-200 bg-green-50 dark:border-green-900/50 dark:bg-green-950/30",
    icon: "text-green-600 dark:text-green-400",
    title: "text-green-900 dark:text-green-100",
    content: "text-green-800 dark:text-green-200",
    Icon: CheckCircle2,
  },
};

export function Callout({
  type = "default",
  title,
  children,
  className,
}: CalloutProps) {
  const variant = calloutVariants[type];
  const Icon = variant.Icon;

  return (
    <div
      className={cn(
        "my-6 flex gap-3 rounded-lg border p-4",
        variant.container,
        className
      )}
    >
      <Icon className={cn("size-5 shrink-0 mt-0.5", variant.icon)} />
      <div className="flex-1 space-y-2">
        {title && (
          <p className={cn("font-semibold text-sm", variant.title)}>{title}</p>
        )}
        <div className={cn("text-sm leading-relaxed", variant.content)}>
          {children}
        </div>
      </div>
    </div>
  );
}
