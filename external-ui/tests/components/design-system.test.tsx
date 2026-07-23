import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { IconFolder } from '@tabler/icons-react';
import { Field } from '../../src/components/ui/field';
import { Input } from '../../src/components/ui/input';
import { Tooltip } from '../../src/components/ui/tooltip';
import { CopyField } from '../../src/components/patterns/copy-field';
import { DashboardCard } from '../../src/components/patterns/dashboard-card';

describe('design system accessibility contracts', () => {
  it('connects a field label and helper text to its control', () => {
    render(
      <Field label="Email" htmlFor="email" description="Use your government email address." required>
        <Input id="email" />
      </Field>,
    );

    const input = screen.getByRole('textbox', { name: /Email/ });
    expect(input).toHaveAccessibleDescription('Use your government email address.');
  });

  it('exposes field errors through the control description', () => {
    render(
      <Field label="Email" htmlFor="email" error="Enter a valid email address.">
        <Input id="email" />
      </Field>,
    );

    const input = screen.getByRole('textbox', { name: 'Email' });
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Enter a valid email address.');
  });

  it('associates keyboard-accessible tooltip content with its trigger', () => {
    render(
      <Tooltip content="Copy the workflow identifier">
        <button type="button">Copy</button>
      </Tooltip>,
    );

    expect(screen.getByRole('button', { name: 'Copy' })).toHaveAccessibleDescription('Copy the workflow identifier');
  });

  it('copies a read-only value and announces completion', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    render(<CopyField label="Workflow ID" value="workflow-123" />);
    await user.click(screen.getByRole('button', { name: 'Copy' }));

    expect(writeText).toHaveBeenCalledWith('workflow-123');
    expect(screen.getByText('Workflow ID copied to clipboard.')).toBeInTheDocument();
  });

  it('renders actionable dashboard cards as named links', () => {
    render(
      <MemoryRouter>
        <DashboardCard
          to="/projects"
          title="Projects"
          description="View and manage project mappings."
          icon={IconFolder}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: /Projects/ })).toHaveAttribute('href', '/projects');
  });
});
