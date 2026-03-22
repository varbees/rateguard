// API configuration templates for popular services

export interface APITemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  config: {
    name: string;
    targetUrl: string;
    description: string;
    perSecond: number;
    burst: number;
    perHour: number;
    perDay: number;
    perMonth: number;
    timeoutSeconds: number;
    retryAttempts: number;
  };
}

export const API_TEMPLATES: APITemplate[] = [
  {
    id: "stripe",
    name: "Stripe",
    description: "Payment processing API",
    icon: "💳",
    config: {
      name: "stripe-api",
      targetUrl: "https://api.stripe.com/v1",
      description: "Stripe payment processing API for checkout flows",
      perSecond: 10,
      burst: 20,
      perHour: 1000,
      perDay: 10000,
      perMonth: 100000,
      timeoutSeconds: 30,
      retryAttempts: 1,
    },
  },
  {
    id: "openai",
    name: "OpenAI",
    description: "AI & Machine Learning API",
    icon: "🤖",
    config: {
      name: "openai-api",
      targetUrl: "https://api.openai.com/v1",
      description: "OpenAI API for GPT models and AI completions",
      perSecond: 5,
      burst: 10,
      perHour: 500,
      perDay: 5000,
      perMonth: 50000,
      timeoutSeconds: 60,
      retryAttempts: 2,
    },
  },
  {
    id: "gemini",
    name: "Google Gemini",
    description: "Gemini API",
    icon: "✨",
    config: {
      name: "gemini-api",
      targetUrl: "https://generativelanguage.googleapis.com/v1beta",
      description: "Google Gemini API for multimodal generation and chat",
      perSecond: 5,
      burst: 10,
      perHour: 500,
      perDay: 5000,
      perMonth: 50000,
      timeoutSeconds: 60,
      retryAttempts: 2,
    },
  },
  {
    id: "github",
    name: "GitHub",
    description: "Version control & collaboration",
    icon: "🐙",
    config: {
      name: "github-api",
      targetUrl: "https://api.github.com",
      description: "GitHub API for repositories, issues, and pull requests",
      perSecond: 15,
      burst: 30,
      perHour: 5000,
      perDay: 0,
      perMonth: 0,
      timeoutSeconds: 30,
      retryAttempts: 1,
    },
  },
  {
    id: "twilio",
    name: "Twilio",
    description: "SMS & Voice communications",
    icon: "📱",
    config: {
      name: "twilio-api",
      targetUrl: "https://api.twilio.com/2010-04-01",
      description: "Twilio API for sending SMS and voice calls",
      perSecond: 10,
      burst: 20,
      perHour: 1000,
      perDay: 10000,
      perMonth: 100000,
      timeoutSeconds: 30,
      retryAttempts: 1,
    },
  },
  {
    id: "sendgrid",
    name: "SendGrid",
    description: "Email delivery service",
    icon: "📧",
    config: {
      name: "sendgrid-api",
      targetUrl: "https://api.sendgrid.com/v3",
      description: "SendGrid API for transactional email delivery",
      perSecond: 10,
      burst: 20,
      perHour: 1000,
      perDay: 10000,
      perMonth: 100000,
      timeoutSeconds: 30,
      retryAttempts: 1,
    },
  },
  {
    id: "cohere",
    name: "Cohere",
    description: "AI language and embedding API",
    icon: "🧠",
    config: {
      name: "cohere-api",
      targetUrl: "https://api.cohere.ai/v2",
      description: "Cohere API for text generation and embeddings",
      perSecond: 10,
      burst: 20,
      perHour: 1000,
      perDay: 10000,
      perMonth: 100000,
      timeoutSeconds: 30,
      retryAttempts: 1,
    },
  },
  {
    id: "aws",
    name: "AWS API Gateway",
    description: "Amazon Web Services",
    icon: "☁️",
    config: {
      name: "aws-api",
      targetUrl: "https://your-api-id.execute-api.region.amazonaws.com/prod",
      description: "AWS API Gateway endpoint",
      perSecond: 20,
      burst: 40,
      perHour: 0,
      perDay: 0,
      perMonth: 0,
      timeoutSeconds: 30,
      retryAttempts: 1,
    },
  },
];

export type AuthType = "none" | "bearer" | "api_key" | "basic";

export function getDefaultConfig() {
  return {
    name: "",
    targetUrl: "",
    description: "",
    perSecond: 10,
    burst: 20,
    perHour: 1000,
    perDay: 10000,
    perMonth: 100000,
    timeoutSeconds: 30,
    retryAttempts: 1,
    corsOrigins: "",
    customHeaders: {} as Record<string, string>,
    enabled: true,
    authType: "none" as AuthType,
    authCredentials: {} as Record<string, string>,
  };
}
