"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
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
  AuthenticationSection,
  PreviewPanel,
  TemplatesDialog,
  getDefaultConfig,
  APITemplate,
} from "@/components/api-form";
import { DeleteDialog } from "@/components/api-form/DeleteDialog";
import { ArrowLeft, Save, Upload, Download, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/lib/api";

export default function EditAPIPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const apiId = params.id as string;

  // Form state
  const [formData, setFormData] = React.useState(getDefaultConfig());
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);

  // Load existing API config
  React.useEffect(() => {
    async function loadAPI() {
      try {
        const api = await apiClient.getAPIConfig(apiId);

        setFormData({
          name: api.name,
          targetUrl: api.target_url,
          description: api.custom_headers?.description || "",
          perSecond: api.rate_limit_per_second,
          burst: api.burst_size,
          perHour: api.rate_limit_per_hour,
          perDay: api.rate_limit_per_day,
          perMonth: api.rate_limit_per_month || 0,
          timeoutSeconds: api.timeout_seconds,
          retryAttempts: api.retry_attempts,
          corsOrigins: api.allowed_origins?.join("\n") || "",
          enabled: api.enabled,
          authType: api.auth_type || "none",
          authCredentials: api.auth_credentials || {},
        });
      } catch {
        toast({
          title: "Failed to load API",
          description: "Could not find the API configuration.",
          variant: "destructive",
        });
        router.push("/dashboard/apis");
      } finally {
        setIsLoading(false);
      }
    }

    loadAPI();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiId]);

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

  const handleTemplateSelect = (template: APITemplate) => {
    setFormData({
      ...template.config,
      corsOrigins: "",
      enabled: formData.enabled, // Keep current enabled state
      authType: "none",
      authCredentials: {},
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

  const handleUpdate = async () => {
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
      await apiClient.updateAPIConfig(apiId, {
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
        auth_type: formData.authType,
        auth_credentials:
          Object.keys(formData.authCredentials).length > 0
            ? formData.authCredentials
            : undefined,
        custom_headers: formData.description
          ? { description: formData.description }
          : undefined,
      });

      toast({
        title: "API updated successfully!",
        description: `${formData.name} has been updated.`,
      });
      router.push("/dashboard/apis");
    } catch (error) {
      toast({
        title: "Failed to update API",
        description:
          error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);

    try {
      await apiClient.deleteAPIConfig(apiId);
      toast({
        title: "API deleted successfully",
        description: `${formData.name} has been removed.`,
      });
      router.push("/dashboard/apis");
    } catch (error) {
      toast({
        title: "Failed to delete API",
        description:
          error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Loading API configuration...</p>
        </div>
      </div>
    );
  }

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
              <BreadcrumbPage>Edit {formData.name}</BreadcrumbPage>
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
                onClick={() => router.push("/dashboard/apis")}
                className="gap-2"
              >
                <ArrowLeft className="size-4" />
                Back to APIs
              </Button>
            </div>
            <h1 className="text-3xl font-bold tracking-tight">
              Edit API Configuration
            </h1>
            <p className="text-muted-foreground mt-1">
              Update rate limiting and protection settings for {formData.name}
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
            <DeleteDialog
              apiName={formData.name}
              onConfirm={handleDelete}
              isDeleting={isDeleting}
            />
            <Button
              onClick={handleUpdate}
              disabled={isSaving}
              className="gap-2"
            >
              <Save className="size-4" />
              {isSaving ? "Updating..." : "Update API"}
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

            <AuthenticationSection
              authType={formData.authType}
              authCredentials={formData.authCredentials}
              onAuthTypeChange={(value) => {
                // Clear credentials when changing auth type
                setFormData({
                  ...formData,
                  authType: value,
                  authCredentials: {},
                });
              }}
              onAuthCredentialsChange={(value) =>
                setFormData({ ...formData, authCredentials: value })
              }
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
