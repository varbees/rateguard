import { cn } from "@/lib/utils";

function Skeleton({
  className,
  shimmer = false,
  ...props
}: React.ComponentProps<"div"> & { shimmer?: boolean }) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "bg-accent rounded-md relative overflow-hidden",
        shimmer
          ? "animate-shimmer bg-gradient-to-r from-accent via-accent/50 to-accent bg-[length:200%_100%]"
          : "animate-pulse",
        className
      )}
      {...props}
    />
  );
}

export { Skeleton };
