export interface CodeExample {
  language: string;
  label: string;
  code: string;
}

export interface RateLimitExample {
  title: string;
  description: string;
  examples: CodeExample[];
}

const API_BASE_URL = "https://api.rateguard.io/v1";

// Configure rate limits
export const configureRateLimitsExamples: RateLimitExample = {
  title: "Configure Rate Limits",
  description: "Set up multi-tier rate limits for your API",
  examples: [
    {
      language: "curl",
      label: "cURL",
      code: `curl -X POST "${API_BASE_URL}/apis/config" \\
  -H "X-API-Key: rg_live_abc123xyz789" \\
  -H "Content-Type: application/json" \\
  -d '{
    "rate_limits": {
      "per_second": 10,
      "burst": 20,
      "per_hour": 1000,
      "per_day": 10000,
      "per_month": 100000
    }
  }'`,
    },
    {
      language: "javascript",
      label: "JavaScript",
      code: `const configureRateLimits = async () => {
  const response = await fetch('${API_BASE_URL}/apis/config', {
    method: 'POST',
    headers: {
      'X-API-Key': 'rg_live_abc123xyz789',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      rate_limits: {
        per_second: 10,
        burst: 20,
        per_hour: 1000,
        per_day: 10000,
        per_month: 100000
      }
    })
  });

  return await response.json();
};`,
    },
    {
      language: "typescript",
      label: "TypeScript",
      code: `interface RateLimitConfig {
  per_second: number;
  burst: number;
  per_hour: number;
  per_day: number;
  per_month: number;
}

const configureRateLimits = async (
  limits: RateLimitConfig
): Promise<void> => {
  const response = await fetch('${API_BASE_URL}/apis/config', {
    method: 'POST',
    headers: {
      'X-API-Key': 'rg_live_abc123xyz789',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ rate_limits: limits })
  });

  if (!response.ok) {
    throw new Error(\`Failed: \${response.status}\`);
  }
};`,
    },
    {
      language: "python",
      label: "Python",
      code: `import requests

def configure_rate_limits(config):
    headers = {
        'X-API-Key': 'rg_live_abc123xyz789',
        'Content-Type': 'application/json'
    }
    
    response = requests.post(
        '${API_BASE_URL}/apis/config',
        headers=headers,
        json={'rate_limits': config}
    )
    
    response.raise_for_status()
    return response.json()`,
    },
    {
      language: "go",
      label: "Go",
      code: `type RateLimitConfig struct {
    PerSecond int \`json:"per_second"\`
    Burst     int \`json:"burst"\`
    PerHour   int \`json:"per_hour"\`
    PerDay    int \`json:"per_day"\`
    PerMonth  int \`json:"per_month"\`
}

func configureRateLimits(config RateLimitConfig) error {
    body, _ := json.Marshal(map[string]interface{}{
        "rate_limits": config,
    })
    
    req, _ := http.NewRequest("POST", 
        "${API_BASE_URL}/apis/config", 
        bytes.NewBuffer(body))
    req.Header.Set("X-API-Key", "rg_live_abc123xyz789")
    
    client := &http.Client{}
    resp, err := client.Do(req)
    defer resp.Body.Close()
    
    return err
}`,
    },
  ],
};

