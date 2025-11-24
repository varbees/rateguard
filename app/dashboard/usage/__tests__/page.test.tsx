import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { useQuery, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import UsagePage from '../page';

// Helper to wrap component with QueryClientProvider
const queryClient = new QueryClient();
const renderWithClient = (ui: React.ReactElement) => {
    return render(
        <QueryClientProvider client={queryClient}>
            {ui}
        </QueryClientProvider>
    );
};

// Mocks
jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQuery: jest.fn(),
}));

describe('UsagePage', () => {
  const mockStats = {
    total_requests: 50000,
    success_rate: 98.5,
    avg_response_time_ms: 150,
    usage_by_api: [
      { api_name: 'API 1', last_used: new Date().toISOString(), requests: 123, success_rate: 99.0 },
      { api_name: 'API 2', last_used: new Date().toISOString(), requests: 456, success_rate: 98.0 },
    ],
  };

  beforeEach(() => {
    (useQuery as jest.Mock).mockClear();
  });

  it('renders the main title', () => {
    // Mock a default return value for all queries to avoid errors
    (useQuery as jest.Mock).mockReturnValue({ data: {}, isLoading: false });
    renderWithClient(<UsagePage />);
    expect(screen.getByText('Usage Analytics')).toBeInTheDocument();
  });

  it('renders loading state for key metrics', () => {
    (useQuery as jest.Mock).mockImplementation(({ queryKey }) => {
      if (queryKey[0] === 'dashboard-stats') {
        return { data: null, isLoading: true };
      }
      return { data: null, isLoading: false };
    });

    renderWithClient(<UsagePage />);
    
    // The text content should be '...' when loading
    const requestCard = screen.getByText('Total Requests').closest('div');
    expect(within(requestCard).getByText('...')).toBeInTheDocument();
  });

  it('renders key metrics with data', () => {
    (useQuery as jest.Mock).mockImplementation(({ queryKey }) => {
      if (queryKey[0] === 'dashboard-stats') {
        return { data: mockStats, isLoading: false };
      }
      return { data: null, isLoading: false };
    });

    const { getByText } = renderWithClient(<UsagePage />);

    expect(getByText('50,000')).toBeInTheDocument(); // Total Requests
    expect(getByText('98.5%')).toBeInTheDocument(); // Success Rate
    expect(getByText('150ms')).toBeInTheDocument(); // Avg Response Time
    
    // Error rate is calculated from success rate
    const errorRate = (100 - mockStats.success_rate).toFixed(1) + '%';
    expect(getByText(errorRate)).toBeInTheDocument();
  });

  it('renders the recent activity list', () => {
    (useQuery as jest.Mock).mockImplementation(({ queryKey }) => {
      if (queryKey[0] === 'dashboard-stats') {
        return { data: mockStats, isLoading: false };
      }
      return { data: null, isLoading: false };
    });

    renderWithClient(<UsagePage />);

    expect(screen.getByText('API 1')).toBeInTheDocument();
    expect(screen.getByText('API 2')).toBeInTheDocument();
    expect(screen.getByText('123 requests')).toBeInTheDocument();
  });

  it('renders an empty state for recent activity', () => {
    (useQuery as jest.Mock).mockImplementation(({ queryKey }) => {
      if (queryKey[0] === 'dashboard-stats') {
        return { data: { ...mockStats, usage_by_api: [] }, isLoading: false };
      }
      return { data: null, isLoading: false };
    });

    renderWithClient(<UsagePage />);

    expect(screen.getByText('No recent activity')).toBeInTheDocument();
  });
  
});
