import { ReactNode } from "react";

interface DocsSectionHeaderProps {
  icon: ReactNode;
  title: string;
  description: string;
}

export function DocsSectionHeader({
  icon,
  title,
  description,
}: DocsSectionHeaderProps) {
  return (
    <div className="flex flex-col md:flex-row md:items-start gap-4">
      <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
        <div className="text-primary">{icon}</div>
      </div>
      <div>
        <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
        <p className="text-muted-foreground mt-1">{description}</p>
      </div>
    </div>
  );
}
