export interface CodeExample {
  language: string;
  label: string;
  code: string;
}

export interface ApiExample {
  title: string;
  description: string;
  examples: CodeExample[];
}

// Base URL for the API
const API_BASE_URL = "https://api.rateguard.io/v1";

// Authentication examples
export const authenticationExamples: ApiExample = {
  title: "Basic Authentication",
  description: "Include your API key in the X-API-Key header for all requests",
  examples: [
    {
      language: "curl",
      label: "cURL",
      code: `curl -X GET "${API_BASE_URL}/health" \\
  -H "X-API-Key: rg_live_abc123xyz789"`,
    },
    {
      language: "javascript",
      label: "JavaScript (Fetch)",
      code: `const response = await fetch('${API_BASE_URL}/health', {
  method: 'GET',
  headers: {
    'X-API-Key': 'rg_live_abc123xyz789',
    'Content-Type': 'application/json'
  }
});

const data = await response.json();
console.log(data);`,
    },
    {
      language: "typescript",
      label: "TypeScript (Axios)",
      code: `import axios from 'axios';

const client = axios.create({
  baseURL: '${API_BASE_URL}',
  headers: {
    'X-API-Key': 'rg_live_abc123xyz789',
    'Content-Type': 'application/json'
  }
});

const { data } = await client.get('/health');
console.log(data);`,
    },
    {
      language: "python",
      label: "Python",
      code: `import requests

headers = {
    'X-API-Key': 'rg_live_abc123xyz789',
    'Content-Type': 'application/json'
}

response = requests.get('${API_BASE_URL}/health', headers=headers)
data = response.json()
print(data)`,
    },
    {
      language: "go",
      label: "Go",
      code: `package main

import (
    "fmt"
    "io"
    "net/http"
)

func main() {
    client := &http.Client{}
    req, _ := http.NewRequest("GET", "${API_BASE_URL}/health", nil)
    req.Header.Set("X-API-Key", "rg_live_abc123xyz789")
    req.Header.Set("Content-Type", "application/json")
    
    resp, err := client.Do(req)
    if err != nil {
        panic(err)
    }
    defer resp.Body.Close()
    
    body, _ := io.ReadAll(resp.Body)
    fmt.Println(string(body))
}`,
    },
    {
      language: "ruby",
      label: "Ruby",
      code: `require 'rest-client'
require 'json'

response = RestClient.get(
  '${API_BASE_URL}/health',
  { 
    'X-API-Key' => 'rg_live_abc123xyz789',
    'Content-Type' => 'application/json'
  }
)

data = JSON.parse(response.body)
puts data`,
    },
  ],
};

