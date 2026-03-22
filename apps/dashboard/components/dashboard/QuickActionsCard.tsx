/**
 * QuickActionsCard Component
 *
 * Provides shortcuts to common tasks.
 */

'use client';

import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, BarChart3, Settings, Book } from 'lucide-react';

interface QuickAction {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  href: string;
  external?: boolean;
}

export function QuickActionsCard() {
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
      href: '/dashboard/account',
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
          return (
            <Button
              key={action.title}
              variant="outline"
              className="w-full justify-start h-auto py-3 px-4"
              asChild
              role="listitem"
            >
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
            </Button>
          );
        })}
      </CardContent>
    </Card>
  );
}
