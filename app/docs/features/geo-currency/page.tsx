import { Metadata } from "next";
import {
  Globe,
  MapPin,
  Banknote,
  RefreshCcw,
  Wallet,
  Coins,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Callout } from "@/components/docs/Callout";
import { CodeTabs } from "@/components/docs/CodeTabs";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "Geo-Currency | RateGuard Documentation",
  description:
    "Learn how RateGuard automatically detects user location and displays pricing in their local currency.",
};

export default function GeoCurrencyPage() {
  return (
    <div className="min-h-screen bg-background space-y-12 max-w-5xl mx-auto">
      {/* Hero Section */}
      <div className="border-b bg-muted/30 pb-8 pt-12 rounded-xl px-8">
        <div className="flex items-start gap-4 mb-6">
          <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
            <Globe className="size-8 text-primary" />
          </div>
          <div className="flex-1">
            <h1 className="text-4xl font-bold tracking-tight mb-3">
              Geo-Currency
            </h1>
            <p className="text-xl text-muted-foreground leading-relaxed">
              We speak money in every language. Because asking a user in Tokyo to
              pay in USD is like asking Michael Scott to keep a secret. It just
              doesn't work.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-12 px-4">
        {/* How It Works */}
        <section className="space-y-6">
          <div className="flex items-center gap-2">
            <MapPin className="h-6 w-6 text-primary" />
            <h2 className="text-2xl font-bold">Location Detection</h2>
          </div>
          <p className="text-muted-foreground text-lg">
            We use the user's IP address to guess where they are. It's not
            creepy, it's helpful.
          </p>

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Globe className="size-4 text-primary" />
                  IP Geolocation
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                We look up the IP. "Oh, you're in London? Here's the price in
                Pounds." "Mumbai? Here's Rupees."
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <RefreshCcw className="size-4 text-primary" />
                  Auto-Conversion
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                We convert the base price using real-time exchange rates. No
                hidden fees, unlike that ATM at the airport.
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Supported Currencies */}
        <section className="space-y-6">
          <div className="flex items-center gap-2">
            <Coins className="h-6 w-6 text-primary" />
            <h2 className="text-2xl font-bold">Supported Currencies</h2>
          </div>
          <p className="text-muted-foreground text-lg">
            We support major currencies out of the box.
          </p>

          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary" className="text-base px-3 py-1">
              🇺🇸 USD
            </Badge>
            <Badge variant="secondary" className="text-base px-3 py-1">
              🇪🇺 EUR
            </Badge>
            <Badge variant="secondary" className="text-base px-3 py-1">
              🇬🇧 GBP
            </Badge>
            <Badge variant="secondary" className="text-base px-3 py-1">
              🇮🇳 INR
            </Badge>
            <Badge variant="secondary" className="text-base px-3 py-1">
              🇯🇵 JPY
            </Badge>
            <Badge variant="secondary" className="text-base px-3 py-1">
              🇨🇦 CAD
            </Badge>
            <Badge variant="secondary" className="text-base px-3 py-1">
              🇦🇺 AUD
            </Badge>
          </div>
        </section>

        {/* Implementation */}
        <section className="space-y-6">
          <div className="flex items-center gap-2">
            <Wallet className="h-6 w-6 text-primary" />
            <h2 className="text-2xl font-bold">Implementation</h2>
          </div>
          <p className="text-muted-foreground text-lg">
            It happens automatically on the pricing page. But you can also force
            it if you're testing via VPN.
          </p>

          <CodeTabs
            examples={[
              {
                label: "Force Currency (URL Param)",
                language: "text",
                code: `https://rateguard.io/pricing?currency=INR`,
              },
            ]}
          />
        </section>

        <Callout type="default" title="Purchasing Power Parity">
          We don't just convert currency; we can also adjust pricing based on
          purchasing power. So a student in Bangalore pays a fair price compared
          to a startup in San Francisco.
        </Callout>
      </div>
    </div>
  );
}
