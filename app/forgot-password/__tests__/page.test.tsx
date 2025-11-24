"use client";

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useMutation, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ForgotPasswordPage from '../page';
import { apiClient } from '@/lib/api';

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
  useMutation: jest.fn(),
}));
jest.mock('@/lib/api', () => ({
  apiClient: {
    requestPasswordReset: jest.fn(),
  },
}));
jest.mock('@/lib/toast', () => ({
  handleApiError: jest.fn(),
}));

describe('ForgotPasswordPage', () => {
  let mockMutate: jest.Mock;
  
  beforeEach(() => {
    mockMutate = jest.fn();
    (useMutation as jest.Mock).mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    });
    (apiClient.requestPasswordReset as jest.Mock).mockClear();
  });

  it('renders the form correctly', () => {
    renderWithClient(<ForgotPasswordPage />);
    expect(screen.getByText(/Reset Your Password/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/you@example.com/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Send Reset Link/i })).toBeInTheDocument();
  });

  it('shows validation error for invalid email', async () => {
    renderWithClient(<ForgotPasswordPage />);
    const emailInput = screen.getByPlaceholderText(/you@example.com/i);
    const submitButton = screen.getByRole('button', { name: /Send Reset Link/i });

    fireEvent.change(emailInput, { target: { value: 'invalid-email' } });
    fireEvent.click(submitButton);

    expect(await screen.findByText(/Please enter a valid email address./i)).toBeInTheDocument();
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('calls the mutation on valid form submission', async () => {
    renderWithClient(<ForgotPasswordPage />);
    const emailInput = screen.getByPlaceholderText(/you@example.com/i);
    const submitButton = screen.getByRole('button', { name: /Send Reset Link/i });

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith({ email: 'test@example.com' });
    });
  });

  it('shows a success message after successful submission', async () => {
    (useMutation as jest.Mock).mockImplementation(({ onSuccess }: { onSuccess: () => void}) => ({
        mutate: () => {
            onSuccess();
        },
        isPending: false
    }));

    renderWithClient(<ForgotPasswordPage />);
    const emailInput = screen.getByPlaceholderText(/you@example.com/i);
    const submitButton = screen.getByRole('button', { name: /Send Reset Link/i });

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/Check Your Email/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/If an account with that email exists/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Return to Sign In/i })).toBeInTheDocument();
  });

  it('disables the button when the mutation is pending', () => {
    (useMutation as jest.Mock).mockReturnValue({
      mutate: mockMutate,
      isPending: true,
    });
    renderWithClient(<ForgotPasswordPage />);
    expect(screen.getByRole('button', { name: /Sending.../i })).toBeDisabled();
  });
});
