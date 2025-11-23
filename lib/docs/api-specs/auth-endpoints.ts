import { EndpointSpec, API_BASE_URL } from "./types";

export const AUTH_SIGNUP: EndpointSpec = {
  id: "auth-signup",
  method: "POST",
  path: "/api/v1/auth/signup",
  category: "Authentication",
  title: "Sign Up",
  description:
    "Create a new user account with email and password. Returns user details and API key for immediate use.",
  authentication: false,
  requestBody: {
    contentType: "application/json",
    schema: {
      email: "string (required) - Valid email address",
      password: "string (required) - Minimum 8 characters",
      plan: "string (optional) - 'free', 'pro', or 'enterprise'. Default: 'free'",
    },
    example: {
      email: "user@example.com",
      password: "SecurePass123!",
      plan: "free",
    },
  },
  responses: [
    {
      status: 201,
      description: "User created successfully",
      example: {
        user: {
          id: "550e8400-e29b-41d4-a716-446655440000",
          email: "user@example.com",
          plan: "free",
          active: true,
          email_verified: false,
          created_at: "2024-01-15T10:30:00Z",
        },
        api_key:
          "rg_1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      },
    },
    {
      status: 400,
      description: "Invalid request body",
      example: {
        error: "Invalid request body",
        message: "Email is required",
        timestamp: "2024-01-15T10:30:00Z",
      },
    },
    {
      status: 409,
      description: "Email already exists",
      example: {
        error: "Email already exists",
        message: "An account with this email already exists",
        timestamp: "2024-01-15T10:30:00Z",
      },
    },
  ],
  codeExamples: [
    {
      language: "javascript",
      label: "JavaScript",
      code: `const response = await fetch('${API_BASE_URL}/auth/signup', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'SecurePass123!',
    plan: 'free'
  })
});

const { user, api_key } = await response.json();
console.log('API Key:', api_key);`,
    },
    {
      language: "python",
      label: "Python",
      code: `import requests

response = requests.post(
    '${API_BASE_URL}/auth/signup',
    json={
        'email': 'user@example.com',
        'password': 'SecurePass123!',
        'plan': 'free'
    }
)

data = response.json()
print(f"API Key: {data['api_key']}")`,
    },
    {
      language: "go",
      label: "Go",
      code: `body := map[string]string{
    "email":    "user@example.com",
    "password": "SecurePass123!",
    "plan":     "free",
}

jsonBody, _ := json.Marshal(body)
resp, _ := http.Post(
    "${API_BASE_URL}/auth/signup",
    "application/json",
    bytes.NewBuffer(jsonBody),
)
defer resp.Body.Close()

var result map[string]interface{}
json.NewDecoder(resp.Body).Decode(&result)
fmt.Println("API Key:", result["api_key"])`,
    },
    {
      language: "ruby",
      label: "Ruby",
      code: `require 'rest-client'
require 'json'

response = RestClient.post(
  '${API_BASE_URL}/auth/signup',
  {
    email: 'user@example.com',
    password: 'SecurePass123!',
    plan: 'free'
  }.to_json,
  { content_type: :json }
)

data = JSON.parse(response.body)
puts "API Key: #{data['api_key']}"`,
    },
  ],
  errorScenarios: [
    {
      status: 400,
      error: "Invalid request body",
      description:
        "Missing required fields (email, password) or invalid email format",
      solution:
        "Ensure email and password fields are present and valid. Password must be at least 8 characters.",
    },
    {
      status: 409,
      error: "Email already exists",
      description: "An account with this email already exists in the system",
      solution:
        "Use a different email address or try logging in with existing credentials",
    },
    {
      status: 500,
      error: "Internal server error",
      description: "Failed to create user account due to server error",
      solution: "Retry the request. If issue persists, contact support",
    },
  ],
  rateLimitHeaders: false,
};

export const AUTH_LOGIN: EndpointSpec = {
  id: "auth-login",
  method: "POST",
  path: "/api/v1/auth/login",
  category: "Authentication",
  title: "Login",
  description:
    "Authenticate user with email and password. Returns user details and API key.",
  authentication: false,
  requestBody: {
    contentType: "application/json",
    schema: {
      email: "string (required) - User email address",
      password: "string (required) - User password",
    },
    example: {
      email: "user@example.com",
      password: "SecurePass123!",
    },
  },
  responses: [
    {
      status: 200,
      description: "Login successful",
      example: {
        user: {
          id: "550e8400-e29b-41d4-a716-446655440000",
          email: "user@example.com",
          plan: "pro",
          active: true,
          last_login_at: "2024-01-15T10:30:00Z",
        },
        api_key:
          "rg_1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      },
    },
    {
      status: 401,
      description: "Invalid credentials",
      example: {
        error: "Invalid credentials",
        message: "Email or password is incorrect",
        timestamp: "2024-01-15T10:30:00Z",
      },
    },
    {
      status: 403,
      description: "Account disabled",
      example: {
        error: "Account disabled",
        message: "Your account has been disabled",
        timestamp: "2024-01-15T10:30:00Z",
      },
    },
  ],
  codeExamples: [
    {
      language: "javascript",
      label: "JavaScript",
      code: `const response = await fetch('${API_BASE_URL}/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'SecurePass123!'
  })
});

const { user, api_key } = await response.json();
// Store API key securely
localStorage.setItem('rateguard_api_key', api_key);`,
    },
    {
      language: "python",
      label: "Python",
      code: `import requests

response = requests.post(
    '${API_BASE_URL}/auth/login',
    json={
        'email': 'user@example.com',
        'password': 'SecurePass123!'
    }
)

data = response.json()
api_key = data['api_key']
# Store API key securely (environment variable, keychain, etc.)`,
    },
    {
      language: "go",
      label: "Go",
      code: `type LoginResponse struct {
    User   User   \`json:"user"\`
    APIKey string \`json:"api_key"\`
}

func login(email, password string) (*LoginResponse, error) {
    body := map[string]string{"email": email, "password": password}
    jsonBody, _ := json.Marshal(body)
    
    resp, err := http.Post("${API_BASE_URL}/auth/login",
        "application/json", bytes.NewBuffer(jsonBody))
    if err != nil {
        return nil, err
    }
    defer resp.Body.Close()
    
    var result LoginResponse
    json.NewDecoder(resp.Body).Decode(&result)
    return &result, nil
}`,
    },
    {
      language: "ruby",
      label: "Ruby",
      code: `response = RestClient.post(
  '${API_BASE_URL}/auth/login',
  { email: 'user@example.com', password: 'SecurePass123!' }.to_json,
  { content_type: :json }
)

data = JSON.parse(response.body)
api_key = data['api_key']
# Store API key securely`,
    },
  ],
  errorScenarios: [
    {
      status: 401,
      error: "Invalid credentials",
      description: "Email or password is incorrect",
      solution:
        "Check your credentials and try again. Use password reset if you've forgotten your password",
    },
    {
      status: 403,
      error: "Account disabled",
      description: "Account has been disabled by administrator",
      solution: "Contact support to reactivate your account",
    },
  ],
  rateLimitHeaders: false,
};

export const AUTH_REQUEST_RESET: EndpointSpec = {
  id: "auth-request-reset",
  method: "POST",
  path: "/api/v1/auth/request-reset",
  category: "Authentication",
  title: "Request Password Reset",
  description:
    "Send password reset email to user. Returns success message regardless of email existence for security.",
  authentication: false,
  requestBody: {
    contentType: "application/json",
    schema: {
      email: "string (required) - User email address",
    },
    example: {
      email: "user@example.com",
    },
  },
  responses: [
    {
      status: 200,
      description: "Reset email sent (if account exists)",
      example: {
        message:
          "If an account exists with this email, a password reset link has been sent",
      },
    },
  ],
  codeExamples: [
    {
      language: "javascript",
      label: "JavaScript",
      code: `const response = await fetch('${API_BASE_URL}/auth/request-reset', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'user@example.com' })
});

const data = await response.json();
console.log(data.message);`,
    },
    {
      language: "python",
      label: "Python",
      code: `response = requests.post(
    '${API_BASE_URL}/auth/request-reset',
    json={'email': 'user@example.com'}
)

print(response.json()['message'])`,
    },
    {
      language: "go",
      label: "Go",
      code: `body := map[string]string{"email": "user@example.com"}
jsonBody, _ := json.Marshal(body)

resp, _ := http.Post("${API_BASE_URL}/auth/request-reset",
    "application/json", bytes.NewBuffer(jsonBody))
defer resp.Body.Close()`,
    },
    {
      language: "ruby",
      label: "Ruby",
      code: `response = RestClient.post(
  '${API_BASE_URL}/auth/request-reset',
  { email: 'user@example.com' }.to_json,
  { content_type: :json }
)

puts JSON.parse(response.body)['message']`,
    },
  ],
  errorScenarios: [
    {
      status: 400,
      error: "Invalid request body",
      description: "Email field is missing or invalid",
      solution: "Provide a valid email address",
    },
  ],
  rateLimitHeaders: false,
};

export const AUTH_RESET_PASSWORD: EndpointSpec = {
  id: "auth-reset-password",
  method: "POST",
  path: "/api/v1/auth/reset-password",
  category: "Authentication",
  title: "Reset Password",
  description:
    "Reset user password with reset token received via email. Token is valid for 1 hour.",
  authentication: false,
  requestBody: {
    contentType: "application/json",
    schema: {
      token: "string (required) - Reset token from email",
      new_password: "string (required) - New password (min 8 characters)",
    },
    example: {
      token: "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6",
      new_password: "NewSecurePass456!",
    },
  },
  responses: [
    {
      status: 200,
      description: "Password reset successfully",
      example: {
        message: "Password has been reset successfully",
      },
    },
    {
      status: 401,
      description: "Invalid or expired token",
      example: {
        error: "Invalid token",
        message: "Password reset token is invalid or has expired",
        timestamp: "2024-01-15T10:30:00Z",
      },
    },
  ],
  codeExamples: [
    {
      language: "javascript",
      label: "JavaScript",
      code: `const response = await fetch('${API_BASE_URL}/auth/reset-password', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    token: resetToken,
    new_password: 'NewSecurePass456!'
  })
});

if (response.ok) {
  console.log('Password reset successful');
  // Redirect to login page
  window.location.href = '/login';
}`,
    },
    {
      language: "python",
      label: "Python",
      code: `response = requests.post(
    '${API_BASE_URL}/auth/reset-password',
    json={
        'token': reset_token,
        'new_password': 'NewSecurePass456!'
    }
)

if response.status_code == 200:
    print('Password reset successful')`,
    },
    {
      language: "go",
      label: "Go",
      code: `body := map[string]string{
    "token":        resetToken,
    "new_password": "NewSecurePass456!",
}

jsonBody, _ := json.Marshal(body)
resp, _ := http.Post("${API_BASE_URL}/auth/reset-password",
    "application/json", bytes.NewBuffer(jsonBody))`,
    },
    {
      language: "ruby",
      label: "Ruby",
      code: `response = RestClient.post(
  '${API_BASE_URL}/auth/reset-password',
  {
    token: reset_token,
    new_password: 'NewSecurePass456!'
  }.to_json,
  { content_type: :json }
)

puts 'Password reset successful'`,
    },
  ],
  errorScenarios: [
    {
      status: 401,
      error: "Invalid token",
      description: "Reset token is invalid or has expired (1 hour expiration)",
      solution: "Request a new password reset link",
    },
  ],
  rateLimitHeaders: false,
};

export const AUTH_ENDPOINTS = [
  AUTH_SIGNUP,
  AUTH_LOGIN,
  AUTH_REQUEST_RESET,
  AUTH_RESET_PASSWORD,
];
