import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DocsPagerProps {
  prev?: {
    href: string;
    title: string;
  };
  next?: {
    href: string;
    title: string;
  };
}

export function DocsPager({ prev, next }: DocsPagerProps) {
  return (
    <div className="flex items-center justify-between border-t pt-6">
      {prev ? (
        <Button variant="ghost" asChild className="flex items-center gap-2">
          <Link href={prev.href}>
            <ChevronLeft className="h-4 w-4" />
            <span>{prev.title}</span>
          </Link>
        </Button>
      ) : (
        <div />
      )}
      {next ? (
        <Button variant="ghost" asChild className="flex items-center gap-2">
          <Link href={next.href}>
            <span>{next.title}</span>
            <ChevronRight className="h-4 w-4" />
          </Link>
        </Button>
      ) : (
        <div />
      )}
    </div>
  );
}
