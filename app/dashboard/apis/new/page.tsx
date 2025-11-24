"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  BasicInfoSection,
  RateLimitsSection,
  AdvancedSection,
  PreviewPanel,
  TemplatesDialog,
  getDefaultConfig,
  APITemplate,
} from "@/components/api-form";
import { ArrowLeft, Save, Upload, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/lib/api";

export default function NewAPIPage() {
  const router = useRouter();
  const { toast } = useToast();

  // Form state
  const [formData, setFormData] = React.useState(getDefaultConfig());
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = React.useState(false);

  // Track previous form data for auto-save
  const prevFormDataRef = React.useRef(formData);

  // Auto-save draft when form data changes (debounced)
  React.useEffect(() => {
    // Only save if there's actual content
    if (formData.name || formData.targetUrl) {
      // Debounce save to avoid excessive writes
      const saveTimeout = setTimeout(() => {
        // Compare with previous save to avoid unnecessary writes
        if (
          JSON.stringify(formData) !== JSON.stringify(prevFormDataRef.current)
        ) {
          localStorage.setItem("api_draft", JSON.stringify(formData));
          prevFormDataRef.current = { ...formData };
          console.log("Draft auto-saved");
        }
      }, 2000); // 2 second debounce

      return () => clearTimeout(saveTimeout);
    }
  }, [formData]); // Depend on formData to detect changes

  // Track if we've already shown the toast
  const draftToastShown = React.useRef(false);

  // Load draft on mount (only once)
  React.useEffect(() => {
    const draft = localStorage.getItem("api_draft");
    if (draft && !draftToastShown.current) {
      try {
        const parsed = JSON.parse(draft);
        setFormData(parsed);

        // Only show toast once
        toast({
          title: "Draft restored",
          description: "Your previous work has been restored.",
        });
        draftToastShown.current = true;
      } catch (e) {
        console.error("Failed to parse draft", e);
      }
    }
  }, []); // No dependencies - run only once on mount

  // Memoize onChange handlers to prevent infinite re-renders
  const handlePerSecondChange = React.useCallback(
    (value: number) => setFormData((prev) => ({ ...prev, perSecond: value })),
    []
  );
  const handleBurstChange = React.useCallback(
    (value: number) => setFormData((prev) => ({ ...prev, burst: value })),
    []
  );
  const handlePerHourChange = React.useCallback(
    (value: number) => setFormData((prev) => ({ ...prev, perHour: value })),
    []
  );
  const handlePerDayChange = React.useCallback(
    (value: number) => setFormData((prev) => ({ ...prev, perDay: value })),
    []
  );
  const handlePerMonthChange = React.useCallback(
    (value: number) => setFormData((prev) => ({ ...prev, perMonth: value })),
    []
  );

  // Function to clear draft from localStorage
  const clearDraft = React.useCallback(() => {
    localStorage.removeItem("api_draft");
    console.log("Draft cleared");
  }, []);

  const handleTemplateSelect = (template: APITemplate) => {
    setFormData({
      ...template.config,
      corsOrigins: "",
      enabled: true,
    });
    toast({
      title: "Template applied",
      description: `${template.name} configuration has been loaded.`,
    });
  };

  const handleExportJSON = () => {
    const json = JSON.stringify(formData, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${formData.name || "api-config"}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast({
      title: "Configuration exported",
      description: "JSON file has been downloaded.",
    });
  };

  const handleImportJSON = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const json = JSON.parse(e.target?.result as string);
            setFormData(json);
            toast({
              title: "Configuration imported",
              description: "JSON configuration has been loaded.",
            });
          } catch {
            toast({
              title: "Import failed",
              description: "Invalid JSON file.",
              variant: "destructive",
            });
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.name || formData.name.length < 3) {
      newErrors.name = "API name must be at least 3 characters";
    }

    if (!formData.targetUrl) {
      newErrors.targetUrl = "Target URL is required";
    } else {
      try {
        new URL(formData.targetUrl);
      } catch {
        newErrors.targetUrl = "Invalid URL format";
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) {
      toast({
        title: "Validation failed",
        description: "Please fix the errors before saving.",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);

    try {
      await apiClient.createAPIConfig({
        name: formData.name,
        target_url: formData.targetUrl,
        rate_limit_per_second: formData.perSecond,
        burst_size: formData.burst,
        rate_limit_per_hour: formData.perHour,
        rate_limit_per_day: formData.perDay,
        rate_limit_per_month: formData.perMonth,
        timeout_seconds: formData.timeoutSeconds,
        retry_attempts: formData.retryAttempts,
        allowed_origins: formData.corsOrigins
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        enabled: formData.enabled,
        auth_type: "none",
        custom_headers: formData.description
          ? { description: formData.description }
          : undefined,
      });

      // Clear draft after successful submission
      clearDraft();

      toast({
        title: "API created successfully!",
        description: `${formData.name} is now protected and ready to use.`,
      });
      router.push("/dashboard/apis");
    } catch (error) {
      toast({
        title: "Failed to create API",
        description:
          error instanceof Error
            ? error.message
            : "An error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-7xl mx-auto px-4 py-8">
        {/* Breadcrumb Navigation */}
        <Breadcrumb className="mb-6">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/dashboard">Dashboard</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="/dashboard/apis">APIs</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>New API</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.back()}
                className="gap-2"
              >
                <ArrowLeft className="size-4" />
                Back
              </Button>
            </div>
            <h1 className="text-3xl font-bold tracking-tight">
              Create New API
            </h1>
            <p className="text-muted-foreground mt-1">
              Configure rate limiting and protection for your API endpoint
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <TemplatesDialog onSelectTemplate={handleTemplateSelect} />
            <Button
              variant="outline"
              size="sm"
              onClick={handleImportJSON}
              className="gap-2"
            >
              <Upload className="size-4" />
              Import JSON
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportJSON}
              className="gap-2"
            >
              <Download className="size-4" />
              Export JSON
            </Button>
            <Button onClick={handleSave} disabled={isSaving} className="gap-2">
              <Save className="size-4" />
              {isSaving ? "Creating..." : "Create API"}
            </Button>
          </div>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Form Sections */}
          <div className="lg:col-span-2 space-y-6">
            <BasicInfoSection
              name={formData.name}
              targetUrl={formData.targetUrl}
              description={formData.description}
              onNameChange={(value) =>
                setFormData({ ...formData, name: value })
              }
              onTargetUrlChange={(value) =>
                setFormData({ ...formData, targetUrl: value })
              }
              onDescriptionChange={(value) =>
                setFormData({ ...formData, description: value })
              }
              errors={errors}
            />

            <RateLimitsSection
              perSecond={formData.perSecond}
              burst={formData.burst}
              perHour={formData.perHour}
              perDay={formData.perDay}
              perMonth={formData.perMonth}
              onPerSecondChange={handlePerSecondChange}
              onBurstChange={handleBurstChange}
              onPerHourChange={handlePerHourChange}
              onPerDayChange={handlePerDayChange}
              onPerMonthChange={handlePerMonthChange}
            />

            <AdvancedSection
              timeoutSeconds={formData.timeoutSeconds}
              retryAttempts={formData.retryAttempts}
              corsOrigins={formData.corsOrigins}
              enabled={formData.enabled}
              onTimeoutChange={(value) =>
                setFormData({ ...formData, timeoutSeconds: value })
              }
              onRetryChange={(value) =>
                setFormData({ ...formData, retryAttempts: value })
              }
              onCorsOriginsChange={(value) =>
                setFormData({ ...formData, corsOrigins: value })
              }
              onEnabledChange={(value) =>
                setFormData({ ...formData, enabled: value })
              }
            />
          </div>

          {/* Right Column - Preview Panel */}
          <div className="lg:col-span-1">
            <PreviewPanel
              apiName={formData.name}
              targetUrl={formData.targetUrl}
              perSecond={formData.perSecond}
              burst={formData.burst}
              perHour={formData.perHour}
              perDay={formData.perDay}
              perMonth={formData.perMonth}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