// Rate limiting example
export const rateLimitingExamples: ApiExample = {
  title: "Check Rate Limits",
  description: "Monitor your rate limit usage with the dedicated endpoint",
  examples: [
    {
      language: "curl",
      label: "cURL",
      code: `curl -X GET "${API_BASE_URL}/rate-limit/status" \\
  -H "X-API-Key: rg_live_abc123xyz789"`,
    },
    {
      language: "javascript",
      label: "JavaScript",
      code: `const checkRateLimit = async () => {
  try {
    const response = await fetch('${API_BASE_URL}/rate-limit/status', {
      headers: {
        'X-API-Key': 'rg_live_abc123xyz789'
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('Remaining requests:', data.remaining);
      console.log('Reset time:', data.reset);
    }
  } catch (error) {
    console.error('Error checking rate limit:', error);
  }
};

checkRateLimit();`,
    },
    {
      language: "typescript",
      label: "TypeScript",
      code: `interface RateLimitStatus {
  limit: number;
  remaining: number;
  reset: string;
}

const checkRateLimit = async (): Promise<RateLimitStatus> => {
  const response = await fetch('${API_BASE_URL}/rate-limit/status', {
    headers: {
      'X-API-Key': 'rg_live_abc123xyz789'
    }
  });
  
  if (!response.ok) {
    throw new Error(\`HTTP error! status: \${response.status}\`);
  }
  
  return response.json();
};

const status = await checkRateLimit();
console.log(status);`,
    },
    {
      language: "python",
      label: "Python",
      code: `import requests
from datetime import datetime

def check_rate_limit(api_key):
    headers = {'X-API-Key': api_key}
    response = requests.get('${API_BASE_URL}/rate-limit/status', headers=headers)
    
    if response.status_code == 200:
        data = response.json()
        print(f"Remaining: {data['remaining']}")
        print(f"Reset: {data['reset']}")
        return data
    else:
        raise Exception(f"Error: {response.status_code}")

check_rate_limit('rg_live_abc123xyz789')`,
    },
    {
      language: "go",
      label: "Go",
      code: `package main

import (
    "encoding/json"
    "fmt"
    "net/http"
)

type RateLimitStatus struct {
    Limit     int    \`json:"limit"\`
    Remaining int    \`json:"remaining"\`
    Reset     string \`json:"reset"\`
}

func checkRateLimit(apiKey string) (*RateLimitStatus, error) {
    client := &http.Client{}
    req, _ := http.NewRequest("GET", "${API_BASE_URL}/rate-limit/status", nil)
    req.Header.Set("X-API-Key", apiKey)
    
    resp, err := client.Do(req)
    if err != nil {
        return nil, err
    }
    defer resp.Body.Close()
    
    var status RateLimitStatus
    if err := json.NewDecoder(resp.Body).Decode(&status); err != nil {
        return nil, err
    }
    
    return &status, nil
}

func main() {
    status, _ := checkRateLimit("rg_live_abc123xyz789")
    fmt.Printf("Remaining: %d\\n", status.Remaining)
}`,
    },
    {
      language: "ruby",
      label: "Ruby",
      code: `require 'rest-client'
require 'json'

def check_rate_limit(api_key)
  response = RestClient.get(
    '${API_BASE_URL}/rate-limit/status',
    { 'X-API-Key' => api_key }
  )
  
  data = JSON.parse(response.body)
  puts "Remaining: #{data['remaining']}"
  puts "Reset: #{data['reset']}"
  data
rescue RestClient::ExceptionWithResponse => e
  puts "Error: #{e.response.code}"
end

check_rate_limit('rg_live_abc123xyz789')`,
    },
  ],
};

