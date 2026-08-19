---
name: Workflow User Portal
description: Design system guidance for the external workflow user portal.
version: 1.0.1
last_verified: 2026-07-27
sources:
  figma:
    name: Workflow User Portal
    url: https://www.figma.com/design/yYR1AIWk5rIlQTP4ZrvWcz/Workflow-User-Portal?node-id=0-1&m=dev
    design_system_node: '5:5101'
    palette_node: '5:4448'
  production:
    tokens: src/styles/tokens.css
    base_styles: src/styles/base.css
tokens:
  colors:
    background: '#ffffff'
    foreground: '#252423'
    surface: '#ffffff'
    surface-subtle: '#faf9f8'
    surface-muted: '#f2f2f2'
    border: '#d8d8d8'
    border-strong: '#898785'
    text-muted: '#606060'
    primary: '#013366'
    primary-hover: '#01264c'
    primary-active: '#001b35'
    on-primary: '#ffffff'
    secondary: '#ffffff'
    secondary-hover: '#f2f2f2'
    on-secondary: '#013366'
    accent: '#fcba19'
    link: '#255a90'
    link-hover: '#01264c'
    focus: '#1e5189'
    danger: '#ce3e39'
    danger-hover: '#a72f2b'
    danger-surface: '#fcebea'
    on-danger-surface: '#711e1a'
    success: '#42814a'
    success-surface: '#eaf4eb'
    on-success-surface: '#234c28'
    warning: '#f8bb47'
    warning-surface: '#fff4d6'
    on-warning-surface: '#5f4300'
    information: '#1e5189'
    information-surface: '#e9f1f8'
    on-information-surface: '#01264c'
  typography:
    family-sans: "'BC Sans', Arial, sans-serif"
    weight-regular: 400
    weight-emphasis: 700
    page-title: '2rem/2.5rem'
    section-title: '1.5rem/2rem'
    card-title: '1.25rem/1.75rem'
    body-large: '1rem/1.5rem'
    body: '0.875rem/1.25rem'
    body-small: '0.8125rem/1rem'
    caption: '0.75rem/1rem'
  radii:
    control: '0.375rem'
    card: '0.75rem'
    dialog: '0.5rem'
    pill: '999px'
  spacing:
    field-gap: '0.375rem'
    control-gap: '0.5rem'
    cluster-gap: '0.75rem'
    card-padding: '1.25rem'
    card-padding-wide: '1.5rem'
    section-gap: 'clamp(1.5rem, 3vw, 2rem)'
    page-gutter: 'clamp(1rem, 4vw, 2rem)'
    page-block-start: 'clamp(2rem, 4vw, 2.5rem)'
  layout:
    content-max: '75rem'
    shell-max: '80rem'
    header-height: '4rem'
    footer-height: '4rem'
    minimum-viewport: '20rem'
  shadows:
    card: '0 1px 2px rgb(37 36 35 / 8%)'
    card-hover: '0 4px 12px rgb(37 36 35 / 14%)'
    dialog: '0 16px 40px rgb(37 36 35 / 24%)'
  motion:
    fast: '150ms'
    standard: '200ms'
  focus:
    width: '0.1875rem'
    offset: '0.125rem'
---

# Workflow User Portal design system

This document is the design contract for `external-ui`. It translates the Figma file into implementation guidance while keeping the production token layer authoritative.

## Authority and maintenance

Use sources in this order:

1. `src/styles/tokens.css` and `src/styles/base.css` define production values and global behavior.
2. Existing components in `src/components/ui`, `src/components/patterns`, and `src/components/layout` define production structure, interaction, and accessibility.
3. The Figma redesign frames define visual intent, page composition, and expected states.
4. Raw Figma hex values or absolute positions are reference evidence only.

The Figma file contains local components but no local variable collections, paint styles, text styles, or effect styles. The component showcase at node `5:5101` has no bound variables, while the palette reference at node `5:4448` retains resolved B.C. Design Tokens (v3.2.0) bindings. The file-level library list shows Material Design Icons (Community) as the only subscribed library; the B.C. Design System library is available but not subscribed. Treat semantic bindings on the palette node as reference evidence, and do not treat an unbound value in a local component example as a new project token.

The Figma component examples sometimes use Inter, while the Figma typography guide and the application use BC Sans. BC Sans is the product font. Do not introduce Inter. The shipped font files provide regular and bold weights, so use `typography.weight-emphasis` instead of synthesizing medium or semibold faces.

## Brand and visual character

The portal should feel official, calm, direct, and task-oriented. Its identity comes from:

- B.C. government blue for the application shell and primary actions.
- B.C. gold as a narrow navigational accent, not a general-purpose fill.
- White cards on quiet gray page surfaces.
- Strong hierarchy, restrained elevation, and generous whitespace.
- Plain, outcome-focused language that explains what users can do next.

