'use client';

import { useState } from 'react';
import { Trash2, AlertTriangle, Download, Power } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useUser } from '@/lib/hooks/use-user';
import { APIConfig } from '@/lib/api';

interface DangerZoneProps {
  api: APIConfig;
  onDisable?: () => Promise<void>;
  onDelete?: () => Promise<void>;
  onExport?: () => Promise<void>;
}

export function DangerZone({ api, onDisable, onDelete, onExport }: DangerZoneProps) {
  const { hasAccess } = useUser();
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDisabling, setIsDisabling] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const handleDisable = async () => {
    if (!onDisable) return;
    
    setIsDisabling(true);
    try {
      await onDisable();
    } finally {
      setIsDisabling(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete || deleteConfirmation !== api.name) return;
    
    setIsDeleting(true);
    try {
      await onDelete();
    } finally {
      setIsDeleting(false);
    }
  };

  const handleExport = async () => {
    if (!onExport) return;
    
    setIsExporting(true);
    try {
      await onExport();
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Card className="border-destructive/50">
      <CardHeader>
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          <div>
            <CardTitle className="text-destructive">Danger Zone</CardTitle>
            <CardDescription>
              Irreversible and destructive actions
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Export Data (Pro+) */}
        {hasAccess('pro') && (
          <div className="flex items-center justify-between p-4 border border-blue-200 dark:border-blue-900/50 rounded-lg bg-blue-50/50 dark:bg-blue-900/10">
            <div className="flex-1">
              <h4 className="text-sm font-medium mb-1">Export API Data</h4>
              <p className="text-xs text-muted-foreground">
                Download all analytics, logs, and configuration as JSON
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              disabled={isExporting}
              className="gap-2"
            >
              {isExporting ? (
                <>Exporting...</>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  Export
                </>
              )}
            </Button>
          </div>
        )}

        {/* Disable API */}
        <div className="flex items-center justify-between p-4 border border-orange-200 dark:border-orange-900/50 rounded-lg bg-orange-50/50 dark:bg-orange-900/10">
          <div className="flex-1">
            <h4 className="text-sm font-medium mb-1">Disable API</h4>
            <p className="text-xs text-muted-foreground">
              Temporarily stop all requests to this API
            </p>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                disabled={!api.enabled || isDisabling}
                className="gap-2"
              >
                <Power className="h-4 w-4" />
                {api.enabled ? 'Disable' : 'Already Disabled'}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Disable API?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will immediately stop accepting requests for "{api.name}". 
                  You can re-enable it at any time from Quick Settings.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDisable}>
                  Disable API
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        {/* Delete API */}
        <div className="flex items-center justify-between p-4 border border-destructive rounded-lg bg-destructive/5">
          <div className="flex-1">
            <h4 className="text-sm font-medium mb-1 text-destructive">Delete API</h4>
            <p className="text-xs text-muted-foreground">
              Permanently delete this API and all associated data
            </p>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="destructive"
                size="sm"
                disabled={isDeleting}
                className="gap-2"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription className="space-y-3">
                  <p>
                    This action <strong>cannot be undone</strong>. This will permanently delete:
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-sm">
                    <li>All request history and analytics</li>
                    <li>Rate limit configurations</li>
                    <li>Proxy URL and access keys</li>
                    <li>CORS settings and custom headers</li>
                  </ul>
                  <p className="pt-2">
                    Please type <strong>{api.name}</strong> to confirm.
                  </p>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="py-4">
                <Input
                  placeholder={`Type "${api.name}" to confirm`}
                  value={deleteConfirmation}
                  onChange={(e) => setDeleteConfirmation(e.target.value)}
                  className="border-destructive focus-visible:ring-destructive"
                />
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setDeleteConfirmation('')}>
                  Cancel
                </AlertDialogCancel>
                <Button
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={deleteConfirmation !== api.name || isDeleting}
                >
                  {isDeleting ? 'Deleting...' : 'Delete API'}
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}
