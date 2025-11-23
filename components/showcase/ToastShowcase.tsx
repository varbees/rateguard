"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast, toasts } from "@/lib/toast";

/**
 * Toast Showcase Component
 * Demonstrates all toast notification types
 *
 * Usage: Add to a page for testing/demo purposes
 */
export function ToastShowcase() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Basic Toast Types</CardTitle>
          <CardDescription>Test all toast notification types</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2">
          <Button
            onClick={() =>
              toast.success("Success!", { description: "Operation completed" })
            }
          >
            Success Toast
          </Button>
          <Button
            variant="destructive"
            onClick={() =>
              toast.error("Error!", { description: "Something went wrong" })
            }
          >
            Error Toast
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              toast.warning("Warning!", { description: "Be careful" })
            }
          >
            Warning Toast
          </Button>
          <Button
            variant="secondary"
            onClick={() => toast.info("Info!", { description: "FYI" })}
          >
            Info Toast
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              toast.loading("Loading...", { description: "Please wait" })
            }
          >
            Loading Toast
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              const promise = new Promise((resolve) =>
                setTimeout(resolve, 2000)
              );
              toast.promise(promise, {
                loading: "Processing...",
                success: "Done!",
                error: "Failed!",
              });
            }}
          >
            Promise Toast
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>API Operations</CardTitle>
          <CardDescription>
            Toast notifications for API operations
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2">
          <Button onClick={() => toasts.api.created("My API")}>
            API Created
          </Button>
          <Button onClick={() => toasts.api.updated("My API")}>
            API Updated
          </Button>
          <Button onClick={() => toasts.api.deleted("My API")}>
            API Deleted
          </Button>
          <Button onClick={() => toasts.api.enabled("My API")}>
            API Enabled
          </Button>
          <Button
            variant="destructive"
            onClick={() => toasts.api.createFailed("Name already exists")}
          >
            Create Failed
          </Button>
          <Button variant="destructive" onClick={() => toasts.api.notFound()}>
            API Not Found
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Clipboard Operations</CardTitle>
          <CardDescription>
            Toast notifications for clipboard actions
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2">
          <Button onClick={() => toasts.clipboard.copied("Proxy URL")}>
            URL Copied
          </Button>
          <Button onClick={() => toasts.clipboard.apiKey()}>
            API Key Copied
          </Button>
          <Button
            onClick={() =>
              toasts.clipboard.proxyUrl(
                "https://proxy.example.com/api/v1/my-api"
              )
            }
          >
            Proxy URL Copied
          </Button>
          <Button
            variant="destructive"
            onClick={() => toasts.clipboard.failed()}
          >
            Copy Failed
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Configuration</CardTitle>
          <CardDescription>
            Toast notifications for configuration changes
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2">
          <Button onClick={() => toasts.config.saved()}>Config Saved</Button>
          <Button onClick={() => toasts.config.imported()}>
            Config Imported
          </Button>
          <Button onClick={() => toasts.config.exported()}>
            Config Exported
          </Button>
          <Button onClick={() => toasts.config.draftRestored()}>
            Draft Restored
          </Button>
          <Button
            onClick={() => toasts.config.templateApplied("REST API Template")}
          >
            Template Applied
          </Button>
          <Button
            variant="destructive"
            onClick={() => toasts.config.importFailed()}
          >
            Import Failed
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Rate Limiting & Usage</CardTitle>
          <CardDescription>Toast notifications for rate limits</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            onClick={() => toasts.rateLimit.approaching(85)}
          >
            Approaching Limit (85%)
          </Button>
          <Button
            variant="destructive"
            onClick={() => toasts.rateLimit.exceeded()}
          >
            Rate Limit Exceeded
          </Button>
          <Button
            variant="destructive"
            onClick={() => toasts.rateLimit.quotaExceeded()}
          >
            Quota Exceeded
          </Button>
          <Button
            variant="outline"
            onClick={() => toasts.rateLimit.slowResponse(1250)}
          >
            Slow Response (1250ms)
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Authentication</CardTitle>
          <CardDescription>
            Toast notifications for auth operations
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2">
          <Button onClick={() => toasts.auth.loginSuccess()}>
            Login Success
          </Button>
          <Button onClick={() => toasts.auth.logoutSuccess()}>
            Logout Success
          </Button>
          <Button onClick={() => toasts.auth.signupSuccess()}>
            Signup Success
          </Button>
          <Button
            variant="destructive"
            onClick={() => toasts.auth.invalidCredentials()}
          >
            Invalid Credentials
          </Button>
          <Button
            variant="destructive"
            onClick={() => toasts.auth.invalidApiKey()}
          >
            Invalid API Key
          </Button>
          <Button
            variant="destructive"
            onClick={() => toasts.auth.sessionExpired()}
          >
            Session Expired
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Network & Connection</CardTitle>
          <CardDescription>
            Toast notifications for network issues
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2">
          <Button
            variant="destructive"
            onClick={() => toasts.network.offline()}
          >
            Offline
          </Button>
          <Button onClick={() => toasts.network.online()}>Back Online</Button>
          <Button
            variant="destructive"
            onClick={() => toasts.network.timeout()}
          >
            Request Timeout
          </Button>
          <Button
            variant="destructive"
            onClick={() => toasts.network.serverError(500)}
          >
            Server Error (500)
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Validation</CardTitle>
          <CardDescription>
            Toast notifications for validation errors
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2">
          <Button
            variant="destructive"
            onClick={() => toasts.validation.failed()}
          >
            Validation Failed
          </Button>
          <Button
            variant="destructive"
            onClick={() => toasts.validation.required("API Name")}
          >
            Required Field
          </Button>
          <Button
            variant="destructive"
            onClick={() => toasts.validation.invalidFormat("Email")}
          >
            Invalid Format
          </Button>
          <Button
            variant="destructive"
            onClick={() => toasts.validation.invalidUrl()}
          >
            Invalid URL
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Data & Analytics</CardTitle>
          <CardDescription>
            Toast notifications for data operations
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2">
          <Button onClick={() => toasts.data.updateInfo(5)}>Update Info</Button>
          <Button onClick={() => toasts.data.changesDelay(10)}>
            Changes Delay
          </Button>
          <Button onClick={() => toasts.data.refreshComplete()}>
            Refresh Complete
          </Button>
          <Button onClick={() => toasts.data.exportSuccess("CSV")}>
            Export Success
          </Button>
          <Button
            variant="destructive"
            onClick={() => toasts.data.exportFailed()}
          >
            Export Failed
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Toast with Actions</CardTitle>
          <CardDescription>Toasts with action buttons</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2">
          <Button
            onClick={() =>
              toast.error("Rate limit exceeded", {
                description: "Upgrade to Pro for higher limits",
                action: {
                  label: "Upgrade",
                  onClick: () => alert("Navigate to billing page"),
                },
              })
            }
          >
            Error with Action
          </Button>
          <Button
            onClick={() =>
              toast.warning("Unsaved changes", {
                description: "You have unsaved changes",
                action: {
                  label: "Save Now",
                  onClick: () => alert("Saving changes..."),
                },
              })
            }
          >
            Warning with Action
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
