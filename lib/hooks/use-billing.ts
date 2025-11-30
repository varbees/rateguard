import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { billingAPI, apiClient } from "@/lib/api";
import { toast } from "sonner";

export const billingQueryKeys = {
  plan: ["billing", "plan"],
  invoices: ["billing", "invoices"],
  paymentMethod: ["billing", "paymentMethod"],
  providers: ["billing", "providers"],
};

export function useBillingPlan() {
  return useQuery({
    queryKey: billingQueryKeys.plan,
    queryFn: async () => {
      // Use dashboard stats to get plan info
      const data = await apiClient.getDashboardStats();
      return { plan: data.plan };
    },
  });
}

export interface Invoice {
  id: string;
  date: string;
  amount: number;
  status: "paid" | "pending" | "failed";
  pdfUrl?: string;
}

export function useInvoices() {
  return useQuery({
    queryKey: billingQueryKeys.invoices,
    queryFn: async (): Promise<Invoice[]> => {
      // TODO: Implement getInvoices in backend if not already present
      // For now, return empty or mock if backend endpoint is missing
      return [];
    },
  });
}

export interface PaymentMethod {
  last4: string;
  brand: string;
  expMonth: number;
  expYear: number;
}

export function usePaymentMethod() {
  return useQuery({
    queryKey: billingQueryKeys.paymentMethod,
    queryFn: async (): Promise<PaymentMethod | null> => {
      // TODO: Implement getPaymentMethod in backend
      return null; 
    },
  });
}

export function usePaymentProviders() {
  return useQuery({
    queryKey: billingQueryKeys.providers,
    queryFn: () => billingAPI.getProviders(),
  });
}

export function useChangePlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ provider, planId }: { provider: string; planId: string }) => {
      const response = await billingAPI.checkout(provider, planId);
      if (response.checkout_url) {
        window.location.href = response.checkout_url;
      }
      return response;
    },
    onError: (error) => {
      console.error(error);
      toast.error("Failed to initiate plan change");
    },
  });
}

export function useManageSubscription() {
  return useMutation({
    mutationFn: async (provider: string) => {
      const response = await billingAPI.portal(provider);
      if (response.portal_url) {
        window.location.href = response.portal_url;
      }
      return response;
    },
    onError: (error) => {
      console.error(error);
      toast.error("Failed to open billing portal");
    },
  });
}

export function useUpdatePaymentMethod() {
  // This is typically handled via the portal
  const manageSubscription = useManageSubscription();
  return {
    mutate: (provider: string = "stripe") => manageSubscription.mutate(provider),
    isLoading: manageSubscription.isPending
  };
}
