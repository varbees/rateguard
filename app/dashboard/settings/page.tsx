"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toasts, copyToClipboard } from "@/lib/toast";
import { settingsAPI } from "@/lib/api";
import { ButtonLoading } from "@/components/loading";
import {
  User,
  Key,
  CreditCard,
  Bell,
  Shield,
  Copy,
  Trash2,
  Upload,
  Lock,
  ExternalLink,
} from "lucide-react";

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState("profile");

  // Profile state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // API Keys state
  const [apiKeys, setApiKeys] = useState([
    {
      id: "1",
      name: "Production Key",
      key: "rg_xxxxxxxxxxxxxxxxxxxx",
      lastUsed: "2 hours ago",
      createdAt: "Nov 15, 2025",
    },
    {
      id: "2",
      name: "Development Key",
      key: "rg_yyyyyyyyyyyyyyyyyyyy",
      lastUsed: "5 days ago",
      createdAt: "Nov 10, 2025",
    },
  ]);
  const [isCreatingKey, setIsCreatingKey] = useState(false);
  const [keyToDelete, setKeyToDelete] = useState<string | null>(null);

  // Notifications state
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [usageThreshold, setUsageThreshold] = useState([80]);
  const [errorAlerts, setErrorAlerts] = useState(true);
  const [weeklyReport, setWeeklyReport] = useState(false);
  const [isSavingNotifications, setIsSavingNotifications] = useState(false);

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const data = await settingsAPI.get();

        // Set user data
        setEmail(data.user.email);
        setName(data.user.name || data.user.email);

        // Set notification preferences
        setEmailAlerts(data.notifications.email_alerts);
        setUsageThreshold([data.notifications.usage_threshold_percent]);
        setErrorAlerts(data.notifications.error_alerts);
        setWeeklyReport(data.notifications.weekly_report);
      } catch (error) {
        console.error("Failed to load settings:", error);
        toasts.config.importFailed();
      }
    };

    loadSettings();
  }, []);

  // Profile handlers
  const handleSaveProfile = async () => {
    setIsSavingProfile(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      toasts.config.saved();
    } catch {
      toasts.config.importFailed();
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      toasts.validation.failed();
      return;
    }
    if (newPassword.length < 8) {
      toasts.validation.failed();
      return;
    }

    setIsChangingPassword(true);
    try {
      await settingsAPI.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      toasts.config.saved();
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error) {
      toasts.config.importFailed();
      console.error("Password change failed:", error);
    } finally {
      setIsChangingPassword(false);
    }
  };

  // API Keys handlers
  const handleCreateKey = async () => {
    setIsCreatingKey(true);
    try {
      const result = await settingsAPI.regenerateAPIKey();
      const newKey = {
        id: Date.now().toString(),
        name: "Primary API Key",
        key: result.api_key,
        lastUsed: "Just now",
        createdAt: new Date().toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        }),
      };
      // Replace existing keys (users have one primary key)
      setApiKeys([newKey]);
      toasts.api.created("API Key");
    } catch {
      toasts.api.createFailed();
    } finally {
      setIsCreatingKey(false);
    }
  };

  const handleDeleteKey = async () => {
    if (!keyToDelete) return;

    try {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const keyName = apiKeys.find((k) => k.id === keyToDelete)?.name || "Key";
      setApiKeys(apiKeys.filter((k) => k.id !== keyToDelete));
      setKeyToDelete(null);
      toasts.api.deleted(keyName);
    } catch {
      toasts.api.deleteFailed();
    }
  };

  // Notifications handlers
  const handleSaveNotifications = async () => {
    setIsSavingNotifications(true);
    try {
      await settingsAPI.update({
        email_alerts: emailAlerts,
        usage_threshold_percent: usageThreshold[0],
        error_alerts: errorAlerts,
        weekly_report: weeklyReport,
      });
      toasts.config.saved();
    } catch {
      toasts.config.importFailed();
    } finally {
      setIsSavingNotifications(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground mt-2">
          Manage your account preferences and configuration
        </p>
      </div>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="space-y-8"
      >
        <TabsList className="inline-flex h-12 items-center justify-start rounded-lg bg-muted p-1.5 text-muted-foreground w-full overflow-x-auto">
          <TabsTrigger value="profile" className="gap-2 px-4">
            <User className="w-4 h-4" />
            <span className="hidden sm:inline">Profile</span>
          </TabsTrigger>
          <TabsTrigger value="apikeys" className="gap-2 px-4">
            <Key className="w-4 h-4" />
            <span className="hidden sm:inline">API Keys</span>
          </TabsTrigger>
          <TabsTrigger value="billing" className="gap-2 px-4">
            <CreditCard className="w-4 h-4" />
            <span className="hidden sm:inline">Billing</span>
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-2 px-4">
            <Bell className="w-4 h-4" />
            <span className="hidden sm:inline">Notifications</span>
          </TabsTrigger>
          <TabsTrigger value="security" className="gap-2 px-4">
            <Shield className="w-4 h-4" />
            <span className="hidden sm:inline">Security</span>
          </TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile" className="space-y-6">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-foreground">
                Personal Information
              </CardTitle>
              <CardDescription>
                Update your account details and profile
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="bg-accent border-slate-700"
                  placeholder="Enter your full name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  readOnly
                  className="bg-accent border-slate-700 opacity-60"
                />
                <p className="text-xs text-muted-foreground">
                  Email cannot be changed
                </p>
              </div>

              <div className="space-y-2">
                <Label>Profile Picture</Label>
                <div className="flex items-center gap-4">
                  <div className="w-20 h-20 rounded-full bg-blue-500/10 border-2 border-blue-500/20 flex items-center justify-center text-blue-500 text-2xl font-bold">
                    {name.charAt(0).toUpperCase()}
                  </div>
                  <Button variant="outline" size="sm" className="gap-2">
                    <Upload className="w-4 h-4" />
                    Upload Image
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  JPG, PNG or GIF. Max 2MB.
                </p>
              </div>

              <Separator className="bg-accent" />

              <ButtonLoading
                loading={isSavingProfile}
                loadingText="Saving..."
                onClick={handleSaveProfile}
              >
                Save Changes
              </ButtonLoading>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2">
                <Lock className="w-5 h-5" />
                Change Password
              </CardTitle>
              <CardDescription>
                Update your password to keep your account secure
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="current-password">Current Password</Label>
                <Input
                  id="current-password"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="bg-accent border-slate-700"
                  placeholder="Enter current password"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="new-password">New Password</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="bg-accent border-slate-700"
                  placeholder="Enter new password (min 8 characters)"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm New Password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="bg-accent border-slate-700"
                  placeholder="Confirm new password"
                />
              </div>

              <ButtonLoading
                loading={isChangingPassword}
                loadingText="Changing Password..."
                onClick={handleChangePassword}
                disabled={!currentPassword || !newPassword || !confirmPassword}
              >
                Change Password
              </ButtonLoading>
            </CardContent>
          </Card>
        </TabsContent>

        {/* API Keys Tab */}
        <TabsContent value="apikeys" className="space-y-6">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-foreground">API Keys</CardTitle>
              <CardDescription>
                Manage your API keys for authentication
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <ButtonLoading
                  loading={isCreatingKey}
                  loadingText="Regenerating..."
                  onClick={handleCreateKey}
                  className="gap-2"
                >
                  <Key className="w-4 h-4" />
                  Regenerate API Key
                </ButtonLoading>
                <p className="text-xs text-yellow-400">
                  ⚠️ Regenerating will invalidate your current API key
                </p>
              </div>

              <Separator className="bg-accent" />

              <div className="space-y-3">
                {apiKeys.map((key) => (
                  <div
                    key={key.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-accent border border-slate-700 rounded-lg"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-medium text-foreground">
                          {key.name}
                        </p>
                        {key.lastUsed === "Never" && (
                          <Badge variant="outline" className="text-xs">
                            New
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground font-mono truncate">
                        {key.key}
                      </p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                        <span>Last used: {key.lastUsed}</span>
                        <span>Created: {key.createdAt}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyToClipboard(key.key, "API Key")}
                        className="gap-2"
                      >
                        <Copy className="w-3 h-3" />
                        <span className="hidden sm:inline">Copy</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => setKeyToDelete(key.id)}
                        className="gap-2"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span className="hidden sm:inline">Revoke</span>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              {apiKeys.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <Key className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>No API keys yet. Create one to get started.</p>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
            <p className="text-yellow-400 text-sm">
              <strong>Security Note:</strong> API keys grant full access to your
              account. Keep them secure and never share them publicly or commit
              them to version control.
            </p>
          </div>
        </TabsContent>

        {/* Billing Tab */}
        <TabsContent value="billing" className="space-y-6">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-foreground">Current Plan</CardTitle>
              <CardDescription>
                Manage your subscription and billing
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between p-6 bg-linear-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20 rounded-lg">
                <div>
                  <h3 className="text-2xl font-bold text-foreground mb-1">
                    Free Plan
                  </h3>
                  <p className="text-muted-foreground">
                    Perfect for getting started
                  </p>
                </div>
                <Badge className="bg-blue-500 text-foreground px-4 py-2 text-lg">
                  $0/mo
                </Badge>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>API Requests This Month</Label>
                  <span className="text-sm text-muted-foreground">
                    2,450 / 10,000
                  </span>
                </div>
                <div className="w-full bg-accent rounded-full h-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full"
                    style={{ width: "24.5%" }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  7,550 requests remaining this month
                </p>
              </div>

              <Separator className="bg-accent" />

              <div className="space-y-3">
                <h4 className="font-semibold text-foreground">
                  Upgrade Options
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 bg-accent border border-slate-700 rounded-lg">
                    <h5 className="font-semibold text-foreground mb-2">
                      Pro Plan
                    </h5>
                    <p className="text-2xl font-bold text-blue-500 mb-3">
                      $29/mo
                    </p>
                    <ul className="space-y-2 text-sm text-muted-foreground mb-4">
                      <li>✓ 100,000 requests/month</li>
                      <li>✓ Priority support</li>
                      <li>✓ Advanced analytics</li>
                      <li>✓ Custom rate limits</li>
                    </ul>
                    <Button className="w-full">Upgrade to Pro</Button>
                  </div>
                  <div className="p-4 bg-accent border border-purple-500/30 rounded-lg relative overflow-hidden">
                    <div className="absolute top-2 right-2">
                      <Badge className="bg-purple-500">Popular</Badge>
                    </div>
                    <h5 className="font-semibold text-foreground mb-2">
                      Business Plan
                    </h5>
                    <p className="text-2xl font-bold text-purple-500 mb-3">
                      $99/mo
                    </p>
                    <ul className="space-y-2 text-sm text-muted-foreground mb-4">
                      <li>✓ 1,000,000 requests/month</li>
                      <li>✓ 24/7 premium support</li>
                      <li>✓ Custom integrations</li>
                      <li>✓ SLA guarantee</li>
                    </ul>
                    <Button className="w-full bg-purple-500 hover:bg-purple-600">
                      Upgrade to Business
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-foreground">Payment Method</CardTitle>
              <CardDescription>Manage your billing information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-accent border border-slate-700 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-8 bg-linear-to-r from-blue-500 to-purple-500 rounded flex items-center justify-center text-foreground text-xs font-bold">
                    VISA
                  </div>
                  <div>
                    <p className="text-foreground font-medium">
                      •••• •••• •••• 4242
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Expires 12/2025
                    </p>
                  </div>
                </div>
                <Button variant="outline" size="sm">
                  Update
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                No payment method required for Free plan
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications" className="space-y-6">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-foreground">
                Notification Preferences
              </CardTitle>
              <CardDescription>
                Choose how and when you want to be notified
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>Email Alerts</Label>
                  <p className="text-sm text-muted-foreground">
                    Receive email notifications for important events
                  </p>
                </div>
                <Switch
                  checked={emailAlerts}
                  onCheckedChange={setEmailAlerts}
                />
              </div>

              <Separator className="bg-accent" />

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Usage Threshold Alert</Label>
                  <span className="text-sm text-blue-500 font-medium">
                    {usageThreshold[0]}%
                  </span>
                </div>
                <Slider
                  value={usageThreshold}
                  onValueChange={setUsageThreshold}
                  max={100}
                  step={5}
                  className="w-full"
                />
                <p className="text-sm text-muted-foreground">
                  Get notified when you reach this percentage of your monthly
                  quota
                </p>
              </div>

              <Separator className="bg-accent" />

              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>Error Rate Alerts</Label>
                  <p className="text-sm text-muted-foreground">
                    Get notified when error rates spike
                  </p>
                </div>
                <Switch
                  checked={errorAlerts}
                  onCheckedChange={setErrorAlerts}
                />
              </div>

              <Separator className="bg-accent" />

              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>Weekly Report</Label>
                  <p className="text-sm text-muted-foreground">
                    Receive a summary of your API usage every week
                  </p>
                </div>
                <Switch
                  checked={weeklyReport}
                  onCheckedChange={setWeeklyReport}
                />
              </div>

              <Separator className="bg-accent" />

              <ButtonLoading
                loading={isSavingNotifications}
                loadingText="Saving..."
                onClick={handleSaveNotifications}
              >
                Save Preferences
              </ButtonLoading>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security Tab */}
        <TabsContent value="security" className="space-y-6">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-foreground">
                Security Settings
              </CardTitle>
              <CardDescription>Enhance your account security</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between p-4 bg-accent border border-slate-700 rounded-lg">
                <div className="space-y-1">
                  <Label className="text-base">Two-Factor Authentication</Label>
                  <p className="text-sm text-muted-foreground">
                    Add an extra layer of security to your account
                  </p>
                </div>
                <Badge variant="outline" className="text-muted-foreground">
                  Coming Soon
                </Badge>
              </div>

              <Separator className="bg-accent" />

              <div className="flex items-center justify-between p-4 bg-accent border border-slate-700 rounded-lg">
                <div className="space-y-1">
                  <Label className="text-base">API Key Rotation Schedule</Label>
                  <p className="text-sm text-muted-foreground">
                    Automatically rotate your API keys periodically
                  </p>
                </div>
                <Badge variant="outline" className="text-muted-foreground">
                  Coming Soon
                </Badge>
              </div>

              <Separator className="bg-accent" />

              <div className="flex items-center justify-between p-4 bg-accent border border-slate-700 rounded-lg hover:bg-accent/70 transition-colors cursor-pointer">
                <div className="space-y-1">
                  <Label className="text-base cursor-pointer">Audit Log</Label>
                  <p className="text-sm text-muted-foreground">
                    View all account activity and API key usage
                  </p>
                </div>
                <ExternalLink className="w-5 h-5 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>

          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
            <p className="text-blue-400 text-sm">
              <strong>Security Tip:</strong> Enable two-factor authentication
              and regularly rotate your API keys to keep your account secure.
              Never share your credentials with anyone.
            </p>
          </div>
        </TabsContent>
      </Tabs>

      {/* Confirmation Dialog for API Key Deletion */}
      <AlertDialog
        open={!!keyToDelete}
        onOpenChange={(open) => !open && setKeyToDelete(null)}
      >
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">
              Revoke API Key?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              This action cannot be undone. This API key will be permanently
              revoked and any applications using it will no longer be able to
              authenticate.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-accent border-slate-700 hover:bg-slate-700">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteKey}
              className="bg-destructive hover:bg-red-600 text-foreground"
            >
              Revoke Key
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
