import * as React from 'react';
import { useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { IconChevronDown, IconX } from '@tabler/icons-react';

export type ComboboxInputProps = {
  /** Current value of the input. */
  value: string;
  /** Called when the value changes (typed or selected from dropdown). */
  onChange: (value: string) => void;
  /** Options to show in the dropdown. Empty array = plain input (no dropdown). */
  options: string[];
  /** Placeholder text. */
  placeholder?: string;
  /** Whether the input is disabled. */
  disabled?: boolean;
  /** HTML id attribute. */
  id?: string;
  /** Additional class names. */
  className?: string;
};

/**
 * A combobox input that combines a text field with a dropdown list.
 *
 * - Shows a styled dropdown with filterable options.
 * - User can type any custom value (not restricted to the list).
 * - Selecting from the dropdown sets the value.
 * - Clear button (X) appears when a value is set.
 * - If options is empty, behaves as a plain text input (no dropdown arrow).
 */
export function ComboboxInput({
  value,
  onChange,
  options,
  placeholder,
  disabled = false,
  id,
  className,
}: Readonly<ComboboxInputProps>) {
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const hasOptions = options.length > 0;
  const hasValue = value.length > 0;

  // Filter options based on current input text
  const filteredOptions = options.filter((opt) =>
    opt.toLowerCase().includes((filter || value).toLowerCase()),
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
    setFilter(newValue);
    if (hasOptions && !isOpen) {
      setIsOpen(true);
    }
  };

  const handleSelect = useCallback(
    (option: string) => {
      onChange(option);
      setFilter('');
      setIsOpen(false);
      inputRef.current?.focus();
    },
    [onChange],
  );

  const handleClear = () => {
    onChange('');
    setFilter('');
    setIsOpen(false);
    inputRef.current?.focus();
  };

  const toggleDropdown = () => {
    if (disabled || !hasOptions) return;
    setIsOpen((prev) => !prev);
    if (!isOpen) {
      setFilter('');
      inputRef.current?.focus();
    }
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close on Escape, open on ArrowDown
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
    } else if (e.key === 'ArrowDown' && hasOptions) {
      e.preventDefault();
      setIsOpen(true);
    }
  };

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          type="text"
          value={value}
          onChange={handleInputChange}
          onFocus={() => hasOptions && setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className={cn(
            'flex h-10 w-full rounded-md border border-[var(--bc-border)] bg-white px-3 py-2 text-sm ring-offset-white placeholder:text-[var(--bc-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bc-blue)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
            (hasOptions || hasValue) && 'pr-16',
          )}
          role="combobox"
          aria-expanded={isOpen}
          aria-autocomplete="list"
          autoComplete="off"
        />
        <div className="absolute inset-y-0 right-0 flex items-center">
          {hasValue && !disabled && (
            <button
              type="button"
              tabIndex={-1}
              onClick={handleClear}
              aria-label="Clear value"
              className="flex items-center px-1.5 text-[var(--bc-muted)] hover:text-[var(--bc-text)]"
            >
              <IconX size={14} aria-hidden="true" />
            </button>
          )}
          {hasOptions && (
            <button
              type="button"
              tabIndex={-1}
              onClick={toggleDropdown}
              disabled={disabled}
              aria-label="Toggle options"
              className="flex items-center px-2 text-[var(--bc-muted)] hover:text-[var(--bc-text)] disabled:opacity-50"
            >
              <IconChevronDown size={16} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {isOpen && hasOptions && (
        <ul
          role="listbox"
          className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-md border border-[var(--bc-border)] bg-white py-1 shadow-lg"
        >
          {filteredOptions.length > 0 ? (
            filteredOptions.map((option) => (
              <li
                key={option}
                role="option"
                aria-selected={option === value}
                onClick={() => handleSelect(option)}
                className={cn(
                  'cursor-pointer px-3 py-2 text-sm hover:bg-[var(--bc-surface)]',
                  option === value && 'bg-[var(--bc-surface)] font-medium',
                )}
              >
                {option}
              </li>
            ))
          ) : (
            <li className="px-3 py-2 text-sm text-[var(--bc-muted)]">No matching options</li>
          )}
        </ul>
      )}
    </div>
  );
}
