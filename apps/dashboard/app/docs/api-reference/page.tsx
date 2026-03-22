import * as React from "react";
import { Metadata } from "next";
import { Book, Code2, Zap, Shield } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Callout } from "@/components/docs";
import {
  EndpointHeader,
  ParametersTable,
  CodeExampleTabs,
  RequestResponseTabs,
  ErrorScenarios,
} from "@/components/docs/endpoint-docs";
import { ENDPOINT_CATEGORIES, API_BASE_URL } from "@/lib/docs/api-specs";

export const metadata: Metadata = {
  title: "API Reference | RateGuard Documentation",
  description:
    "Complete REST API reference for RateGuard. Interactive examples in JavaScript, Python, Go, and Ruby.",
};

export default function APIReferencePage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <div className="border-b bg-linear-to-b from-muted/50 to-background">
        <div className="container max-w-6xl mx-auto px-6 py-16">
          <div className="flex items-start gap-4 mb-6">
            <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
              <Book className="size-8 text-primary" />
            </div>
            <div className="flex-1">
              <h1 className="text-4xl font-bold tracking-tight mb-3">
                API Reference
              </h1>
              <p className="text-xl text-muted-foreground leading-relaxed">
                Complete REST API reference with interactive examples. Explore
                all endpoints, request/response formats, and error handling.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
            <Card className="border-2">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Code2 className="size-4 text-primary" />
                  <CardTitle className="text-sm">4 Languages</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  Code examples in JavaScript, Python, Go, and Ruby
                </p>
              </CardContent>
            </Card>

            <Card className="border-2">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Zap className="size-4 text-primary" />
                  <CardTitle className="text-sm">12 Endpoints</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  Complete coverage of authentication, API management, and
                  analytics
                </p>
              </CardContent>
            </Card>

            <Card className="border-2">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Shield className="size-4 text-primary" />
                  <CardTitle className="text-sm">Production Ready</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  Battle-tested examples matching actual backend implementation
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container max-w-6xl mx-auto px-6 py-12">
        {/* Base URL */}
        <Callout type="default" title="API Base URL">
          All API requests should be made to:{" "}
          <code className="font-mono text-sm">{API_BASE_URL}</code>
        </Callout>

        {/* Endpoint Categories */}
        {ENDPOINT_CATEGORIES.map((category, categoryIndex) => (
          <div key={categoryIndex} className="mt-16">
            <div className="mb-8">
              <h2 className="text-3xl font-bold mb-2">{category.name}</h2>
              <p className="text-muted-foreground">{category.description}</p>
            </div>

            {/* Endpoints in Category */}
            <div className="space-y-16">
              {category.endpoints.map((endpoint, endpointIndex) => (
                <div
                  key={endpointIndex}
                  id={endpoint.id}
                  className="scroll-mt-20"
                >
                  <Card className="border-2">
                    <CardContent className="p-8 space-y-8">
                      {/* Endpoint Header */}
                      <EndpointHeader
                        method={endpoint.method}
                        path={endpoint.path}
                        title={endpoint.title}
                        description={endpoint.description}
                        authentication={endpoint.authentication}
                        authType={endpoint.authType}
                      />

                      {/* Path Parameters */}
                      {endpoint.pathParams &&
                        endpoint.pathParams.length > 0 && (
                          <ParametersTable
                            parameters={endpoint.pathParams}
                            title="Path Parameters"
                            description="Parameters in the URL path"
                          />
                        )}

                      {/* Query Parameters */}
                      {endpoint.queryParams &&
                        endpoint.queryParams.length > 0 && (
                          <ParametersTable
                            parameters={endpoint.queryParams}
                            title="Query Parameters"
                            description="URL query string parameters"
                          />
                        )}

                      {/* Request & Response */}
                      <RequestResponseTabs
                        requestBody={endpoint.requestBody}
                        responses={endpoint.responses}
                      />

                      {/* Code Examples */}
                      <div>
                        <h4 className="text-lg font-semibold mb-3">
                          Code Examples
                        </h4>
                        <CodeExampleTabs examples={endpoint.codeExamples} />
                      </div>

                      {/* Rate Limit Headers */}
                      {endpoint.rateLimitHeaders && (
                        <Callout type="default" title="Rate Limit Headers">
                          <p className="mb-2">
                            All authenticated endpoints return rate limit
                            headers:
                          </p>
                          <ul className="space-y-1 text-sm">
                            <li>
                              <code className="bg-muted px-1.5 py-0.5 rounded">
                                X-RateLimit-Limit
                              </code>{" "}
                              - Maximum requests per period
                            </li>
                            <li>
                              <code className="bg-muted px-1.5 py-0.5 rounded">
                                X-RateLimit-Remaining
                              </code>{" "}
                              - Remaining requests in current period
                            </li>
                            <li>
                              <code className="bg-muted px-1.5 py-0.5 rounded">
                                X-RateLimit-Reset
                              </code>{" "}
                              - Unix timestamp when limit resets
                            </li>
                          </ul>
                        </Callout>
                      )}

                      {/* Error Scenarios */}
                      <ErrorScenarios errors={endpoint.errorScenarios} />
                    </CardContent>
                  </Card>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Footer Section */}
        <div className="mt-20 pt-12 border-t">
          <Card className="border-2 bg-muted/30">
            <CardContent className="p-8">
              <h3 className="text-2xl font-bold mb-4">Need Help?</h3>
              <p className="text-muted-foreground mb-4">
                If you have questions about the API or need assistance,
                we&apos;re here to help:
              </p>
              <ul className="space-y-2 text-sm">
                <li>
                  <strong>Documentation:</strong> Browse our comprehensive
                  guides at{" "}
                  <a href="/docs" className="text-primary hover:underline">
                    /docs
                  </a>
                </li>
                <li>
                  <strong>Support:</strong> Email us at{" "}
                  <a
                    href="mailto:support@rateguard.io"
                    className="text-primary hover:underline"
                  >
                    support@rateguard.io
                  </a>
                </li>
                <li>
                  <strong>Status:</strong> Check API status at{" "}
                  <a
                    href="https://status.rateguard.io"
                    className="text-primary hover:underline"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    status.rateguard.io
                  </a>
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
