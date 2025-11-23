"use client";

import * as React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CopyButton } from "@/components/docs/CopyButton";
import { CheckCircle2, AlertCircle, XCircle } from "lucide-react";
import { Response, RequestBody } from "@/lib/docs/api-specs";
import { cn } from "@/lib/utils";

interface RequestResponseTabsProps {
  requestBody?: RequestBody;
  responses: Response[];
}

export function RequestResponseTabs({
  requestBody,
  responses,
}: RequestResponseTabsProps) {
  const [selectedTab, setSelectedTab] = React.useState("request");

  return (
    <div className="space-y-4">
      <h4 className="text-lg font-semibold">Request & Response</h4>

      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="request">Request</TabsTrigger>
          <TabsTrigger value="response">Responses</TabsTrigger>
        </TabsList>

        {/* Request Tab */}
        <TabsContent value="request" className="space-y-4">
          {requestBody ? (
            <>
              <div>
                <h5 className="text-sm font-semibold mb-2">Content-Type</h5>
                <code className="text-sm bg-muted px-3 py-1.5 rounded border">
                  {requestBody.contentType}
                </code>
              </div>

              <div>
                <h5 className="text-sm font-semibold mb-2">
                  Request Body Schema
                </h5>
                <Card className="p-4 bg-muted/30">
                  <pre className="text-sm overflow-x-auto">
                    <code>{JSON.stringify(requestBody.schema, null, 2)}</code>
                  </pre>
                </Card>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <h5 className="text-sm font-semibold">Example Request</h5>
                  <CopyButton
                    value={JSON.stringify(requestBody.example, null, 2)}
                  />
                </div>
                <Card className="p-4 bg-muted/30">
                  <pre className="text-sm overflow-x-auto">
                    <code className="language-json">
                      {JSON.stringify(requestBody.example, null, 2)}
                    </code>
                  </pre>
                </Card>
              </div>
            </>
          ) : (
            <p className="text-muted-foreground text-sm">
              No request body required
            </p>
          )}
        </TabsContent>

        {/* Response Tab */}
        <TabsContent value="response" className="space-y-4">
          {responses.map((response, index) => (
            <Card
              key={index}
              className={cn(
                "p-4 border-2",
                response.status >= 200 && response.status < 300
                  ? "border-green-200 dark:border-green-900/50"
                  : response.status >= 400 && response.status < 500
                  ? "border-amber-200 dark:border-amber-900/50"
                  : "border-red-200 dark:border-red-900/50"
              )}
            >
              <div className="space-y-3">
                {/* Status Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {response.status >= 200 && response.status < 300 ? (
                      <CheckCircle2 className="size-5 text-green-600" />
                    ) : response.status >= 400 && response.status < 500 ? (
                      <AlertCircle className="size-5 text-amber-600" />
                    ) : (
                      <XCircle className="size-5 text-red-600" />
                    )}
                    <Badge
                      variant={
                        response.status >= 200 && response.status < 300
                          ? "default"
                          : response.status >= 400 && response.status < 500
                          ? "secondary"
                          : "destructive"
                      }
                      className="font-mono"
                    >
                      {response.status}
                    </Badge>
                    <span className="font-semibold">
                      {response.description}
                    </span>
                  </div>
                  <CopyButton
                    value={JSON.stringify(response.example, null, 2)}
                  />
                </div>

                {/* Response Headers */}
                {response.headers &&
                  Object.keys(response.headers).length > 0 && (
                    <div>
                      <h6 className="text-xs font-semibold text-muted-foreground uppercase mb-2">
                        Headers
                      </h6>
                      <div className="space-y-1">
                        {Object.entries(response.headers).map(
                          ([key, value]) => (
                            <div
                              key={key}
                              className="flex items-center gap-2 text-sm font-mono bg-muted/30 px-2 py-1 rounded"
                            >
                              <span className="text-muted-foreground">
                                {key}:
                              </span>
                              <span>{value}</span>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  )}

                {/* Response Body */}
                <div>
                  <h6 className="text-xs font-semibold text-muted-foreground uppercase mb-2">
                    Response Body
                  </h6>
                  <div className="rounded-lg bg-muted/30 p-3">
                    <pre className="text-sm overflow-x-auto">
                      <code className="language-json">
                        {JSON.stringify(response.example, null, 2)}
                      </code>
                    </pre>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
