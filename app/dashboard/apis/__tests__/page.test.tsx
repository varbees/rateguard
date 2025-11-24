import React from 'react';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import { useQuery, useMutation, useQueryClient, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import APIsPage from '../page';

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
  useMutation: jest.fn(),
  useQueryClient: jest.fn(), // Mock useQueryClient
}));

jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('@/components/dashboard/APIConfigModal', () => ({
  __esModule: true,
  default: ({ isOpen, onClose, api }: { isOpen: boolean; onClose: () => void; api?: any }) => {
    if (!isOpen) return null;
    return (
      <div data-testid="api-config-modal">
        <h2>{api ? 'Edit API' : 'Add API'}</h2>
        <button onClick={onClose}>Close</button>
      </div>
    );
  },
}));

jest.mock('@/lib/toast', () => ({
  toasts: {
    api: {
      deleted: jest.fn(),
    },
  },
  handleApiError: jest.fn(),
}));

// Mock window.confirm
global.confirm = jest.fn(() => true);

describe('APIsPage', () => {
  const mockQueryClient = {
    invalidateQueries: jest.fn(),
  };
  const mockDeleteMutation = {
    mutate: jest.fn(),
  };
  const mockApis = [
    { id: '1', name: 'API 1', target_url: 'https://api1.com', rate_limit_per_second: 10, burst_size: 20, enabled: true },
    { id: '2', name: 'API 2', target_url: 'https://api2.com', rate_limit_per_second: 5, burst_size: 10, enabled: false },
  ];

  beforeEach(() => {
    (useQuery as jest.Mock).mockReturnValue({
      data: [],
      isLoading: true,
    });
    (useMutation as jest.Mock).mockReturnValue(mockDeleteMutation);
    (useQueryClient as jest.Mock).mockReturnValue(mockQueryClient); // Provide the mock client
    (mockQueryClient.invalidateQueries as jest.Mock).mockClear();
    (mockDeleteMutation.mutate as jest.Mock).mockClear();
    (global.confirm as jest.Mock).mockClear();
  });

  it('renders loading state correctly', () => {
    renderWithClient(<APIsPage />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders empty state and allows opening modal', () => {
    (useQuery as jest.Mock).mockReturnValue({
      data: [],
      isLoading: false,
    });
    renderWithClient(<APIsPage />);
    expect(screen.getByText('No APIs configured yet')).toBeInTheDocument();
    
    const addButton = screen.getByText('Add Your First API');
    fireEvent.click(addButton);

    const modal = screen.getByTestId('api-config-modal');
    expect(within(modal).getByText('Add API')).toBeInTheDocument();
  });

  it('renders a table with API data', () => {
    (useQuery as jest.Mock).mockReturnValue({
      data: mockApis,
      isLoading: false,
    });
    renderWithClient(<APIsPage />);

    expect(screen.getByText('API 1')).toBeInTheDocument();
    expect(screen.getByText('https://api2.com')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Inactive')).toBeInTheDocument();
  });

  it('opens the modal in create mode when "Add API" is clicked', () => {
    (useQuery as jest.Mock).mockReturnValue({
      data: mockApis,
      isLoading: false,
    });
    renderWithClient(<APIsPage />);

    const addButton = screen.getByRole('button', { name: /Add API/i });
    fireEvent.click(addButton);

    const modal = screen.getByTestId('api-config-modal');
    expect(within(modal).getByText('Add API')).toBeInTheDocument();
  });

  it('opens the modal in edit mode when an edit button is clicked', () => {
    (useQuery as jest.Mock).mockReturnValue({
      data: mockApis,
      isLoading: false,
    });
    renderWithClient(<APIsPage />);

    const editButton = screen.getByRole('button', { name: /Edit API 1/i });
    fireEvent.click(editButton);

    const modal = screen.getByTestId('api-config-modal');
    expect(within(modal).getByText('Edit API')).toBeInTheDocument();
  });

  it('calls the delete mutation and invalidates queries on success', () => {
    // A more realistic mock for this specific test
    (useMutation as jest.Mock).mockImplementation(({ onSuccess }: { onSuccess: () => void }) => {
        return { 
            mutate: (id: string) => {
                mockDeleteMutation.mutate(id);
                act(() => {
                    onSuccess();
                });
            }
        };
    });
    (useQuery as jest.Mock).mockReturnValue({
        data: mockApis,
        isLoading: false,
    });
    
    renderWithClient(<APIsPage />);

    const deleteButton = screen.getByRole('button', { name: /Delete API 1/i });
    fireEvent.click(deleteButton);

    expect(global.confirm).toHaveBeenCalledWith('Are you sure you want to delete this API configuration?');
    expect(mockDeleteMutation.mutate).toHaveBeenCalledWith('1');
    // Check if the onSuccess callback was triggered, which in turn calls invalidateQueries
    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["apis"] });
  });
});
