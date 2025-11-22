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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Mail, Lock, Key, AlertCircle, Shield } from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api";
import { useDashboardStore } from "@/lib/store";

export default function LoginForm() {
  const router = useRouter();
  const setApiKey = useDashboardStore((state) => state.setApiKey);

  // Email/Password login state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // API Key login state
  const [apiKeyInput, setApiKeyInput] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("email");

  const handleEmailPasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email || !password) {
      setError("Please fill in all fields");
      toast.error("Please fill in all fields");
      return;
    }

    setLoading(true);

    try {
      // Use API client login method
      const data = await apiClient.login({ email, password });

      // Store API key from login response
      if (data.api_key) {
        apiClient.setApiKey(data.api_key);
        setApiKey(data.api_key);
      }

      toast.success("Login successful!", {
        description: `Welcome back, ${data.user?.email || "user"}!`,
      });

      // Redirect to dashboard
      router.push("/dashboard");
    } catch (err) {
      const error = err as Error;
      setError(error.message || "Login failed");
      toast.error("Login failed", {
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleApiKeyLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!apiKeyInput) {
      setError("Please enter your API key");
      toast.error("Please enter your API key");
      return;
    }

    setLoading(true);

    try {
      // Set the API key temporarily
      apiClient.setApiKey(apiKeyInput);

      // Verify by making a test request
      await apiClient.getDashboardStats();

      // If successful, store permanently
      setApiKey(apiKeyInput);

      toast.success("Authentication successful!", {
        description: "Welcome to RateGuard!",
      });

      router.push("/dashboard");
    } catch (err) {
      const error = err as Error;
      setError(error.message || "Invalid API key");
      toast.error("Authentication failed", {
        description: "Invalid API key. Please check and try again.",
      });
      apiClient.clearApiKey();
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
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 bg-slate-800">
            <TabsTrigger
              value="email"
              className="data-[state=active]:bg-blue-500"
            >
              Email
            </TabsTrigger>
            <TabsTrigger
              value="apikey"
              className="data-[state=active]:bg-blue-500"
            >
              API Key
            </TabsTrigger>
          </TabsList>

          {/* Email/Password Login */}
          <TabsContent value="email" className="space-y-4 mt-4">
            <form onSubmit={handleEmailPasswordLogin} className="space-y-4">
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
          </TabsContent>

          {/* API Key Login */}
          <TabsContent value="apikey" className="space-y-4 mt-4">
            <form onSubmit={handleApiKeyLogin} className="space-y-4">
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
                <Label htmlFor="apiKey" className="text-slate-300">
                  API Key
                </Label>
                <div className="relative">
                  <Key className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
                  <Input
                    id="apiKey"
                    type="password"
                    placeholder="rg_your_api_key_here..."
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    className="pl-10 bg-slate-800 border-slate-700 text-white font-mono text-sm"
                    required
                    disabled={loading}
                  />
                </div>
                <p className="text-xs text-slate-400">
                  Your API key can be found in your account settings
                </p>
              </div>

              <Button
                type="submit"
                className="w-full bg-blue-500 hover:bg-blue-600 text-white"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Authenticating...
                  </>
                ) : (
                  "Authenticate"
                )}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
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
