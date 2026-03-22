
export type APIProvider = 'openai' | 'anthropic' | 'google' | 'cohere' | 'custom';

export interface CreateAPIState {
  step: number;
  provider: APIProvider;
  name: string;
  target_url: string;
  api_key?: string;
  rate_limit_per_second: number;
  burst_size: number;
  rate_limit_per_hour?: number;
  rate_limit_per_day?: number;
  rate_limit_per_month?: number;
  allowed_origins: string[];
  custom_headers: Record<string, string>;
  auth_type: 'none' | 'bearer' | 'api_key' | 'basic';
  auth_credentials?: Record<string, string>;
}

export const INITIAL_STATE: CreateAPIState = {
  step: 1,
  provider: 'custom',
  name: '',
  target_url: '',
  rate_limit_per_second: 10,
  burst_size: 20,
  allowed_origins: [],
  custom_headers: {},
  auth_type: 'none',
};