Prefer clarity over decoration. Icons support recognition but never replace a visible label for an unfamiliar or consequential action. Use Tabler icons already installed in the project; use a Figma-exported asset only when its glyph has no faithful project equivalent.

## Color decisions

Token names describe roles. Components must consume these roles rather than primitive color names or raw hex values.

| Token                                            | Purpose and reasoning                                                                                       | Constraints                                                                                                             |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `colors.background`                              | Default document background; keeps content neutral and readable.                                            | Do not use to visually group a card from the page.                                                                      |
| `colors.surface`                                 | Cards, dialogs, inputs, and other raised or bounded regions.                                                | Pair with `colors.border` or an appropriate shadow when separation is needed.                                           |
| `colors.surface-subtle`                          | Read-only fields, hover areas, filter regions, and low-emphasis grouping.                                   | Do not use as a disabled-state signal by itself.                                                                        |
| `colors.surface-muted`                           | Stronger neutral state, including disabled controls.                                                        | Disabled controls also need native `disabled` behavior and muted text.                                                  |
| `colors.foreground`                              | Primary text and icons.                                                                                     | Use for content, not on dark brand surfaces.                                                                            |
| `colors.text-muted`                              | Descriptions, metadata, helper text, and secondary labels.                                                  | Never use for validation errors or essential instructions when contrast becomes marginal.                               |
| `colors.primary`                                 | Header shell and primary actions. It communicates official, high-confidence action.                         | Use once per local decision area when possible; do not make every action primary.                                       |
| `colors.primary-hover` / `colors.primary-active` | Pointer and pressed feedback for primary actions.                                                           | State changes must not rely on color alone; preserve label, focus, and geometry.                                        |
| `colors.accent`                                  | Active navigation underline and the thin shell divider. Gold provides a recognizable B.C. cue.              | Do not use for body text, large surfaces, generic warnings, or primary buttons.                                         |
| `colors.link` / `colors.link-hover`              | Inline navigation and text actions.                                                                         | Default links should remain visibly identifiable; underline on hover is additive, not the sole accessible cue in prose. |
| `colors.focus`                                   | Universal keyboard focus outline.                                                                           | Never remove it. On the blue shell, use the accent-colored focus treatment already defined by shell components.         |
| Semantic status triples                          | `danger`, `success`, `warning`, and `information` each provide an accent, surface, and readable foreground. | Use only for the matching meaning. Pair status color with text and, when useful, an icon.                               |

Destructive red is reserved for errors and the committed destructive step. A resting “Remove” action may be outlined or lower emphasis; the final “Remove access” confirmation uses `colors.danger`.

### Verified Figma-to-production reconciliation

The core brand roles agree across the B.C. palette node and production: primary `#013366`, accent `#fcba19`, border `#d8d8d8`, strong border `#898785`, link `#255a90`, and the danger/success/warning accents `#ce3e39`, `#42814a`, and `#f8bb47`.

Production `colors.foreground` (`#252423`) maps to the Figma palette’s `theme/gray/110`. The Figma token `typography/color/primary` separately resolves to `#2d2d2d`; do not replace the production foreground role with that component-level typography value.

Known differences are deliberate source reconciliations, not additional token variants:

| Area                      | Figma evidence                                                                                                                                     | Production decision                                                                                             |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Primary button states     | Local component nodes `5:5049`, `5:5052`, and `5:5055` use `#013366`, `#1e5189`, and `#01264c`.                                                    | Use `colors.primary`, `colors.primary-hover`, and `colors.primary-active`: `#013366`, `#01264c`, and `#001b35`. |
| Destructive button states | Local component nodes `65:107`, `65:110`, and `65:113` use unbound Tailwind reds `#dc2626`, `#b91c1c`, and `#991b1b`, with Inter Semi Bold labels. | Use the danger tokens (`#ce3e39` default, `#a72f2b` hover/active) and BC Sans.                                  |
| Semantic surfaces         | Figma palette bindings resolve info `#f7f9fc`, danger `#f4e1e2`, success `#f6fff8`, and warning `#fef1d8`.                                         | Use the production information `#e9f1f8`, danger `#fcebea`, success `#eaf4eb`, and warning `#fff4d6` surfaces.  |

Do not “correct” these production values by copying the local component swatches. Revisit them only through an explicit design-token decision that updates `src/styles/tokens.css` and this document together.

## Typography

Use `typography.family-sans` everywhere. Keep text left-aligned except for compact empty states and similarly self-contained messaging.

