import { EndpointSpec, API_BASE_URL } from "./types";

export const API_CREATE: EndpointSpec = {
  id: "api-create",
  method: "POST",
  path: "/api/v1/apis",
  category: "API Management",
  title: "Create API Configuration",
  description:
    "Create a new API configuration for proxying external APIs with rate limiting, CORS, and custom headers.",
  authentication: true,
  authType: "X-API-Key header",
  requestBody: {
    contentType: "application/json",
    schema: {
      name: "string (required) - Lowercase, hyphens only",
      target_url: "string (required) - Valid URL of target API",
      rate_limit_per_second: "number (required)",
      burst_size: "number (required)",
      rate_limit_per_hour: "number (optional)",
      rate_limit_per_day: "number (optional)",
      rate_limit_per_month: "number (optional)",
      allowed_origins: "array (optional) - CORS allowed origins",
      timeout_seconds: "number (optional) - Default: 30",
      retry_attempts: "number (optional) - Default: 0",
    },
    example: {
      name: "github-api",
      target_url: "https://api.github.com",
      rate_limit_per_second: 10,
      burst_size: 20,
      rate_limit_per_hour: 1000,
      rate_limit_per_day: 10000,
      allowed_origins: ["https://myapp.com"],
      timeout_seconds: 30,
    },
  },
  responses: [
    {
      status: 201,
      description: "API configuration created",
      example: {
        id: "7f3e8c10-d29b-41d4-a716-446655440001",
        name: "github-api",
        target_url: "https://api.github.com",
        rate_limit_per_second: 10,
        burst_size: 20,
        rate_limit_per_hour: 1000,
        rate_limit_per_day: 10000,
        enabled: true,
        proxy_url: "https://api.rateguard.io/v1/proxy/github-api",
        created_at: "2024-01-15T10:30:00Z",
      },
      headers: {
        "X-RateLimit-Limit": "100",
        "X-RateLimit-Remaining": "95",
        "X-RateLimit-Reset": "1705315800",
      },
    },
    {
      status: 400,
      description: "Invalid request body",
      example: {
        error: "Invalid request body",
        message:
          "Invalid API name format. Use lowercase letters and hyphens only",
        timestamp: "2024-01-15T10:30:00Z",
      },
    },
    {
      status: 401,
      description: "Unauthorized",
      example: {
        error: "Unauthorized",
        message: "Authentication required",
        timestamp: "2024-01-15T10:30:00Z",
      },
    },
    {
      status: 403,
      description: "API limit reached",
      example: {
        error: "API limit reached",
        message: "Maximum number of APIs reached for your plan",
        timestamp: "2024-01-15T10:30:00Z",
      },
    },
    {
      status: 409,
      description: "API name already exists",
      example: {
        error: "API configuration already exists",
        message: "An API with name 'github-api' already exists",
        timestamp: "2024-01-15T10:30:00Z",
      },
    },
  ],
  codeExamples: [
    {
      language: "javascript",
      label: "JavaScript",
      code: `const response = await fetch('${API_BASE_URL}/apis', {
  method: 'POST',
  headers: {
    'X-API-Key': 'rg_your_api_key_here',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: 'github-api',
    target_url: 'https://api.github.com',
    rate_limit_per_second: 10,
    burst_size: 20,
    rate_limit_per_hour: 1000,
    rate_limit_per_day: 10000
  })
});

const apiConfig = await response.json();
console.log('Proxy URL:', apiConfig.proxy_url);

// Check rate limit
const remaining = response.headers.get('X-RateLimit-Remaining');
console.log(\`Rate limit remaining: \${remaining}\`);`,
    },
    {
      language: "python",
      label: "Python",
      code: `import requests

headers = {
    'X-API-Key': 'rg_your_api_key_here',
    'Content-Type': 'application/json'
}

data = {
    'name': 'github-api',
    'target_url': 'https://api.github.com',
    'rate_limit_per_second': 10,
    'burst_size': 20,
    'rate_limit_per_hour': 1000,
    'rate_limit_per_day': 10000
}

response = requests.post(
    '${API_BASE_URL}/apis',
    headers=headers,
    json=data
)

api_config = response.json()
print(f"Proxy URL: {api_config['proxy_url']}")

# Check rate limit
remaining = response.headers.get('X-RateLimit-Remaining')
print(f"Rate limit remaining: {remaining}")`,
    },
    {
      language: "go",
      label: "Go",
      code: `type APIConfig struct {
    Name               string \`json:"name"\`
    TargetURL          string \`json:"target_url"\`
    RateLimitPerSecond int    \`json:"rate_limit_per_second"\`
    BurstSize          int    \`json:"burst_size"\`
    RateLimitPerHour   int    \`json:"rate_limit_per_hour"\`
    RateLimitPerDay    int    \`json:"rate_limit_per_day"\`
}

config := APIConfig{
    Name:               "github-api",
    TargetURL:          "https://api.github.com",
    RateLimitPerSecond: 10,
    BurstSize:          20,
    RateLimitPerHour:   1000,
    RateLimitPerDay:    10000,
}

jsonBody, _ := json.Marshal(config)
req, _ := http.NewRequest("POST", "${API_BASE_URL}/apis", bytes.NewBuffer(jsonBody))
req.Header.Set("X-API-Key", apiKey)
req.Header.Set("Content-Type", "application/json")

resp, _ := http.DefaultClient.Do(req)
defer resp.Body.Close()

// Check rate limit
remaining := resp.Header.Get("X-RateLimit-Remaining")
fmt.Printf("Rate limit remaining: %s\\n", remaining)`,
    },
    {
      language: "ruby",
      label: "Ruby",
      code: `require 'rest-client'
require 'json'

response = RestClient.post(
  '${API_BASE_URL}/apis',
  {
    name: 'github-api',
    target_url: 'https://api.github.com',
    rate_limit_per_second: 10,
    burst_size: 20,
    rate_limit_per_hour: 1000,
    rate_limit_per_day: 10000
  }.to_json,
  {
    'X-API-Key' => 'rg_your_api_key_here',
    content_type: :json
  }
)

api_config = JSON.parse(response.body)
puts "Proxy URL: #{api_config['proxy_url']}"

# Check rate limit
remaining = response.headers[:x_ratelimit_remaining]
puts "Rate limit remaining: #{remaining}"`,
    },
  ],
  errorScenarios: [
    {
      status: 400,
      error: "Invalid request body",
      description:
        "Missing required fields or invalid values. Name must be lowercase with hyphens only.",
      solution:
        "Ensure all required fields are present and valid. Use snake-case or kebab-case for API names.",
    },
    {
      status: 401,
      error: "Unauthorized",
      description: "Missing or invalid API key",
      solution: "Include valid X-API-Key header in request",
    },
    {
      status: 403,
      error: "API limit reached",
      description:
        "Maximum number of APIs reached for your plan (Free: 5, Pro: 50, Enterprise: unlimited)",
      solution: "Upgrade your plan or delete unused APIs",
    },
    {
      status: 409,
      error: "API configuration already exists",
      description: "An API with this name already exists in your account",
      solution: "Use a different name or update the existing configuration",
    },
  ],
  rateLimitHeaders: true,
};

