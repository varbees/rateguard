# RateGuard Dashboard

A modern, beautiful dashboard for managing your RateGuard API rate limits and usage built with Next.js, React Server Components, shadcn/ui, and TanStack Query.

## ✨ Features

- 🔐 **API Key Authentication** - Secure login based on RateGuard backend auth
- 📊 **Real-time Dashboard** - Live charts showing request volume and success rates
- ⚡ **API Configuration UI** - Add, edit, and delete API configurations
- 💳 **Billing Page** - Plan management with placeholder for Stripe integration
- 🎨 **Beautiful UI** - Built with shadcn/ui and Tailwind CSS
- ⚡ **Fast Performance** - Bun for lightning-fast builds and runtime
- 🔄 **Smart Caching** - TanStack Query for optimized data fetching

## 🚀 Tech Stack

- **Framework:** Next.js 14 with App Router
- **Language:** TypeScript
- **UI Components:** shadcn/ui
- **Styling:** Tailwind CSS v4
- **Charts:** Recharts
- **Data Fetching:** TanStack Query (React Query)
- **State Management:** Zustand
- **Icons:** Lucide React
- **Package Manager:** Bun
- **Real-time:** Socket.IO Client (ready for integration)

## 📋 Prerequisites

- [Bun](https://bun.sh) installed (v1.0+)
- RateGuard backend running (default: http://localhost:8008)

## 🛠️ Installation

1. **Install dependencies:**

```bash
bun install
```

2. **Configure environment variables:**

```bash
cp .env.example .env.local
```

Edit `.env.local` and set your RateGuard API URL:

```env
NEXT_PUBLIC_API_URL=http://localhost:8008
```

3. **Run the development server:**

```bash
bun dev
```

4. **Open your browser:**

Navigate to [http://localhost:3000](http://localhost:3000)

## 🔑 Authentication

The dashboard uses API key authentication based on the RateGuard backend implementation in `@/go-concurrent-aggregator/api/middleware/auth.go`.

**Test API Key:** `test_key_admin_12345678901234567890123456789012`

## 📁 Project Structure

```
go-rateguard-dashboard/
├── app/
│   ├── dashboard/
│   │   ├── layout.tsx          # Dashboard layout with nav
│   │   ├── page.tsx             # Overview with charts
│   │   ├── apis/page.tsx        # API management
│   │   ├── billing/page.tsx     # Billing & plans
│   │   └── settings/page.tsx    # Account settings
│   ├── login/page.tsx           # Login page
│   ├── layout.tsx               # Root layout
│   ├── page.tsx                 # Redirect to login
│   └── providers.tsx            # Query & toast providers
├── components/
│   ├── auth/
│   │   └── LoginForm.tsx        # Login form component
│   ├── dashboard/
│   │   ├── DashboardNav.tsx     # Navigation sidebar
│   │   └── APIConfigModal.tsx   # API config dialog
│   └── ui/                      # shadcn components
├── lib/
│   ├── api.ts                   # API client & types
│   ├── store.ts                 # Zustand store
│   └── utils.ts                 # Utility functions
└── public/
```

## 🎨 Features Detail

### Dashboard Overview

- **Real-time statistics** with auto-refresh every 30 seconds
- **Interactive charts** showing request volume and success rates
- **Usage metrics** including total requests, active APIs, success rate, and avg response time
- **Recent API configurations** list

### API Management

- **CRUD operations** for API configurations
- **Rate limit configuration** (requests/sec, burst size)
- **Timeout and retry settings**
- **Enable/disable** APIs
- **Beautiful table view** with status badges

### Billing

- **Plan comparison** (Free, Pro, Enterprise)
- **Usage tracking** with progress bars
- **Payment method** placeholder for Stripe
- **Upgrade options**

### Settings

- **API key display** with copy functionality
- **Account information**
- **API endpoint configuration**

## 🔄 Real-time Updates (Socket.IO)

The dashboard is **ready for Socket.IO integration**. To enable real-time updates:

1. Implement Socket.IO server in RateGuard backend
2. Update the dashboard to connect:

```typescript
// Example integration point
import io from "socket.io-client";

const socket = io(process.env.NEXT_PUBLIC_API_URL);

socket.on("usage-update", (data) => {
  queryClient.invalidateQueries(["dashboard-stats"]);
});
```

## 💳 Stripe Integration

Billing page structure is ready for Stripe:

1. Install Stripe SDK: `bun add @stripe/stripe-js`
2. Add Stripe Elements to payment method section
3. Connect to RateGuard Stripe endpoints (to be implemented)

## 🚀 Build for Production

```bash
bun run build
bun start
```

## 📝 Available Scripts

- `bun dev` - Start development server
- `bun build` - Build for production
- `bun start` - Start production server
- `bun lint` - Run ESLint

## 🎯 Roadmap

- [ ] Socket.IO real-time updates
- [ ] Stripe payment integration
- [ ] User signup/registration
- [ ] Email notifications
- [ ] Advanced analytics
- [ ] Export usage reports
- [ ] API key regeneration
- [ ] Team management
- [ ] Webhook configuration

## 📄 License

Part of the RateGuard project.

## 🤝 Contributing

Built as part of the RateGuard SaaS API Rate Limit Manager.
