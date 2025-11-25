"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface ChartData {
  [key: string]: string | number;
}

interface UsageChartProps {
  title: string;
  data: ChartData[];
  type?: "line" | "area";
  dataKeys: {
    key: string;
    name: string;
    color: string;
  }[];
  height?: number;
}

export default function UsageChart({
  title,
  data,
  type = "area",
  dataKeys,
  height = 300,
}: UsageChartProps) {
  const Chart = type === "area" ? AreaChart : LineChart;

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-card-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={height}>
          <Chart data={data}>
            {type === "area" && (
              <defs>
                {dataKeys.map((dataKey, index) => (
                  <linearGradient
                    key={dataKey.key}
                    id={`color${index}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="5%"
                      stopColor={dataKey.color}
                      stopOpacity={0.3}
                    />
                    <stop
                      offset="95%"
                      stopColor={dataKey.color}
                      stopOpacity={0}
                    />
                  </linearGradient>
                ))}
              </defs>
            )}
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis stroke="hsl(var(--muted-foreground))" />
            <YAxis stroke="hsl(var(--muted-foreground))" />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
                color: "hsl(var(--popover-foreground))",
              }}
            />
            {dataKeys.map((dataKey, index) =>
              type === "area" ? (
                <Area
                  key={dataKey.key}
                  type="monotone"
                  dataKey={dataKey.key}
                  stroke={dataKey.color}
                  fillOpacity={1}
                  fill={`url(#color${index})`}
                  name={dataKey.name}
                />
              ) : (
                <Line
                  key={dataKey.key}
                  type="monotone"
                  dataKey={dataKey.key}
                  stroke={dataKey.color}
                  strokeWidth={2}
                  name={dataKey.name}
                />
              )
            )}
          </Chart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
