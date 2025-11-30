"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CreditCard, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface BillingMethodSectionProps {
  last4?: string;
  brand?: string;
  expMonth?: number;
  expYear?: number;
  onUpdate: () => void;
}

export function BillingMethodSection({ last4, brand, expMonth, expYear, onUpdate }: BillingMethodSectionProps) {
  const [isLoading, setIsLoading] = useState(false);
  const isTestMode = process.env.NEXT_PUBLIC_ENABLE_TEST_MODE === "true";

  const handleUpdate = async () => {
    setIsLoading(true);
    try {
      await onUpdate();
    } catch (error) {
       console.error(error);
       toast.error("Failed to update payment method");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Payment Method</CardTitle>
        <CardDescription>Manage your payment details</CardDescription>
      </CardHeader>
      <CardContent>
        {last4 ? (
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="flex items-center gap-4">
              <div className="h-10 w-16 bg-slate-100 dark:bg-slate-800 rounded flex items-center justify-center">
                <CreditCard className="h-6 w-6 text-slate-500" />
              </div>
              <div>
                <p className="font-medium capitalize">
                  {brand || "Card"} ending in {last4}
                  {isTestMode && <span className="ml-2 text-xs text-yellow-500 font-mono">(TEST)</span>}
                </p>
                <p className="text-sm text-muted-foreground">
                  Expires {expMonth}/{expYear}
                </p>
              </div>
            </div>
            <Button variant="outline" onClick={handleUpdate} disabled={isLoading}>
              Update
            </Button>
          </div>
        ) : (
          <div className="text-center py-6">
            <p className="text-muted-foreground mb-4">No payment method added</p>
            <Button onClick={handleUpdate} disabled={isLoading}>
              <Plus className="mr-2 h-4 w-4" />
              Add Payment Method
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
