/**
 * QuickActionsCard Component
 * 
 * Provides shortcuts to common tasks with plan-aware disabled states.
 */

'use client';

import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, BarChart3, Settings, Book, Lock } from 'lucide-react';
import { useUser } from '@/lib/hooks/use-user';
import { cn } from '@/lib/utils';

interface QuickAction {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  href: string;
  external?: boolean;
  planRequired?: 'pro' | 'enterprise';
}

export function QuickActionsCard() {
  const { user } = useUser();
  
  const canCreateAPI = user && user.currentUsage?.apiCount < user.planLimits?.maxApis;

  const actions: QuickAction[] = [
    {
      icon: Plus,
      title: 'Create New API',
      description: 'Add a new API proxy in 5 minutes',
      href: '/dashboard/apis/new',
    },
    {
      icon: BarChart3,
      title: 'View Analytics',
      description: 'Detailed metrics and insights',
      href: '/dashboard/analytics',
    },
    {
      icon: Settings,
      title: 'Manage Settings',
      description: 'Notifications, security, and preferences',
      href: '/dashboard/settings',
    },
    {
      icon: Book,
      title: 'Read Documentation',
      description: 'Integration guides and API reference',
      href: '/docs',
      external: true,
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quick Actions</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3" role="list" aria-label="Quick actions">
        {actions.map((action) => {
          const Icon = action.icon;
          const isCreateAPI = action.title === 'Create New API';
          const isDisabled = isCreateAPI && !canCreateAPI;
          const isPlanGated = action.planRequired && user?.plan !== action.planRequired && user?.plan !== 'enterprise';

          const button = (
            <Button
              key={action.title}
              variant="outline"
              className={cn(
                "w-full justify-start h-auto py-3 px-4",
                isDisabled && "opacity-50 cursor-not-allowed"
              )}
              disabled={isDisabled || isPlanGated}
              asChild={!isDisabled && !isPlanGated}
              role="listitem"
            >
              {isDisabled || isPlanGated ? (
                <div className="flex items-start gap-3 w-full">
                  <Icon className="h-5 w-5 mt-0.5 flex-shrink-0" aria-hidden="true" />
                  <div className="flex-1 text-left">
                    <div className="font-semibold mb-0.5 flex items-center gap-2">
                      {action.title}
                      {isPlanGated && (
                        <Lock className="h-3 w-3" aria-label={`${action.planRequired} plan required`} />
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {isDisabled ? `API limit reached (${user?.planLimits?.maxApis}/${user?.planLimits?.maxApis})` : action.description}
                    </div>
                    {isDisabled && (
                      <Badge variant="secondary" className="mt-2 text-xs">
                        Upgrade to add more APIs
                      </Badge>
                    )}
                  </div>
                </div>
              ) : (
                <Link
                  href={action.href}
                  className="flex items-start gap-3 w-full"
                  target={action.external ? '_blank' : undefined}
                  rel={action.external ? 'noopener noreferrer' : undefined}
                >
                  <Icon className="h-5 w-5 mt-0.5 flex-shrink-0" aria-hidden="true" />
                  <div className="flex-1 text-left">
                    <div className="font-semibold mb-0.5">
                      {action.title}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {action.description}
                    </div>
                  </div>
                </Link>
              )}
            </Button>
          );

          return button;
        })}
      </CardContent>
    </Card>
  );
}
