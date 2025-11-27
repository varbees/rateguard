import { toast as sonnerToast } from "sonner";

/**
 * Enhanced toast notifications with predefined messages
 * Built on top of Sonner for modern shadcn toast experience
 */

// Toast duration constants
const DURATION = {
  SHORT: 3000,
  MEDIUM: 5000,
  LONG: 7000,
  PERSISTENT: Infinity,
} as const;

// Toast options interface
interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastOptions {
  description?: string;
  action?: ToastAction;
  duration?: number;
  onDismiss?: () => void;
  onAutoClose?: () => void;
}

// Error details interface
export interface ErrorDetails {
  code?: string;
  message: string;
  details?: string;
  timestamp?: Date;
}

/**
 * Core toast functions with auto-dismiss and action support
 */
export const toast = {
  // Success toasts (auto-dismiss after 3s)
  success: (message: string, options?: ToastOptions) => {
    return sonnerToast.success(message, {
      description: options?.description,
      duration: options?.duration ?? DURATION.SHORT,
      action: options?.action,
      onDismiss: options?.onDismiss,
      onAutoClose: options?.onAutoClose,
    });
  },

  // Error toasts (persist until dismissed)
  error: (message: string, options?: ToastOptions) => {
    return sonnerToast.error(message, {
      description: options?.description,
      duration: options?.duration ?? DURATION.PERSISTENT,
      action: options?.action,
      onDismiss: options?.onDismiss,
    });
  },

  // Warning toasts (auto-dismiss after 5s)
  warning: (message: string, options?: ToastOptions) => {
    return sonnerToast.warning(message, {
      description: options?.description,
      duration: options?.duration ?? DURATION.MEDIUM,
      action: options?.action,
      onDismiss: options?.onDismiss,
      onAutoClose: options?.onAutoClose,
    });
  },

  // Info toasts (auto-dismiss after 5s)
  info: (message: string, options?: ToastOptions) => {
    return sonnerToast.info(message, {
      description: options?.description,
      duration: options?.duration ?? DURATION.MEDIUM,
      action: options?.action,
      onDismiss: options?.onDismiss,
      onAutoClose: options?.onAutoClose,
    });
  },

  // Loading toast (persists until dismissed or promise resolves)
  loading: (message: string, options?: Omit<ToastOptions, "action">) => {
    return sonnerToast.loading(message, {
      description: options?.description,
      duration: options?.duration ?? DURATION.PERSISTENT,
    });
  },

  // Promise toast (auto-handles loading, success, error states)
  promise: <T>(
    promise: Promise<T>,
    {
      loading,
      success,
      error,
    }: {
      loading: string;
      success: string | ((data: T) => string);
      error: string | ((error: Error) => string);
    }
  ) => {
    return sonnerToast.promise(promise, {
      loading,
      success,
      error,
    });
  },

  // Dismiss a specific toast
  dismiss: (toastId?: string | number) => {
    sonnerToast.dismiss(toastId);
  },

  // Dismiss all toasts
  dismissAll: () => {
    sonnerToast.dismiss();
  },
};

/**
 * Predefined toast messages for common scenarios
 */
