"use client";

import * as React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Shield, Key, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

type AuthType = "none" | "bearer" | "api_key" | "basic";

interface AuthenticationSectionProps {
  authType: AuthType;
  authCredentials: Record<string, string>;
  onAuthTypeChange: (value: AuthType) => void;
  onAuthCredentialsChange: (credentials: Record<string, string>) => void;
}

export function AuthenticationSection({
  authType,
  authCredentials,
  onAuthTypeChange,
  onAuthCredentialsChange,
}: AuthenticationSectionProps) {
  // Helper to update a specific credential field
  const updateCredential = (key: string, value: string) => {
    onAuthCredentialsChange({ ...authCredentials, [key]: value });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="size-5 text-primary" />
          Authentication
        </CardTitle>
        <CardDescription>
          Configure how to authenticate with the target API. Credentials are
          encrypted at rest.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Auth Type Selection */}
        <div className="space-y-2">
          <Label htmlFor="auth-type">Authentication Type</Label>
          <Select
            value={authType}
            onValueChange={(value) => onAuthTypeChange(value as AuthType)}
          >
            <SelectTrigger id="auth-type">
              <SelectValue placeholder="Select authentication type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None (No Authentication)</SelectItem>
              <SelectItem value="bearer">Bearer Token</SelectItem>
              <SelectItem value="api_key">API Key Header</SelectItem>
              <SelectItem value="basic">
                Basic Auth (Username/Password)
              </SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            How should RateGuard authenticate when proxying requests to your
            API?
          </p>
        </div>

        {/* Security Notice */}
        {authType !== "none" && (
          <Alert>
            <Key className="size-4" />
            <AlertDescription className="text-xs">
              <strong>Secure Storage:</strong> All credentials are encrypted
              using AES-256-GCM before being stored in the database.
            </AlertDescription>
          </Alert>
        )}

        {/* Bearer Token Fields */}
        {authType === "bearer" && (
          <div className="space-y-2">
            <Label htmlFor="bearer-token">
              Bearer Token <span className="text-destructive">*</span>
            </Label>
            <Input
              id="bearer-token"
              type="password"
              placeholder="your-bearer-token-here"
              value={authCredentials.token || ""}
              onChange={(e) => updateCredential("token", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Will be sent as:{" "}
              <code className="bg-muted px-1 py-0.5 rounded">
                Authorization: Bearer [token]
              </code>
            </p>
          </div>
        )}

        {/* API Key Fields */}
        {authType === "api_key" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="api-key-name">Header Name</Label>
              <Input
                id="api-key-name"
                placeholder="X-API-Key"
                value={authCredentials.header_name || "X-API-Key"}
                onChange={(e) =>
                  updateCredential("header_name", e.target.value)
                }
              />
              <p className="text-xs text-muted-foreground">
                The HTTP header name for your API key (default: X-API-Key)
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="api-key-value">
                API Key <span className="text-destructive">*</span>
              </Label>
              <Input
                id="api-key-value"
                type="password"
                placeholder="your-api-key-here"
                value={authCredentials.key || ""}
                onChange={(e) => updateCredential("key", e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Will be sent as:{" "}
                <code className="bg-muted px-1 py-0.5 rounded">
                  {authCredentials.header_name || "X-API-Key"}: [key]
                </code>
              </p>
            </div>
          </div>
        )}

        {/* Basic Auth Fields */}
        {authType === "basic" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="basic-username">
                Username <span className="text-destructive">*</span>
              </Label>
              <Input
                id="basic-username"
                type="text"
                placeholder="username"
                value={authCredentials.username || ""}
                onChange={(e) => updateCredential("username", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="basic-password">
                Password <span className="text-destructive">*</span>
              </Label>
              <Input
                id="basic-password"
                type="password"
                placeholder="password"
                value={authCredentials.password || ""}
                onChange={(e) => updateCredential("password", e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Will be sent as:{" "}
                <code className="bg-muted px-1 py-0.5 rounded">
                  Authorization: Basic [base64(username:password)]
                </code>
              </p>
            </div>
          </div>
        )}

        {/* No Auth Info */}
        {authType === "none" && (
          <Alert>
            <AlertCircle className="size-4" />
            <AlertDescription className="text-xs">
              Requests will be proxied without any authentication headers. The
              target API must not require authentication.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
