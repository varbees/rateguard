"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  CheckCircle,
  CreditCard,
  Lock,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { ButtonLoading } from "@/components/loading";
import { toasts } from "@/lib/toast";

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedPlan: string;
  isAnnual: boolean;
}

const planDetails = {
  free: {
    name: "Free",
    price: { monthly: 0, annual: 0 },
    features: [
      "2 APIs",
      "10K requests/day",
      "Basic analytics",
      "Community support",
    ],
  },
  pro: {
    name: "Pro",
    price: { monthly: 19, annual: 15.2 },
    features: [
      "10 APIs",
      "100K requests/day",
      "Advanced analytics",
      "Email support",
      "Priority queue",
      "Custom rate limits",
    ],
  },
  business: {
    name: "Business",
    price: { monthly: 49, annual: 39.2 },
    features: [
      "50 APIs",
      "1M requests/day",
      "Custom rate limits",
      "Dedicated support",
      "99.9% uptime SLA",
      "Advanced security",
    ],
  },
};

export function UpgradeModal({
  isOpen,
  onClose,
  selectedPlan,
  isAnnual,
}: UpgradeModalProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [cardNumber, setCardNumber] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [cvv, setCvv] = useState("");
  const [nameOnCard, setNameOnCard] = useState("");

  const plan = planDetails[selectedPlan as keyof typeof planDetails];
  if (!plan) return null;

  const price = isAnnual ? plan.price.annual : plan.price.monthly;
  const totalPrice = isAnnual ? price * 12 : price;
  const savingsAmount = isAnnual
    ? (plan.price.monthly * 12 - totalPrice).toFixed(2)
    : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);

    // Simulate payment processing
    try {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      toasts.config.saved();
      onClose();
      // Reset form
      setCardNumber("");
      setExpiryDate("");
      setCvv("");
      setNameOnCard("");
    } catch {
      toasts.api.createFailed();
    } finally {
      setIsProcessing(false);
    }
  };

  // Format card number with spaces
  const formatCardNumber = (value: string) => {
    const cleaned = value.replace(/\s/g, "");
    const formatted = cleaned.match(/.{1,4}/g)?.join(" ") || cleaned;
    return formatted.substring(0, 19); // 16 digits + 3 spaces
  };

  // Format expiry date as MM/YY
  const formatExpiryDate = (value: string) => {
    const cleaned = value.replace(/\D/g, "");
    if (cleaned.length >= 2) {
      return cleaned.substring(0, 2) + "/" + cleaned.substring(2, 4);
    }
    return cleaned;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <Sparkles className="w-6 h-6 text-blue-400" />
            <DialogTitle className="text-2xl">
              Unlock {plan.name} Features
            </DialogTitle>
          </div>
          <DialogDescription className="text-slate-400">
            {selectedPlan === "free"
              ? "Start your free trial today"
              : "Upgrade your plan and start using advanced features immediately"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Plan Summary */}
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-xl font-bold text-white">
                  {plan.name} Plan
                </h3>
                <p className="text-slate-400 text-sm">
                  {isAnnual ? "Billed annually" : "Billed monthly"}
                </p>
              </div>
              <div className="text-right">
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-white">
                    ${price.toFixed(2)}
                  </span>
                  <span className="text-slate-400">/month</span>
                </div>
                {isAnnual && (
                  <Badge className="bg-green-500/10 text-green-500 border-green-500/20 mt-1">
                    Save ${savingsAmount}/year
                  </Badge>
                )}
              </div>
            </div>

            <Separator className="bg-slate-700 mb-4" />

            <div className="space-y-2">
              <p className="text-sm font-semibold text-slate-300 mb-3">
                What&apos;s included:
              </p>
              <div className="grid grid-cols-2 gap-2">
                {plan.features.map((feature) => (
                  <div key={feature} className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                    <span className="text-sm text-slate-300">{feature}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Feature Comparison */}
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
            <h4 className="font-semibold text-white mb-4 flex items-center gap-2">
              <ArrowRight className="w-5 h-5 text-blue-400" />
              Upgrade Benefits
            </h4>
            <div className="space-y-3">
              {selectedPlan === "pro" && (
                <>
                  <ComparisonRow label="APIs" from="2" to="10" />
                  <ComparisonRow label="Requests/day" from="10K" to="100K" />
                  <ComparisonRow label="Analytics" from="Basic" to="Advanced" />
                  <ComparisonRow label="Support" from="Community" to="Email" />
                </>
              )}
              {selectedPlan === "business" && (
                <>
                  <ComparisonRow label="APIs" from="2" to="50" />
                  <ComparisonRow label="Requests/day" from="10K" to="1M" />
                  <ComparisonRow
                    label="Support"
                    from="Community"
                    to="Dedicated"
                  />
                  <ComparisonRow label="SLA" from="99%" to="99.9%" />
                </>
              )}
            </div>
          </div>

          {/* Payment Form (only for paid plans) */}
          {selectedPlan !== "free" && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                <div className="flex items-center gap-2 mb-4">
                  <CreditCard className="w-5 h-5 text-blue-400" />
                  <h4 className="font-semibold text-white">
                    Payment Information
                  </h4>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="nameOnCard">Name on Card</Label>
                    <Input
                      id="nameOnCard"
                      value={nameOnCard}
                      onChange={(e) => setNameOnCard(e.target.value)}
                      placeholder="John Doe"
                      className="bg-slate-900 border-slate-700"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="cardNumber">Card Number</Label>
                    <Input
                      id="cardNumber"
                      value={cardNumber}
                      onChange={(e) =>
                        setCardNumber(formatCardNumber(e.target.value))
                      }
                      placeholder="1234 5678 9012 3456"
                      className="bg-slate-900 border-slate-700 font-mono"
                      required
                      maxLength={19}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="expiryDate">Expiry Date</Label>
                      <Input
                        id="expiryDate"
                        value={expiryDate}
                        onChange={(e) =>
                          setExpiryDate(formatExpiryDate(e.target.value))
                        }
                        placeholder="MM/YY"
                        className="bg-slate-900 border-slate-700 font-mono"
                        required
                        maxLength={5}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="cvv">CVV</Label>
                      <Input
                        id="cvv"
                        type="password"
                        value={cvv}
                        onChange={(e) =>
                          setCvv(
                            e.target.value.replace(/\D/g, "").substring(0, 4)
                          )
                        }
                        placeholder="123"
                        className="bg-slate-900 border-slate-700 font-mono"
                        required
                        maxLength={4}
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-2 text-xs text-slate-400">
                  <Lock className="w-4 h-4" />
                  <span>
                    Secured by Stripe. Your payment information is encrypted.
                  </span>
                </div>
              </div>

              {/* Total and Submit */}
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-slate-300">
                    {isAnnual ? "Annual" : "Monthly"} Total
                  </span>
                  <span className="text-2xl font-bold text-white">
                    ${totalPrice.toFixed(2)}
                  </span>
                </div>

                {isAnnual && (
                  <p className="text-sm text-slate-400 mb-4">
                    You&#39;ll be charged ${totalPrice.toFixed(2)} today for 12
                    months of service
                  </p>
                )}

                <ButtonLoading
                  type="submit"
                  loading={isProcessing}
                  loadingText="Processing..."
                  className="w-full bg-blue-500 hover:bg-blue-600"
                >
                  {selectedPlan === "free"
                    ? "Start Free Trial"
                    : `Upgrade to ${plan.name}`}
                  <ArrowRight className="w-4 h-4 ml-2" />
                </ButtonLoading>

                <p className="text-xs text-slate-500 text-center mt-4">
                  7-day free trial • Cancel anytime • 30-day money-back
                  guarantee
                </p>
              </div>
            </form>
          )}

          {/* Free plan - just needs confirmation */}
          {selectedPlan === "free" && (
            <div className="space-y-4">
              <Button
                onClick={onClose}
                className="w-full bg-blue-500 hover:bg-blue-600"
              >
                Start Free Trial
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
              <p className="text-xs text-slate-500 text-center">
                No credit card required • Instant access
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Helper component for comparison rows
function ComparisonRow({
  label,
  from,
  to,
}: {
  label: string;
  from: string;
  to: string;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-400">{label}:</span>
      <div className="flex items-center gap-2">
        <span className="text-slate-500 line-through">{from}</span>
        <ArrowRight className="w-4 h-4 text-blue-400" />
        <span className="text-green-400 font-semibold">{to}</span>
      </div>
    </div>
  );
}
