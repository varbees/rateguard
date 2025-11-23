"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Parameter } from "@/lib/docs/api-specs";

interface ParametersTableProps {
  parameters: Parameter[];
  title: string;
  description?: string;
}

export function ParametersTable({
  parameters,
  title,
  description,
}: ParametersTableProps) {
  if (!parameters || parameters.length === 0) return null;

  return (
    <div className="space-y-3">
      <div>
        <h4 className="text-lg font-semibold">{title}</h4>
        {description && (
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        )}
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[200px]">Name</TableHead>
              <TableHead className="w-[120px]">Type</TableHead>
              <TableHead className="w-[100px]">Required</TableHead>
              <TableHead>Description</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {parameters.map((param) => (
              <TableRow key={param.name}>
                <TableCell>
                  <code className="text-sm font-mono bg-muted px-2 py-1 rounded">
                    {param.name}
                  </code>
                </TableCell>
                <TableCell>
                  <span className="text-sm text-muted-foreground">
                    {param.type}
                  </span>
                </TableCell>
                <TableCell>
                  {param.required ? (
                    <Badge variant="destructive" className="text-xs">
                      Required
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-xs">
                      Optional
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  <div className="space-y-1">
                    <p className="text-sm">{param.description}</p>
                    {param.example && (
                      <p className="text-xs text-muted-foreground">
                        Example:{" "}
                        <code className="bg-muted px-1 py-0.5 rounded">
                          {param.example}
                        </code>
                      </p>
                    )}
                    {param.default && (
                      <p className="text-xs text-muted-foreground">
                        Default:{" "}
                        <code className="bg-muted px-1 py-0.5 rounded">
                          {param.default}
                        </code>
                      </p>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
