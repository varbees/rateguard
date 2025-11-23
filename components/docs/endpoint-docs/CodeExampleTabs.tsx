"use client";

import * as React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CopyButton } from "@/components/docs/CopyButton";
import { cn } from "@/lib/utils";
import { CodeExample } from "@/lib/docs/api-specs";

interface CodeExampleTabsProps {
  examples: CodeExample[];
  defaultLanguage?: string;
  className?: string;
}

const LANGUAGE_COLORS: Record<string, string> = {
  javascript: "language-javascript",
  python: "language-python",
  go: "language-go",
  ruby: "language-ruby",
  curl: "language-bash",
};

export function CodeExampleTabs({
  examples,
  defaultLanguage = "javascript",
  className,
}: CodeExampleTabsProps) {
  const [selectedTab, setSelectedTab] = React.useState(defaultLanguage);

  return (
    <div className={cn("my-6", className)}>
      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <div className="flex items-center justify-between bg-muted/50 rounded-t-lg border border-b-0 px-4 py-2">
          <TabsList className="bg-transparent h-auto p-0 gap-1">
            {examples.map((example) => (
              <TabsTrigger
                key={example.language}
                value={example.language}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                  "data-[state=active]:bg-background data-[state=active]:shadow-sm",
                  "data-[state=inactive]:text-muted-foreground hover:text-foreground"
                )}
              >
                {example.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {examples.map((example) => (
          <TabsContent
            key={example.language}
            value={example.language}
            className="mt-0 relative group"
          >
            <div className="absolute right-3 top-3 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
              <CopyButton value={example.code} />
            </div>
            <pre
              className={cn(
                "rounded-b-lg rounded-t-none border p-4 overflow-x-auto",
                "bg-muted/30 dark:bg-muted/10",
                "text-sm leading-relaxed",
                LANGUAGE_COLORS[example.language] || "language-plaintext"
              )}
            >
              <code className="text-foreground/90 font-mono">
                {example.code}
              </code>
            </pre>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
