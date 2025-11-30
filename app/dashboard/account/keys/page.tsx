import { APIKeysManagement } from "@/components/dashboard/APIKeysManagement";

export default function APIKeysPage() {
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">API Keys</h1>
      <p className="text-muted-foreground mb-8">
        Manage your authentication tokens for accessing the RateGuard API.
      </p>
      <APIKeysManagement />
    </div>
  );
}
