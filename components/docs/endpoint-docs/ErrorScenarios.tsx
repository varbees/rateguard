"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { AlertCircle, Lightbulb, ChevronDown } from "lucide-react";
import { ErrorScenario } from "@/lib/docs/api-specs";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface ErrorScenariosProps {
  errors: ErrorScenario[];
}

export function ErrorScenarios({ errors }: ErrorScenariosProps) {
  const [expandedErrors, setExpandedErrors] = React.useState<Set<number>>(
    new Set()
  );

  if (!errors || errors.length === 0) return null;

  const toggleError = (index: number) => {
    const newExpanded = new Set(expandedErrors);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedErrors(newExpanded);
  };

  return (
    <div className="space-y-3">
      <h4 className="text-lg font-semibold">Common Errors & Solutions</h4>

      <div className="space-y-2">
        {errors.map((error, index) => (
          <Card key={index} className="overflow-hidden">
            <button
              onClick={() => toggleError(index)}
              className="w-full p-4 flex items-center justify-between hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Badge variant="destructive" className="font-mono">
                  {error.status}
                </Badge>
                <span className="font-semibold">{error.error}</span>
              </div>
              <ChevronDown
                className={cn(
                  "size-4 transition-transform",
                  expandedErrors.has(index) && "rotate-180"
                )}
              />
            </button>

            <AnimatePresence>
              {expandedErrors.has(index) && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="px-4 pb-4 space-y-3 border-t">
                    {/* Description */}
                    <div className="flex items-start gap-3 pt-3">
                      <AlertCircle className="size-5 text-red-600 mt-0.5 shrink-0" />
                      <div>
                        <h6 className="text-sm font-semibold mb-1">
                          Description
                        </h6>
                        <p className="text-sm text-muted-foreground">
                          {error.description}
                        </p>
                      </div>
                    </div>

                    {/* Solution */}
                    <div className="flex items-start gap-3">
                      <Lightbulb className="size-5 text-green-600 mt-0.5 shrink-0" />
                      <div>
                        <h6 className="text-sm font-semibold mb-1">Solution</h6>
                        <p className="text-sm text-muted-foreground">
                          {error.solution}
                        </p>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </Card>
        ))}
      </div>
    </div>
  );
}
