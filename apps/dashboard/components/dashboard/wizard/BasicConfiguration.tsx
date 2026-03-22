"use client";

import { useState } from "react";
import {
  CheckCircle2,
  XCircle,
  Zap,
  Info,
  Lock,
  Unlock,
  Clock,
  Shield,
  Server,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { CreateAPIState } from "./types";
import { cn } from "@/lib/utils";
import { APIError, apiClient, TestConnectionResponse } from "@/lib/api";
import {
  buildWizardAuthConfig,
  createIdempotencyKey,
  isValidHttpUrl,
} from "./auth-config";

interface BasicConfigurationProps {
  state: CreateAPIState;
  updateState: (updates: Partial<CreateAPIState>) => void;
  onNext: () => void;
  onBack: () => void;
}

export function BasicConfiguration({
  state,
  updateState,
  onNext,
  onBack,
}: BasicConfigurationProps) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestConnectionResponse | null>(
    null
  );
  const [testError, setTestError] = useState<string | null>(null);
  const [overrideUrl, setOverrideUrl] = useState(false);

  const authConfig = buildWizardAuthConfig(state);
  const targetUrlValid = isValidHttpUrl(state.target_url);
  const isTestable = targetUrlValid;
  const apiKeyRequired = authConfig.requiresKey;
  const hasApiKey = (state.api_key || "").trim().length > 0;

  const isValid =
    state.name.trim().length >= 3 &&
    targetUrlValid &&
    (!apiKeyRequired || hasApiKey);

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    setTestError(null);

    try {
      const result = await apiClient.testConnection({
        provider: state.provider,
        target_url: state.target_url,
        auth_type: authConfig.auth_type,
        auth_credentials: authConfig.auth_credentials,
        custom_headers: state.custom_headers,
        timeout_seconds: 10,
      }, {
        idempotencyKey: createIdempotencyKey("test-connection"),
      });

      setTestResult(result);
      if (!result.success) {
        setTestError(result.error_message || "Connection test failed");
      }
    } catch (err: unknown) {
      const apiError = err instanceof APIError ? err : null;
      const errorMessage =
        apiError?.message ||
        (err instanceof Error
          ? err.message
          : "Connection test failed. Please check your credentials.");
      const errorCode =
        apiError?.code ||
        (apiError ? `HTTP_${apiError.statusCode}` : "CLIENT_ERROR");
      setTestError(errorMessage);
      setTestResult({
        success: false,
        latency_ms: 0,
        error_message: errorMessage,
        error_code: errorCode,
        tested_at: new Date().toISOString(),
      });
    } finally {
      setTesting(false);
    }
  };

  const isUrlEditable = state.provider === "custom" || overrideUrl;

  return (
    <div className="space-y-6 max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold mb-2">Configure API Details</h2>
        <p className="text-muted-foreground">
          Set up the connection details for your{" "}
          {state.provider === "custom" ? "API" : state.provider} proxy.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">
            Project Name <span className="text-red-500">*</span>
          </Label>
          <Input
            id="name"
            placeholder="e.g. My Production OpenAI API"
            value={state.name}
            onChange={(e) => updateState({ name: e.target.value })}
            className={cn(
              state.name.length > 0 &&
                state.name.length < 3 &&
                "border-red-500 focus-visible:ring-red-500"
            )}
          />
          <p className="text-xs text-muted-foreground">
            A friendly name to identify this API proxy in your dashboard.
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="target_url">
              Target API URL <span className="text-red-500">*</span>
            </Label>
            {state.provider !== "custom" && (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="override-url"
                  checked={overrideUrl}
                  onCheckedChange={(checked) =>
                    setOverrideUrl(checked as boolean)
                  }
                />
                <Label
                  htmlFor="override-url"
                  className="text-xs font-normal cursor-pointer text-muted-foreground flex items-center gap-1"
                >
                  {overrideUrl ? (
                    <Unlock className="w-3 h-3" />
                  ) : (
                    <Lock className="w-3 h-3" />
                  )}
                  Override default URL
                </Label>
              </div>
            )}
          </div>
          <Input
            id="target_url"
            placeholder="https://api.openai.com/v1"
            value={state.target_url}
            onChange={(e) => updateState({ target_url: e.target.value })}
            readOnly={!isUrlEditable}
            className={cn(
              !isUrlEditable &&
                "bg-muted text-muted-foreground cursor-not-allowed"
            )}
          />
          {state.provider !== "custom" && !overrideUrl && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Using pre-configured endpoint for {state.provider}. If the
                provider changed their API endpoint, enable &quot;Override
                default URL&quot; above.
              </AlertDescription>
            </Alert>
          )}
          {overrideUrl && (
            <p className="text-xs text-orange-600 dark:text-orange-400">
              ⚠️ Custom URL override enabled. Make sure you enter the correct
              endpoint.
            </p>
          )}
          {!targetUrlValid && state.target_url.trim().length > 0 && (
            <p className="text-xs text-red-600 dark:text-red-400">
              Enter a valid http:// or https:// URL.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="api_key">
            {authConfig.requiresKey
              ? `Your ${state.provider === "custom" ? "API" : state.provider} API Key`
              : "Optional upstream credential"}
            {authConfig.requiresKey ? (
              <span className="text-red-500">*</span>
            ) : null}
          </Label>
          <Input
            id="api_key"
            type="password"
            placeholder={
              state.provider === "openai" ? "sk-..." : "Paste your API key here"
            }
            value={state.api_key || ""}
            onChange={(e) => updateState({ api_key: e.target.value })}
            required={apiKeyRequired}
          />
          <Alert>
            <Lock className="h-4 w-4" />
            <AlertDescription className="text-xs">
              <strong>
                {authConfig.requiresKey
                  ? "Paste the upstream token or key required by this provider."
                  : "Leave this blank for public endpoints, or add a credential if your upstream requires one."}
              </strong>
              <br />
              Your credential is encrypted at rest and never shown in plain
              text.
            </AlertDescription>
          </Alert>
          <p className="text-xs text-muted-foreground">{authConfig.summary}</p>
        </div>

        {/* Test Connection */}
        <div className="pt-2">
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={handleTestConnection}
              disabled={!isTestable || testing || (apiKeyRequired && !hasApiKey)}
              className="gap-2"
            >
              {testing ? (
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                <Zap className="w-4 h-4" />
              )}
              Test Connection
            </Button>
            {!isTestable && (
              <span className="text-xs text-muted-foreground">
                Enter a valid API URL to test the connection.
              </span>
            )}
            {apiKeyRequired && !hasApiKey && isTestable && (
              <span className="text-xs text-muted-foreground">
                Add the provider API key before testing the connection.
              </span>
            )}

            {testResult?.success && (
              <div className="flex items-center gap-2 text-green-600 text-sm font-medium animate-in fade-in">
                <CheckCircle2 className="w-4 h-4" />
                Connected successfully!
              </div>
            )}

            {testResult && !testResult.success && (
              <div className="flex items-center gap-2 text-destructive text-sm font-medium animate-in fade-in">
                <XCircle className="w-4 h-4" />
                {testError || "Connection failed"}
              </div>
            )}
          </div>

          {/* Detailed Test Results */}
          {testResult && (
            <div className="mt-4 p-4 bg-muted/50 rounded-lg border animate-in fade-in slide-in-from-bottom-2">
              <div className="flex items-center gap-2 mb-3">
                <Server className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">Connection Details</span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <Clock className="w-3 h-3 text-muted-foreground" />
                  <span className="text-muted-foreground">Latency:</span>
                  <span
                    className={cn(
                      "font-mono",
                      testResult.latency_ms < 200
                        ? "text-green-600"
                        : testResult.latency_ms < 500
                        ? "text-yellow-600"
                        : "text-red-600"
                    )}
                  >
                    {testResult.latency_ms}ms
                  </span>
                </div>
                {testResult.status_code && (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Status:</span>
                    <span
                      className={cn(
                        "font-mono",
                        testResult.status_code < 300
                          ? "text-green-600"
                          : testResult.status_code < 400
                          ? "text-yellow-600"
                          : "text-red-600"
                      )}
                    >
                      {testResult.status_code} {testResult.status_text}
                    </span>
                  </div>
                )}
                {testResult.tls_version && (
                  <div className="flex items-center gap-2">
                    <Shield className="w-3 h-3 text-muted-foreground" />
                    <span className="text-muted-foreground">TLS:</span>
                    <span className="font-mono text-green-600">
                      {testResult.tls_version}
                    </span>
                  </div>
                )}
                {testResult.server_info && (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Server:</span>
                    <span
                      className="font-mono truncate"
                      title={testResult.server_info}
                    >
                      {testResult.server_info}
                    </span>
                  </div>
                )}
              </div>
              {testResult.error_code && (
                <div className="mt-3 pt-3 border-t text-xs">
                  <span className="text-muted-foreground">Error Code: </span>
                  <code className="bg-destructive/10 text-destructive px-1.5 py-0.5 rounded">
                    {testResult.error_code}
                  </code>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-between pt-8 border-t mt-8">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onNext} disabled={!isValid}>
          Next Step
        </Button>
      </div>
    </div>
  );
}
