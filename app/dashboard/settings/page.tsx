"use client";

import { useState } from "react";
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
import { useDashboardStore } from "@/lib/store";
import { toasts, copyToClipboard } from "@/lib/toast";
import { ButtonLoading } from "@/components/loading";
import {
  User,
  Key,
  CreditCard,
  Bell,
  Shield,
  Copy,
  Trash2,
  Plus,
  Upload,
  Lock,
  ExternalLink,
} from "lucide-react";

export default function SettingsPage() {
  const apiKey = useDashboardStore((state) => state.apiKey);
  const [activeTab, setActiveTab] = useState("profile");

  // Profile state
  const [name, setName] = useState("John Doe");
  const [email] = useState("john@example.com");
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
      key: apiKey || "rg_xxxxxxxxxxxxxxxxxxxx",
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
  const [newKeyName, setNewKeyName] = useState("");
  const [isCreatingKey, setIsCreatingKey] = useState(false);
  const [keyToDelete, setKeyToDelete] = useState<string | null>(null);

  // Notifications state
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [usageThreshold, setUsageThreshold] = useState([80]);
  const [errorAlerts, setErrorAlerts] = useState(true);
  const [weeklyReport, setWeeklyReport] = useState(false);
  const [isSavingNotifications, setIsSavingNotifications] = useState(false);

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
      await new Promise((resolve) => setTimeout(resolve, 1000));
      toasts.config.saved();
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      toasts.config.importFailed();
    } finally {
      setIsChangingPassword(false);
    }
  };

  // API Keys handlers
  const handleCreateKey = async () => {
    if (!newKeyName.trim()) {
      toasts.validation.required("key name");
      return;
    }

    setIsCreatingKey(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const newKey = {
        id: Date.now().toString(),
        name: newKeyName,
        key: `rg_${Math.random().toString(36).substring(2, 24)}`,
        lastUsed: "Never",
        createdAt: new Date().toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        }),
      };
      setApiKeys([...apiKeys, newKey]);
      setNewKeyName("");
      toasts.api.created(newKeyName);
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
      await new Promise((resolve) => setTimeout(resolve, 1000));
      toasts.config.saved();
    } catch {
      toasts.config.importFailed();
    } finally {
      setIsSavingNotifications(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white">Settings</h1>
        <p className="text-slate-400 mt-1">
          Manage your account preferences and configuration
        </p>
      </div>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="space-y-6"
      >
        <TabsList className="grid w-full grid-cols-2 lg:grid-cols-5 bg-slate-900 border border-slate-800">
          <TabsTrigger value="profile" className="gap-2">
            <User className="w-4 h-4" />
            <span className="hidden sm:inline">Profile</span>
          </TabsTrigger>
          <TabsTrigger value="apikeys" className="gap-2">
            <Key className="w-4 h-4" />
            <span className="hidden sm:inline">API Keys</span>
          </TabsTrigger>
          <TabsTrigger value="billing" className="gap-2">
            <CreditCard className="w-4 h-4" />
            <span className="hidden sm:inline">Billing</span>
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-2">
            <Bell className="w-4 h-4" />
            <span className="hidden sm:inline">Notifications</span>
          </TabsTrigger>
          <TabsTrigger value="security" className="gap-2">
            <Shield className="w-4 h-4" />
            <span className="hidden sm:inline">Security</span>
          </TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile" className="space-y-6">
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white">Personal Information</CardTitle>
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
                  className="bg-slate-800 border-slate-700"
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
                  className="bg-slate-800 border-slate-700 opacity-60"
                />
                <p className="text-xs text-slate-400">
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
                <p className="text-xs text-slate-400">
                  JPG, PNG or GIF. Max 2MB.
                </p>
              </div>

              <Separator className="bg-slate-800" />

              <ButtonLoading
                loading={isSavingProfile}
                loadingText="Saving..."
                onClick={handleSaveProfile}
              >
                Save Changes
              </ButtonLoading>
            </CardContent>
          </Card>

          <Card className="bg-slate-900 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
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
                  className="bg-slate-800 border-slate-700"
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
                  className="bg-slate-800 border-slate-700"
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
                  className="bg-slate-800 border-slate-700"
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
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white">API Keys</CardTitle>
              <CardDescription>
                Manage your API keys for authentication
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="Key name (e.g., Production Key)"
                  className="bg-slate-800 border-slate-700"
                  onKeyDown={(e) => e.key === "Enter" && handleCreateKey()}
                />
                <ButtonLoading
                  loading={isCreatingKey}
                  loadingText="Creating..."
                  onClick={handleCreateKey}
                  className="gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Create
                </ButtonLoading>
              </div>

              <Separator className="bg-slate-800" />

              <div className="space-y-3">
                {apiKeys.map((key) => (
                  <div
                    key={key.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-slate-800 border border-slate-700 rounded-lg"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-medium text-white">{key.name}</p>
                        {key.lastUsed === "Never" && (
                          <Badge variant="outline" className="text-xs">
                            New
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-slate-400 font-mono truncate">
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
                <div className="text-center py-8 text-slate-400">
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
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white">Current Plan</CardTitle>
              <CardDescription>
                Manage your subscription and billing
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between p-6 bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20 rounded-lg">
                <div>
                  <h3 className="text-2xl font-bold text-white mb-1">
                    Free Plan
                  </h3>
                  <p className="text-slate-400">Perfect for getting started</p>
                </div>
                <Badge className="bg-blue-500 text-white px-4 py-2 text-lg">
                  $0/mo
                </Badge>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>API Requests This Month</Label>
                  <span className="text-sm text-slate-400">2,450 / 10,000</span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full"
                    style={{ width: "24.5%" }}
                  />
                </div>
                <p className="text-xs text-slate-400">
                  7,550 requests remaining this month
                </p>
              </div>

              <Separator className="bg-slate-800" />

              <div className="space-y-3">
                <h4 className="font-semibold text-white">Upgrade Options</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 bg-slate-800 border border-slate-700 rounded-lg">
                    <h5 className="font-semibold text-white mb-2">Pro Plan</h5>
                    <p className="text-2xl font-bold text-blue-500 mb-3">
                      $29/mo
                    </p>
                    <ul className="space-y-2 text-sm text-slate-400 mb-4">
                      <li>✓ 100,000 requests/month</li>
                      <li>✓ Priority support</li>
                      <li>✓ Advanced analytics</li>
                      <li>✓ Custom rate limits</li>
                    </ul>
                    <Button className="w-full">Upgrade to Pro</Button>
                  </div>
                  <div className="p-4 bg-slate-800 border border-purple-500/30 rounded-lg relative overflow-hidden">
                    <div className="absolute top-2 right-2">
                      <Badge className="bg-purple-500">Popular</Badge>
                    </div>
                    <h5 className="font-semibold text-white mb-2">
                      Business Plan
                    </h5>
                    <p className="text-2xl font-bold text-purple-500 mb-3">
                      $99/mo
                    </p>
                    <ul className="space-y-2 text-sm text-slate-400 mb-4">
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

          <Card className="bg-slate-900 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white">Payment Method</CardTitle>
              <CardDescription>Manage your billing information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-slate-800 border border-slate-700 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-8 bg-gradient-to-r from-blue-500 to-purple-500 rounded flex items-center justify-center text-white text-xs font-bold">
                    VISA
                  </div>
                  <div>
                    <p className="text-white font-medium">
                      •••• •••• •••• 4242
                    </p>
                    <p className="text-sm text-slate-400">Expires 12/2025</p>
                  </div>
                </div>
                <Button variant="outline" size="sm">
                  Update
                </Button>
              </div>
              <p className="text-xs text-slate-400">
                No payment method required for Free plan
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications" className="space-y-6">
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white">
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
                  <p className="text-sm text-slate-400">
                    Receive email notifications for important events
                  </p>
                </div>
                <Switch
                  checked={emailAlerts}
                  onCheckedChange={setEmailAlerts}
                />
              </div>

              <Separator className="bg-slate-800" />

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
                <p className="text-sm text-slate-400">
                  Get notified when you reach this percentage of your monthly
                  quota
                </p>
              </div>

              <Separator className="bg-slate-800" />

              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>Error Rate Alerts</Label>
                  <p className="text-sm text-slate-400">
                    Get notified when error rates spike
                  </p>
                </div>
                <Switch
                  checked={errorAlerts}
                  onCheckedChange={setErrorAlerts}
                />
              </div>

              <Separator className="bg-slate-800" />

              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>Weekly Report</Label>
                  <p className="text-sm text-slate-400">
                    Receive a summary of your API usage every week
                  </p>
                </div>
                <Switch
                  checked={weeklyReport}
                  onCheckedChange={setWeeklyReport}
                />
              </div>

              <Separator className="bg-slate-800" />

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
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white">Security Settings</CardTitle>
              <CardDescription>Enhance your account security</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between p-4 bg-slate-800 border border-slate-700 rounded-lg">
                <div className="space-y-1">
                  <Label className="text-base">Two-Factor Authentication</Label>
                  <p className="text-sm text-slate-400">
                    Add an extra layer of security to your account
                  </p>
                </div>
                <Badge variant="outline" className="text-slate-400">
                  Coming Soon
                </Badge>
              </div>

              <Separator className="bg-slate-800" />

              <div className="flex items-center justify-between p-4 bg-slate-800 border border-slate-700 rounded-lg">
                <div className="space-y-1">
                  <Label className="text-base">API Key Rotation Schedule</Label>
                  <p className="text-sm text-slate-400">
                    Automatically rotate your API keys periodically
                  </p>
                </div>
                <Badge variant="outline" className="text-slate-400">
                  Coming Soon
                </Badge>
              </div>

              <Separator className="bg-slate-800" />

              <div className="flex items-center justify-between p-4 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-800/70 transition-colors cursor-pointer">
                <div className="space-y-1">
                  <Label className="text-base cursor-pointer">Audit Log</Label>
                  <p className="text-sm text-slate-400">
                    View all account activity and API key usage
                  </p>
                </div>
                <ExternalLink className="w-5 h-5 text-slate-400" />
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
        <AlertDialogContent className="bg-slate-900 border-slate-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">
              Revoke API Key?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              This action cannot be undone. This API key will be permanently
              revoked and any applications using it will no longer be able to
              authenticate.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-800 border-slate-700 hover:bg-slate-700">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteKey}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              Revoke Key
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
