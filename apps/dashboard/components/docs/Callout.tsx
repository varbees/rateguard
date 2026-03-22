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
    container: "border-primary/20 bg-primary/10",
    icon: "text-primary",
    title: "text-foreground",
    content: "text-muted-foreground",
    Icon: Info,
  },
  warning: {
    container: "border-accent bg-accent/10",
    icon: "text-accent-foreground",
    title: "text-foreground",
    content: "text-muted-foreground",
    Icon: AlertTriangle,
  },
  danger: {
    container: "border-destructive/20 bg-destructive/10",
    icon: "text-destructive",
    title: "text-foreground",
    content: "text-muted-foreground",
    Icon: AlertCircle,
  },
  success: {
    container: "border-primary/20 bg-primary/10",
    icon: "text-primary",
    title: "text-foreground",
    content: "text-muted-foreground",
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
