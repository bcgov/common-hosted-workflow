import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { InlineEditCell } from '@/components/projects/inline-edit-cell';

describe('InlineEditCell', () => {
  const defaultProps = {
    value: '550e8400-e29b-41d4-a716-446655440000',
    onSave: vi.fn(),
    isLoading: false,
    error: null,
  };

  it('renders the current value in display mode', () => {
    render(<InlineEditCell {...defaultProps} />);
    expect(screen.getByText(defaultProps.value)).toBeInTheDocument();
  });

  it('renders a placeholder when value is null', () => {
    render(<InlineEditCell {...defaultProps} value={null} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('enters edit mode on click', async () => {
    const user = userEvent.setup();
    render(<InlineEditCell {...defaultProps} />);

    await user.click(screen.getByRole('button'));

    const input = screen.getByRole('textbox', { name: 'Tenant ID' });
    expect(input).toBeInTheDocument();
    expect(input).toHaveValue(defaultProps.value);
  });

  it('pre-populates input with empty string when value is null', async () => {
    const user = userEvent.setup();
    render(<InlineEditCell {...defaultProps} value={null} />);

    await user.click(screen.getByRole('button'));

    const input = screen.getByRole('textbox', { name: 'Tenant ID' });
    expect(input).toHaveValue('');
  });

  it('calls onSave with new UUID value on Enter', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<InlineEditCell {...defaultProps} onSave={onSave} />);

    await user.click(screen.getByRole('button'));
    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.type(input, '660e8400-e29b-41d4-a716-446655440001{Enter}');

    expect(onSave).toHaveBeenCalledWith('660e8400-e29b-41d4-a716-446655440001');
  });

  it('calls onSave with null when input is cleared and submitted', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<InlineEditCell {...defaultProps} onSave={onSave} />);

    await user.click(screen.getByRole('button'));
    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.type(input, '{Enter}');

    expect(onSave).toHaveBeenCalledWith(null);
  });

  it('shows validation error for invalid UUID', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<InlineEditCell {...defaultProps} onSave={onSave} />);

    await user.click(screen.getByRole('button'));
    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.type(input, 'not-a-uuid{Enter}');

    expect(screen.getByText('Invalid UUID format')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('cancels edit on Escape and reverts to display mode', async () => {
    const user = userEvent.setup();
    render(<InlineEditCell {...defaultProps} />);

    await user.click(screen.getByRole('button'));
    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.type(input, 'something-else');
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByText(defaultProps.value)).toBeInTheDocument();
  });

  it('shows loading state when isLoading is true', () => {
    render(<InlineEditCell {...defaultProps} isLoading={true} />);
    expect(screen.getByText('Saving…')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('does not call onSave when value unchanged', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<InlineEditCell {...defaultProps} onSave={onSave} />);

    await user.click(screen.getByRole('button'));
    await user.keyboard('{Enter}');

    expect(onSave).not.toHaveBeenCalled();
  });

  it('does not call onSave(null) when value was already null and input cleared', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<InlineEditCell {...defaultProps} value={null} onSave={onSave} />);

    await user.click(screen.getByRole('button'));
    await user.keyboard('{Enter}');

    expect(onSave).not.toHaveBeenCalled();
  });
});
