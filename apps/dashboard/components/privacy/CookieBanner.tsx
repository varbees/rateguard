"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import Link from "next/link";

export function CookieBanner() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Check if user has already accepted cookies
    const accepted = localStorage.getItem("rateguard_cookies_accepted");
    if (!accepted) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsVisible(true);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem("rateguard_cookies_accepted", "true");
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-background border-t p-4 shadow-lg z-50 animate-in slide-in-from-bottom-full duration-300">
      <div className="container mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="text-sm text-muted-foreground text-center sm:text-left">
          <p>
            We use cookies to enhance your experience and analyze our traffic. By
            continuing to visit this site you agree to our use of cookies.{" "}
            <Link
              href="/legal/privacy"
              className="underline underline-offset-4 hover:text-foreground"
            >
              Learn more
            </Link>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={handleAccept}>
            Accept
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsVisible(false)}
            aria-label="Close"
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
