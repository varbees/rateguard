"use client";

import React, { Suspense } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useMutation, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ResetPasswordPage from '../page';
import { apiClient } from '@/lib/api';
import { useSearchParams } from 'next/navigation';

// Helper to wrap component with QueryClientProvider
const queryClient = new QueryClient();
const renderWithClient = (ui: React.ReactElement) => {
    return render(
        <QueryClientProvider client={queryClient}>
            <Suspense fallback={<div>Loading...</div>}>
                {ui}
            </Suspense>
        </QueryClientProvider>
    );
};

// Mocks
jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useMutation: jest.fn(),
}));
jest.mock('@/lib/api', () => ({
  apiClient: {
    resetPassword: jest.fn(),
  },
}));
jest.mock('@/lib/toast', () => ({
  handleApiError: jest.fn(),
}));
jest.mock('next/navigation', () => ({
  useSearchParams: jest.fn(),
  useRouter: () => ({
      push: jest.fn(),
  })
}));

describe('ResetPasswordPage', () => {
  let mockMutate: jest.Mock;
  
  beforeEach(() => {
    mockMutate = jest.fn();
    (useMutation as jest.Mock).mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    });
    (apiClient.resetPassword as jest.Mock).mockClear();
    (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams("token=test-token"));
  });

  it('shows an error if no token is provided', () => {
    (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams(""));
    renderWithClient(<ResetPasswordPage />);
    expect(screen.getByText(/No reset token provided/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/New Password/i)).not.toBeInTheDocument();
  });

  it('renders the form when a token is present', () => {
    renderWithClient(<ResetPasswordPage />);
    expect(screen.getByText(/Create New Password/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Enter your new password/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Confirm your new password/i)).toBeInTheDocument();
  });

  it('shows validation error for short passwords', async () => {
    renderWithClient(<ResetPasswordPage />);
    const passwordInput = screen.getByPlaceholderText(/Enter your new password/i);
    const submitButton = screen.getByRole('button', { name: /Set New Password/i });

    fireEvent.change(passwordInput, { target: { value: 'short' } });
    fireEvent.click(submitButton);

    expect(await screen.findByText(/Password must be at least 8 characters/i)).toBeInTheDocument();
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('shows validation error for mismatched passwords', async () => {
    renderWithClient(<ResetPasswordPage />);
    const passwordInput = screen.getByPlaceholderText(/Enter your new password/i);
    const confirmInput = screen.getByPlaceholderText(/Confirm your new password/i);
    const submitButton = screen.getByRole('button', { name: /Set New Password/i });

    fireEvent.change(passwordInput, { target: { value: 'password123' } });
    fireEvent.change(confirmInput, { target: { value: 'password456' } });
    fireEvent.click(submitButton);

    expect(await screen.findByText(/Passwords do not match/i)).toBeInTheDocument();
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('calls the mutation with token and password on valid submission', async () => {
    renderWithClient(<ResetPasswordPage />);
    const passwordInput = screen.getByPlaceholderText(/Enter your new password/i);
    const confirmInput = screen.getByPlaceholderText(/Confirm your new password/i);
    const submitButton = screen.getByRole('button', { name: /Set New Password/i });

    fireEvent.change(passwordInput, { target: { value: 'new-secure-password' } });
    fireEvent.change(confirmInput, { target: { value: 'new-secure-password' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
        expect(mockMutate).toHaveBeenCalledWith({ token: 'test-token', password: 'new-secure-password' });
    });
  });

  it('shows the success screen after a successful mutation', async () => {
    (useMutation as jest.Mock).mockImplementation(({ onSuccess }: { onSuccess: () => void}) => ({
        mutate: () => onSuccess(),
        isPending: false,
    }));
    renderWithClient(<ResetPasswordPage />);

    // Simulate filling and submitting the form
    const passwordInput = screen.getByPlaceholderText(/Enter your new password/i);
    const confirmInput = screen.getByPlaceholderText(/Confirm your new password/i);
    const submitButton = screen.getByRole('button', { name: /Set New Password/i });
    fireEvent.change(passwordInput, { target: { value: 'new-secure-password' } });
    fireEvent.change(confirmInput, { target: { value: 'new-secure-password' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
        expect(screen.getByText(/Your password has been reset successfully/i)).toBeInTheDocument();
    });
    expect(screen.getByRole('link', {name: /Return to Sign In/i})).toBeInTheDocument();
  });
});