export const toasts = {
  // ========================================
  // API Management Toasts
  // ========================================
  api: {
    created: (apiName: string) =>
      toast.success(`✅ API created successfully`, {
        description: `${apiName} is now protected and ready to use`,
        duration: DURATION.SHORT,
      }),

    updated: (apiName: string) =>
      toast.success(`✅ API updated successfully`, {
        description: `Changes to ${apiName} have been saved`,
        duration: DURATION.SHORT,
      }),

    deleted: (apiName: string) =>
      toast.success(`🗑️ API deleted`, {
        description: `${apiName} has been removed`,
        duration: DURATION.SHORT,
      }),

    enabled: (apiName: string) =>
      toast.success(`✅ API enabled`, {
        description: `${apiName} is now active`,
        duration: DURATION.SHORT,
      }),

    disabled: (apiName: string) =>
      toast.info(`⏸️ API disabled`, {
        description: `${apiName} is now inactive`,
        duration: DURATION.SHORT,
      }),

    createFailed: (reason?: string) =>
      toast.error(`❌ Failed to create API`, {
        description: reason || "Name already exists or invalid configuration",
      }),

    updateFailed: (reason?: string) =>
      toast.error(`❌ Failed to update API`, {
        description: reason || "An error occurred while saving changes",
      }),

    deleteFailed: (reason?: string) =>
      toast.error(`❌ Failed to delete API`, {
        description: reason || "An error occurred while deleting",
      }),

    notFound: () =>
      toast.error(`❌ API not found`, {
        description: "The requested API configuration does not exist",
      }),
  },

  // ========================================
  // Copy to Clipboard Toasts
  // ========================================
  clipboard: {
    copied: (item: string = "Content") =>
      toast.success(`📋 ${item} copied to clipboard`, {
        duration: DURATION.SHORT,
      }),

    proxyUrl: (url: string) =>
      toast.success(`📋 Proxy URL copied to clipboard`, {
        description: url,
        duration: DURATION.SHORT,
      }),

    apiKey: () =>
      toast.success(`🔑 API key copied to clipboard`, {
        description: "Keep this key secure and never share it publicly",
        duration: DURATION.MEDIUM,
      }),

    failed: () =>
      toast.error(`❌ Failed to copy to clipboard`, {
        description: "Please try again or copy manually",
      }),
  },

  // ========================================
  // Configuration Toasts
  // ========================================
  config: {
    saved: () =>
      toast.success(`🎉 Configuration saved`, {
        description: "Your settings have been updated",
        duration: DURATION.SHORT,
      }),

    imported: () =>
      toast.success(`✅ Configuration imported`, {
        description: "JSON configuration has been loaded",
        duration: DURATION.SHORT,
      }),

    exported: () =>
      toast.success(`✅ Configuration exported`, {
        description: "JSON file has been downloaded",
        duration: DURATION.SHORT,
      }),

    draftRestored: () =>
      toast.info(`📝 Draft restored`, {
        description: "Your previous work has been restored",
        duration: DURATION.MEDIUM,
      }),

    draftSaved: () =>
      toast.info(`💾 Draft saved`, {
        description: "Your changes have been auto-saved",
        duration: DURATION.SHORT,
      }),

    importFailed: () =>
      toast.error(`❌ Import failed`, {
        description: "Invalid JSON file format",
      }),

    templateApplied: (templateName: string) =>
      toast.success(`✨ Template applied`, {
        description: `${templateName} configuration has been loaded`,
        duration: DURATION.SHORT,
      }),
  },

  // ========================================
  // Rate Limit & Usage Toasts
  // ========================================
  rateLimit: {
    approaching: (percentage: number) =>
      toast.warning(`⚠️ Approaching rate limit`, {
        description: `${percentage}% of your rate limit has been used`,
        duration: DURATION.MEDIUM,
      }),

    exceeded: () =>
      toast.error(`🚫 Rate limit exceeded`, {
        description: "Upgrade to Pro for higher limits",
        action: {
          label: "Upgrade",
          onClick: () => {
            window.location.href = "/dashboard/billing";
          },
        },
      }),

    quotaExceeded: () =>
      toast.error(`⚠️ Monthly quota exceeded`, {
        description: "Upgrade your plan to continue using the API",
        action: {
          label: "View Plans",
          onClick: () => {
            window.location.href = "/dashboard/billing";
          },
        },
      }),

    slowResponse: (responseTime: number) =>
      toast.warning(`⏰ API response time is slower than usual`, {
        description: `Current response time: ${responseTime}ms`,
        duration: DURATION.MEDIUM,
      }),
  },

  // ========================================
  // Authentication Toasts
  // ========================================
  auth: {
    loginSuccess: () =>
      toast.success(`🎉 Welcome back!`, {
        description: "You have successfully logged in",
        duration: DURATION.SHORT,
      }),

    logoutSuccess: () =>
      toast.success(`👋 Logged out`, {
        description: "You have been successfully logged out",
        duration: DURATION.SHORT,
      }),

    signupSuccess: () =>
      toast.success(`🎉 Account created!`, {
        description: "Welcome to RateGuard",
        duration: DURATION.SHORT,
      }),

    invalidCredentials: () =>
      toast.error(`🔒 Invalid credentials`, {
        description: "Please check your email and password",
      }),

    invalidApiKey: () =>
      toast.error(`🔒 Invalid API key`, {
        description: "Please check your API key and try again",
      }),

    sessionExpired: () =>
      toast.error(`⏱️ Session expired`, {
        description: "Please log in again to continue",
        action: {
          label: "Login",
          onClick: () => {
            window.location.href = "/login";
          },
        },
      }),

    unauthorized: () =>
      toast.error(`🔒 Unauthorized`, {
        description: "You don't have permission to perform this action",
      }),
  },

  // ========================================
  // Data & Analytics Toasts
  // ========================================
  data: {
    updateInfo: (intervalMinutes: number = 5) =>
      toast.info(`ℹ️ Analytics data updates every ${intervalMinutes} minutes`, {
        duration: DURATION.MEDIUM,
      }),

    changesDelay: (delaySeconds: number = 10) =>
      toast.info(`ℹ️ Changes will take effect in ~${delaySeconds} seconds`, {
        duration: DURATION.MEDIUM,
      }),

    refreshing: () => toast.loading(`🔄 Refreshing data...`),

    refreshComplete: () =>
      toast.success(`✅ Data refreshed`, {
        duration: DURATION.SHORT,
      }),

    exportSuccess: (format: string = "CSV") =>
      toast.success(`📊 ${format} exported successfully`, {
        description: "Your file has been downloaded",
        duration: DURATION.SHORT,
      }),

    exportFailed: () =>
      toast.error(`❌ Export failed`, {
        description: "Unable to export data at this time",
      }),
  },

  // ========================================
  // Validation & Form Toasts
  // ========================================
  validation: {
    failed: () =>
      toast.error(`❌ Validation failed`, {
        description: "Please fix the errors before submitting",
      }),

    required: (fieldName: string) =>
      toast.error(`❌ ${fieldName} is required`, {
        description: `Please provide a value for ${fieldName}`,
      }),

    invalidFormat: (fieldName: string) =>
      toast.error(`❌ Invalid ${fieldName} format`, {
        description: `Please check the ${fieldName} and try again`,
      }),

    invalidUrl: () =>
      toast.error(`❌ Invalid URL format`, {
        description: "Please enter a valid HTTP or HTTPS URL",
      }),

    invalidEmail: () =>
      toast.error(`❌ Invalid email address`, {
        description: "Please enter a valid email address",
      }),

    passwordTooShort: (minLength: number = 8) =>
      toast.error(`❌ Password too short`, {
        description: `Password must be at least ${minLength} characters`,
      }),

    passwordMismatch: () =>
      toast.error(`❌ Passwords don't match`, {
        description: "Please make sure both passwords are identical",
      }),
  },

  // ========================================
  // Network & Connection Toasts
  // ========================================
  network: {
    offline: () =>
      toast.error(`📡 You are offline`, {
        description: "Please check your internet connection",
      }),

    online: () =>
      toast.success(`📡 Back online`, {
        description: "Your connection has been restored",
        duration: DURATION.SHORT,
      }),

    timeout: () =>
      toast.error(`⏱️ Request timeout`, {
        description: "The server is taking too long to respond",
        action: {
          label: "Retry",
          onClick: () => window.location.reload(),
        },
      }),

    serverError: (statusCode?: number) =>
      toast.error(`❌ Server error${statusCode ? ` (${statusCode})` : ""}`, {
        description: "Something went wrong on our end. Please try again",
        action: {
          label: "Retry",
          onClick: () => window.location.reload(),
        },
      }),
  },

  // ========================================
  // Generic Toasts
  // ========================================
  generic: {
    success: (message: string, description?: string) =>
      toast.success(message, { description }),

    error: (message: string, description?: string) =>
      toast.error(message, { description }),

    warning: (message: string, description?: string) =>
      toast.warning(message, { description }),

    info: (message: string, description?: string) =>
      toast.info(message, { description }),
  },
};

