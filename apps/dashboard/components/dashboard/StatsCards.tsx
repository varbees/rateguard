"use client";

import { Card, CardContent } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";

interface StatCard {
  title: string;
  value: string | number;
  icon: LucideIcon;
  color: string;
  bgColor: string;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
}

interface StatsCardsProps {
  stats: StatCard[];
  loading?: boolean;
}

export default function StatsCards({
  stats,
  loading = false,
}: StatsCardsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <Card
            key={stat.title}
            className="bg-card border-border hover:border-primary/50 transition-colors"
          >
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    {stat.title}
                  </p>
                  <p className="text-2xl font-bold text-foreground mt-2">
                    {loading ? "..." : stat.value}
                  </p>
                  {stat.change && (
                    <p
                      className={`text-xs mt-1 ${
                        stat.changeType === "positive"
                          ? "text-green-500"
                          : stat.changeType === "negative"
                          ? "text-red-500"
                          : "text-muted-foreground"
                      }`}
                    >
                      {stat.change}
                    </p>
                  )}
                </div>
                <div className={`p-3 rounded-lg ${stat.bgColor}`}>
                  <Icon className={`w-6 h-6 ${stat.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
