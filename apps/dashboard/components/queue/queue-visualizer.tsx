import { useMemo } from "react";
import type { QueuedRequest, APIQueue } from "@/lib/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";

interface QueueVisualizerProps {
  apiQueues: APIQueue[];
  queuedRequests: QueuedRequest[];
  onCancelRequest?: (requestId: string) => void;
}

export default function QueueVisualizer({
  apiQueues,
  queuedRequests,
  onCancelRequest,
}: QueueVisualizerProps) {
  // Group requests by API using useMemo instead of useState + useEffect
  const groupedRequests = useMemo(() => {
    return queuedRequests.reduce((acc, request) => {
      if (!acc[request.target_api]) {
        acc[request.target_api] = [];
      }
      acc[request.target_api].push(request);
      return acc;
    }, {} as { [key: string]: QueuedRequest[] });
  }, [queuedRequests]);

  // Format milliseconds to readable time
  const formatTime = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  if (queuedRequests.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="pt-6 text-center">
          <p className="text-sm text-muted-foreground">
            No requests currently in queue
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {Object.entries(groupedRequests).map(([apiName, requests]) => {
        // Find API queue stats
        const apiQueue = apiQueues.find((q) => q.api_name === apiName);
        const avgWaitTime = apiQueue?.avg_wait_time_ms || 0;

        return (
          <Card key={apiName} className="overflow-hidden">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-semibold">
                  {apiName}
                </CardTitle>
                <Badge variant="secondary">{requests.length} in queue</Badge>
              </div>
              <CardDescription>
                Avg. wait time: {formatTime(avgWaitTime)}
              </CardDescription>
            </CardHeader>
            <CardContent className="pb-1">
              {/* Queue visualization */}
              <div className="relative mb-6">
                <div className="absolute inset-0 flex items-center">
                  <Progress value={100} className="h-2 w-full bg-secondary" />
                </div>

                <AnimatePresence>
                  {requests.map((request, index) => {
                    // Calculate position percentage (spread evenly)
                    const position = 5 + index * (90 / (requests.length || 1));

                    return (
                      <motion.div
                        key={request.request_id}
                        className="absolute -mt-4"
                        style={{ left: `${position}%` }}
                        initial={{ y: 20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: -20, opacity: 0 }}
                        transition={{ duration: 0.3 }}
                      >
                        <div className="relative flex flex-col items-center">
                          <div className="absolute top-0 -mt-1 h-3 w-3 rounded-full bg-primary" />
                          <div className="mt-3 min-w-[120px] rounded-md border bg-background p-2 shadow-sm">
                            <div className="text-xs font-medium">
                              {request.method} {request.path.slice(0, 15)}
                              {request.path.length > 15 ? "..." : ""}
                            </div>
                            <div className="flex justify-between text-xs text-muted-foreground">
                              <span>{formatTime(request.queued_for_ms)}</span>
                              <span>#{index + 1}</span>
                            </div>
                            {onCancelRequest && (
                              <button
                                onClick={() =>
                                  onCancelRequest(request.request_id)
                                }
                                className="mt-1 w-full rounded-sm bg-secondary px-2 py-1 text-xs hover:bg-secondary/80"
                              >
                                Cancel
                              </button>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>

              {/* Legend */}
              <div className="mt-6 flex justify-between text-xs text-muted-foreground">
                <div>Entry point</div>
                <div>Processing</div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
