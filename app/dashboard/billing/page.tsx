"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, CreditCard, Clock } from "lucide-react";

const plans = [
  {
    name: "Free",
    price: "$0",
    period: "/month",
    features: [
      "Up to 3 APIs",
      "10,000 requests/month",
      "Basic rate limiting",
      "Community support",
    ],
    current: true,
  },
  {
    name: "Pro",
    price: "$29",
    period: "/month",
    features: [
      "Up to 20 APIs",
      "1,000,000 requests/month",
      "Advanced rate limiting",
      "Priority support",
      "Custom headers",
      "Analytics dashboard",
    ],
    current: false,
    popular: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    features: [
      "Unlimited APIs",
      "Unlimited requests",
      "Dedicated support",
      "SLA guarantee",
      "Custom integrations",
      "On-premise deployment",
    ],
    current: false,
  },
];

export default function BillingPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white">Billing & Plans</h1>
        <p className="text-slate-400 mt-1">
          Manage your subscription and billing information
        </p>
      </div>

      {/* Current Usage */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center justify-between">
            <span>Current Usage</span>
            <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20">
              Free Plan
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <p className="text-sm text-slate-400">Requests This Month</p>
              <p className="text-2xl font-bold text-white">0 / 10,000</p>
              <div className="w-full bg-slate-800 rounded-full h-2">
                <div
                  className="bg-blue-500 h-2 rounded-full"
                  style={{ width: "0%" }}
                />
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-slate-400">APIs Configured</p>
              <p className="text-2xl font-bold text-white">0 / 3</p>
              <div className="w-full bg-slate-800 rounded-full h-2">
                <div
                  className="bg-green-500 h-2 rounded-full"
                  style={{ width: "0%" }}
                />
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-slate-400">Next Billing Date</p>
              <p className="text-2xl font-bold text-white flex items-center gap-2">
                <Clock className="w-5 h-5" />
                --
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Plans */}
      <div>
        <h2 className="text-2xl font-bold text-white mb-4">Available Plans</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map((plan) => (
            <Card
              key={plan.name}
              className={`bg-slate-900 border-slate-800 ${
                plan.popular ? "ring-2 ring-blue-500" : ""
              }`}
            >
              {plan.popular && (
                <div className="bg-blue-500 text-white text-center py-1 text-sm font-medium rounded-t-lg">
                  Most Popular
                </div>
              )}
              <CardHeader>
                <CardTitle className="text-white">
                  <div className="flex items-center justify-between">
                    <span>{plan.name}</span>
                    {plan.current && (
                      <Badge className="bg-green-500/10 text-green-500 border-green-500/20">
                        Current
                      </Badge>
                    )}
                  </div>
                </CardTitle>
                <div className="flex items-baseline gap-1 mt-4">
                  <span className="text-4xl font-bold text-white">
                    {plan.price}
                  </span>
                  <span className="text-slate-400">{plan.period}</span>
                </div>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3 mb-6">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <Check className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                      <span className="text-slate-300">{feature}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  className={`w-full ${
                    plan.current
                      ? "bg-slate-700 hover:bg-slate-600"
                      : plan.popular
                      ? "bg-blue-500 hover:bg-blue-600"
                      : "bg-slate-800 hover:bg-slate-700"
                  }`}
                  disabled={plan.current}
                >
                  {plan.current
                    ? "Current Plan"
                    : plan.name === "Enterprise"
                    ? "Contact Sales"
                    : "Upgrade"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Payment Method */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white">Payment Method</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-4 bg-slate-800 rounded-lg">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-slate-700 rounded-lg">
                <CreditCard className="w-6 h-6 text-slate-400" />
              </div>
              <div>
                <p className="text-white font-medium">No payment method</p>
                <p className="text-sm text-slate-400">
                  Add a payment method to upgrade
                </p>
              </div>
            </div>
            <Button className="bg-blue-500 hover:bg-blue-600" disabled>
              Add Card (Coming Soon)
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Note about Stripe */}
      <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
        <p className="text-blue-400 text-sm">
          <strong>Note:</strong> Stripe integration will be added in a future
          update. All billing features are currently placeholder UI.
        </p>
      </div>
    </div>
  );
}
