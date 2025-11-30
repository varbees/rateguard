
'use client';

import { CreateAPIWizard } from '@/components/dashboard/wizard/CreateAPIWizard';
import { Button } from '@/components/ui/button';
import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';

export default function CreateAPIPage() {
  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/dashboard/apis" className="gap-2">
            <ChevronLeft className="w-4 h-4" />
            Back to APIs
          </Link>
        </Button>
      </div>
      
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Create New API Proxy</h1>
        <p className="text-muted-foreground">
          Configure a new API proxy to protect and monitor your endpoints.
        </p>
      </div>

      <CreateAPIWizard />
    </div>
  );
}
