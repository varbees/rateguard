"use client";

import * as React from "react";
import { useDashboardStats } from "@/lib/hooks/use-api";
import { useInvoices, usePaymentMethod, useChangePlan, useUpdatePaymentMethod, usePaymentProviders, useManageSubscription } from "@/lib/hooks/use-billing";
import { EnvironmentNotice } from "@/components/billing/EnvironmentNotice";
import { PlanSummaryCard } from "@/components/billing/PlanSummaryCard";
import { UsageQuotaBlock } from "@/components/billing/UsageQuotaBlock";
import { InvoiceHistoryTable } from "@/components/billing/InvoiceHistoryTable";
import { BillingMethodSection } from "@/components/billing/BillingMethodSection";
import { PlanChangeDialog } from "@/components/billing/PlanChangeDialog";
import { AlertCircle, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export default function BillingPage() {
  const { data: dashboardData, isLoading: isLoadingStats, error: statsError } = useDashboardStats();
  const { data: invoices, isLoading: isLoadingInvoices } = useInvoices();
  const { data: paymentMethod, isLoading: isLoadingPayment } = usePaymentMethod();
  const { data: providersData } = usePaymentProviders();
  
  const changePlanMutation = useChangePlan();
  const manageSubscriptionMutation = useManageSubscription();

  const [isPlanDialogOpen, setIsPlanDialogOpen] = React.useState(false);

  const plan = dashboardData?.plan;
  const stats = dashboardData?.stats;
  
  // Determine preferred provider and currency
  const preferredProvider = providersData?.preferred || "stripe";
  const currency = preferredProvider === "razorpay" ? "INR" : "USD";

  if (statsError) {
    return (
      <div className="space-y-6">
        <EnvironmentNotice />
        <div>
          <h1 className="text-3xl font-bold text-foreground">Billing & Plan</h1>
          <p className="text-muted-foreground mt-1">
            Manage your subscription and billing details
          </p>
        </div>
        <Card className="bg-destructive/10 border-destructive/20">
          <CardContent className="pt-6 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-destructive shrink-0" />
            <div>
              <p className="font-medium text-destructive">
                Failed to load billing information
              </p>
              <p className="text-sm text-muted-foreground">
                Please try again later or contact support.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoadingStats) {
    return (
      <div className="space-y-6">
        <EnvironmentNotice />
        <div>
          <h1 className="text-3xl font-bold text-foreground">Billing & Plan</h1>
          <p className="text-muted-foreground mt-1">
            Manage your subscription and billing details
          </p>
        </div>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-8">
      <EnvironmentNotice />
      
      <div>
        <h1 className="text-3xl font-bold text-foreground">Billing & Plan</h1>
        <p className="text-muted-foreground mt-1">
          Manage your subscription and billing details
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Plan & Usage */}
        <div className="lg:col-span-2 space-y-8">
          {plan && stats && (
            <UsageQuotaBlock stats={stats} plan={plan} />
          )}
          
          <InvoiceHistoryTable 
            invoices={invoices} 
            isLoading={isLoadingInvoices} 
          />
        </div>

        {/* Right Column: Summary & Payment Method */}
        <div className="space-y-8">
          {plan && (
            <PlanSummaryCard 
              plan={plan} 
              onUpgrade={() => setIsPlanDialogOpen(true)}
              onManage={() => manageSubscriptionMutation.mutate(preferredProvider)}
              currency={currency}
            />
          )}

          <BillingMethodSection 
            last4={paymentMethod?.last4}
            brand={paymentMethod?.brand}
            expMonth={paymentMethod?.expMonth}
            expYear={paymentMethod?.expYear}
            onUpdate={() => manageSubscriptionMutation.mutate(preferredProvider)}
          />
        </div>
      </div>

      {plan && (
        <PlanChangeDialog 
          open={isPlanDialogOpen} 
          onOpenChange={setIsPlanDialogOpen}
          currentPlanId={plan.tier}
          onPlanChange={async (planId) => {
            await changePlanMutation.mutateAsync({ provider: preferredProvider, planId });
          }}
        />
      )}
    </div>
  );
}
