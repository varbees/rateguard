import { Metadata } from "next";
import { Globe, MessageSquare, Image, Mic } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CodeTabs } from "@/components/docs/CodeTabs";
import { Callout } from "@/components/docs/Callout";

export const metadata: Metadata = {
  title: "Connect Your LLM API | RateGuard Documentation",
  description: "Integrate OpenAI, Anthropic, and other LLM providers.",
};

export default function ConnectLLMPage() {
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
              Connect Your LLM API
            </h1>
            <p className="text-xl text-muted-foreground leading-relaxed">
              We speak fluent AI. Whether it's OpenAI, Anthropic, or Cohere, we've got you covered.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-12 px-4">
        {/* OpenAI */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <MessageSquare className="size-6 text-primary" />
            OpenAI
          </h2>
          <p className="text-muted-foreground">
            The big cheese. Connecting OpenAI is as simple as changing the base URL.
          </p>
          
          <CodeTabs
            examples={[
              {
                label: "Node.js",
                language: "javascript",
                code: `import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: 'https://api.rateguard.io/proxy/openai/v1', // The magic happens here
  defaultHeaders: {
    'X-RG-Key': process.env.RATEGUARD_API_KEY
  }
});

const completion = await openai.chat.completions.create({
  messages: [{ role: 'user', content: 'Hello!' }],
  model: 'gpt-4',
});`,
              },
              {
                label: "Python",
                language: "python",
                code: `from openai import OpenAI
import os

client = OpenAI(
    api_key=os.environ.get("OPENAI_API_KEY"),
    base_url="https://api.rateguard.io/proxy/openai/v1", # The magic happens here
    default_headers={"X-RG-Key": os.environ.get("RATEGUARD_API_KEY")}
)

completion = client.chat.completions.create(
    model="gpt-4",
    messages=[{"role": "user", "content": "Hello!"}]
)
print(completion.choices[0].message)`,
              },
            ]}
          />
        </section>

        {/* Anthropic */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <MessageSquare className="size-6 text-primary" />
            Anthropic (Claude)
          </h2>
          <p className="text-muted-foreground">
            For when you want an AI that's helpful, harmless, and honest (and rate-limited).
          </p>
          
          <CodeTabs
            examples={[
              {
                label: "Node.js",
                language: "javascript",
                code: `import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: 'https://api.rateguard.io/proxy/anthropic', // Note: No /v1 here for Anthropic SDK usually
  defaultHeaders: {
    'X-RG-Key': process.env.RATEGUARD_API_KEY
  }
});

const message = await anthropic.messages.create({
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Hello, Claude' }],
  model: 'claude-3-opus-20240229',
});`,
              },
              {
                label: "cURL",
                language: "bash",
                code: `curl https://api.rateguard.io/proxy/anthropic/v1/messages \\
     --header "x-api-key: $ANTHROPIC_API_KEY" \\
     --header "X-RG-Key: $RATEGUARD_API_KEY" \\
     --header "anthropic-version: 2023-06-01" \\
     --header "content-type: application/json" \\
     --data '{
       "model": "claude-3-opus-20240229",
       "max_tokens": 1024,
       "messages": [{"role": "user", "content": "Hello, world"}]
     }'`,
              },
            ]}
          />
        </section>

        {/* Supported Endpoints */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold">Supported Endpoints</h2>
          <p className="text-muted-foreground">
            We support token counting for the following endpoints. For others, we just proxy the request (rate limiting still applies).
          </p>
          
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <MessageSquare className="size-4 text-primary" />
                  Chat Completions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">OpenAI, Anthropic, Cohere, Mistral</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Image className="size-4 text-primary" />
                  Image Generation
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">DALL-E 2/3 (Request counting only)</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Mic className="size-4 text-primary" />
                  Audio/Speech
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Whisper, TTS (Request counting only)</p>
              </CardContent>
            </Card>
          </div>
        </section>

        <Callout type="default" title="Streaming Support">
          Yes, we support streaming (Server-Sent Events). We count tokens on the fly as they stream back to your client. It's like magic, but with more math.
        </Callout>
      </div>
    </div>
  );
}
