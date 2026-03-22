import React from 'react';
import { render, screen } from '@testing-library/react';
import { StreamingMetrics } from '../StreamingMetrics';
import { useQuery } from '@tanstack/react-query';

// Mock the useQuery hook
jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQuery: jest.fn(),
}));

// Mock the lucide-react library to avoid rendering actual icons
jest.mock('lucide-react', () => ({
  Activity: () => <div data-testid="icon-activity" />,
  Database: () => <div data-testid="icon-database" />,
  Clock: () => <div data-testid="icon-clock" />,
  CheckCircle2: () => <div data-testid="icon-check" />,
  AlertCircle: () => <div data-testid="icon-alert" />,
}));


describe('StreamingMetrics', () => {
  it('renders loading state correctly', () => {
    // Mock the loading state
    (useQuery as jest.Mock).mockReturnValue({
      isLoading: true,
      error: null,
      data: null,
    });

    render(<StreamingMetrics />);

    // Check for the skeleton
    expect(screen.getByTestId('metrics-skeleton')).toBeInTheDocument();
  });

  it('renders error state correctly', () => {
    // Mock the error state
    (useQuery as jest.Mock).mockReturnValue({
      isLoading: false,
      error: new Error('Failed to fetch'),
      data: null,
    });

    render(<StreamingMetrics />);

    // Check for the error message
    expect(screen.getByText(/Failed to load streaming metrics/i)).toBeInTheDocument();
  });

  it('renders empty state correctly', () => {
    // Mock the empty data state
    (useQuery as jest.Mock).mockReturnValue({
      isLoading: false,
      error: null,
      data: null,
    });

    render(<StreamingMetrics />);

    // Check for the empty state message
    expect(screen.getByText(/No Streaming Data Yet/i)).toBeInTheDocument();
  });

  it('renders data correctly', () => {
    // Mock the success state with some data
    const mockData = {
      total_streams: 1234,
      active_streams: 5,
      total_bytes: 1024 * 1024 * 500, // 500 MB
      total_bytes_gb: 0.5,
      avg_duration_ms: 60000, // 1 minute
      max_duration_ms: 300000, // 5 minutes
      success_rate: 99.9,
      streaming_enabled: true,
    };

    (useQuery as jest.Mock).mockReturnValue({
      isLoading: false,
      error: null,
      data: mockData,
    });

    render(<StreamingMetrics />);

    // Check for some of the data points
    expect(screen.getByText('Total Streams')).toBeInTheDocument();
    expect(screen.getByText('1,234')).toBeInTheDocument();

    expect(screen.getByText('Active Streams')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();

    expect(screen.getByText('Data Transferred')).toBeInTheDocument();
    expect(screen.getByText('500 MB')).toBeInTheDocument();

    expect(screen.getByText('Avg Duration')).toBeInTheDocument();
    expect(screen.getByText('1.0m')).toBeInTheDocument();
    
    expect(screen.getByText('Success Rate')).toBeInTheDocument();
    expect(screen.getByText('99.9%')).toBeInTheDocument();

    expect(screen.getByText('Streaming Status')).toBeInTheDocument();
    expect(screen.getByText('Enabled')).toBeInTheDocument();
  });
});
