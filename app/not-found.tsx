"use client";

import { Home, Search, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * 404 Not Found Page
 * Friendly, helpful page when users hit a non-existent route
 */
export default function NotFound() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      // Navigate to search or dashboard with query
      router.push(`/dashboard?search=${encodeURIComponent(searchQuery)}`);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex items-center justify-center">
            <div className="relative">
              <div className="text-9xl font-bold text-primary/10">404</div>
              <div className="absolute inset-0 flex items-center justify-center">
                <Search className="size-16 text-primary" />
              </div>
            </div>
          </div>
          <CardTitle className="text-2xl">Page Not Found</CardTitle>
          <CardDescription className="text-base">
            Oops! The page you&apos;re looking for doesn&apos;t exist. It might
            have been moved or deleted.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Search Box */}
          <form onSubmit={handleSearch} className="space-y-2">
            <label htmlFor="search" className="text-sm font-medium">
              Looking for something specific?
            </label>
            <div className="flex gap-2">
              <Input
                id="search"
                type="text"
                placeholder="Search for APIs, docs, or features..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1"
              />
              <Button type="submit" size="icon">
                <Search className="size-4" />
              </Button>
            </div>
          </form>

          {/* Helpful Links */}
          <div className="space-y-2 pt-2">
            <p className="text-sm font-medium">Quick Links:</p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push("/dashboard")}
                className="justify-start"
              >
                <Home className="size-4 mr-2" />
                Dashboard
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push("/dashboard/apis")}
                className="justify-start"
              >
                API List
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push("/dashboard/analytics")}
                className="justify-start"
              >
                Analytics
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push("/docs")}
                className="justify-start"
              >
                Documentation
              </Button>
            </div>
          </div>
        </CardContent>

        <CardFooter className="flex gap-2">
          <Button
            onClick={() => router.back()}
            variant="outline"
            className="gap-2 flex-1"
          >
            <ArrowLeft className="size-4" />
            Go Back
          </Button>
          <Button
            onClick={() => router.push("/dashboard")}
            className="gap-2 flex-1"
          >
            <Home className="size-4" />
            Back to Dashboard
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