export const API_LIST: EndpointSpec = {
  id: "api-list",
  method: "GET",
  path: "/api/v1/apis",
  category: "API Management",
  title: "List API Configurations",
  description: "List all API configurations for the authenticated user.",
  authentication: true,
  authType: "X-API-Key header",
  responses: [
    {
      status: 200,
      description: "List of API configurations",
      example: [
        {
          id: "7f3e8c10-d29b-41d4-a716-446655440001",
          name: "github-api",
          target_url: "https://api.github.com",
          rate_limit_per_second: 10,
          burst_size: 20,
          enabled: true,
          proxy_url: "https://api.rateguard.io/v1/proxy/github-api",
          created_at: "2024-01-15T10:30:00Z",
        },
        {
          id: "8a4f9d21-e39c-52e5-b827-557766551112",
          name: "weather-api",
          target_url: "https://api.weather.com",
          rate_limit_per_second: 5,
          burst_size: 10,
          enabled: true,
          proxy_url: "https://api.rateguard.io/v1/proxy/weather-api",
          created_at: "2024-01-14T09:15:00Z",
        },
      ],
      headers: {
        "X-RateLimit-Limit": "100",
        "X-RateLimit-Remaining": "99",
        "X-RateLimit-Reset": "1705315800",
      },
    },
  ],
  codeExamples: [
    {
      language: "javascript",
      label: "JavaScript",
      code: `const response = await fetch('${API_BASE_URL}/apis', {
  headers: { 'X-API-Key': 'rg_your_api_key_here' }
});

const apis = await response.json();
console.log(\`You have \${apis.length} APIs configured\`);

// Check rate limit
const remaining = response.headers.get('X-RateLimit-Remaining');
console.log(\`Rate limit remaining: \${remaining}\`);`,
    },
    {
      language: "python",
      label: "Python",
      code: `headers = {'X-API-Key': 'rg_your_api_key_here'}

response = requests.get('${API_BASE_URL}/apis', headers=headers)
apis = response.json()

print(f"You have {len(apis)} APIs configured")

remaining = response.headers.get('X-RateLimit-Remaining')
print(f"Rate limit remaining: {remaining}")`,
    },
    {
      language: "go",
      label: "Go",
      code: `req, _ := http.NewRequest("GET", "${API_BASE_URL}/apis", nil)
req.Header.Set("X-API-Key", apiKey)

resp, _ := http.DefaultClient.Do(req)
defer resp.Body.Close()

var apis []APIConfig
json.NewDecoder(resp.Body).Decode(&apis)

fmt.Printf("You have %d APIs configured\\n", len(apis))

remaining := resp.Header.Get("X-RateLimit-Remaining")
fmt.Printf("Rate limit remaining: %s\\n", remaining)`,
    },
    {
      language: "ruby",
      label: "Ruby",
      code: `response = RestClient.get(
  '${API_BASE_URL}/apis',
  { 'X-API-Key' => 'rg_your_api_key_here' }
)

apis = JSON.parse(response.body)
puts "You have #{apis.length} APIs configured"

remaining = response.headers[:x_ratelimit_remaining]
puts "Rate limit remaining: #{remaining}"`,
    },
  ],
  errorScenarios: [
    {
      status: 401,
      error: "Unauthorized",
      description: "Missing or invalid API key",
      solution: "Include valid X-API-Key header",
    },
    {
      status: 429,
      error: "Rate limit exceeded",
      description: "Too many requests in a short time period",
      solution: "Wait for rate limit to reset (check X-RateLimit-Reset header)",
    },
  ],
  rateLimitHeaders: true,
};

