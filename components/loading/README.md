# Loading & Empty States Guide

Comprehensive loading and empty state components for delightful user experiences.

## 🎨 Features

### Loading States

- ✅ **Skeleton loaders** with pulse animation
- ✅ **Shimmer effects** for tables and lists
- ✅ **Chart placeholders** with animated bars
- ✅ **Form skeletons** with disabled inputs
- ✅ **Button loading states** with spinners
- ✅ **Estimated time** for long operations

### Empty States

- ✅ **Emoji illustrations** for personality
- ✅ **Clear call-to-action** buttons
- ✅ **Contextual messages** for different scenarios
- ✅ **Secondary actions** (view docs, etc.)
- ✅ **Responsive design** for all screen sizes

## 📦 Components

### Skeleton Loaders

#### Basic Skeleton

```tsx
import { Skeleton } from "@/components/ui/skeleton";

<Skeleton className="h-4 w-full" />
<Skeleton shimmer className="h-4 w-3/4" /> // With shimmer effect
```

#### Dashboard Cards

```tsx
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardHeader, CardContent } from "@/components/ui/card";

function MetricCardSkeleton() {
  return (
    <Card className="border-2">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-8 w-8 rounded-full" />
        </div>
      </CardHeader>
      <CardContent>
        <Skeleton className="h-9 w-24 mb-1" />
        <Skeleton className="h-3 w-20" />
      </CardContent>
    </Card>
  );
}
```

#### Shimmer Table

```tsx
import { ShimmerTable } from "@/components/loading";

<ShimmerTable rows={5} columns={4} showHeader={true} />;
```

#### Chart Skeleton

```tsx
import { ChartSkeleton } from "@/components/loading";

<ChartSkeleton showHeader={true} height={300} />;
```

#### Form Skeleton

```tsx
import { FormSkeleton } from "@/components/loading";

<FormSkeleton fields={5} showHeader={true} showButtons={true} />;
```

### Button Loading States

```tsx
import { ButtonLoading } from "@/components/loading";

<ButtonLoading loading={isLoading} loadingText="Saving..." onClick={handleSave}>
  Save Changes
</ButtonLoading>;
```

#### In Actions

```tsx
const [isSaving, setIsSaving] = useState(false);

const handleSave = async () => {
  setIsSaving(true);
  try {
    await api.save(data);
  } finally {
    setIsSaving(false);
  }
};

<ButtonLoading loading={isSaving} loadingText="Saving...">
  Save Configuration
</ButtonLoading>;
```

### Empty States

#### New User Dashboard

```tsx
import { NewUserDashboard } from "@/components/loading";

<NewUserDashboard onAddAPI={() => router.push("/dashboard/apis/new")} />;
```

#### No Analytics Data

```tsx
import { NoAnalyticsData } from "@/components/loading";

<NoAnalyticsData onViewDocs={() => router.push("/docs")} />;
```

#### No APIs Configured

```tsx
import { NoAPIsConfigured } from "@/components/loading";

<NoAPIsConfigured
  onAddAPI={() => router.push("/dashboard/apis/new")}
  onViewDocs={() => window.open("/docs", "_blank")}
/>;
```

#### No Requests Yet

```tsx
import { NoRequestsYet } from "@/components/loading";

<NoRequestsYet apiName="stripe-api" />;
```

#### Custom Empty State

```tsx
import { EmptyState } from "@/components/loading";
import { Plus } from "lucide-react";

<EmptyState
  emoji="🎉"
  title="No Webhooks Configured"
  description="Set up webhooks to receive real-time notifications about your API events."
  action={{
    label: "Add Webhook",
    onClick: handleAddWebhook,
    icon: Plus,
  }}
  secondaryAction={{
    label: "View Examples",
    onClick: handleViewExamples,
  }}
  compact={false}
/>;
```

## 🎯 Usage Examples

### Dashboard Page with Loading

```tsx
"use client";

import { useState, useEffect } from "react";
import { MetricCards, APIListTable } from "@/components/dashboard";
import { NewUserDashboard, NoAPIsConfigured } from "@/components/loading";

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [apis, setApis] = useState([]);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [statsData, apisData] = await Promise.all([
        api.getStats(),
        api.listAPIs(),
      ]);
      setStats(statsData);
      setApis(apisData);
    } finally {
      setLoading(false);
    }
  };

  // Show skeleton while loading
  if (loading) {
    return (
      <div className="space-y-8">
        <MetricCards data={null} loading={true} />
        <APIListTable apis={[]} loading={true} />
      </div>
    );
  }

  // Show empty state for new users
  if (!loading && apis.length === 0 && !stats?.total_requests) {
    return <NewUserDashboard onAddAPI={() => router.push("/apis/new")} />;
  }

  // Show normal dashboard
  return (
    <div className="space-y-8">
      <MetricCards data={stats} loading={false} />
      <APIListTable
        apis={apis}
        loading={false}
        onAdd={() => router.push("/apis/new")}
      />
    </div>
  );
}
```

