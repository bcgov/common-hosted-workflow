/**
 * Props that stop browsers and password managers from autofilling the trigger and
 * CHEFS credential forms. These are configuration fields, not login fields, so a
 * saved email or password must never be suggested (or silently filled) into them.
 */
export const NO_AUTOFILL = {
  autoComplete: 'off',
  'data-1p-ignore': true,
  'data-lpignore': 'true',
  'data-form-type': 'other',
} as const;

/**
 * For secret fields such as the CHEFS API key. Browsers ignore `autocomplete="off"`
 * on password inputs, but honour `new-password` by not offering saved passwords.
 */
export const NO_AUTOFILL_SECRET = { ...NO_AUTOFILL, autoComplete: 'new-password' } as const;