| Role          | Token                                                  | Use                                                             |
| ------------- | ------------------------------------------------------ | --------------------------------------------------------------- |
| Page title    | `typography.page-title` + `typography.weight-emphasis` | One `h1` per page.                                              |
| Section title | `typography.section-title` + emphasis                  | Major content groups and dialog titles when the scale fits.     |
| Card title    | `typography.card-title` + emphasis                     | Dashboard cards, workflow cards, and empty-state headings.      |
| Large body    | `typography.body-large`                                | Introductory copy that needs more presence.                     |
| Body          | `typography.body`                                      | Default descriptions, controls, table content, and helper copy. |
| Small body    | `typography.body-small`                                | Navigation, compact actions, and dense metadata.                |
| Caption       | `typography.caption`                                   | Timestamps, counts, and supporting metadata only.               |

Use sentence case. Avoid all caps except for genuinely conventional short labels. Keep page descriptions outcome-focused: explain what appears on the page or what the user can accomplish, not internal system mechanics.

## Spacing, shape, and elevation

The layout follows a restrained 4px/8px rhythm expressed through role tokens:

- Use `spacing.field-gap` between a label, control, helper text, and error.
- Use `spacing.control-gap` between icon and label or between tightly related controls.
- Use `spacing.cluster-gap` between peer actions.
- Use `spacing.card-padding` by default and `spacing.card-padding-wide` from the small breakpoint upward.
- Use `spacing.section-gap` between major page regions.
- Use `spacing.page-gutter` at the page edge.

Controls use `radii.control`; cards use `radii.card`; dialogs use `radii.dialog`; badges and filter chips use `radii.pill`. Do not mix arbitrary radii inside a component family.

Use `shadows.card` for quiet separation and `shadows.card-hover` only for an interactive card. Use `shadows.dialog` for modal elevation. Do not add elevation to ordinary form controls or static status surfaces.

## Layout and responsiveness

Desktop Figma frames are 1440px wide with a 1200px content column. Implement that intent with `layout.content-max` and fluid `spacing.page-gutter`, never with fixed 120px page margins.

- The application is usable down to `layout.minimum-viewport`.
- Page content is constrained to `layout.content-max`.
- The shell may extend to `layout.shell-max` to accommodate identity, navigation, account details, and actions.
- Header and footer are at least their respective height tokens.
- Multi-column dashboard content collapses progressively to one column.
- Filter bars stack controls on narrow viewports and align them in a row when space permits.
- Wide data tables may scroll horizontally; core row actions and labels must remain understandable.
- Desktop navigation becomes a labelled menu button and drawer below the large breakpoint.
- Touch targets should be at least 44px where practical. The project’s compact button size is reserved for secondary actions inside spacious layouts.

Do not copy Figma absolute coordinates into application code. Preserve relationships: content hierarchy, alignment, gaps, maximum widths, and responsive behavior.

## Components

Build screens from existing project components. Extend a component’s variants when a reusable state is missing; do not duplicate its styling at the page level.

### Application shell and navigation

Use `AppHeader`, `AppFooter`, and `AppLayout`.

- Default navigation links are white on `colors.primary`.
- Hover adds a quiet translucent surface.
- The current page uses emphasis plus the `colors.accent` underline and `aria-current="page"`.
- Keyboard focus stays visible.
- The skip link becomes visible on focus.
- Account email is secondary information and may truncate at narrow widths.
- “Sign in” and “Log out” retain visible text where space permits.
- The mobile menu closes after navigation and on Escape.

### Buttons and text actions

Use `Button`. Choose variants by consequence:

- `default`: the primary action in a decision area.
- `secondary`: an important alternative such as Cancel.
- `outline`: a neutral bounded action.
- `ghost`: a low-emphasis action inside another surface.
- `link`: navigation expressed as text.
- `destructive`: the final destructive commitment.

Every button must cover default, hover, active, focus-visible, and disabled behavior. A loading button keeps its label or accessible name stable, preserves width, sets `aria-busy="true"`, and prevents duplicate submission. Disabled styling never replaces the native disabled state or an explanation when the reason is not obvious.

### Cards and dashboard cards

Use `Card` for bounded information and `DashboardCard` for navigation.

- Static cards use `colors.surface`, `colors.border`, `radii.card`, and `shadows.card`.
- Interactive cards gain stronger border/elevation feedback on hover and a visible focus outline.
- A dashboard card has one accessible link target, a title, a short outcome-focused description, an icon badge, and an “Open” affordance.
- Do not place competing nested links inside an all-card link.

### Fields, selects, and textareas

Use `Field` with `Input`, `Select`, or `Textarea`.

