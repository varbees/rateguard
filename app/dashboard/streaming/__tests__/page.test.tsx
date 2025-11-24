import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { useQuery } from '@tanstack/react-query';
import StreamingDashboardPage from '../page';
import * as StreamingApi from '@/lib/api/streaming';

// Mock the entire module to allow spying on `exportToCSV`
jest.mock('@/lib/api/streaming', () => ({
  ...jest.requireActual('@/lib/api/streaming'), // Keep other functions working
  exportToCSV: jest.fn(),
}));

// Mock child components
jest.mock('@/components/dashboard/StreamingMetrics', () => ({
  StreamingMetrics: ({ period }: { period: string }) => <div data-testid="streaming-metrics">Period: {period}</div>,
}));
jest.mock('@/components/dashboard/StreamingChart', () => ({
  StreamingHistoryChart: ({ period }: { period: string }) => <div data-testid="history-chart">Period: {period}</div>,
  StreamingByAPIChart: ({ period }: { period: string }) => <div data-testid="by-api-chart">Period: {period}</div>,
  StreamingDurationChart: ({ period }: { period: string }) => <div data-testid="duration-chart">Period: {period}</div>,
}));
jest.mock('@/components/dashboard/StreamingCostCalculator', () => ({
    StreamingCostCalculator: () => <div data-testid="cost-calculator" />,
}));

// Mock the useQuery hook
jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQuery: jest.fn(),
}));


describe('StreamingDashboardPage', () => {
  const mockRefetch = jest.fn();
  const mockApiData = {
    apis: [
      { api_id: '1', api_name: 'Test API 1', streams: 100, bytes: 1024, avg_duration_ms: 100, success_rate: 99 },
      { api_id: '2', api_name: 'Test API 2', streams: 200, bytes: 2048, avg_duration_ms: 200, success_rate: 98 },
    ],
  };

  beforeEach(() => {
    // Reset mocks before each test
    (useQuery as jest.Mock).mockClear();
    mockRefetch.mockClear();
    (StreamingApi.exportToCSV as jest.Mock).mockClear();
  });

  it('renders the main title and components', () => {
    (useQuery as jest.Mock).mockReturnValue({
      data: mockApiData,
      refetch: mockRefetch,
    });

    render(<StreamingDashboardPage />);

    expect(screen.getByText('Streaming Analytics')).toBeInTheDocument();
    expect(screen.getByTestId('streaming-metrics')).toBeInTheDocument();
    expect(screen.getByTestId('history-chart')).toBeInTheDocument();
    expect(screen.getByTestId('by-api-chart')).toBeInTheDocument();
    expect(screen.getByTestId('duration-chart')).toBeInTheDocument();
    expect(screen.getByTestId('cost-calculator')).toBeInTheDocument();
  });

  it('renders the API table with data', () => {
    (useQuery as jest.Mock).mockReturnValue({
      data: mockApiData,
      refetch: mockRefetch,
    });

    render(<StreamingDashboardPage />);
    
    const table = screen.getByRole('table');

    expect(within(table).getByText('Test API 1')).toBeInTheDocument();
    expect(within(table).getByText('Test API 2')).toBeInTheDocument();
    expect(within(table).getByText('100')).toBeInTheDocument(); // streams for API 1
  });

  it('calls refetch when the refresh button is clicked', () => {
    (useQuery as jest.Mock).mockReturnValue({
      data: mockApiData,
      refetch: mockRefetch,
    });

    render(<StreamingDashboardPage />);

    const refreshButton = screen.getByRole('button', { name: /Refresh/i });
    fireEvent.click(refreshButton);

    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it('calls exportToCSV when the export button is clicked', () => {
    (useQuery as jest.Mock).mockReturnValue({
      data: mockApiData,
      refetch: mockRefetch,
    });

    render(<StreamingDashboardPage />);

    const exportButton = screen.getByRole('button', { name: /Export CSV/i });
    fireEvent.click(exportButton);

    expect(StreamingApi.exportToCSV).toHaveBeenCalledTimes(1);
    expect(StreamingApi.exportToCSV).toHaveBeenCalledWith(mockApiData.apis, expect.stringContaining('streaming-data-30d'));
  });
  
  it('changes the period filter when a period button is clicked', () => {
    (useQuery as jest.Mock).mockReturnValue({
      data: mockApiData,
      refetch: mockRefetch,
    });
  
    render(<StreamingDashboardPage />);
  
    // Initial period is 30d
    expect(screen.getByTestId('streaming-metrics')).toHaveTextContent('Period: 30d');
  
    const sevenDayButton = screen.getByRole('button', { name: /Last 7d/i });
    fireEvent.click(sevenDayButton);
  
    // After clicking, the period passed to the child component should change
    expect(screen.getByTestId('streaming-metrics')).toHaveTextContent('Period: 7d');
  });

  it('shows an empty state for the table when there is no API data', () => {
    (useQuery as jest.Mock).mockReturnValue({
      data: { apis: [] },
      refetch: mockRefetch,
    });

    render(<StreamingDashboardPage />);
    
    expect(screen.getByText(/No streaming data available/i)).toBeInTheDocument();
    // Make sure the table headers are there, but no rows
    expect(screen.queryByText('Test API 1')).not.toBeInTheDocument();
  });
});
