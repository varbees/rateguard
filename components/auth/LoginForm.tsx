"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Mail, Lock, AlertCircle, Shield } from "lucide-react";
import { toasts, handleApiError } from "@/lib/toast";
import { apiClient } from "@/lib/api";
import { useDashboardStore } from "@/lib/store";

export default function LoginForm() {
  const router = useRouter();
  const setApiKey = useDashboardStore((state) => state.setApiKey);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email || !password) {
      const errorMsg = "Please fill in all fields";
      setError(errorMsg);
      toasts.validation.failed();
      return;
    }

    setLoading(true);

    try {
      // Use API client login method
      const data = await apiClient.login({ email, password });

      // Store API key from login response
      if (data.api_key) {
        setApiKey(data.api_key);
      }

      toasts.auth.loginSuccess();

      // Redirect to dashboard
      router.push("/dashboard");
    } catch (error) {
      setError((error as Error).message || "Login failed");
      handleApiError(error, "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md bg-slate-900 border-slate-800">
      <CardHeader className="space-y-1">
        <div className="flex items-center justify-center mb-4">
          <div className="p-3 bg-blue-500 rounded-lg">
            <Shield className="w-8 h-8 text-white" />
          </div>
        </div>
        <CardTitle className="text-2xl text-center text-white">
          Sign in to RateGuard
        </CardTitle>
        <CardDescription className="text-center text-slate-400">
          Enter your credentials to access your dashboard
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleLogin} className="space-y-4">
          {error && (
            <Alert
              variant="destructive"
              className="bg-red-500/10 border-red-500/50"
            >
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="email" className="text-slate-300">
              Email
            </Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-10 bg-slate-800 border-slate-700 text-white"
                required
                disabled={loading}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className="text-slate-300">
              Password
            </Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-10 bg-slate-800 border-slate-700 text-white"
                required
                disabled={loading}
              />
            </div>
          </div>

          <div className="flex items-center justify-between text-sm">
            <Link
              href="/reset-password"
              className="text-blue-400 hover:text-blue-300 underline"
            >
              Forgot password?
            </Link>
          </div>

          <Button
            type="submit"
            className="w-full bg-blue-500 hover:bg-blue-600 text-white"
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Signing in...
              </>
            ) : (
              "Sign In"
            )}
          </Button>
        </form>
      </CardContent>

      <CardFooter className="flex flex-col space-y-4">
        <div className="text-center text-sm text-slate-400">
          Don&apos;t have an account?{" "}
          <Link
            href="/signup"
            className="text-blue-400 hover:text-blue-300 underline font-medium"
          >
            Sign up for free
          </Link>
        </div>

        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
          <p className="text-xs text-blue-300 text-center">
            🎉 New users get 10,000 free requests per month!
          </p>
        </div>
      </CardFooter>
    </Card>
  );
}
