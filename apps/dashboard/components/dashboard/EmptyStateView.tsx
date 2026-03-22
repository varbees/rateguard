/**
 * EmptyStateView Component
 * 
 * Onboarding experience shown when user has no APIs configured.
 */

'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Zap, Plus, Book, CheckCircle2, Circle } from 'lucide-react';
import { useUser } from '@/lib/hooks/use-user';

interface OnboardingStep {
  label: string;
  done: boolean;
}

export function EmptyStateView() {
  const { user } = useUser();

  // Mock onboarding progress - in real app, fetch from API
  const steps: OnboardingStep[] = [
    { label: 'Create account', done: true },
    { label: 'Create first API', done: false },
    { label: 'Make first request', done: false },
    { label: 'Set up webhooks', done: false },
  ];

  return (
    <div 
      className="container max-w-2xl mx-auto px-4 py-16"
      role="region"
      aria-labelledby="empty-state-heading"
    >
      <div className="text-center space-y-6">
        {/* Icon */}
        <div 
          className="w-20 h-20 mx-auto bg-primary/10 rounded-2xl flex items-center justify-center"
          aria-hidden="true"
        >
          <Zap className="w-10 h-10 text-primary" />
        </div>

        {/* Heading */}
        <div>
          <h1 id="empty-state-heading" className="text-3xl font-bold mb-3">
            Welcome to RateGuard!
          </h1>
          <p className="text-lg text-muted-foreground">
            Get started by creating your first API proxy.
            <br />
            It takes less than 5 minutes.
          </p>
        </div>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button size="lg" asChild autoFocus>
            <Link href="/dashboard/apis/new">
              <Plus className="mr-2 h-5 w-5" />
              Create Your First API
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/docs/quickstart" target="_blank" rel="noopener noreferrer">
              <Book className="mr-2 h-5 w-5" />
              View Quickstart Guide
            </Link>
          </Button>
        </div>

        {/* Onboarding Checklist */}
        <div 
          className="mt-8 border rounded-lg p-6 text-left max-w-md mx-auto"
          role="list"
          aria-label="Getting started checklist"
        >
          <h2 className="font-semibold mb-4 text-base">Getting Started</h2>
          <ul className="space-y-3">
            {steps.map((step, index) => (
              <li
                key={index}
                className="flex items-center gap-3"
                role="listitem"
                aria-label={`${step.label} - ${step.done ? 'completed' : 'not completed'}`}
              >
                {step.done ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0" aria-hidden="true" />
                ) : (
                  <Circle className="h-5 w-5 text-muted-foreground flex-shrink-0" aria-hidden="true" />
                )}
                <span className={step.done ? 'line-through text-muted-foreground' : ''}>
                  {step.label}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Additional help text */}
        <p className="text-sm text-muted-foreground mt-6">
          Need help? Check out our{' '}
          <a
            href="/docs"
            className="text-primary hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            documentation
          </a>
          {' '}or{' '}
          <a
            href="mailto:support@rateguard.io"
            className="text-primary hover:underline"
          >
            contact support
          </a>
          .
        </p>
      </div>
    </div>
  );
}