export const API_GET: EndpointSpec = {
  id: "api-get",
  method: "GET",
  path: "/api/v1/apis/:id",
  category: "API Management",
  title: "Get API Configuration",
  description: "Retrieve a specific API configuration by ID.",
  authentication: true,
  authType: "X-API-Key header",
  pathParams: [
    {
      name: "id",
      type: "string (UUID)",
      required: true,
      description: "API configuration ID",
      example: "7f3e8c10-d29b-41d4-a716-446655440001",
    },
  ],
  responses: [
    {
      status: 200,
      description: "API configuration details",
      example: {
        id: "7f3e8c10-d29b-41d4-a716-446655440001",
        user_id: "550e8400-e29b-41d4-a716-446655440000",
        name: "github-api",
        target_url: "https://api.github.com",
        rate_limit_per_second: 10,
        burst_size: 20,
        rate_limit_per_hour: 1000,
        rate_limit_per_day: 10000,
        rate_limit_per_month: 50000,
        enabled: true,
        allowed_origins: ["https://myapp.com"],
        timeout_seconds: 30,
        retry_attempts: 2,
        proxy_url: "https://api.rateguard.io/v1/proxy/github-api",
        created_at: "2024-01-15T10:30:00Z",
        updated_at: "2024-01-15T10:30:00Z",
      },
    },
    {
      status: 404,
      description: "API configuration not found",
      example: {
        error: "Not found",
        message: "API configuration not found",
        timestamp: "2024-01-15T10:30:00Z",
      },
    },
  ],
  codeExamples: [
    {
      language: "javascript",
      label: "JavaScript",
      code: `const apiId = '7f3e8c10-d29b-41d4-a716-446655440001';

const response = await fetch(\`${API_BASE_URL}/apis/\${apiId}\`, {
  headers: { 'X-API-Key': 'rg_your_api_key_here' }
});

const apiConfig = await response.json();
console.log('Target URL:', apiConfig.target_url);
console.log('Rate limit:', apiConfig.rate_limit_per_second, 'req/s');`,
    },
    {
      language: "python",
      label: "Python",
      code: `api_id = '7f3e8c10-d29b-41d4-a716-446655440001'
headers = {'X-API-Key': 'rg_your_api_key_here'}

response = requests.get(
    f'${API_BASE_URL}/apis/{api_id}',
    headers=headers
)

api_config = response.json()
print(f"Target URL: {api_config['target_url']}")
print(f"Rate limit: {api_config['rate_limit_per_second']} req/s")`,
    },
    {
      language: "go",
      label: "Go",
      code: `apiID := "7f3e8c10-d29b-41d4-a716-446655440001"

req, _ := http.NewRequest("GET", 
    "${API_BASE_URL}/apis/"+apiID, nil)
req.Header.Set("X-API-Key", apiKey)

resp, _ := http.DefaultClient.Do(req)
defer resp.Body.Close()

var config APIConfig
json.NewDecoder(resp.Body).Decode(&config)

fmt.Printf("Target URL: %s\\n", config.TargetURL)`,
    },
    {
      language: "ruby",
      label: "Ruby",
      code: `api_id = '7f3e8c10-d29b-41d4-a716-446655440001'

response = RestClient.get(
  "${API_BASE_URL}/apis/#{api_id}",
  { 'X-API-Key' => 'rg_your_api_key_here' }
)

api_config = JSON.parse(response.body)
puts "Target URL: #{api_config['target_url']}"
puts "Rate limit: #{api_config['rate_limit_per_second']} req/s"`,
    },
  ],
  errorScenarios: [
    {
      status: 400,
      error: "Invalid ID",
      description: "Invalid API configuration ID format (must be UUID)",
      solution: "Ensure the ID is a valid UUID format",
    },
    {
      status: 401,
      error: "Unauthorized",
      description: "Missing or invalid API key",
      solution: "Include valid X-API-Key header",
    },
    {
      status: 404,
      error: "Not found",
      description:
        "API configuration not found or doesn't belong to your account",
      solution: "Check the API ID is correct and belongs to your account",
    },
  ],
  rateLimitHeaders: true,
};