- A persistent visible label is required; placeholder text is an example, never the label.
- Helper text describes format or requirements before interaction.
- Validation errors appear after submit or an appropriate touched/blur condition, not on initial load.
- Invalid controls use `aria-invalid`, a semantic error message, and the danger tokens.
- Disabled controls use `colors.surface-muted`, retain readable text, and are non-interactive.
- Read-only identifiers use `CopyField`, not an input-like affordance.

### Copy field

Use `CopyField` for workflow, tenant, and project IDs that users may need for support or sharing.

- Keep the label visible and the value selectable.
- Truncate only visually; expose the full value through the title/accessibility relationship.
- States are idle, copied, and error.
- Announce copy success or failure through the existing polite live region.
- Do not give read-only IDs the appearance of editable text inputs.

### Tabs, filters, and action lists

Use `TabList` and `TabTrigger` for views of the same data, and `FilterBar` for visible query controls.

- Tabs cover default, hover, selected, focus-visible, and disabled states; selection is exposed with `aria-selected`.
- Each filter has a visible, programmatically associated label.
- Filter chips are pill-shaped and cover default, hover, active/pressed, selected, focus-visible, and disabled states.
- Action list rows cover default, hover, selected, focus-visible, loading, empty, and error behavior.
- Selection uses more than a background change: combine border, weight, or semantic state.
- Status badges are compact read-only labels, not buttons. Their text must name the status.

### Badges, alerts, and inline confirmation

Use `Badge` for compact status metadata and `Alert` for messages requiring attention. Use `InlineConfirmation` to safeguard a consequential row-level action without losing context.

- Available meanings are neutral/default, information, success, warning, and danger/destructive.
- Alert titles state the condition; descriptions explain impact or next action.
- An inline destructive confirmation names the affected person or object and states the consequence.
- Success feedback confirms what happened and what happens next.
- Do not use red for a reversible resting action when a neutral treatment is sufficient.

### Empty states

Use `EmptyState`.

- State what is absent.
- Explain why that matters in the current context.
- Offer the most likely next action when the user can resolve it.
- Use an icon as supportive decoration and keep the message concise.
- Do not leave users at a dead end or add redundant navigation below the card.

### Dialogs

Use the existing Radix-based dialog primitives.

- The dialog has a clear title and explains the consequence of the action.
- Focus moves into the dialog, is trapped while open, and returns to the trigger on close.
- Escape and a visible Cancel action dismiss non-destructive dialogs.
- The backdrop separates the decision from the page without making background content readable as active.
- Primary submission stays disabled until minimum requirements are met; helper text explains why.
- Validation runs inline at the appropriate interaction point.

## Page composition

A standard page uses:

1. `PageContainer`.
2. `PageHeader` with one title, a concise description, and optional page-level actions.
3. Major regions separated by `spacing.section-gap`.
4. Existing patterns such as `FilterBar`, `EmptyState`, cards, lists, or tables.

The home page is a responsive dashboard of permission-appropriate destinations. Workflow pages use cards and `CopyField` for identifiers. Workflow interaction uses labelled tenant/status filters before its tabs and action/message content. Access-request experiences use persistent labels, useful examples, delayed validation, and explicit success confirmation.

## Interaction, accessibility, and motion

- Keyboard focus is always visible and uses the focus tokens.
- Use semantic HTML before ARIA. ARIA augments native roles; it does not replace them.
- The active route uses `aria-current="page"`.
- Icon-only controls need an accessible name; visible labels are preferred for unfamiliar actions.
- Status and validation never depend on color alone.
- Announce asynchronous success, failure, and loading changes appropriately.
- Preserve logical heading order and a single page `h1`.
- Respect `prefers-reduced-motion`; movement is removed or reduced to near-instant feedback.
- Use `motion.fast` for small state changes and `motion.standard` for standard transitions. Avoid decorative looping motion.
- Preserve usable contrast in forced-colors mode.

## Content guidance

Write for the user’s goal:

- Prefer “View and manage workflows shared with you” over a description of internal sharing mechanics.
- Explain unfamiliar IDs only when they are exposed.
- Name affected entities in destructive confirmations.
- Give concrete examples in helper text.
- Confirm submission and describe the next step.

Avoid raw UUIDs as visual hierarchy, premature error messages, ambiguous “All” filters, passive empty states, and generic placeholders.

## Adding or changing the system

Before adding a value or component:

1. Search the production tokens and existing components.
2. Confirm that the need is a reusable role, not a one-page visual exception.
3. Add or change the role in `src/styles/tokens.css`.
4. Update the owning component and all relevant states.
5. Verify keyboard, pointer, disabled, loading, error, empty, and responsive behavior as applicable.
6. Update this file when the decision, rationale, or constraint changes.

Do not add a token merely because a new hex value appears in a mockup. A new token must express a durable design decision.