// Error handling examples
export const errorHandlingExamples: ApiExample = {
  title: "Error Handling",
  description: "Handle different error responses appropriately",
  examples: [
    {
      language: "curl",
      label: "cURL",
      code: `# Missing API Key (401)
curl -X GET "${API_BASE_URL}/health"

# Invalid API Key (403)
curl -X GET "${API_BASE_URL}/health" \\
  -H "X-API-Key: invalid_key"

# Rate Limit Exceeded (429)
curl -X GET "${API_BASE_URL}/health" \\
  -H "X-API-Key: rg_live_abc123xyz789"`,
    },
    {
      language: "javascript",
      label: "JavaScript",
      code: `const makeRequest = async (apiKey) => {
  try {
    const response = await fetch('${API_BASE_URL}/health', {
      headers: {
        'X-API-Key': apiKey
      }
    });
    
    // Handle different status codes
    switch (response.status) {
      case 200:
        return await response.json();
      case 401:
        throw new Error('Missing or invalid API key');
      case 403:
        throw new Error('Forbidden: API key lacks permissions');
      case 429:
        const retryAfter = response.headers.get('Retry-After');
        throw new Error(\`Rate limit exceeded. Retry after \${retryAfter}s\`);
      default:
        throw new Error(\`HTTP error! status: \${response.status}\`);
    }
  } catch (error) {
    console.error('Request failed:', error.message);
    throw error;
  }
};`,
    },
    {
      language: "typescript",
      label: "TypeScript",
      code: `class RateGuardError extends Error {
  constructor(
    message: string, 
    public statusCode: number,
    public retryAfter?: number
  ) {
    super(message);
    this.name = 'RateGuardError';
  }
}

const makeRequest = async (apiKey: string): Promise<any> => {
  const response = await fetch('${API_BASE_URL}/health', {
    headers: { 'X-API-Key': apiKey }
  });
  
  if (!response.ok) {
    const retryAfter = response.headers.get('Retry-After');
    
    switch (response.status) {
      case 401:
        throw new RateGuardError(
          'Missing or invalid API key', 
          401
        );
      case 403:
        throw new RateGuardError(
          'Forbidden: API key lacks permissions', 
          403
        );
      case 429:
        throw new RateGuardError(
          'Rate limit exceeded', 
          429,
          retryAfter ? parseInt(retryAfter) : undefined
        );
      default:
        throw new RateGuardError(
          'Unknown error', 
          response.status
        );
    }
  }
  
  return response.json();
};`,
    },
    {
      language: "python",
      label: "Python",
      code: `import requests
import time

class RateGuardError(Exception):
    def __init__(self, message, status_code, retry_after=None):
        super().__init__(message)
        self.status_code = status_code
        self.retry_after = retry_after

def make_request(api_key, max_retries=3):
    headers = {'X-API-Key': api_key}
    
    for attempt in range(max_retries):
        try:
            response = requests.get('${API_BASE_URL}/health', headers=headers)
            
            if response.status_code == 200:
                return response.json()
            elif response.status_code == 401:
                raise RateGuardError('Missing or invalid API key', 401)
            elif response.status_code == 403:
                raise RateGuardError('Forbidden', 403)
            elif response.status_code == 429:
                retry_after = int(response.headers.get('Retry-After', 60))
                if attempt < max_retries - 1:
                    time.sleep(retry_after)
                    continue
                raise RateGuardError('Rate limit exceeded', 429, retry_after)
            else:
                raise RateGuardError(f'HTTP {response.status_code}', response.status_code)
                
        except requests.exceptions.RequestException as e:
            raise RateGuardError(f'Request failed: {str(e)}', 0)
    
    raise RateGuardError('Max retries exceeded', 0)`,
    },
    {
      language: "go",
      label: "Go",
      code: `package main

import (
    "errors"
    "fmt"
    "net/http"
    "strconv"
    "time"
)

type RateGuardError struct {
    Message    string
    StatusCode int
    RetryAfter int
}

func (e *RateGuardError) Error() string {
    return fmt.Sprintf("%s (status: %d)", e.Message, e.StatusCode)
}

func makeRequest(apiKey string, maxRetries int) error {
    client := &http.Client{}
    
    for attempt := 0; attempt < maxRetries; attempt++ {
        req, _ := http.NewRequest("GET", "${API_BASE_URL}/health", nil)
        req.Header.Set("X-API-Key", apiKey)
        
        resp, err := client.Do(req)
        if err != nil {
            return err
        }
        defer resp.Body.Close()
        
        switch resp.StatusCode {
        case 200:
            return nil
        case 401:
            return &RateGuardError{"Missing or invalid API key", 401, 0}
        case 403:
            return &RateGuardError{"Forbidden", 403, 0}
        case 429:
            retryAfter, _ := strconv.Atoi(resp.Header.Get("Retry-After"))
            if attempt < maxRetries-1 {
                time.Sleep(time.Duration(retryAfter) * time.Second)
                continue
            }
            return &RateGuardError{"Rate limit exceeded", 429, retryAfter}
        default:
            return &RateGuardError{
                fmt.Sprintf("HTTP %d", resp.StatusCode), 
                resp.StatusCode, 
                0,
            }
        }
    }
    
    return errors.New("max retries exceeded")
}`,
    },
    {
      language: "ruby",
      label: "Ruby",
      code: `require 'rest-client'
require 'json'

class RateGuardError < StandardError
  attr_reader :status_code, :retry_after
  
  def initialize(message, status_code, retry_after = nil)
    super(message)
    @status_code = status_code
    @retry_after = retry_after
  end
end

def make_request(api_key, max_retries = 3)
  max_retries.times do |attempt|
    begin
      response = RestClient.get(
        '${API_BASE_URL}/health',
        { 'X-API-Key' => api_key }
      )
      
      return JSON.parse(response.body)
      
    rescue RestClient::Unauthorized
      raise RateGuardError.new('Missing or invalid API key', 401)
    rescue RestClient::Forbidden
      raise RateGuardError.new('Forbidden', 403)
    rescue RestClient::TooManyRequests => e
      retry_after = e.response.headers[:retry_after].to_i
      raise RateGuardError.new('Rate limit exceeded', 429, retry_after) if attempt == max_retries - 1
      sleep(retry_after)
    rescue RestClient::ExceptionWithResponse => e
      raise RateGuardError.new("HTTP #{e.response.code}", e.response.code)
    end
  end
  
  raise RateGuardError.new('Max retries exceeded', 0)
end`,
    },
  ],
};

