"use client";

import { AnimatedDemo } from "./AnimatedDemo";
import { InteractivePlayground } from "./InteractivePlayground";

export function HowItWorks() {
  return (
    <section id="how-it-works" className="py-24 bg-muted/30">
      <div className="container max-w-7xl mx-auto px-4 md:px-6">
        {/* Section Header */}
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl">
            How RateGuard Works
            <span className="block text-primary mt-2">
              See It In Action
            </span>
          </h2>
          <p className="mt-4 text-muted-foreground md:text-xl max-w-3xl mx-auto">
            Experience RateGuard&apos;s powerful API gateway in real-time with our interactive demo
          </p>
        </div>

        {/* Animated Demo Section */}
        <div className="mb-16">
          <AnimatedDemo />
        </div>

        {/* Interactive Playground Section */}
        <div>
          <InteractivePlayground />
        </div>
      </div>
    </section>
  );
}
