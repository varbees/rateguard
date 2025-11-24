"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Lock, AlertCircle, Shield, CheckCircle } from "lucide-react";
import { apiClient } from "@/lib/api";
import { handleApiError } from "@/lib/toast";

const formSchema = z
  .object({
    password: z
      .string()
      .min(8, { message: "Password must be at least 8 characters." }),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"], // Error will be shown on this field
  });

type ResetPasswordFormValues = z.infer<typeof formSchema>;

function ResetPasswordComponent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState("");

  const form = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
  });

  const { mutate, isPending } = useMutation({
    mutationFn: apiClient.resetPassword,
    onSuccess: () => {
      setIsSuccess(true);
    },
    onError: (err: Error) => {
      setError(err.message || "An unknown error occurred.");
      handleApiError(err, "Failed to reset password");
    },
  });

  useEffect(() => {
    if (!token) {
      // Use setTimeout to avoid synchronous setState in effect
      setTimeout(() => {
        setError("No reset token provided. Please request a new reset link.");
      }, 0);
    }
  }, [token]);

  const onSubmit = (values: ResetPasswordFormValues) => {
    if (!token) {
      setError("Cannot reset password without a valid token.");
      return;
    }
    mutate({ token, password: values.password });
  };

  const renderContent = () => {
    if (isSuccess) {
      return (
        <div className="text-center">
          <CheckCircle className="mx-auto h-12 w-12 text-primary mb-4" />
          <p className="text-card-foreground mb-6">
            Your password has been reset successfully.
          </p>
          <Button
            asChild
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            <Link href="/login">Return to Sign In</Link>
          </Button>
        </div>
      );
    }

    if (error && !token) {
      return (
        <Alert
          variant="destructive"
          className="bg-destructive/10 border-destructive"
        >
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      );
    }

    return (
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          {error && (
            <Alert
              variant="destructive"
              className="bg-destructive/10 border-destructive"
            >
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-foreground">New Password</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5" />
                    <Input
                      type="password"
                      placeholder="Enter your new password"
                      {...field}
                      className="pl-10 bg-input border-input text-foreground ring-offset-background focus-visible:ring-ring"
                      disabled={isPending}
                    />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="confirmPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-foreground">
                  Confirm New Password
                </FormLabel>
                <FormControl>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5" />
                    <Input
                      type="password"
                      placeholder="Confirm your new password"
                      {...field}
                      className="pl-10 bg-input border-input text-foreground ring-offset-background focus-visible:ring-ring"
                      disabled={isPending}
                    />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button
            type="submit"
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
            disabled={isPending || !token}
          >
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Resetting...
              </>
            ) : (
              "Set New Password"
            )}
          </Button>
        </form>
      </Form>
    );
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md bg-card border-border">
        <CardHeader className="space-y-1">
          <div className="flex items-center justify-center mb-4">
            <div className="p-3 bg-primary rounded-lg">
              <Shield className="w-8 h-8 text-primary-foreground" />
            </div>
          </div>
          <CardTitle className="text-2xl text-center text-card-foreground">
            Create New Password
          </CardTitle>
          {!isSuccess && (
            <CardDescription className="text-center text-muted-foreground">
              Your new password must be at least 8 characters long.
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>{renderContent()}</CardContent>
      </Card>
    </div>
  );
}

// next/navigation's useSearchParams hook should be used within a Suspense boundary
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ResetPasswordComponent />
    </Suspense>
  );
}
