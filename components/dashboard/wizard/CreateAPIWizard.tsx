
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useUser } from '@/lib/hooks/use-user';
import { cn } from '@/lib/utils';
import { CreateAPIState, INITIAL_STATE } from './types';
import { ProviderSelection } from './ProviderSelection';
import { BasicConfiguration } from './BasicConfiguration';
import { RateLimitSetup } from './RateLimitSetup';
import { AdvancedSettings } from './AdvancedSettings';
import { ReviewAndCreate } from './ReviewAndCreate';

const STEPS = [
  { id: 1, title: 'Provider', description: 'Choose API type' },
  { id: 2, title: 'Basics', description: 'Name & Target' },
  { id: 3, title: 'Limits', description: 'Rate limiting' },
  { id: 4, title: 'Advanced', description: 'Security & CORS' },
  { id: 5, title: 'Review', description: 'Confirm details' },
];

export function CreateAPIWizard() {
  const router = useRouter();
  const { user } = useUser();
  const [state, setState] = useState<CreateAPIState>(INITIAL_STATE);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateState = (updates: Partial<CreateAPIState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  };

  const nextStep = () => {
    if (state.step < STEPS.length) {
      updateState({ step: state.step + 1 });
    }
  };

  const prevStep = () => {
    if (state.step > 1) {
      updateState({ step: state.step - 1 });
    }
  };

  const goToStep = (step: number) => {
    if (step < state.step) {
      updateState({ step });
    }
  };

  return (
    <div className="max-w-5xl mx-auto py-8 px-4">
      {/* Progress Indicator (remains same) */}
      <div className="mb-8">
        {/* ... */}
        <div className="flex items-center justify-between relative">
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-muted -z-10" />
          <div 
            className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-primary transition-all duration-500 -z-10"
            style={{ width: `${((state.step - 1) / (STEPS.length - 1)) * 100}%` }}
          />
          
          {STEPS.map((step) => {
            const isCompleted = step.id < state.step;
            const isCurrent = step.id === state.step;
            
            return (
              <div key={step.id} className="flex flex-col items-center gap-2 bg-background px-2">
                <button
                  onClick={() => goToStep(step.id)}
                  disabled={!isCompleted}
                  className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all",
                    isCompleted ? "bg-primary border-primary text-primary-foreground" :
                    isCurrent ? "border-primary text-primary" :
                    "border-muted text-muted-foreground bg-background"
                  )}
                >
                  {isCompleted ? <Check className="w-5 h-5" /> : step.id}
                </button>
                <div className="text-center hidden sm:block">
                  <div className={cn("text-sm font-medium", isCurrent ? "text-primary" : "text-foreground")}>
                    {step.title}
                  </div>
                  <div className="text-xs text-muted-foreground">{step.description}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Step Content */}
      <div className="min-h-[400px]">
        <AnimatePresence mode="wait">
          <motion.div
            key={state.step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
          >
            {state.step === 1 && (
              <ProviderSelection 
                state={state} 
                updateState={updateState} 
                onNext={nextStep} 
              />
            )}
            {state.step === 2 && (
              <BasicConfiguration
                state={state}
                updateState={updateState}
                onNext={nextStep}
                onBack={prevStep}
              />
            )}
            {state.step === 3 && (
              <RateLimitSetup
                state={state}
                updateState={updateState}
                onNext={nextStep}
                onBack={prevStep}
              />
            )}
            {state.step === 4 && (
              <AdvancedSettings
                state={state}
                updateState={updateState}
                onNext={nextStep}
                onBack={prevStep}
              />
            )}
            {state.step === 5 && (
              <ReviewAndCreate
                state={state}
                onBack={prevStep}
                goToStep={goToStep}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
