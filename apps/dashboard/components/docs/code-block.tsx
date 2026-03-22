"use client"

import React from "react";
import { Highlight, themes } from "prism-react-renderer";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CodeBlockProps {
  language: string;
  value: string;
  className?: string;
}

export function CodeBlock({ language, value, className }: CodeBlockProps) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={cn("relative rounded-md overflow-hidden", className)}>
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2 h-8 w-8 bg-muted/80 hover:bg-muted"
        onClick={handleCopy}
      >
        <Copy className="h-4 w-4" />
        <span className="sr-only">Copy code</span>
      </Button>
      {copied && (
        <div className="absolute top-2 right-12 bg-muted text-muted-foreground text-xs px-2 py-1 rounded">
          Copied!
        </div>
      )}
      <Highlight theme={themes.vsDark} code={value} language={language}>
        {({ className, style, tokens, getLineProps, getTokenProps }) => (
          <pre
            className={cn(className, "p-4 text-sm overflow-auto")}
            style={style}
          >
            {tokens.map((line, i) => (
              <div key={i} {...getLineProps({ line })}>
                <span className="inline-block w-6 text-right mr-4 text-muted-foreground text-xs select-none">
                  {i + 1}
                </span>
                {line.map((token, key) => (
                  <span key={key} {...getTokenProps({ token })} />
                ))}
              </div>
            ))}
          </pre>
        )}
      </Highlight>
    </div>
  );
}