// Read rate limit headers
export const readHeadersExamples: RateLimitExample = {
  title: "Read Rate Limit Headers",
  description: "Parse rate limit information from response headers",
  examples: [
    {
      language: "javascript",
      label: "JavaScript",
      code: `const checkRateLimitHeaders = async () => {
  const response = await fetch('${API_BASE_URL}/health', {
    headers: { 'X-API-Key': 'rg_live_abc123xyz789' }
  });

  const rateLimits = {
    second: {
      limit: parseInt(response.headers.get('X-RateLimit-Limit-Second')),
      remaining: parseInt(response.headers.get('X-RateLimit-Remaining-Second'))
    },
    hour: {
      limit: parseInt(response.headers.get('X-RateLimit-Limit-Hour')),
      remaining: parseInt(response.headers.get('X-RateLimit-Remaining-Hour')),
      reset: parseInt(response.headers.get('X-RateLimit-Reset-Hour'))
    }
  };

  if (rateLimits.second.remaining < 2) {
    console.warn('⚠️ Approaching per-second limit!');
  }

  return rateLimits;
};`,
    },
    {
      language: "typescript",
      label: "TypeScript",
      code: `interface TierLimit {
  limit: number;
  remaining: number;
  reset?: number;
}

interface RateLimitInfo {
  second: TierLimit;
  hour: TierLimit;
  day: TierLimit;
}

const parseRateLimitHeaders = (
  headers: Headers
): RateLimitInfo => {
  return {
    second: {
      limit: parseInt(headers.get('X-RateLimit-Limit-Second') || '0'),
      remaining: parseInt(headers.get('X-RateLimit-Remaining-Second') || '0')
    },
    hour: {
      limit: parseInt(headers.get('X-RateLimit-Limit-Hour') || '0'),
      remaining: parseInt(headers.get('X-RateLimit-Remaining-Hour') || '0'),
      reset: parseInt(headers.get('X-RateLimit-Reset-Hour') || '0')
    },
    day: {
      limit: parseInt(headers.get('X-RateLimit-Limit-Day') || '0'),
      remaining: parseInt(headers.get('X-RateLimit-Remaining-Day') || '0')
    }
  };
};`,
    },
    {
      language: "python",
      label: "Python",
      code: `from dataclasses import dataclass

@dataclass
class RateLimitInfo:
    limit: int
    remaining: int
    reset: int = None

def parse_rate_limit_headers(headers):
    return {
        'second': RateLimitInfo(
            limit=int(headers.get('X-RateLimit-Limit-Second', 0)),
            remaining=int(headers.get('X-RateLimit-Remaining-Second', 0))
        ),
        'hour': RateLimitInfo(
            limit=int(headers.get('X-RateLimit-Limit-Hour', 0)),
            remaining=int(headers.get('X-RateLimit-Remaining-Hour', 0)),
            reset=int(headers.get('X-RateLimit-Reset-Hour', 0))
        )
    }`,
    },
    {
      language: "go",
      label: "Go",
      code: `type TierLimit struct {
    Limit     int
    Remaining int
    Reset     int
}

func parseRateLimitHeaders(headers http.Header) map[string]TierLimit {
    parseInt := func(key string) int {
        val, _ := strconv.Atoi(headers.Get(key))
        return val
    }

    return map[string]TierLimit{
        "second": {
            Limit:     parseInt("X-RateLimit-Limit-Second"),
            Remaining: parseInt("X-RateLimit-Remaining-Second"),
        },
        "hour": {
            Limit:     parseInt("X-RateLimit-Limit-Hour"),
            Remaining: parseInt("X-RateLimit-Remaining-Hour"),
            Reset:     parseInt("X-RateLimit-Reset-Hour"),
        },
    }
}`,
    },
  ],
};

// Exponential backoff
export const exponentialBackoffExamples: RateLimitExample = {
  title: "Implement Exponential Backoff",
  description:
    "Retry requests with exponential backoff when hitting rate limits",
  examples: [
    {
      language: "javascript",
      label: "JavaScript",
      code: `const fetchWithRetry = async (url, options = {}, maxRetries = 5) => {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const response = await fetch(url, options);

    if (response.status === 429) {
      const delay = Math.min(1000 * Math.pow(2, attempt), 32000);
      const retryAfter = response.headers.get('Retry-After');
      const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : delay;

      console.log(\`Rate limited. Retrying in \${waitTime / 1000}s...\`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      continue;
    }

    return response;
  }

  throw new Error('Max retries exceeded');
};`,
    },
    {
      language: "typescript",
      label: "TypeScript",
      code: `class RateLimitedClient {
  async fetchWithRetry<T>(
    endpoint: string,
    maxRetries = 5
  ): Promise<T> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const response = await fetch(\`\${this.baseUrl}\${endpoint}\`, {
        headers: { 'X-API-Key': this.apiKey }
      });

      if (response.status === 429) {
        const delay = Math.min(
          1000 * Math.pow(2, attempt),
          32000
        );
        
        console.warn(\`Retry \${attempt + 1}/\${maxRetries}\`);
        await this.sleep(delay);
        continue;
      }

      return response.json();
    }

    throw new Error('Max retries exceeded');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}`,
    },
    {
      language: "python",
      label: "Python",
      code: `import requests
import time

class RateLimitedClient:
    def fetch_with_retry(self, endpoint, max_retries=5):
        for attempt in range(max_retries):
            response = self.session.get(
                f'{self.base_url}{endpoint}'
            )
            
            if response.status_code == 429:
                retry_after = response.headers.get('Retry-After')
                wait_time = int(retry_after) if retry_after else min(2 ** attempt, 32)
                
                print(f"Rate limited. Retry in {wait_time}s...")
                time.sleep(wait_time)
                continue
            
            response.raise_for_status()
            return response.json()
        
        raise Exception('Max retries exceeded')`,
    },
    {
      language: "go",
      label: "Go",
      code: `func (c *RateLimitedClient) FetchWithRetry(endpoint string) (*http.Response, error) {
    for attempt := 0; attempt < c.MaxRetries; attempt++ {
        req, _ := http.NewRequest("GET", c.BaseURL+endpoint, nil)
        req.Header.Set("X-API-Key", c.APIKey)

        resp, err := c.Client.Do(req)
        if err != nil {
            time.Sleep(time.Duration(math.Pow(2, float64(attempt))) * time.Second)
            continue
        }

        if resp.StatusCode == 429 {
            waitTime := time.Duration(math.Min(math.Pow(2, float64(attempt)), 32)) * time.Second
            fmt.Printf("Rate limited. Retry in %v...\\n", waitTime)
            resp.Body.Close()
            time.Sleep(waitTime)
            continue
        }

        return resp, nil
    }

    return nil, fmt.Errorf("max retries exceeded")
}`,
    },
  ],
};

