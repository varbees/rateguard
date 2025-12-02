"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import Link from "next/link";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<"verifying" | "success" | "error">("verifying");
  const [message, setMessage] = useState("Verifying your email...");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("Invalid verification link. Token is missing.");
      return;
    }

    const verify = async () => {
      try {
        await api.verifyEmail(token);
        setStatus("success");
        setMessage("Your email has been successfully verified!");
        // Redirect to dashboard after 3 seconds
        setTimeout(() => {
          router.push("/dashboard");
        }, 3000);
      } catch (error: any) {
        setStatus("error");
        setMessage(error.message || "Failed to verify email. The link may be expired or invalid.");
      }
    };

    verify();
  }, [token, router]);

  return (
    <Card className="w-full max-w-md bg-card border-border">
      <CardHeader className="text-center">
        <div className="flex justify-center mb-4">
          {status === "verifying" && <Loader2 className="w-12 h-12 text-primary animate-spin" />}
          {status === "success" && <CheckCircle2 className="w-12 h-12 text-green-500" />}
          {status === "error" && <XCircle className="w-12 h-12 text-destructive" />}
        </div>
        <CardTitle className="text-2xl">
          {status === "verifying" && "Verifying Email"}
          {status === "success" && "Email Verified"}
          {status === "error" && "Verification Failed"}
        </CardTitle>
        <CardDescription>
          {message}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex justify-center">
        {status === "success" && (
          <Button asChild className="w-full">
            <Link href="/dashboard">Go to Dashboard</Link>
          </Button>
        )}
        {status === "error" && (
          <Button asChild variant="outline" className="w-full">
            <Link href="/login">Back to Login</Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export default function VerifyEmailPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-4">
      <Suspense fallback={<Loader2 className="w-8 h-8 text-white animate-spin" />}>
        <VerifyEmailContent />
      </Suspense>
    </div>
  );
}
