"use client";

import * as React from "react";
import { Check, Copy, Terminal } from "lucide-react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface CodeBlockProps {
  title?: string;
  tabs?: {
    label: string;
    value: string;
    language: string;
    code: string;
  }[];
  code?: string; // Fallback for single code block
  language?: string; // Fallback for single code block
}

export function CodeBlock({
  title = "Example",
  tabs = [],
  code,
  language = "bash",
}: CodeBlockProps) {
  const [copied, setCopied] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState(
    tabs.length > 0 ? tabs[0].value : "default"
  );

  // Determine current code content based on active tab or fallback
  const currentCode =
    tabs.length > 0
      ? tabs.find((t) => t.value === activeTab)?.code || ""
      : code || "";

  const currentLanguage =
    tabs.length > 0
      ? tabs.find((t) => t.value === activeTab)?.language || "text"
      : language;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(currentCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-xl overflow-hidden border bg-[#1e1e1e] text-white shadow-2xl my-6">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#252526] border-b border-[#333]">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium text-muted-foreground">
            {title}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {tabs.length > 0 && (
            <Tabs
              value={activeTab}
              onValueChange={setActiveTab}
              className="h-8"
            >
              <TabsList className="h-8 bg-[#333] p-0.5">
                {tabs.map((tab) => (
                  <TabsTrigger
                    key={tab.value}
                    value={tab.value}
                    className="h-7 px-3 text-xs data-[state=active]:bg-[#1e1e1e] data-[state=active]:text-white text-gray-400"
                  >
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-gray-400 hover:text-white hover:bg-[#333]"
            onClick={handleCopy}
          >
            {copied ? (
              <Check className="w-4 h-4 text-green-500" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Code Content */}
      <div className="relative">
        <SyntaxHighlighter
          language={currentLanguage}
          style={vscDarkPlus}
          customStyle={{
            margin: 0,
            padding: "1.5rem",
            background: "transparent",
            fontSize: "0.9rem",
            lineHeight: "1.5",
          }}
          wrapLines={true}
          showLineNumbers={true}
          lineNumberStyle={{
            minWidth: "2.5em",
            paddingRight: "1em",
            color: "#6e7681",
            textAlign: "right",
          }}
        >
          {currentCode}
        </SyntaxHighlighter>
      </div>
    </div>
  );
}
