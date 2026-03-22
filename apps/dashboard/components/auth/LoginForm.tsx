"use client";

import { useState } from "react";
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
import { useLogin } from "@/lib/hooks/use-api";

export default function LoginForm() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [identifierError, setIdentifierError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  
  const loginMutation = useLogin();

  // Validate identifier presence
  const validateIdentifier = (identifier: string): boolean => {
    if (!identifier.trim()) {
      setIdentifierError("Email or handle is required");
      return false;
    }
    setIdentifierError("");
    return true;
  };

  // Validate password
  const validatePassword = (password: string): boolean => {
    if (!password) {
      setPasswordError("Password is required");
      return false;
    }
    setPasswordError("");
    return true;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIdentifierError("");
    setPasswordError("");

    // Validate all fields
    const isIdentifierValid = validateIdentifier(identifier);
    const isPasswordValid = validatePassword(password);

    if (!isIdentifierValid || !isPasswordValid) {
      toasts.validation.failed();
      return;
    }

    loginMutation.mutate(
      { identifier: identifier.trim(), password },
      {
        onSuccess: () => {
          toasts.auth.loginSuccess();
          // Redirect to dashboard using window.location for full page reload
          // This ensures cookies are properly set and user context is loaded
          window.location.href = "/dashboard";
        },
        onError: (err) => {
          const errorMessage = (err as Error).message || "Login failed";
          setError(errorMessage);
          handleApiError(err, "Login failed");
        },
      }
    );
  };

  return (
    <Card className="w-full max-w-md bg-card border-border">
      <CardHeader className="space-y-1">
        <div className="flex items-center justify-center mb-4">
          <div className="p-3 bg-primary rounded-lg">
            <Shield className="w-8 h-8 text-primary-foreground" />
          </div>
        </div>
        <CardTitle className="text-2xl text-center text-card-foreground">
          Sign in to RateGuard
        </CardTitle>
        <CardDescription className="text-center text-muted-foreground">
          Enter your credentials to access your dashboard
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleLogin} className="space-y-4">
          {error && (
            <Alert
              variant="destructive"
              className="bg-destructive/10 border-destructive"
            >
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="identifier" className="text-foreground">
              Email or handle
            </Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5" />
              <Input
                id="identifier"
                type="text"
                placeholder="you@example.com or your-handle"
                value={identifier}
                onChange={(e) => {
                  setIdentifier(e.target.value);
                  if (identifierError) setIdentifierError("");
                  if (error) setError("");
                }}
                onBlur={() => validateIdentifier(identifier)}
                className={`pl-10 bg-input border-input text-foreground ring-offset-background focus-visible:ring-ring ${
                  identifierError ? "border-destructive focus-visible:ring-destructive" : ""
                }`}
                required
                disabled={loginMutation.isPending}
              />
            </div>
            {identifierError && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                {identifierError}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className="text-foreground">
              Password
            </Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5" />
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (passwordError) setPasswordError("");
                  if (error) setError("");
                }}
                onBlur={() => validatePassword(password)}
                className={`pl-10 bg-input border-input text-foreground ring-offset-background focus-visible:ring-ring ${
                  passwordError ? "border-destructive focus-visible:ring-destructive" : ""
                }`}
                required
                disabled={loginMutation.isPending}
              />
            </div>
            {passwordError && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                {passwordError}
              </p>
            )}
          </div>

          <div className="flex items-center justify-between text-sm">
            <Link
              href="/forgot-password"
              className="text-primary hover:text-primary/80 underline"
            >
              Forgot password?
            </Link>
          </div>

          <Button
            type="submit"
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
            disabled={loginMutation.isPending}
          >
            {loginMutation.isPending ? (
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
        <div className="text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link
            href="/signup"
            className="text-primary hover:text-primary/80 underline font-medium"
          >
            Sign up for free
          </Link>
        </div>

        <div className="bg-primary/10 border border-primary/30 rounded-lg p-3">
          <p className="text-xs text-primary text-center">
            🎉 New users get 10,000 free requests per month!
          </p>
        </div>
      </CardFooter>
    </Card>
  );
}