// API Key rotation example
export const keyRotationExamples: ApiExample = {
  title: "Rotating API Keys",
  description: "Safely rotate your API keys without downtime",
  examples: [
    {
      language: "curl",
      label: "cURL",
      code: `# Generate a new API key
curl -X POST "${API_BASE_URL}/api-keys" \\
  -H "X-API-Key: rg_live_current_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Production Key (New)",
    "permissions": ["read", "write"]
  }'

# Revoke old API key
curl -X DELETE "${API_BASE_URL}/api-keys/rg_live_old_key" \\
  -H "X-API-Key: rg_live_current_key"`,
    },
    {
      language: "javascript",
      label: "JavaScript",
      code: `// Step 1: Generate new API key
const generateNewKey = async (currentKey) => {
  const response = await fetch('${API_BASE_URL}/api-keys', {
    method: 'POST',
    headers: {
      'X-API-Key': currentKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: 'Production Key (New)',
      permissions: ['read', 'write']
    })
  });
  
  const { apiKey } = await response.json();
  return apiKey;
};

// Step 2: Update your application to use new key
// Step 3: Revoke old key after migration

const revokeOldKey = async (currentKey, oldKey) => {
  await fetch(\`${API_BASE_URL}/api-keys/\${oldKey}\`, {
    method: 'DELETE',
    headers: {
      'X-API-Key': currentKey
    }
  });
};

// Safe rotation workflow
const rotateApiKey = async (oldKey) => {
  const newKey = await generateNewKey(oldKey);
  console.log('New key generated:', newKey);
  
  // Wait for migration to complete
  console.log('Update your application with the new key');
  console.log('After migration is complete, revoke the old key');
  
  // After confirming migration
  // await revokeOldKey(newKey, oldKey);
};`,
    },
    {
      language: "typescript",
      label: "TypeScript",
      code: `interface ApiKey {
  id: string;
  key: string;
  name: string;
  permissions: string[];
  createdAt: string;
}

class ApiKeyManager {
  private baseUrl = '${API_BASE_URL}';
  
  async generateKey(
    currentKey: string, 
    name: string, 
    permissions: string[]
  ): Promise<ApiKey> {
    const response = await fetch(\`\${this.baseUrl}/api-keys\`, {
      method: 'POST',
      headers: {
        'X-API-Key': currentKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name, permissions })
    });
    
    if (!response.ok) {
      throw new Error('Failed to generate API key');
    }
    
    return response.json();
  }
  
  async revokeKey(currentKey: string, keyToRevoke: string): Promise<void> {
    const response = await fetch(
      \`\${this.baseUrl}/api-keys/\${keyToRevoke}\`, 
      {
        method: 'DELETE',
        headers: { 'X-API-Key': currentKey }
      }
    );
    
    if (!response.ok) {
      throw new Error('Failed to revoke API key');
    }
  }
  
  async rotateKey(oldKey: string, name: string): Promise<ApiKey> {
    const newKey = await this.generateKey(
      oldKey, 
      name, 
      ['read', 'write']
    );
    
    console.log('New key generated. Update your application.');
    return newKey;
  }
}

const manager = new ApiKeyManager();
await manager.rotateKey('rg_live_old_key', 'Production Key (New)');`,
    },
    {
      language: "python",
      label: "Python",
      code: `import requests
from typing import List, Dict

class ApiKeyManager:
    def __init__(self, base_url: str = '${API_BASE_URL}'):
        self.base_url = base_url
    
    def generate_key(
        self, 
        current_key: str, 
        name: str, 
        permissions: List[str]
    ) -> Dict:
        response = requests.post(
            f'{self.base_url}/api-keys',
            headers={'X-API-Key': current_key},
            json={'name': name, 'permissions': permissions}
        )
        response.raise_for_status()
        return response.json()
    
    def revoke_key(self, current_key: str, key_to_revoke: str):
        response = requests.delete(
            f'{self.base_url}/api-keys/{key_to_revoke}',
            headers={'X-API-Key': current_key}
        )
        response.raise_for_status()
    
    def rotate_key(self, old_key: str, name: str) -> Dict:
        new_key = self.generate_key(
            old_key, 
            name, 
            ['read', 'write']
        )
        
        print(f"New key generated: {new_key['key']}")
        print("Update your application before revoking the old key")
        
        return new_key

# Usage
manager = ApiKeyManager()
new_key = manager.rotate_key('rg_live_old_key', 'Production Key (New)')`,
    },
    {
      language: "go",
      label: "Go",
      code: `package main

import (
    "bytes"
    "encoding/json"
    "fmt"
    "net/http"
)

type ApiKey struct {
    ID          string   \`json:"id"\`
    Key         string   \`json:"key"\`
    Name        string   \`json:"name"\`
    Permissions []string \`json:"permissions"\`
    CreatedAt   string   \`json:"createdAt"\`
}

type ApiKeyManager struct {
    BaseURL string
}

func (m *ApiKeyManager) GenerateKey(
    currentKey, name string, 
    permissions []string,
) (*ApiKey, error) {
    body, _ := json.Marshal(map[string]interface{}{
        "name":        name,
        "permissions": permissions,
    })
    
    req, _ := http.NewRequest(
        "POST", 
        m.BaseURL+"/api-keys", 
        bytes.NewBuffer(body),
    )
    req.Header.Set("X-API-Key", currentKey)
    req.Header.Set("Content-Type", "application/json")
    
    client := &http.Client{}
    resp, err := client.Do(req)
    if err != nil {
        return nil, err
    }
    defer resp.Body.Close()
    
    var apiKey ApiKey
    json.NewDecoder(resp.Body).Decode(&apiKey)
    return &apiKey, nil
}

func (m *ApiKeyManager) RevokeKey(currentKey, keyToRevoke string) error {
    req, _ := http.NewRequest(
        "DELETE", 
        fmt.Sprintf("%s/api-keys/%s", m.BaseURL, keyToRevoke), 
        nil,
    )
    req.Header.Set("X-API-Key", currentKey)
    
    client := &http.Client{}
    _, err := client.Do(req)
    return err
}

func main() {
    manager := &ApiKeyManager{BaseURL: "${API_BASE_URL}"}
    newKey, _ := manager.GenerateKey(
        "rg_live_old_key", 
        "Production Key (New)", 
        []string{"read", "write"},
    )
    fmt.Printf("New key: %s\\n", newKey.Key)
}`,
    },
    {
      language: "ruby",
      label: "Ruby",
      code: `require 'rest-client'
require 'json'

class ApiKeyManager
  def initialize(base_url = '${API_BASE_URL}')
    @base_url = base_url
  end
  
  def generate_key(current_key, name, permissions)
    response = RestClient.post(
      "#{@base_url}/api-keys",
      { name: name, permissions: permissions }.to_json,
      {
        'X-API-Key' => current_key,
        'Content-Type' => 'application/json'
      }
    )
    JSON.parse(response.body)
  end
  
  def revoke_key(current_key, key_to_revoke)
    RestClient.delete(
      "#{@base_url}/api-keys/#{key_to_revoke}",
      { 'X-API-Key' => current_key }
    )
  end
  
  def rotate_key(old_key, name)
    new_key = generate_key(old_key, name, ['read', 'write'])
    
    puts "New key generated: #{new_key['key']}"
    puts "Update your application before revoking the old key"
    
    new_key
  end
end

# Usage
manager = ApiKeyManager.new
new_key = manager.rotate_key('rg_live_old_key', 'Production Key (New)')`,
    },
  ],
};

