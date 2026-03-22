import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import DashboardPage from '../page';
import { useDashboardStore } from '@/lib/store';
import { apiClient } from '@/lib/api';
import { useRouter } from 'next/navigation';

// Mock child components
jest.mock('@/components/dashboard', () => ({
  MetricCards: ({ loading }: { loading: boolean }) => <div data-testid="metric-cards">{loading ? 'Loading...' : 'Data'}</div>,
  UsageGraphSection: ({ loading }: { loading: boolean }) => <div data-testid="usage-graph">{loading ? 'Loading...' : 'Data'}</div>,
  APIListTable: ({ loading }: { loading: boolean }) => <div data-testid="api-list">{loading ? 'Loading...' : 'Data'}</div>,
  RecentActivity: ({ loading }: { loading: boolean }) => <div data-testid="recent-activity">{loading ? 'Loading...' : 'Data'}</div>,
}));

// Mock API client
jest.mock('@/lib/api', () => ({
  ...jest.requireActual('@/lib/api'),
  apiClient: {
    getDashboardStats: jest.fn(),
    listAPIConfigs: jest.fn(),
    clearApiKey: jest.fn(),
  },
}));

// Mock Zustand store
jest.mock('@/lib/store', () => ({
  useDashboardStore: jest.fn(),
}));

// Mock Next.js router
const mockRouterPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockRouterPush,
  }),
}));

describe('DashboardPage', () => {
  const mockClearAuth = jest.fn();

  beforeEach(() => {
    (useDashboardStore as jest.Mock).mockReturnValue({
      isAuthenticated: true,
      clearAuth: mockClearAuth,
    });
    (apiClient.getDashboardStats as jest.Mock).mockClear().mockResolvedValue({ total_requests: 100 });
    (apiClient.listAPIConfigs as jest.Mock).mockClear().mockResolvedValue([{ id: '1', name: 'Test API' }]);
    mockRouterPush.mockClear();
    mockClearAuth.mockClear();
  });

  it('redirects to /login if not authenticated', () => {
    (useDashboardStore as jest.Mock).mockReturnValue({
      isAuthenticated: false,
      clearAuth: mockClearAuth,
    });
    render(<DashboardPage />);
    expect(mockRouterPush).toHaveBeenCalledWith('/login');
  });

  it('renders loading state initially', async () => {
    // Prevent the fetch from resolving immediately
    (apiClient.getDashboardStats as jest.Mock).mockReturnValue(new Promise(() => {}));
    (apiClient.listAPIConfigs as jest.Mock).mockReturnValue(new Promise(() => {}));

    render(<DashboardPage />);

    expect(screen.getByTestId('metric-cards')).toHaveTextContent('Loading...');
    expect(screen.getByTestId('api-list')).toHaveTextContent('Loading...');
  });

  it('renders data after successful fetch', async () => {
    render(<DashboardPage />);

    await waitFor(() => {
        expect(screen.getByTestId('metric-cards')).toHaveTextContent('Data');
        expect(screen.getByTestId('api-list')).toHaveTextContent('Data');
    });
    
    expect(apiClient.getDashboardStats).toHaveBeenCalledTimes(1);
    expect(apiClient.listAPIConfigs).toHaveBeenCalledTimes(1);
  });

  it('renders error state if fetch fails', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const errorMessage = 'Network Error';
    (apiClient.getDashboardStats as jest.Mock).mockRejectedValue(new Error(errorMessage));

    render(<DashboardPage />);

    await screen.findByText('Error Loading Dashboard');
    expect(screen.getByText(errorMessage)).toBeInTheDocument();
    consoleSpy.mockRestore();
  });

  it('calls clearAuth and redirects on logout', async () => {
    render(<DashboardPage />);
    await waitFor(() => {
        expect(screen.getByTestId('metric-cards')).toHaveTextContent('Data');
    });

    const logoutButton = screen.getByRole('button', { name: /Logout/i });
    fireEvent.click(logoutButton);

    expect(apiClient.clearApiKey).toHaveBeenCalled();
    expect(mockClearAuth).toHaveBeenCalled();
    expect(mockRouterPush).toHaveBeenCalledWith('/login');
  });
});
