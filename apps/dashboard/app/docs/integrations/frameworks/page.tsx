import { Metadata } from "next";
import { Code, Box, Terminal } from "lucide-react";
import { CodeTabs } from "@/components/docs/CodeTabs";
import { Callout } from "@/components/docs/Callout";
import { DOCS_PROXY_BASE_URL } from "@/lib/docs/urls";

export const metadata: Metadata = {
  title: "Common Frameworks | RateGuard Documentation",
  description: "Integrate RateGuard with your favorite frameworks.",
};

export default function FrameworksPage() {
  return (
    <div className="min-h-screen bg-background space-y-12 max-w-5xl mx-auto">
      {/* Hero Section */}
      <div className="border-b bg-muted/30 pb-8 pt-12 rounded-xl px-8">
        <div className="flex items-start gap-4 mb-6">
          <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
            <Code className="size-8 text-primary" />
          </div>
          <div className="flex-1">
            <h1 className="text-4xl font-bold tracking-tight mb-3">
              Common Frameworks
            </h1>
            <p className="text-xl text-muted-foreground leading-relaxed">
              RateGuard plays nice with everyone. Here&apos;s how to hook us up.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-12 px-4">
        <Callout type="default" title="Standalone SDKs">
          If you are embedding RateGuard directly in your app, you do not need
          a dashboard API key or control-plane URL. Use the Python or Node SDK
          quickstarts for in-process enforcement.
        </Callout>

        {/* Next.js / React */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Box className="size-6 text-primary" />
            Next.js / React
          </h2>
          <p className="text-muted-foreground">
            Using the Vercel AI SDK? It&apos;s a match made in heaven.
          </p>
          
          <CodeTabs
            examples={[
              {
                label: "Vercel AI SDK",
                language: "typescript",
                code: `import { OpenAI } from 'openai';
import { OpenAIStream, StreamingTextResponse } from 'ai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: '${DOCS_PROXY_BASE_URL}/openai/v1',
  defaultHeaders: {
    'X-RG-Key': process.env.RATEGUARD_API_KEY
  }
});

export async function POST(req: Request) {
  const { messages } = await req.json();
  const response = await openai.chat.completions.create({
    model: 'gpt-4',
    stream: true,
    messages,
  });
  const stream = OpenAIStream(response);
  return new StreamingTextResponse(stream);
}`,
              },
            ]}
          />
        </section>

        {/* Python / LangChain */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Terminal className="size-6 text-primary" />
            Python / LangChain
          </h2>
          <p className="text-muted-foreground">
            Building a sophisticated RAG pipeline? We can protect it.
          </p>
          
          <CodeTabs
            examples={[
              {
                label: "LangChain",
                language: "python",
                code: `from langchain_openai import ChatOpenAI
import os

llm = ChatOpenAI(
    api_key=os.environ["OPENAI_API_KEY"],
    base_url="${DOCS_PROXY_BASE_URL}/openai/v1",
    default_headers={"X-RG-Key": os.environ["RATEGUARD_API_KEY"]},
    model="gpt-4"
)

response = llm.invoke("Tell me a joke about rate limiting.")
print(response.content)`,
              },
            ]}
          />
        </section>
      </div>
    </div>
  );
}