// Response examples
export const responseExamples = {
  success: {
    status: 200,
    body: {
      success: true,
      data: {
        message: "Request successful",
        timestamp: "2024-01-15T10:30:00Z",
      },
    },
  },
  unauthorized: {
    status: 401,
    body: {
      error: "Unauthorized",
      message: "Missing or invalid API key",
      code: "INVALID_API_KEY",
    },
  },
  forbidden: {
    status: 403,
    body: {
      error: "Forbidden",
      message: "API key lacks required permissions",
      code: "INSUFFICIENT_PERMISSIONS",
    },
  },
  rateLimitExceeded: {
    status: 429,
    body: {
      error: "Too Many Requests",
      message: "Rate limit exceeded",
      code: "RATE_LIMIT_EXCEEDED",
      retryAfter: 60,
    },
  },
};

// Geo-Currency examples
export const geoCurrencyExamples: ApiExample = {
  title: "Geo-Currency Detection",
  description: "Detect user location and currency from IP address",
  examples: [
    {
      language: "curl",
      label: "cURL",
      code: `curl -X GET "${API_BASE_URL}/geo/currency" \\
  -H "X-API-Key: rg_live_abc123xyz789" \\
  -H "X-Forwarded-For: 203.0.113.1"`,
    },
    {
      language: "javascript",
      label: "JavaScript",
      code: `const getCurrency = async (ip) => {
  const response = await fetch('${API_BASE_URL}/geo/currency', {
    headers: {
      'X-API-Key': 'rg_live_abc123xyz789',
      'X-Forwarded-For': ip
    }
  });
  
  const data = await response.json();
  console.log(\`Currency: \${data.currency} (\${data.symbol})\`);
  return data;
};`,
    },
    {
      language: "python",
      label: "Python",
      code: `import requests

def get_currency(ip_address):
    headers = {
        'X-API-Key': 'rg_live_abc123xyz789',
        'X-Forwarded-For': ip_address
    }
    response = requests.get('${API_BASE_URL}/geo/currency', headers=headers)
    return response.json()

info = get_currency('203.0.113.1')
print(f"Currency: {info['currency']}")`,
    },
    {
      language: "go",
      label: "Go",
      code: `package main

import (
    "fmt"
    "net/http"
    "io/ioutil"
)

func main() {
    client := &http.Client{}
    req, _ := http.NewRequest("GET", "${API_BASE_URL}/geo/currency", nil)
    req.Header.Set("X-API-Key", "rg_live_abc123xyz789")
    req.Header.Set("X-Forwarded-For", "203.0.113.1")
    
    resp, _ := client.Do(req)
    defer resp.Body.Close()
    
    body, _ := ioutil.ReadAll(resp.Body)
    fmt.Println(string(body))
}`,
    },
  ],
};

