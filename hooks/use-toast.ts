/**
 * Legacy toast hook - migrated to use new toast system
 *
 * @deprecated Use `import { toast, toasts } from "@/lib/toast"` instead
 * This hook is kept for backward compatibility with existing code
 */

import { toast as sonnerToast } from "sonner";

interface ToastProps {
  title: string;
  description?: string;
  variant?: "default" | "destructive";
}

export function useToast() {
  const toast = ({ title, description, variant }: ToastProps) => {
    if (variant === "destructive") {
      sonnerToast.error(title, {
        description,
      });
    } else {
      sonnerToast.success(title, {
        description,
      });
    }
  };

  return { toast };
}
