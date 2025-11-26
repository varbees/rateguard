"use client";

import * as React from "react";
import { Metadata } from "next";
import {
  Lock,
  Shield,
  Key,
  AlertTriangle,
  CheckCircle2,
  Code2,
  Database,
  Eye,
  EyeOff,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/docs/Callout";
import { CodeTabs } from "@/components/docs/CodeTabs";

// export const metadata: Metadata = {
//   title: "Secure Credential Management | RateGuard Documentation",
//   description:
//     "Store and manage API credentials securely with AES-256-GCM encryption. Automatic credential injection, rotation support, and zero-exposure architecture.",
// };

export default function SecureCredentialsPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <div className="border-b bg-linear-to-b from-muted/50 to-background">
        <div className="container max-w-5xl mx-auto px-6 py-16">
          <div className="flex items-start gap-4 mb-6">
            <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
              <Lock className="size-8 text-primary" />
            </div>
            <div className="flex-1">
              <h1 className="text-4xl font-bold tracking-tight mb-3">
                Secure Credential Management
              </h1>
              <p className="text-xl text-muted-foreground leading-relaxed">
                Store API keys, tokens, and credentials with military-grade
                AES-256-GCM encryption. Your users never see or manage secrets—
                RateGuard handles everything securely.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-8">
            {[
              {
                icon: Shield,
                color: "text-chart-1",
                name: "AES-256-GCM",
                desc: "Military-grade encryption at rest",
              },
              {
                icon: Key,
                color: "text-chart-2",
                name: "Auto-Injection",
                desc: "Credentials injected automatically",
              },
              {
                icon: EyeOff,
                color: "text-primary",
                name: "Zero Exposure",
                desc: "Users never see raw credentials",
              },
              {
                icon: Database,
                color: "text-chart-3",
                name: "Encrypted Storage",
                desc: "PostgreSQL with encrypted binary",
              },
            ].map((feature) => (
              <Card key={feature.name} className="border-2">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <feature.icon className={`size-4 ${feature.color}`} />
                    <CardTitle className="text-sm">{feature.name}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">{feature.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container max-w-5xl mx-auto px-6 py-12 space-y-16">
        {/* Overview */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <Shield className="size-6 text-primary" />
            <h2 className="text-3xl font-bold">How It Works</h2>
          </div>

          <p className="text-muted-foreground mb-6 leading-relaxed">
            RateGuard implements a zero-exposure credential management system.
            API keys and tokens are encrypted before storage and automatically
            injected into proxied requests. Your users configure APIs through
            the dashboard without ever seeing the actual credentials in logs or responses.
          </p>

          <Callout type="default" title="Encryption Architecture">
            <p className="mb-2">
              All credentials are encrypted using <strong>AES-256-GCM</strong> with a
              unique encryption key stored securely as an environment variable.
            </p>
            <ul className="ml-4 space-y-1">
              <li>• <strong>At Rest</strong>: Encrypted binary stored in PostgreSQL</li>
              <li>• <strong>In Transit</strong>: HTTPS/TLS 1.3 for all API calls</li>
              <li>• <strong>In Use</strong>: Decrypted in-memory only when needed</li>
            </ul>
          </Callout>

          <Callout type="warning" title="Encryption Key Required">
            RateGuard <strong>will not start</strong> without the{" "}
            <code className="text-sm">ENCRYPTION_KEY</code> environment variable.
            This prevents accidental storage of plaintext credentials.
          </Callout>
        </section>

        {/* Supported Auth Types */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <Key className="size-6 text-primary" />
            <h2 className="text-3xl font-bold">Supported Authentication Methods</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Bearer Token</CardTitle>
                <CardDescription>OAuth 2.0 / JWT tokens</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-3">
                  Automatically adds <code className="text-xs">Authorization: Bearer TOKEN</code>
                </p>
                <pre className="text-xs bg-muted p-2 rounded">
                  {`{
  "auth_type": "bearer",
  "auth_credentials": {
    "token": "sk_live_..."
  }
}`}
                </pre>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">API Key</CardTitle>
                <CardDescription>Header or Query based</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-3">
                  Custom header name with API key value
                </p>
                <pre className="text-xs bg-muted p-2 rounded">
                  {`{
  "auth_type": "api_key",
  "auth_credentials": {
    "header_name": "X-API-Key",
    "api_key": "abc123..."
  }
}`}
                </pre>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Basic Auth</CardTitle>
                <CardDescription>Username + Password</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-3">
                  Base64 encoded username:password
                </p>
                <pre className="text-xs bg-muted p-2 rounded">
                  {`{
  "auth_type": "basic",
  "auth_credentials": {
    "username": "user",
    "password": "pass123"
  }
}`}
                </pre>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Custom</CardTitle>
                <CardDescription>Any header combinations</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-3">
                  Multiple custom headers with secret values
                </p>
                <pre className="text-xs bg-muted p-2 rounded">
                  {`{
  "auth_type": "none",
  "custom_headers": {
    "X-Client-ID": "client_123",
    "X-Secret": "encrypted..."
  }
}`}
                </pre>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Configuration */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <Code2 className="size-6 text-primary" />
            <h2 className="text-3xl font-bold">Storing Credentials</h2>
          </div>

          <CodeTabs
            examples={[
                {
                  language: "typescript",
                  label: "TypeScript",
                  code: `// Create API configuration with credentials
async function createAPIWithCredentials() {
  const response = await fetch('/api/v1/apis', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': \`Bearer \${token}\`,
    },
    body: JSON.stringify({
      name: 'stripe-api',
      target_url: 'https://api.stripe.com/v1',
      rate_limit_per_second: 10,
      burst_size: 20,
      auth_type: 'bearer',
      auth_credentials: {
        token: 'sk_live_51234567890abcd...',
      },
    }),
  });

  const api = await response.json();
  console.log('API created:', api.id);
  
  // Note: Credentials are NOT returned in the response
  // They are encrypted and stored securely
}`,
                },
                {
                  language: "go",
                  label: "Go (Backend Encryption)",
                  code: `// CreateAPIConfig handles API configuration creation
func (s *APIConfigStore) CreateAPIConfig(ctx context.Context, config *models.APIConfig) error {
    // Validate encryption is enabled
    if s.encryptor == nil && config.AuthCredentials != nil {
        return fmt.Errorf("cannot store credentials: encryption not enabled")
    }
    
    var encryptedCreds []byte
    var err error
    
    // Encrypt credentials if provided
    if config.AuthCredentials != nil && len(config.AuthCredentials) > 0 {
        encryptedCreds, err = s.encryptor.Encrypt(config.AuthCredentials)
        if err != nil {
            return fmt.Errorf("failed to encrypt credentials: %w", err)
        }
    }
    
    // Store in database with encrypted credentials
    query := \`
        INSERT INTO api_configs (
            id, user_id, name, target_url, auth_type, auth_credentials,
            rate_limit_per_second, burst_size, enabled
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    \`
    
    _, err = s.db.ExecContext(
        ctx, query,
        config.ID, config.UserID, config.Name, config.TargetURL,
        config.AuthType, encryptedCreds, // ← Stored as encrypted binary
        config.RateLimitPerSecond, config.BurstSize, config.Enabled,
    )
    
    return err
}`,
                },
                {
                  language: "javascript",
                  label: "JavaScript (cURL equivalent)",
                  code: `// Using fetch to create API with credentials
fetch('https://api.rateguard.io/api/v1/apis', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_TOKEN',
  },
  body: JSON.stringify({
    name: 'openai-api',
    target_url: 'https://api.openai.com/v1',
    rate_limit_per_second: 50,
    burst_size: 100,
    auth_type: 'bearer',
    auth_credentials: {
      token: 'sk-proj-...',  // ← Encrypted automatically
    },
  }),
})
  .then((res) => res.json())
  .then((api) => {
    console.log('Created:', api.id);
    // api.auth_credentials will be undefined in response
  });`,
                },
              ]
            }
            defaultLanguage="typescript"
          />
        </section>

        {/* Credential Injection */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <Shield className="size-6 text-primary" />
            <h2 className="text-3xl font-bold">Automatic Credential Injection</h2>
          </div>

          <p className="text-muted-foreground mb-6 leading-relaxed">
            When a request passes through the RateGuard proxy, credentials are
            automatically decrypted and injected into the upstream request headers.
            The client never handles or sees the raw credentials.
          </p>

          <CodeTabs
            examples={[
                {
                  language: "go",
                  label: "Proxy Credential Injection",
                  code: `// injectAuthCredentials adds authentication to the proxied request
func (p *ProxyService) injectAuthCredentials(
    req *http.Request,
    apiConfig *models.APIConfig,
) error {
    // Skip if no authentication required
    if apiConfig.AuthType == "none" {
        return nil
    }
    
    // Decrypt credentials on-the-fly
    if apiConfig.AuthCredentials == nil {
        return fmt.Errorf("auth required but no credentials stored")
    }
    
    switch apiConfig.AuthType {
    case "bearer":
        // Extract token from decrypted credentials
        token, ok := apiConfig.AuthCredentials["token"].(string)
        if !ok {
            return fmt.Errorf("missing bearer token")
        }
        req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", token))
        
    case "api_key":
        headerName := apiConfig.AuthCredentials["header_name"].(string)
        apiKey := apiConfig.AuthCredentials["api_key"].(string)
        req.Header.Set(headerName, apiKey)
        
    case "basic":
        username := apiConfig.AuthCredentials["username"].(string)
        password := apiConfig.AuthCredentials["password"].(string)
        auth := base64.StdEncoding.EncodeToString(
            []byte(fmt.Sprintf("%s:%s", username, password)),
        )
        req.Header.Set("Authorization", fmt.Sprintf("Basic %s", auth))
        
    default:
        return fmt.Errorf("unsupported auth type: %s", apiConfig.AuthType)
    }
    
    logger.Debug("Injected authentication credentials",
        zap.String("api", apiConfig.Name),
        zap.String("auth_type", apiConfig.AuthType),
    )
    
    return nil
}`,
                },
                {
                  language: "typescript",
                  label: "Client Usage (No Credentials)",
                  code: `// Client makes request through proxy WITHOUT providing credentials
async function makeAuthenticatedRequest() {
  // Note: No Authorization header needed!
  // RateGuard handles authentication automatically
  const response = await fetch(
    'https://proxy.rateguard.io/proxy/stripe-api/customers',
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        // No auth headers - RateGuard injects them
      },
    }
  );
  
  const customers = await response.json();
  return customers;
}

// Behind the scenes, RateGuard:
// 1. Receives request to /proxy/stripe-api/customers
// 2. Looks up 'stripe-api' configuration
// 3. Decrypts stored credentials in-memory
// 4. Injects Authorization: Bearer sk_live_...
// 5. Forwards to https://api.stripe.com/v1/customers
// 6. Returns response to client

// Client never sees or handles the Stripe API key!`,
                },
              ]
            }
            defaultLanguage="go"
          />
        </section>

        {/* Credential Rotation */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <Key className="size-6 text-primary" />
            <h2 className="text-3xl font-bold">Credential Rotation</h2>
          </div>

          <p className="text-muted-foreground mb-6 leading-relaxed">
            Update credentials when rotating API keys or tokens. The update
            endpoint automatically re-encrypts new credentials.
          </p>

          <CodeTabs
            examples={[
                {
                  language: "typescript",
                  label: "TypeScript",
                  code: `// Update API credentials (e.g., after key rotation)
async function rotateAPICredentials(apiId: string) {
  const response = await fetch(\`/api/v1/apis/\${apiId}\`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': \`Bearer \${token}\`,
    },
    body: JSON.stringify({
      auth_credentials: {
        token: 'sk_live_NEW_TOKEN_HERE',  // ← New credentials
      },
    }),
  });

  if (!response.ok) {
    throw new Error('Failed torotate credentials');
  }

  console.log('Credentials rotated successfully');
  // Old credentials are securely discarded
  // New credentials are encrypted and stored
}`,
                },
                {
                  language: "go",
                  label: "Go (Backend)",
                  code: `// UpdateAPIConfig handles credential rotation
func (s *APIConfigStore) UpdateAPIConfig(
    ctx context.Context,
    apiID uuid.UUID,
    updates *models.APIConfig,
) error {
    var encryptedCreds []byte
    
    // Re-encrypt new credentials if provided
    if updates.AuthCredentials != nil {
        var err error
        encryptedCreds, err = s.encryptor.Encrypt(updates.AuthCredentials)
        if err != nil {
            return fmt.Errorf("failed to encrypt new credentials: %w", err)
        }
    }
    
    query := \`
        UPDATE api_configs
        SET auth_credentials = $1, updated_at = NOW()
        WHERE id = $2
    \`
    
    _, err := s.db.ExecContext(ctx, query, encryptedCreds, apiID)
    
    logger.Info("Credentials rotated",
        zap.String("api_id", apiID.String()),
    )
    
    return err
}`,
                },
              ]
            }
            defaultLanguage="typescript"
          />
        </section>

        {/* Security Best Practices */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <CheckCircle2 className="size-6 text-primary" />
            <h2 className="text-3xl font-bold">Security Best Practices</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="border-2 border-primary/20">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2 text-primary">
                  <CheckCircle2 className="size-5" />
                  Do
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  {[
                    "Rotate credentials regularly (every 90 days)",
                    "Use environment-specific credentials (dev/staging/prod)",
                    "Monitor credential usage via analytics",
                    "Set ENCRYPTION_KEY via environment variable",
                    "Revoke unused API configurations",
                    "Use least-privilege credentials when possible",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <CheckCircle2 className="size-4 text-primary mt-0.5 shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card className="border-2 border-destructive/20">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2 text-destructive">
                  <AlertTriangle className="size-5" />
                  Don&apos;t
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  {[
                    "Never log decrypted credentials",
                    "Don't return credentials in API responses",
                    "Never commit ENCRYPTION_KEY to version control",
                    "Don't reuse credentials across environments",
                    "Never disable encryption in production",
                    "Don't share API configurations between users",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <AlertTriangle className="size-4 text-destructive mt-0.5 shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>

          <Callout type="success" title="Encryption Validation" className="mt-6">
            <p className="mb-2">
              RateGuard includes comprehensive encryption tests to ensure credentials
              are never stored in plaintext:
            </p>
            <ul className="ml-4 space-y-1 text-sm">
              <li>✓ End-to-end encryption flow validation</li>
              <li>✓ Encryption required enforcement (cannot store without ENCRYPTION_KEY)</li>
              <li>✓ Credential rotation and update flow tests</li>
              <li>✓ Bulk decryption for list operations</li>
            </ul>
          </Callout>
        </section>
      </div>
    </div>
  );
}
