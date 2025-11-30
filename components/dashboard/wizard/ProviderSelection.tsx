
'use client';

import { Check, Lock, Zap } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { CreateAPIState, APIProvider } from './types';
import { useUser } from '@/lib/hooks/use-user';
import Link from 'next/link';

interface ProviderSelectionProps {
  state: CreateAPIState;
  updateState: (updates: Partial<CreateAPIState>) => void;
  onNext: () => void;
}

interface ProviderOption {
  id: APIProvider;
  name: string;
  description: string;
  icon?: string; // URL or component
  popular?: boolean;
  gated?: boolean;
}

const PROVIDERS: ProviderOption[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT-4, GPT-3.5, DALL-E, Whisper',
    popular: true,
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Claude 3 Opus, Sonnet, Haiku',
  },
  {
    id: 'google',
    name: 'Google AI',
    description: 'Gemini Pro, Gemini Ultra',
  },
  {
    id: 'cohere',
    name: 'Cohere',
    description: 'Command, Embed, Rerank',
  },
  {
    id: 'custom',
    name: 'Custom REST API',
    description: 'Any HTTP/HTTPS endpoint',
  },
];

export function ProviderSelection({ state, updateState, onNext }: ProviderSelectionProps) {
  const { hasAccess } = useUser();
  const isPro = hasAccess('pro');

  const handleSelect = (provider: APIProvider) => {
    updateState({ provider });
    // Auto-fill target URL and Name for known providers
    if (provider === 'openai') {
      updateState({ 
        target_url: 'https://api.openai.com/v1',
        name: 'My OpenAI API'
      });
    } else if (provider === 'anthropic') {
      updateState({ 
        target_url: 'https://api.anthropic.com/v1',
        name: 'My Anthropic API'
      });
    } else if (provider === 'google') {
      updateState({ 
        target_url: 'https://generativelanguage.googleapis.com/v1beta',
        name: 'My Gemini API'
      });
    } else if (provider === 'cohere') {
      updateState({ 
        target_url: 'https://api.cohere.ai/v1',
        name: 'My Cohere API'
      });
    } else if (provider === 'custom') {
      updateState({ target_url: '', name: '' });
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="text-center max-w-2xl mx-auto mb-8">
        <h2 className="text-2xl font-bold mb-2">Choose your API provider</h2>
        <p className="text-muted-foreground">
          Select the API you want to proxy and protect. We have pre-configured templates for popular AI providers.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {PROVIDERS.map((provider) => (
          <button
            key={provider.id}
            onClick={() => handleSelect(provider.id)}
            className={cn(
              "relative p-6 border-2 rounded-xl text-left transition-all hover:shadow-md group",
              state.provider === provider.id
                ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                : "border-muted hover:border-primary/50 bg-card"
            )}
          >
            {state.provider === provider.id && (
              <div className="absolute top-4 right-4 text-primary">
                <Check className="w-5 h-5" />
              </div>
            )}
            
            <div className="flex items-start gap-4">
              <div className={cn(
                "w-12 h-12 rounded-lg flex items-center justify-center text-2xl",
                state.provider === provider.id ? "bg-primary/10" : "bg-muted"
              )}>
                {provider.id === 'custom' ? <Zap className="w-6 h-6 text-primary" /> : 
                 provider.id === 'openai' ? '🤖' :
                 provider.id === 'anthropic' ? '🧠' :
                 provider.id === 'google' ? '🔍' : '⚡'}
              </div>
              
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-lg">{provider.name}</h3>
                  {provider.popular && (
                    <Badge variant="secondary" className="text-[10px] h-5">
                      Popular
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground leading-snug">
                  {provider.description}
                </p>
              </div>
            </div>
          </button>
        ))}

        {/* More providers (Pro+) */}
        <div className="p-6 border-2 border-dashed rounded-xl flex flex-col items-center justify-center text-center opacity-60 bg-muted/20">
          <Lock className="w-8 h-8 mb-2 text-muted-foreground" />
          <p className="text-sm font-medium">More Providers</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-[150px]">
            Upgrade to Pro for Stripe, Twilio, and more templates
          </p>
        </div>
      </div>

      <div className="flex justify-end pt-6">
        <Button size="lg" onClick={onNext} className="w-full sm:w-auto gap-2">
          Next Step
          <Check className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