export const API_UPDATE: EndpointSpec = {
  id: "api-update",
  method: "PUT",
  path: "/api/v1/apis/:id",
  category: "API Management",
  title: "Update API Configuration",
  description:
    "Update an existing API configuration. All fields are optional; only provided fields will be updated.",
  authentication: true,
  authType: "X-API-Key header",
  pathParams: [
    {
      name: "id",
      type: "string (UUID)",
      required: true,
      description: "API configuration ID",
      example: "7f3e8c10-d29b-41d4-a716-446655440001",
    },
  ],
  requestBody: {
    contentType: "application/json",
    schema: {
      name: "string (optional)",
      target_url: "string (optional)",
      rate_limit_per_second: "number (optional)",
      burst_size: "number (optional)",
      rate_limit_per_hour: "number (optional)",
      rate_limit_per_day: "number (optional)",
      enabled: "boolean (optional)",
      allowed_origins: "array (optional)",
      timeout_seconds: "number (optional)",
    },
    example: {
      rate_limit_per_second: 20,
      burst_size: 40,
      enabled: true,
    },
  },
  responses: [
    {
      status: 200,
      description: "API configuration updated",
      example: {
        id: "7f3e8c10-d29b-41d4-a716-446655440001",
        name: "github-api",
        target_url: "https://api.github.com",
        rate_limit_per_second: 20,
        burst_size: 40,
        enabled: true,
        updated_at: "2024-01-15T11:00:00Z",
      },
    },
    {
      status: 404,
      description: "API configuration not found",
      example: {
        error: "Not found",
        message: "API configuration not found",
        timestamp: "2024-01-15T11:00:00Z",
      },
    },
  ],
  codeExamples: [
    {
      language: "javascript",
      label: "JavaScript",
      code: `const apiId = '7f3e8c10-d29b-41d4-a716-446655440001';

const response = await fetch(\`${API_BASE_URL}/apis/\${apiId}\`, {
  method: 'PUT',
  headers: {
    'X-API-Key': 'rg_your_api_key_here',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    rate_limit_per_second: 20,
    burst_size: 40,
    enabled: true
  })
});

const updated = await response.json();
console.log('Updated:', updated);`,
    },
    {
      language: "python",
      label: "Python",
      code: `api_id = '7f3e8c10-d29b-41d4-a716-446655440001'

response = requests.put(
    f'${API_BASE_URL}/apis/{api_id}',
    headers={
        'X-API-Key': 'rg_your_api_key_here',
        'Content-Type': 'application/json'
    },
    json={
        'rate_limit_per_second': 20,
        'burst_size': 40,
        'enabled': True
    }
)

updated = response.json()
print('Updated:', updated)`,
    },
    {
      language: "go",
      label: "Go",
      code: `updates := map[string]interface{}{
    "rate_limit_per_second": 20,
    "burst_size":            40,
    "enabled":               true,
}

jsonBody, _ := json.Marshal(updates)
req, _ := http.NewRequest("PUT", 
    "${API_BASE_URL}/apis/"+apiID,
    bytes.NewBuffer(jsonBody))
req.Header.Set("X-API-Key", apiKey)
req.Header.Set("Content-Type", "application/json")

resp, _ := http.DefaultClient.Do(req)
defer resp.Body.Close()`,
    },
    {
      language: "ruby",
      label: "Ruby",
      code: `response = RestClient.put(
  "${API_BASE_URL}/apis/#{api_id}",
  {
    rate_limit_per_second: 20,
    burst_size: 40,
    enabled: true
  }.to_json,
  {
    'X-API-Key' => 'rg_your_api_key_here',
    content_type: :json
  }
)

updated = JSON.parse(response.body)`,
    },
  ],
  errorScenarios: [
    {
      status: 400,
      error: "Invalid request body",
      description: "Invalid field values provided",
      solution: "Ensure all provided fields have valid values",
    },
    {
      status: 401,
      error: "Unauthorized",
      description: "Missing or invalid API key",
      solution: "Include valid X-API-Key header",
    },
    {
      status: 404,
      error: "Not found",
      description: "API configuration not found",
      solution: "Check the API ID is correct",
    },
    {
      status: 409,
      error: "Conflict",
      description: "An API with this name already exists",
      solution: "Use a different name",
    },
  ],
  rateLimitHeaders: true,
};