/**
 * Error toast with details viewer
 */
export const showErrorWithDetails = (error: ErrorDetails) => {
  const copyDetails = () => {
    const details = JSON.stringify(
      {
        code: error.code,
        message: error.message,
        details: error.details,
        timestamp: error.timestamp?.toISOString() || new Date().toISOString(),
      },
      null,
      2
    );
    navigator.clipboard.writeText(details);
    toast.success("Error details copied to clipboard");
  };

  toast.error(error.message, {
    description: error.details || error.code,
    action: error.details
      ? {
          label: "Copy Details",
          onClick: copyDetails,
        }
      : undefined,
  });
};

/**
 * Handle API errors with user-friendly messages
 */
export const handleApiError = (
  error: unknown,
  defaultMessage = "An error occurred"
) => {
  if (error instanceof Error) {
    // Check for specific error types
    if (
      error.message.includes("401") ||
      error.message.includes("Unauthorized")
    ) {
      toasts.auth.unauthorized();
    } else if (
      error.message.includes("403") ||
      error.message.includes("Forbidden")
    ) {
      toasts.auth.unauthorized();
    } else if (
      error.message.includes("404") ||
      error.message.includes("Not Found")
    ) {
      toast.error("❌ Resource not found", {
        description: "The requested resource does not exist",
      });
    } else if (
      error.message.includes("409") ||
      error.message.includes("Conflict") ||
      error.message.includes("already exists")
    ) {
      toast.error("❌ Email already registered", {
        description: "An account with this email already exists. Please sign in instead.",
        action: {
          label: "Sign In",
          onClick: () => {
            window.location.href = "/login";
          },
        },
      });
    } else if (
      error.message.includes("429") ||
      error.message.includes("Rate limit")
    ) {
      toasts.rateLimit.exceeded();
    } else if (
      error.message.includes("500") ||
      error.message.includes("502") ||
      error.message.includes("503")
    ) {
      toasts.network.serverError();
    } else if (error.message.includes("timeout")) {
      toasts.network.timeout();
    } else {
      // Generic error with message
      toast.error(defaultMessage, {
        description: error.message,
      });
    }
  } else {
    // Unknown error type
    toast.error(defaultMessage, {
      description: "Please try again later",
    });
  }
};

/**
 * Utility to copy text to clipboard with toast notification
 */
export const copyToClipboard = async (text: string, itemName?: string) => {
  try {
    await navigator.clipboard.writeText(text);
    toasts.clipboard.copied(itemName);
    return true;
  } catch {
    toasts.clipboard.failed();
    return false;
  }
};
