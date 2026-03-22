import { Button } from "@/components/ui/button";
import { Pause, Play, Trash2, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface BulkActionsToolbarProps {
  selectedCount: number;
  onBulkDelete: () => void;
  onBulkPause: () => void;
  onBulkActivate: () => void;
  onClearSelection: () => void;
}

export function BulkActionsToolbar({
  selectedCount,
  onBulkDelete,
  onBulkPause,
  onBulkActivate,
  onClearSelection,
}: BulkActionsToolbarProps) {
  return (
    <AnimatePresence>
      {selectedCount > 0 && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="overflow-hidden"
        >
          <div className="flex items-center justify-between p-4 mb-4 bg-primary/5 rounded-lg border border-primary/20">
            <span className="text-sm font-medium">
              {selectedCount} API{selectedCount > 1 ? "s" : ""} selected
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={onBulkPause}>
                <Pause className="h-4 w-4 mr-2" />
                Pause
              </Button>
              <Button variant="outline" size="sm" onClick={onBulkActivate}>
                <Play className="h-4 w-4 mr-2" />
                Activate
              </Button>
              <Button variant="destructive" size="sm" onClick={onBulkDelete}>
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
              <Button variant="ghost" size="sm" onClick={onClearSelection}>
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