// Handle 429 errors
export const handle429Examples: RateLimitExample = {
  title: "Handle 429 Errors Gracefully",
  description: "Proper error handling for rate limit exceeded responses",
  examples: [
    {
      language: "javascript",
      label: "JavaScript",
      code: `const handleRateLimitError = (response) => {
  if (response.status === 429) {
    const retryAfter = response.headers.get('Retry-After');
    const resetTime = response.headers.get('X-RateLimit-Reset-Second');
    
    console.error('❌ Rate limit exceeded!');
    console.error(\`⏱️  Retry after: \${retryAfter}s\`);
    
    if (resetTime) {
      const resetDate = new Date(parseInt(resetTime) * 1000);
      console.error(\`🔄 Resets at: \${resetDate.toLocaleTimeString()}\`);
    }
    
    return {
      error: true,
      retryAfter: parseInt(retryAfter) || 60,
      message: 'Rate limit exceeded'
    };
  }
  
  return { error: false };
};`,
    },
    {
      language: "typescript",
      label: "TypeScript",
      code: `class RateLimitException extends Error {
  retryAfter: number;
  resetTime?: Date;

  constructor(message: string, retryAfter: number, resetTime?: number) {
    super(message);
    this.name = 'RateLimitException';
    this.retryAfter = retryAfter;
    if (resetTime) {
      this.resetTime = new Date(resetTime * 1000);
    }
  }
}

const makeRequest = async (endpoint: string): Promise<any> => {
  const response = await fetch(endpoint, {
    headers: { 'X-API-Key': 'rg_live_abc123xyz789' }
  });

  if (response.status === 429) {
    const retryAfter = parseInt(response.headers.get('Retry-After') || '60');
    const resetTime = response.headers.get('X-RateLimit-Reset-Second');

    throw new RateLimitException(
      'Rate limit exceeded',
      retryAfter,
      resetTime ? parseInt(resetTime) : undefined
    );
  }

  return response.json();
};`,
    },
    {
      language: "python",
      label: "Python",
      code: `class RateLimitException(Exception):
    def __init__(self, message, retry_after, reset_time=None):
        super().__init__(message)
        self.retry_after = retry_after
        self.reset_time = reset_time

def make_request(endpoint):
    response = requests.get(
        f'{API_BASE_URL}{endpoint}',
        headers={'X-API-Key': 'rg_live_abc123xyz789'}
    )
    
    if response.status_code == 429:
        retry_after = int(response.headers.get('Retry-After', 60))
        reset_time = response.headers.get('X-RateLimit-Reset-Second')
        
        raise RateLimitException(
            'Rate limit exceeded',
            retry_after,
            int(reset_time) if reset_time else None
        )
    
    response.raise_for_status()
    return response.json()`,
    },
    {
      language: "go",
      label: "Go",
      code: `type RateLimitError struct {
    Message    string
    RetryAfter int
    ResetTime  *time.Time
}

func (e *RateLimitError) Error() string {
    return e.Message
}

func makeRequest(endpoint string) ([]byte, error) {
    req, _ := http.NewRequest("GET", baseURL+endpoint, nil)
    req.Header.Set("X-API-Key", "rg_live_abc123xyz789")

    resp, err := client.Do(req)
    if err != nil {
        return nil, err
    }
    defer resp.Body.Close()

    if resp.StatusCode == 429 {
        retryAfter, _ := strconv.Atoi(resp.Header.Get("Retry-After"))
        return nil, &RateLimitError{
            Message:    "Rate limit exceeded",
            RetryAfter: retryAfter,
        }
    }

    return io.ReadAll(resp.Body)
}`,
    },
  ],
};

