"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Trash2, AlertTriangle } from "lucide-react";

interface DeleteDialogProps {
  apiName: string;
  onConfirm: () => void;
  isDeleting: boolean;
}

export function DeleteDialog({
  apiName,
  onConfirm,
  isDeleting,
}: DeleteDialogProps) {
  const [open, setOpen] = React.useState(false);

  const handleConfirm = () => {
    onConfirm();
    // Dialog will close automatically when component unmounts after delete
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive" size="sm" className="gap-2">
          <Trash2 className="size-4" />
          Delete API
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-destructive/20">
              <AlertTriangle className="size-5 text-destructive" />
            </div>
            <DialogTitle className="text-xl">
              Delete API Configuration?
            </DialogTitle>
          </div>
          <DialogDescription className="space-y-4 pt-2">
            <p className="text-base text-foreground">
              This will permanently delete <strong>{apiName}</strong> and remove
              all associated rate limiting protection.
            </p>

            <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-lg">
              <p className="text-destructive font-semibold text-sm mb-2">
                ⚠️ This action cannot be undone!
              </p>
            </div>

            <div className="space-y-2 text-sm">
              <p className="font-semibold text-foreground">
                What happens when you delete:
              </p>
              <ul className="space-y-1.5 pl-1">
                <li className="flex items-start gap-2">
                  <span className="text-destructive mt-0.5">•</span>
                  <span className="text-foreground">
                    Your proxy URL will{" "}
                    <strong>stop working immediately</strong>
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-muted-foreground mt-0.5">•</span>
                  <span className="text-muted-foreground">
                    All historical metrics will be preserved in the database
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-muted-foreground mt-0.5">•</span>
                  <span className="text-muted-foreground">
                    You can create a new API with the same name later
                  </span>
                </li>
              </ul>
            </div>

            <div className="p-3 bg-muted rounded-lg text-sm">
              <p className="font-medium mb-1 text-foreground">
                Alternative options:
              </p>
              <p className="text-muted-foreground text-xs">
                Instead of deleting, you can <strong>disable</strong> the API in
                Advanced Settings to temporarily pause it without losing the
                configuration.
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-4 gap-2">
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={isDeleting}
            className="gap-2"
          >
            {isDeleting ? (
              <>
                <span className="inline-block animate-spin">⏳</span>
                Deleting...
              </>
            ) : (
              <>
                <Trash2 className="size-4" />
                Yes, delete permanently
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