export const API_DELETE: EndpointSpec = {
  id: "api-delete",
  method: "DELETE",
  path: "/api/v1/apis/:id",
  category: "API Management",
  title: "Delete API Configuration",
  description:
    "Delete a specific API configuration. This action cannot be undone.",
  authentication: true,
  authType: "X-API-Key header",
  pathParams: [
    {
      name: "id",
      type: "string (UUID)",
      required: true,
      description: "API configuration ID",
      example: "7f3e8c10-d29b-41d4-a716-446655440001",
    },
  ],
  responses: [
    {
      status: 200,
      description: "API configuration deleted successfully",
      example: {
        message: "API configuration deleted successfully",
      },
    },
    {
      status: 404,
      description: "API configuration not found",
      example: {
        error: "Not found",
        message: "API configuration not found",
        timestamp: "2024-01-15T11:00:00Z",
      },
    },
  ],
  codeExamples: [
    {
      language: "javascript",
      label: "JavaScript",
      code: `const apiId = '7f3e8c10-d29b-41d4-a716-446655440001';

const response = await fetch(\`${API_BASE_URL}/apis/\${apiId}\`, {
  method: 'DELETE',
  headers: { 'X-API-Key': 'rg_your_api_key_here' }
});

if (response.ok) {
  console.log('API deleted successfully');
}`,
    },
    {
      language: "python",
      label: "Python",
      code: `api_id = '7f3e8c10-d29b-41d4-a716-446655440001'

response = requests.delete(
    f'${API_BASE_URL}/apis/{api_id}',
    headers={'X-API-Key': 'rg_your_api_key_here'}
)

if response.status_code == 200:
    print('API deleted successfully')`,
    },
    {
      language: "go",
      label: "Go",
      code: `req, _ := http.NewRequest("DELETE",
    "${API_BASE_URL}/apis/"+apiID, nil)
req.Header.Set("X-API-Key", apiKey)

resp, _ := http.DefaultClient.Do(req)
defer resp.Body.Close()

if resp.StatusCode == 200 {
    fmt.Println("API deleted successfully")
}`,
    },
    {
      language: "ruby",
      label: "Ruby",
      code: `RestClient.delete(
  "${API_BASE_URL}/apis/#{api_id}",
  { 'X-API-Key' => 'rg_your_api_key_here' }
)

puts 'API deleted successfully'`,
    },
  ],
  errorScenarios: [
    {
      status: 401,
      error: "Unauthorized",
      description: "Missing or invalid API key",
      solution: "Include valid X-API-Key header",
    },
    {
      status: 404,
      error: "Not found",
      description: "API configuration not found",
      solution: "Check the API ID is correct",
    },
  ],
  rateLimitHeaders: true,
};

export const API_ENDPOINTS = [
  API_CREATE,
  API_LIST,
  API_GET,
  API_UPDATE,
  API_DELETE,
];
