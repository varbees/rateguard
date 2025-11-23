# API Keys & Authentication Documentation

This directory contains the comprehensive API Keys & Authentication documentation page for RateGuard.

## Overview

A beautiful, modern Next.js documentation page following Next.js docs style with:

- **Hero section** explaining the RateGuard authentication system
- **Two authentication methods**: API Key (server-to-server) and Bearer token (development)
- **Interactive API key management** demo component
- **Multi-language code examples** with tabs for easy switching
- **Security best practices** and common pitfalls
- **Error handling** patterns and response examples
- **Key rotation** workflow and examples

## Features

### Components Used

- **CodeTabs**: Language-switching code examples (cURL, JavaScript, TypeScript, Python, Go, Ruby)
- **ApiKeyDemo**: Interactive API key management simulator
- **Callout**: Styled callout boxes for tips, warnings, and important information
- **CopyButton**: One-click code copying functionality

### Code Examples Include

Each example demonstrates:

- How to include API key in headers (`X-API-Key`)
- Success responses (200)
- Error responses (401, 403, 429)
- How to rotate/revoke keys

### Supported Languages

1. **cURL** - Command-line requests
2. **JavaScript** - Fetch API and Axios examples
3. **TypeScript** - Fully typed implementations
4. **Python** - Requests library
5. **Go** - net/http package
6. **Ruby** - rest-client gem

## File Structure

```
app/docs/authentication/api-keys/
├── page.tsx              # Main documentation page
└── README.md             # This file

components/docs/
├── ApiKeyDemo.tsx        # Interactive API key manager
├── CallOut.tsx           # Styled alert/info boxes
├── CodeTabs.tsx          # Language-switching code viewer
├── CopyButton.tsx        # Copy-to-clipboard button
└── index.ts              # Barrel exports

lib/docs/
└── code-examples.ts      # All language examples and responses
```

## Accessing the Page

Navigate to: `/docs/authentication/api-keys`

## Design Features

- **Dark theme** compatible (matches Next.js docs)
- **Syntax-highlighted** code blocks
- **Smooth animations** on hover and interactions
- **Mobile responsive** layout
- **Interactive examples** with live state management
- **Copy-to-clipboard** functionality
- **Tabbed code examples** for easy language switching

## Security Highlights

The documentation emphasizes:

- AES-256-GCM encryption
- Per-API CORS whitelisting
- Multi-tier rate limiting
- Worker pool architecture (20 goroutines)
- Best practices for key storage and rotation
- Zero-downtime key rotation workflow

## Tech Stack Integration

Built for the RateGuard backend stack:

- Go + Echo (API handlers)
- PostgreSQL (storage)
- Redis (rate limiting, cache)
- Worker pool (20 goroutines)
- Multi-tier rate limiting
- AES-256-GCM encryption

## Development

To modify the documentation:

1. **Update code examples**: Edit `lib/docs/code-examples.ts`
2. **Modify components**: Update files in `components/docs/`
3. **Change page content**: Edit `app/docs/authentication/api-keys/page.tsx`

## Future Enhancements

Potential additions:

- Live API testing playground
- SDK download links
- Webhook signature verification examples
- GraphQL authentication examples
- OAuth2 integration guide
