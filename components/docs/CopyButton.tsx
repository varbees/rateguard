"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CopyButtonProps {
  value: string;
  className?: string;
}

export function CopyButton({ value, className }: CopyButtonProps) {
  const [hasCopied, setHasCopied] = React.useState(false);

  React.useEffect(() => {
    if (hasCopied) {
      const timeout = setTimeout(() => {
        setHasCopied(false);
      }, 2000);

      return () => clearTimeout(timeout);
    }
  }, [hasCopied]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setHasCopied(true);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <Button
      size="icon-sm"
      variant="ghost"
      className={cn(
        "size-7 text-muted-foreground hover:bg-muted hover:text-foreground transition-all",
        className
      )}
      onClick={handleCopy}
    >
      {hasCopied ? (
        <Check className="size-3.5 text-green-500" />
      ) : (
        <Copy className="size-3.5" />
      )}
      <span className="sr-only">Copy code</span>
    </Button>
  );
}