### Table with Shimmer Loading

```tsx
import { ShimmerTable } from "@/components/loading";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";

function DataTable({ data, loading }) {
  if (loading) {
    return <ShimmerTable rows={10} columns={5} />;
  }

  if (data.length === 0) {
    return <NoDataEmptyState />;
  }

  return (
    <Table>
      <TableBody>
        {data.map((row) => (
          <TableRow key={row.id}>{/* ... */}</TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

### Form with Loading Button

```tsx
import { ButtonLoading } from "@/components/loading";
import { FormSkeleton } from "@/components/loading";

function APIConfigForm({ apiId }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState(null);

  useEffect(() => {
    loadData();
  }, [apiId]);

  const loadData = async () => {
    setLoading(true);
    const data = await api.getConfig(apiId);
    setFormData(data);
    setLoading(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.updateConfig(apiId, formData);
      toast.success("Saved successfully!");
    } catch (error) {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <FormSkeleton fields={6} />;
  }

  return (
    <form onSubmit={handleSubmit}>
      {/* Form fields */}
      <ButtonLoading type="submit" loading={saving} loadingText="Saving...">
        Save Configuration
      </ButtonLoading>
    </form>
  );
}
```

### Chart with Loading State

```tsx
import { ChartSkeleton } from "@/components/loading";
import { NoAnalyticsData } from "@/components/loading";
import { AreaChart } from "recharts";

function UsageChart({ data, loading }) {
  if (loading) {
    return <ChartSkeleton height={300} />;
  }

  if (!data || data.length === 0) {
    return <NoAnalyticsData onViewDocs={() => router.push("/docs")} />;
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data}>{/* Chart configuration */}</AreaChart>
    </ResponsiveContainer>
  );
}
```

## 🎭 Animation Details

### Pulse Animation (Default)

- Simple opacity pulse
- Good for most skeleton loaders
- Low visual noise

### Shimmer Animation

- Gradient sweep effect
- Perfect for tables and lists
- More dynamic and eye-catching

```tsx
// Use shimmer for dynamic content
<Skeleton shimmer className="h-4 w-full" />

// Use pulse for static placeholders
<Skeleton className="h-4 w-full" />
```

## 🎨 Customization

### Custom Empty State Colors

```tsx
<EmptyState
  icon={CustomIcon}
  title="Custom Message"
  description="..."
  className="bg-blue-50 dark:bg-blue-950"
/>
```

### Compact Mode

```tsx
<EmptyState
  emoji="📊"
  title="No Data"
  description="..."
  compact={true} // Smaller padding and text
/>
```

## 📱 Responsive Behavior

All components are fully responsive:

- Empty states stack buttons on mobile
- Skeletons maintain aspect ratios
- Tables adapt to smaller screens
- Forms adjust field widths

## ♿ Accessibility

- Proper ARIA labels on loading states
- Keyboard navigation for all actions
- Screen reader friendly messages
- Focus management during state transitions

## 🚀 Best Practices

1. **Always show loading states** - Never leave users wondering
2. **Use appropriate skeletons** - Match the content shape
3. **Provide clear actions** - Tell users what to do next
4. **Keep messages concise** - Short, friendly, actionable
5. **Test empty states** - They're part of the UX
6. **Add estimated times** - For operations over 3 seconds
7. **Use optimistic updates** - When possible

## 🐛 Troubleshooting

### Shimmer not animating

Make sure `globals.css` has the shimmer keyframes:

```css
@keyframes shimmer {
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
  }
}
```

### Button stays in loading state

Ensure you're setting `loading={false}` after async operations complete:

```tsx
try {
  await operation();
} finally {
  setLoading(false); // Always runs
}
```

### Empty state not showing

Check your conditional logic:

```tsx
// ❌ Wrong - might show both
{
  loading && <Skeleton />;
}
{
  !data && <EmptyState />;
}

// ✅ Correct - mutually exclusive
{
  loading ? <Skeleton /> : !data ? <EmptyState /> : <Content />;
}
```
