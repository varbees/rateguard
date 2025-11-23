"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Sparkles } from "lucide-react";
import { API_TEMPLATES, APITemplate } from "./templates";

interface TemplatesDialogProps {
  onSelectTemplate: (template: APITemplate) => void;
}

export function TemplatesDialog({ onSelectTemplate }: TemplatesDialogProps) {
  const [open, setOpen] = React.useState(false);

  const handleSelect = (template: APITemplate) => {
    onSelectTemplate(template);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Sparkles className="size-4" />
          Use Template
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Choose a Template</DialogTitle>
          <DialogDescription>
            Quick start with pre-configured settings for popular APIs
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          {API_TEMPLATES.map((template) => (
            <Card
              key={template.id}
              className="cursor-pointer hover:border-primary transition-colors"
              onClick={() => handleSelect(template)}
            >
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <span className="text-2xl">{template.icon}</span>
                  {template.name}
                </CardTitle>
                <CardDescription className="text-xs">
                  {template.description}
                </CardDescription>
                <div className="pt-2 space-y-1">
                  <div className="text-xs text-muted-foreground">
                    <span className="font-medium">Rate limit:</span>{" "}
                    {template.config.perSecond} req/s
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <span className="font-medium">Burst:</span>{" "}
                    {template.config.burst} requests
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
