"use client";

import { useState, useMemo } from "react";
import { Calculator, DollarSign, TrendingDown } from "lucide-react";

interface CostCalculatorProps {
  className?: string;
}

export function StreamingCostCalculator({
  className = "",
}: CostCalculatorProps) {
  const [monthlyStreams, setMonthlyStreams] = useState<number>(10000);
  const [avgResponseKB, setAvgResponseKB] = useState<number>(50);
  const [plan, setPlan] = useState<"free" | "pro" | "enterprise">("pro");

  const calculations = useMemo(() => {
    // Calculate total data transferred
    const totalBytes = monthlyStreams * avgResponseKB * 1024;
    const totalMB = totalBytes / (1024 * 1024);
    const totalGB = totalBytes / (1024 * 1024 * 1024);

    // Bandwidth pricing (example: $0.10 per GB)
    const bandwidthCostPerGB = 0.1;
    const bandwidthCost = totalGB * bandwidthCostPerGB;

    // RateGuard plan costs
    const planCosts = {
      free: 0,
      pro: 19,
      enterprise: 99,
    };
    const rateGuardCost = planCosts[plan];

    // Total cost
    const totalCost = bandwidthCost + rateGuardCost;

    // Cost per stream
    const costPerStream = monthlyStreams > 0 ? totalCost / monthlyStreams : 0;

    // Self-hosting comparison
    const selfHostingCost = 75; // Average infrastructure cost
    const savings = selfHostingCost - totalCost;
    const savingsPercent =
      selfHostingCost > 0 ? (savings / selfHostingCost) * 100 : 0;

    return {
      totalBytes,
      totalMB: totalMB.toFixed(2),
      totalGB: totalGB.toFixed(3),
      bandwidthCost: bandwidthCost.toFixed(2),
      rateGuardCost: rateGuardCost.toFixed(2),
      totalCost: totalCost.toFixed(2),
      costPerStream: costPerStream.toFixed(4),
      selfHostingCost: selfHostingCost.toFixed(2),
      savings: savings.toFixed(2),
      savingsPercent: savingsPercent.toFixed(1),
    };
  }, [monthlyStreams, avgResponseKB, plan]);

  return (
    <div
      className={`bg-white rounded-lg border border-gray-200 p-6 ${className}`}
    >
      <div className="flex items-center gap-2 mb-6">
        <Calculator className="w-5 h-5 text-blue-600" />
        <h3 className="text-lg font-semibold text-gray-900">
          Streaming Cost Calculator
        </h3>
      </div>

      {/* Input Section */}
      <div className="space-y-4 mb-6">
        {/* Monthly Streams */}
        <div>
          <label
            htmlFor="monthlyStreams"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            Monthly Streams: {monthlyStreams.toLocaleString()}
          </label>
          <input
            id="monthlyStreams"
            type="range"
            min="0"
            max="100000"
            step="1000"
            value={monthlyStreams}
            onChange={(e) => setMonthlyStreams(Number(e.target.value))}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
          />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>0</span>
            <span>100k</span>
          </div>
        </div>

        {/* Average Response Size */}
        <div>
          <label
            htmlFor="avgResponse"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            Avg Response Size: {avgResponseKB} KB
          </label>
          <input
            id="avgResponse"
            type="range"
            min="10"
            max="500"
            step="10"
            value={avgResponseKB}
            onChange={(e) => setAvgResponseKB(Number(e.target.value))}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
          />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>10 KB</span>
            <span>500 KB</span>
          </div>
        </div>

        {/* Plan Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Your Plan
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(["free", "pro", "enterprise"] as const).map((planType) => (
              <button
                key={planType}
                onClick={() => setPlan(planType)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  plan === planType
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {planType.charAt(0).toUpperCase() + planType.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Results Section */}
      <div className="border-t border-gray-200 pt-6 space-y-4">
        <h4 className="text-sm font-semibold text-gray-900 mb-3">
          Estimated Monthly Cost
        </h4>

        {/* Breakdown */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Data Transferred:</span>
            <span className="font-medium">
              {calculations.totalGB} GB ({calculations.totalMB} MB)
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Bandwidth Cost:</span>
            <span className="font-medium">${calculations.bandwidthCost}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">RateGuard ({plan}):</span>
            <span className="font-medium">${calculations.rateGuardCost}</span>
          </div>
        </div>

        {/* Total Cost */}
        <div className="flex justify-between items-center pt-3 border-t border-gray-200">
          <div className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-green-600" />
            <span className="text-base font-semibold text-gray-900">
              Total Cost:
            </span>
          </div>
          <span className="text-2xl font-bold text-green-600">
            ${calculations.totalCost}
          </span>
        </div>

        {/* Cost per Stream */}
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Cost per stream:</span>
          <span className="font-medium">${calculations.costPerStream}</span>
        </div>

        {/* Comparison */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="w-4 h-4 text-blue-600" />
            <h5 className="text-sm font-semibold text-blue-900">
              vs Self-Hosting
            </h5>
          </div>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-blue-700">Self-hosting cost:</span>
              <span className="font-medium text-blue-900">
                ${calculations.selfHostingCost}/mo
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-blue-700">Your savings:</span>
              <span className="font-medium text-blue-900">
                ${calculations.savings} ({calculations.savingsPercent}%)
              </span>
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="bg-gray-50 rounded-lg p-3 mt-4">
          <p className="text-xs text-gray-600">
            <strong>Note:</strong> Bandwidth costs are estimates based on
            industry averages ($0.10/GB). Actual costs may vary. Self-hosting
            comparison includes infrastructure, monitoring, and maintenance
            costs.
          </p>
        </div>
      </div>
    </div>
  );
}
