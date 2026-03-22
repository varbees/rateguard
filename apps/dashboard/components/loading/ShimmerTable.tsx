"use client";

import * as React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface ShimmerTableProps {
  rows?: number;
  columns?: number;
  showHeader?: boolean;
}

/**
 * Shimmer loading table skeleton
 * Beautiful animated placeholder for table data
 */
export function ShimmerTable({
  rows = 5,
  columns = 4,
  showHeader = true,
}: ShimmerTableProps) {
  return (
    <div className="overflow-x-auto">
      <Table>
        {showHeader && (
          <TableHeader>
            <TableRow>
              {Array.from({ length: columns }).map((_, i) => (
                <TableHead key={i}>
                  <Skeleton shimmer className="h-4 w-24" />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
        )}
        <TableBody>
          {Array.from({ length: rows }).map((_, rowIndex) => (
            <TableRow key={rowIndex}>
              {Array.from({ length: columns }).map((_, colIndex) => (
                <TableCell key={colIndex}>
                  <Skeleton
                    shimmer
                    className="h-4"
                    style={{
                      width: `${60 + Math.random() * 40}%`,
                      animationDelay: `${
                        (rowIndex * columns + colIndex) * 0.05
                      }s`,
                    }}
                  />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