// Payment Gateway examples
export const paymentGatewayExamples: ApiExample = {
  title: "Initiate Payment",
  description: "Create a checkout session based on user's currency",
  examples: [
    {
      language: "curl",
      label: "cURL",
      code: `curl -X POST "${API_BASE_URL}/payments/checkout" \\
  -H "X-API-Key: rg_live_abc123xyz789" \\
  -H "Content-Type: application/json" \\
  -d '{
    "plan_id": "plan_pro_monthly",
    "currency": "INR"
  }'`,
    },
    {
      language: "javascript",
      label: "JavaScript",
      code: `const createCheckout = async (planId, currency) => {
  const response = await fetch('${API_BASE_URL}/payments/checkout', {
    method: 'POST',
    headers: {
      'X-API-Key': 'rg_live_abc123xyz789',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ plan_id: planId, currency })
  });
  
  const { checkout_url } = await response.json();
  window.location.href = checkout_url;
};`,
    },
    {
      language: "python",
      label: "Python",
      code: `import requests

def create_checkout(plan_id, currency):
    response = requests.post(
        '${API_BASE_URL}/payments/checkout',
        headers={'X-API-Key': 'rg_live_abc123xyz789'},
        json={'plan_id': plan_id, 'currency': currency}
    )
    return response.json()['checkout_url']

url = create_checkout('plan_pro_monthly', 'USD')
print(f"Checkout URL: {url}")`,
    },
  ],
};