// Per-user rate limit tracking
export const perUserTrackingExamples: RateLimitExample = {
  title: "Per-User Rate Limit Tracking",
  description: "Track rate limits on a per-user basis",
  examples: [
    {
      language: "javascript",
      label: "JavaScript",
      code: `class UserRateLimiter {
  constructor() {
    this.userLimits = new Map();
  }

  trackRequest(userId, response) {
    const limits = {
      second: {
        limit: parseInt(response.headers.get('X-RateLimit-Limit-Second')),
        remaining: parseInt(response.headers.get('X-RateLimit-Remaining-Second'))
      },
      hour: {
        limit: parseInt(response.headers.get('X-RateLimit-Limit-Hour')),
        remaining: parseInt(response.headers.get('X-RateLimit-Remaining-Hour'))
      }
    };

    this.userLimits.set(userId, {
      limits,
      lastUpdated: Date.now()
    });

    return limits;
  }

  canMakeRequest(userId) {
    const userLimit = this.userLimits.get(userId);
    if (!userLimit) return true;

    return userLimit.limits.second.remaining > 0;
  }
}`,
    },
    {
      language: "typescript",
      label: "TypeScript",
      code: `interface UserLimitData {
  limits: RateLimitInfo;
  lastUpdated: number;
}

class UserRateLimiter {
  private userLimits: Map<string, UserLimitData> = new Map();

  trackRequest(userId: string, headers: Headers): void {
    const limits = this.parseHeaders(headers);

    this.userLimits.set(userId, {
      limits,
      lastUpdated: Date.now()
    });
  }

  canMakeRequest(userId: string): boolean {
    const userLimit = this.userLimits.get(userId);
    if (!userLimit) return true;

    return userLimit.limits.second.remaining > 0;
  }

  getUserLimits(userId: string): UserLimitData | undefined {
    return this.userLimits.get(userId);
  }
}`,
    },
    {
      language: "python",
      label: "Python",
      code: `from typing import Dict, Optional
from datetime import datetime

class UserRateLimiter:
    def __init__(self):
        self.user_limits: Dict[str, dict] = {}

    def track_request(self, user_id: str, headers: dict):
        limits = {
            'second': {
                'limit': int(headers.get('X-RateLimit-Limit-Second', 0)),
                'remaining': int(headers.get('X-RateLimit-Remaining-Second', 0))
            },
            'hour': {
                'limit': int(headers.get('X-RateLimit-Limit-Hour', 0)),
                'remaining': int(headers.get('X-RateLimit-Remaining-Hour', 0))
            }
        }

        self.user_limits[user_id] = {
            'limits': limits,
            'last_updated': datetime.now()
        }

    def can_make_request(self, user_id: str) -> bool:
        user_limit = self.user_limits.get(user_id)
        if not user_limit:
            return True

        return user_limit['limits']['second']['remaining'] > 0`,
    },
    {
      language: "go",
      label: "Go",
      code: `type UserLimitData struct {
    Limits      RateLimitInfo
    LastUpdated time.Time
}

type UserRateLimiter struct {
    userLimits map[string]*UserLimitData
    mu         sync.RWMutex
}

func NewUserRateLimiter() *UserRateLimiter {
    return &UserRateLimiter{
        userLimits: make(map[string]*UserLimitData),
    }
}

func (u *UserRateLimiter) TrackRequest(userID string, headers http.Header) {
    limits := parseRateLimitHeaders(headers)

    u.mu.Lock()
    defer u.mu.Unlock()

    u.userLimits[userID] = &UserLimitData{
        Limits:      limits,
        LastUpdated: time.Now(),
    }
}

func (u *UserRateLimiter) CanMakeRequest(userID string) bool {
    u.mu.RLock()
    defer u.mu.RUnlock()

    userLimit, exists := u.userLimits[userID]
    if !exists {
        return true
    }

    return userLimit.Limits["second"].Remaining > 0
}`,
    },
  ],
};
