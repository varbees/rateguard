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
import {
  Loader2,
  Mail,
  Lock,
  AlertCircle,
  CheckCircle2,
  Shield,
} from "lucide-react";
import { toasts, handleApiError } from "@/lib/toast";
import { useSignup } from "@/lib/hooks/use-api";

// Email validation regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Password strength checker
const getPasswordStrength = (password: string): { strength: number; label: string; color: string } => {
  if (!password) return { strength: 0, label: "", color: "" };
  
  let strength = 0;
  if (password.length >= 8) strength++;
  if (password.length >= 12) strength++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++;
  if (/\d/.test(password)) strength++;
  if (/[^a-zA-Z0-9]/.test(password)) strength++;

  if (strength <= 2) return { strength, label: "Weak", color: "text-destructive" };
  if (strength <= 3) return { strength, label: "Fair", color: "text-yellow-600" };
  if (strength <= 4) return { strength, label: "Good", color: "text-blue-600" };
  return { strength, label: "Strong", color: "text-green-600" };
};

export default function SignUpForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [confirmPasswordError, setConfirmPasswordError] = useState("");
  
  const signupMutation = useSignup();

  // Validate email format
  const validateEmail = (email: string): boolean => {
    if (!email) {
      setEmailError("Email is required");
      return false;
    }
    if (!EMAIL_REGEX.test(email)) {
      setEmailError("Please enter a valid email address");
      return false;
    }
    setEmailError("");
    return true;
  };

  // Validate password
  const validatePassword = (password: string): boolean => {
    if (!password) {
      setPasswordError("Password is required");
      return false;
    }
    if (password.length < 8) {
      setPasswordError("Password must be at least 8 characters");
      return false;
    }
    setPasswordError("");
    return true;
  };

  // Validate confirm password
  const validateConfirmPassword = (confirmPwd: string): boolean => {
    if (!confirmPwd) {
      setConfirmPasswordError("Please confirm your password");
      return false;
    }
    if (confirmPwd !== password) {
      setConfirmPasswordError("Passwords do not match");
      return false;
    }
    setConfirmPasswordError("");
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setEmailError("");
    setPasswordError("");
    setConfirmPasswordError("");

    // Validate all fields
    const isEmailValid = validateEmail(email);
    const isPasswordValid = validatePassword(password);
    const isConfirmPasswordValid = validateConfirmPassword(confirmPassword);

    if (!isEmailValid || !isPasswordValid || !isConfirmPasswordValid) {
      toasts.validation.failed();
      return;
    }

    signupMutation.mutate(
      {
        email,
        password,
        plan: "free",
      },
      {
        onSuccess: () => {
          toasts.auth.signupSuccess();
          // Redirect to dashboard using window.location for full page reload
          window.location.href = "/dashboard";
        },
        onError: (err) => {
          const errorMessage = (err as Error).message || "Sign up failed";
          setError(errorMessage);
          handleApiError(err, "Sign up failed");
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
          Create your account
        </CardTitle>
        <CardDescription className="text-center text-muted-foreground">
          Sign up to start using RateGuard
        </CardDescription>
      </CardHeader>

      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
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
            <Label htmlFor="email" className="text-foreground">
              Email
            </Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5" />
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (emailError) setEmailError("");
                  if (error) setError("");
                }}
                onBlur={() => validateEmail(email)}
                className={`pl-10 bg-input border-input text-foreground ring-offset-background focus-visible:ring-ring ${
                  emailError ? "border-destructive focus-visible:ring-destructive" : ""
                }`}
                required
                disabled={signupMutation.isPending}
              />
            </div>
            {emailError && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                {emailError}
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
                placeholder="Create a strong password"
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
                disabled={signupMutation.isPending}
                minLength={8}
              />
            </div>
            {password && password.length > 0 && (
              <div className="space-y-1">
                {passwordError ? (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {passwordError}
                  </p>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all ${
                            getPasswordStrength(password).strength <= 2
                              ? "bg-destructive w-1/3"
                              : getPasswordStrength(password).strength <= 3
                              ? "bg-yellow-600 w-2/3"
                              : getPasswordStrength(password).strength <= 4
                              ? "bg-blue-600 w-5/6"
                              : "bg-green-600 w-full"
                          }`}
                        />
                      </div>
                      <span className={`text-xs font-medium ${getPasswordStrength(password).color}`}>
                        {getPasswordStrength(password).label}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Use 8+ characters with mix of letters, numbers & symbols
                    </p>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword" className="text-foreground">
              Confirm Password
            </Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5" />
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Confirm your password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (confirmPasswordError) setConfirmPasswordError("");
                  if (error) setError("");
                }}
                onBlur={() => validateConfirmPassword(confirmPassword)}
                className={`pl-10 bg-input border-input text-foreground ring-offset-background focus-visible:ring-ring ${
                  confirmPasswordError ? "border-destructive focus-visible:ring-destructive" : ""
                }`}
                required
                disabled={signupMutation.isPending}
              />
              {confirmPassword && password === confirmPassword && !confirmPasswordError && (
                <CheckCircle2 className="absolute right-3 top-1/2 transform -translate-y-1/2 text-primary w-5 h-5" />
              )}
            </div>
            {confirmPasswordError && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                {confirmPasswordError}
              </p>
            )}
          </div>

          <div className="bg-primary/10 border border-primary/30 rounded-lg p-3">
            <p className="text-xs text-primary">
              By signing up, you agree to our Terms of Service and Privacy
              Policy. You&apos;ll start with a free plan with 10,000
              requests/month.
            </p>
          </div>
        </CardContent>

        <CardFooter className="flex flex-col space-y-4">
          <Button
            type="submit"
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
            disabled={signupMutation.isPending}
          >
            {signupMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating account...
              </>
            ) : (
              "Create Account"
            )}
          </Button>

          <div className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link
              href="/login"
              className="text-primary hover:text-primary/80 underline"
            >
              Sign in
            </Link>
          </div>
        </CardFooter>
      </form>
    </Card>
  );
}