// Plan Enforcement examples
export const planEnforcementExamples: ApiExample = {
  title: "Check Plan Status",
  description: "Verify if a user has access to a specific feature",
  examples: [
    {
      language: "curl",
      label: "cURL",
      code: `curl -X POST "${API_BASE_URL}/plans/check-feature" \\
  -H "X-API-Key: rg_live_abc123xyz789" \\
  -H "Content-Type: application/json" \\
  -d '{
    "feature": "custom_domains"
  }'`,
    },
    {
      language: "javascript",
      label: "JavaScript",
      code: `const checkFeatureAccess = async (feature) => {
  const response = await fetch('${API_BASE_URL}/plans/check-feature', {
    method: 'POST',
    headers: {
      'X-API-Key': 'rg_live_abc123xyz789',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ feature })
  });
  
  const { allowed, upgrade_required } = await response.json();
  if (!allowed) {
    console.log('Upgrade required:', upgrade_required);
  }
  return allowed;
};`,
    },
    {
      language: "typescript",
      label: "TypeScript",
      code: `interface FeatureCheck {
  allowed: boolean;
  upgrade_required?: boolean;
  current_plan: string;
}

const checkFeature = async (feature: string): Promise<boolean> => {
  const response = await fetch('${API_BASE_URL}/plans/check-feature', {
    method: 'POST',
    headers: {
      'X-API-Key': 'rg_live_abc123xyz789',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ feature })
  });
  
  const data: FeatureCheck = await response.json();
  return data.allowed;
};`,
    },
  ],
};

// Queue Observability examples
export const queueObservabilityExamples: ApiExample = {
  title: "Get Queue Metrics",
  description: "Fetch real-time metrics for your request queues",
  examples: [
    {
      language: "curl",
      label: "cURL",
      code: `curl -X GET "${API_BASE_URL}/observability/queue/metrics" \\
  -H "X-API-Key: rg_live_abc123xyz789"`,
    },
    {
      language: "javascript",
      label: "JavaScript",
      code: `const getQueueMetrics = async () => {
  const response = await fetch('${API_BASE_URL}/observability/queue/metrics', {
    headers: { 'X-API-Key': 'rg_live_abc123xyz789' }
  });
  
  const metrics = await response.json();
  console.log('Queue Depth:', metrics.queues.standard.depth);
  console.log('Active Workers:', metrics.queues.standard.workers_active);
};`,
    },
    {
      language: "python",
      label: "Python",
      code: `import requests

def get_queue_metrics():
    response = requests.get(
        '${API_BASE_URL}/observability/queue/metrics',
        headers={'X-API-Key': 'rg_live_abc123xyz789'}
    )
    data = response.json()
    for queue_name, stats in data['queues'].items():
        print(f"{queue_name}: {stats['depth']} pending")

get_queue_metrics()`,
    },
    {
      language: "go",
      label: "Go",
      code: `package main

import (
    "encoding/json"
    "fmt"
    "net/http"
)

func main() {
    client := &http.Client{}
    req, _ := http.NewRequest("GET", "${API_BASE_URL}/observability/queue/metrics", nil)
    req.Header.Set("X-API-Key", "rg_live_abc123xyz789")
    
    resp, _ := client.Do(req)
    defer resp.Body.Close()
    
    var data map[string]interface{}
    json.NewDecoder(resp.Body).Decode(&data)
    fmt.Printf("System Load: %v\\n", data["system_load"])
}`,
    },
  ],
};

// All examples grouped
export const allExamples = {
  authentication: authenticationExamples,
  rateLimiting: rateLimitingExamples,
  errorHandling: errorHandlingExamples,
  keyRotation: keyRotationExamples,
  geoCurrency: geoCurrencyExamples,
  paymentGateways: paymentGatewayExamples,
  planEnforcement: planEnforcementExamples,
  queueObservability: queueObservabilityExamples,
};
