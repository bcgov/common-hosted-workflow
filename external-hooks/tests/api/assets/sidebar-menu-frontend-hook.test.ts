import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

const testDir = dirname(fileURLToPath(import.meta.url));
const hookPath = resolve(testDir, '../../../src/api/assets/sidebar-menu-frontend-hook.js');
const hookScript = readFileSync(hookPath, 'utf8');
const oidcHookPath = resolve(testDir, '../../../src/api/assets/oidc-frontend-hook.js');
const oidcHookScript = readFileSync(oidcHookPath, 'utf8');
const dockerfilePath = resolve(testDir, '../../../../Dockerfile');
const dockerfile = readFileSync(dockerfilePath, 'utf8');

// ---------------------------------------------------------------------------
// Minimal fake DOM (enough fidelity for the sidebar hook under vm)
// ---------------------------------------------------------------------------

class FakeClassList {
  private items = new Set<string>();

  constructor(initial = '') {
    for (const part of initial.split(/\s+/).filter(Boolean)) this.items.add(part);
  }

  add(...tokens: string[]) {
    for (const token of tokens) this.items.add(token);
  }

  remove(...tokens: string[]) {
    for (const token of tokens) this.items.delete(token);
  }

  contains(token: string) {
    return this.items.has(token);
  }

  sync(value: string) {
    this.items = new Set(value.split(/\s+/).filter(Boolean));
  }
}

class FakeTextNode {
  parentNode: FakeElement | null = null;
  nodeValue: string;
  readonly tagName = '#TEXT';

  constructor(text: string) {
    this.nodeValue = text;
  }
}

type FakeChild = FakeElement | FakeTextNode;

function isElement(node: FakeChild): node is FakeElement {
  return node instanceof FakeElement;
}

class FakeElement {
  tagName: string;
  attrs = new Map<string, string>();
  children: FakeChild[] = [];
  parentNode: FakeElement | null = null;
  classList: FakeClassList;
  namespaceURI: string | null = null;
  private listeners = new Map<string, Array<(...args: unknown[]) => void>>();

  constructor(tag: string, attrs: Record<string, string> = {}) {
    this.tagName = tag.toUpperCase();
    for (const [key, value] of Object.entries(attrs)) this.attrs.set(key, value);
    this.classList = new FakeClassList(attrs['class'] ?? '');
  }

  getAttribute(name: string): string | null {
    return this.attrs.has(name) ? (this.attrs.get(name) as string) : null;
  }

  setAttribute(name: string, value: string) {
    this.attrs.set(name, String(value));
    if (name === 'class') this.classList.sync(String(value));
  }

  removeAttribute(name: string) {
    this.attrs.delete(name);
  }

  appendChild<T extends FakeChild>(child: T): T {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  insertBefore<T extends FakeChild>(child: T, ref: FakeChild | null): T {
    child.parentNode = this;
    if (!ref) {
      this.children.push(child);
      return child;
    }
    const index = this.children.indexOf(ref);
    if (index === -1) {
      this.children.push(child);
    } else {
      this.children.splice(index, 0, child);
    }
    return child;
  }

  replaceChild<T extends FakeChild>(child: T, old: FakeChild): T {
    const index = this.children.indexOf(old);
    if (index !== -1) {
      this.children[index] = child;
      child.parentNode = this;
      old.parentNode = null;
    }
    return child;
  }

  removeChild<T extends FakeChild>(child: T): T {
    const index = this.children.indexOf(child);
    if (index !== -1) {
      this.children.splice(index, 1);
      child.parentNode = null;
    }
    return child;
  }

  cloneNode(deep = false): FakeElement {
    const clone = new FakeElement(this.tagName.toLowerCase());
    for (const [key, value] of this.attrs) clone.attrs.set(key, value);
    clone.classList = new FakeClassList(this.getAttribute('class') ?? '');
    clone.namespaceURI = this.namespaceURI;
    if (deep) {
      for (const child of this.children) {
        if (isElement(child)) clone.appendChild(child.cloneNode(true));
        else clone.appendChild(new FakeTextNode(child.nodeValue));
      }
    }
    return clone;
  }

  querySelector(selector: string): FakeElement | null {
    return querySelectorAllIn(this, selector, false)[0] ?? null;
  }

  querySelectorAll(selector: string): FakeElement[] {
    return querySelectorAllIn(this, selector, false);
  }

  closest(selector: string): FakeElement | null {
    return closestUp(this, selector);
  }

  addEventListener(type: string, listener: (...args: unknown[]) => void) {
    const existing = this.listeners.get(type) ?? [];
    existing.push(listener);
    this.listeners.set(type, existing);
  }

  click() {
    const event = {
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
    };
    for (const listener of this.listeners.get('click') ?? []) listener(event);
    return event;
  }

  get textContent(): string {
    return this.children.map((child) => (isElement(child) ? child.textContent : child.nodeValue)).join('');
  }

  set textContent(value: string) {
    for (const child of this.children) child.parentNode = null;
    this.children = [];
    if (value !== '') {
      const text = new FakeTextNode(value);
      text.parentNode = this;
      this.children.push(text);
    }
  }
}

function matchesSimple(element: FakeElement, selector: string): boolean {
  const simple = selector.trim();
  if (!simple) return false;
  let tag: string | null = null;
  let rest = simple;
  if (!simple.startsWith('[') && !simple.startsWith('.')) {
    const tagMatch = /^([a-zA-Z][a-zA-Z0-9-]*|\*)(.*)$/.exec(simple);
    if (tagMatch) {
      tag = tagMatch[1].toLowerCase();
      rest = tagMatch[2];
    }
  }
  if (tag && tag !== '*' && element.tagName.toLowerCase() !== tag) return false;
  for (const classMatch of rest.matchAll(/\.([a-zA-Z0-9_-]+)/g)) {
    if (!element.classList.contains(classMatch[1])) return false;
  }
  for (const attrMatch of rest.matchAll(/\[([a-zA-Z0-9_-]+)(?:="([^"]*)")?\]/g)) {
    const actual = element.getAttribute(attrMatch[1]);
    if (attrMatch[2] === undefined) {
      if (actual === null) return false;
    } else if (actual !== attrMatch[2]) {
      return false;
    }
  }
  return true;
}

function matchesSelectorGroup(element: FakeElement, group: string): boolean {
  return group
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .some((part) => matchesSimple(element, part));
}

function closestUp(node: FakeElement | null, selector: string): FakeElement | null {
  let current = node;
  while (current) {
    if (matchesSelectorGroup(current, selector)) return current;
    current = current.parentNode;
  }
  return null;
}

function querySelectorAllIn(root: FakeElement, group: string, includeSelf: boolean): FakeElement[] {
  const found: FakeElement[] = [];
  const visit = (node: FakeElement, isRoot: boolean) => {
    if ((includeSelf || !isRoot) && matchesSelectorGroup(node, group)) found.push(node);
    for (const child of node.children) {
      if (isElement(child)) visit(child, false);
    }
  };
  visit(root, true);
  return found;
}

class FakeDocument {
  documentElement: FakeElement;
  body: FakeElement;
  readyState: string;
  private listeners = new Map<string, Array<(...args: unknown[]) => void>>();

  constructor(readyState = 'complete') {
    this.readyState = readyState;
    this.documentElement = new FakeElement('html');
    this.body = new FakeElement('body');
    this.documentElement.appendChild(this.body);
  }

  querySelector(selector: string): FakeElement | null {
    return querySelectorAllIn(this.documentElement, selector, true)[0] ?? null;
  }

  querySelectorAll(selector: string): FakeElement[] {
    return querySelectorAllIn(this.documentElement, selector, true);
  }

  createElementNS(namespace: string, tag: string): FakeElement {
    const element = new FakeElement(tag);
    element.namespaceURI = namespace;
    return element;
  }

  createTreeWalker(root: FakeElement, whatToShow: number) {
    void whatToShow;
    const texts: FakeTextNode[] = [];
    const collect = (node: FakeChild) => {
      if (!isElement(node)) {
        texts.push(node);
        return;
      }
      for (const child of node.children) collect(child);
    };
    collect(root);
    let index = -1;
    return {
      nextNode: () => {
        index += 1;
        return index < texts.length ? texts[index] : null;
      },
    };
  }

  addEventListener(type: string, listener: (...args: unknown[]) => void) {
    const existing = this.listeners.get(type) ?? [];
    existing.push(listener);
    this.listeners.set(type, existing);
  }

  dispatch(type: string) {
    for (const listener of this.listeners.get(type) ?? []) listener();
  }
}

type SidebarAnchor = {
  testId: string;
  label: string;
  href: string;
  active?: boolean;
  /** Render the clickable as a non-anchor element (covers the click-handler branch). */
  asDiv?: boolean;
};

type HarnessOptions = {
  anchors?: SidebarAnchor[];
  menuOverride?: Record<string, unknown>;
  readyState?: string;
};

type Harness = {
  document: FakeDocument;
  container: FakeElement;
  menu: () => FakeElement | null;
  byTestId: (id: string) => FakeElement | null;
  setOverride: (override: Record<string, unknown>) => void;
  childrenTestIds: () => Array<string | null>;
  fireMutations: () => void;
  runTimers: () => void;
  assignedTo: string[];
  opened: Array<{ url: string; target: string }>;
  logs: unknown[][];
  mutationObserved: boolean;
};

function buildMenuItem(testId: string, label: string, href: string, active = false, asDiv = false): FakeElement {
  const outer = new FakeElement('div', { 'data-test-id': testId });
  const link = asDiv
    ? new FakeElement('div', { 'data-test-id': 'menu-item', role: 'menuitem', 'aria-label': label })
    : new FakeElement('a', {
        href,
        'data-test-id': 'menu-item',
        role: 'menuitem',
        'aria-label': label,
      });
  if (active) {
    link.classList.add('router-link-active');
    link.setAttribute('aria-current', 'page');
  }
  const iconWrap = new FakeElement('div', { class: 'menuItemIcon' });
  const svg = new FakeElement('svg');
  svg.namespaceURI = 'http://www.w3.org/2000/svg';
  iconWrap.appendChild(svg);
  const labelWrap = new FakeElement('div', { class: 'menuItemLabel' });
  const text = new FakeElement('span', { class: 'menuItemText' });
  text.appendChild(new FakeTextNode(label));
  labelWrap.appendChild(text);
  link.appendChild(iconWrap);
  link.appendChild(labelWrap);
  outer.appendChild(link);
  return outer;
}

function runHook(options: HarnessOptions = {}): Harness {
  const anchors = options.anchors ?? [
    { testId: 'main-sidebar-insights', label: 'Insights', href: '/insights' },
    { testId: 'main-sidebar-help', label: 'Help', href: '/help' },
    { testId: 'main-sidebar-settings', label: 'Settings', href: '/settings' },
  ];

  const document = new FakeDocument(options.readyState ?? 'complete');
  const container = new FakeElement('div', { class: 'bottomMenuItems' });
  for (const anchor of anchors) {
    container.appendChild(buildMenuItem(anchor.testId, anchor.label, anchor.href, anchor.active, anchor.asDiv));
  }
  document.body.appendChild(container);

  const assignedTo: string[] = [];
  const opened: Array<{ url: string; target: string }> = [];
  const logs: unknown[][] = [];
  const timers: Array<() => void> = [];
  const intervals: Array<() => void> = [];
  const mutationCallbacks: Array<() => void> = [];
  let mutationObserved = false;

  class FakeMutationObserver {
    private callback: () => void;

    constructor(callback: () => void) {
      this.callback = callback;
      mutationCallbacks.push(callback);
    }

    observe() {
      mutationObserved = true;
    }
  }

  const windowValue: Record<string, unknown> = {
    NodeFilter: { SHOW_TEXT: 4 },
    location: {
      assign: (url: string) => {
        assignedTo.push(url);
      },
    },
    open: (url: string, target: string) => {
      opened.push({ url: String(url), target: String(target) });
      return null;
    },
  };
  if (options.menuOverride) {
    windowValue['__CHWF_SIDEBAR_MENU__'] = options.menuOverride;
  }

  const context = vm.createContext({
    console: {
      log: (...args: unknown[]) => logs.push(args),
    },
    document,
    window: windowValue,
    MutationObserver: FakeMutationObserver,
    setTimeout: (callback: () => void) => {
      timers.push(callback);
      return timers.length;
    },
    setInterval: (callback: () => void) => {
      intervals.push(callback);
      return intervals.length;
    },
  });

  vm.runInContext(hookScript, context);

  const testId = String((options.menuOverride?.testId as string | undefined) ?? 'main-sidebar-chwf-portal');
  return {
    assignedTo,
    byTestId: (id: string) => document.querySelector(`[data-test-id="${id}"]`),
    setOverride: (override: Record<string, unknown>) => {
      windowValue['__CHWF_SIDEBAR_MENU__'] = override;
    },
    childrenTestIds: () => container.children.filter(isElement).map((child) => child.getAttribute('data-test-id')),
    container,
    document,
    fireMutations: () => {
      for (const callback of [...mutationCallbacks]) callback();
    },
    logs,
    menu: () => document.querySelector(`[data-test-id="${testId}"]`),
    mutationObserved,
    opened,
    runTimers: () => {
      for (const timer of timers.splice(0)) timer();
    },
  };
}

describe('sidebar menu frontend hook', () => {
  it('inserts Workflow Portal directly above Insights', () => {
    const harness = runHook();

    const menu = harness.menu();
    expect(menu).not.toBeNull();
    expect(harness.childrenTestIds()).toEqual([
      'main-sidebar-chwf-portal',
      'main-sidebar-insights',
      'main-sidebar-help',
      'main-sidebar-settings',
    ]);

    expect(menu?.getAttribute('data-chwf-custom-menu')).toBe('true');

    const link = menu?.querySelector('a');
    expect(link?.getAttribute('href')).toBe('/ui');
    expect(link?.getAttribute('target')).toBe('_self');
    expect(link?.getAttribute('aria-label')).toBe('Workflow Portal');
    expect(link?.getAttribute('title')).toBe('Workflow Portal');
    expect(link?.textContent).toContain('Workflow Portal');
    expect(link?.textContent).not.toContain('Insights');

    // Icon is replaced with the portal grid glyph instead of the clone's chart icon
    const svg = menu?.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.querySelectorAll('path').length).toBe(4);
  });

  it('is idempotent across mutation observer callbacks and timers', () => {
    const harness = runHook();

    harness.fireMutations();
    harness.runTimers();
    harness.fireMutations();

    expect(harness.childrenTestIds()).toEqual([
      'main-sidebar-chwf-portal',
      'main-sidebar-insights',
      'main-sidebar-help',
      'main-sidebar-settings',
    ]);
    expect(harness.menu()).not.toBeNull();
  });

  it('re-inserts the menu when Vue re-renders and drops it', () => {
    const harness = runHook();
    const menu = harness.menu();
    expect(menu).not.toBeNull();

    // Simulate a Vue bottom-menu re-render that removes non-VDOM nodes
    harness.container.removeChild(menu as FakeElement);
    expect(harness.menu()).toBeNull();

    harness.fireMutations();
    expect(harness.menu()).not.toBeNull();
    expect(harness.childrenTestIds()[0]).toBe('main-sidebar-chwf-portal');
  });

  it('falls back to Help when Insights is hidden', () => {
    const harness = runHook({
      anchors: [
        { testId: 'main-sidebar-help', label: 'Help', href: '/help' },
        { testId: 'main-sidebar-settings', label: 'Settings', href: '/settings' },
      ],
    });

    expect(harness.childrenTestIds()).toEqual([
      'main-sidebar-chwf-portal',
      'main-sidebar-help',
      'main-sidebar-settings',
    ]);
  });

  it('falls back to Settings when Insights and Help are hidden', () => {
    const harness = runHook({
      anchors: [{ testId: 'main-sidebar-settings', label: 'Settings', href: '/settings' }],
    });

    expect(harness.childrenTestIds()).toEqual(['main-sidebar-chwf-portal', 'main-sidebar-settings']);
  });

  it('does nothing when the sidebar is absent (e.g. login page)', () => {
    const harness = runHook({ anchors: [] });

    expect(harness.menu()).toBeNull();
    expect(harness.childrenTestIds()).toEqual([]);
  });

  it('never inherits the active state from the template item', () => {
    const harness = runHook({
      anchors: [
        { testId: 'main-sidebar-insights', label: 'Insights', href: '/insights', active: true },
        { testId: 'main-sidebar-help', label: 'Help', href: '/help' },
      ],
    });

    const menu = harness.menu();
    expect(menu).not.toBeNull();
    expect(menu?.querySelector('.router-link-active')).toBeNull();
    expect(menu?.querySelector('[aria-current="page"]')).toBeNull();

    const link = menu?.querySelector('a');
    expect(link?.getAttribute('aria-current')).toBeNull();
    expect(link?.getAttribute('href')).toBe('/ui');
  });

  it('respects window.__CHWF_SIDEBAR_MENU__ overrides', () => {
    const harness = runHook({
      menuOverride: { label: 'Docs', href: 'https://docs.example.test', testId: 'main-sidebar-docs' },
    });

    const menu = harness.document.querySelector('[data-test-id="main-sidebar-docs"]');
    expect(menu).not.toBeNull();
    expect(menu?.querySelector('a')?.getAttribute('href')).toBe('https://docs.example.test');
    expect(menu?.querySelector('a')?.textContent).toContain('Docs');
  });

  it('navigates via location.assign when the template has no anchor element', () => {
    const harness = runHook({
      anchors: [{ testId: 'main-sidebar-help', label: 'Help', href: '/help', asDiv: true }],
    });

    const clickable = harness.menu()?.querySelector('[role="menuitem"]');
    expect(clickable?.tagName).toBe('DIV');

    clickable?.click();
    expect(harness.assignedTo).toEqual(['/ui']);
  });

  it('opens a new tab for target _blank on non-anchor templates', () => {
    const harness = runHook({
      anchors: [{ testId: 'main-sidebar-help', label: 'Help', href: '/help', asDiv: true }],
      menuOverride: { href: 'https://docs.example.test', target: '_blank' },
    });

    harness.menu()?.querySelector('[role="menuitem"]')?.click();
    expect(harness.opened).toEqual([{ url: 'https://docs.example.test', target: '_blank' }]);
  });

  it('removes the stale entry when the configured test id changes', () => {
    const harness = runHook();
    expect(harness.menu()).not.toBeNull();

    harness.setOverride({ testId: 'main-sidebar-portal-v2', label: 'Portal V2' });
    harness.fireMutations();

    expect(harness.menu()).toBeNull();
    const updated = harness.byTestId('main-sidebar-portal-v2');
    expect(updated).not.toBeNull();
    expect(updated?.querySelector('[data-test-id="menu-item"]')?.textContent).toContain('Portal V2');
    expect(harness.childrenTestIds()).toEqual([
      'main-sidebar-portal-v2',
      'main-sidebar-insights',
      'main-sidebar-help',
      'main-sidebar-settings',
    ]);
  });

  it('falls back to the default test id for unsafe overrides', () => {
    const harness = runHook({ menuOverride: { testId: 'bad"id onmouseover="x' } });

    expect(harness.byTestId('main-sidebar-chwf-portal')).not.toBeNull();
    expect(harness.childrenTestIds()[0]).toBe('main-sidebar-chwf-portal');
  });

  it('starts on DOMContentLoaded when the script loads before the DOM', () => {
    const harness = runHook({ readyState: 'loading' });
    expect(harness.menu()).toBeNull();

    harness.document.dispatch('DOMContentLoaded');
    expect(harness.menu()).not.toBeNull();
  });

  it('observes DOM mutations so SPA re-renders are covered', () => {
    const harness = runHook();
    expect(harness.mutationObserved).toBe(true);
  });
});

describe('sidebar menu hook wiring', () => {
  it('hook script carries the expected markers', () => {
    expect(hookScript).toContain('__CHWF_SIDEBAR_MENU__');
    expect(hookScript).toContain('main-sidebar-insights');
    expect(hookScript).toContain('main-sidebar-chwf-portal');
    expect(hookScript).toContain('Workflow Portal');
    expect(hookScript).toContain('MutationObserver');
    expect(hookScript).toContain('data-chwf-custom-menu');
  });

  it('OIDC hook stays redirect-only and untouched by sidebar logic', () => {
    expect(oidcHookScript).not.toContain('chwf-portal');
    expect(oidcHookScript).not.toContain('main-sidebar-insights');
    expect(oidcHookScript).not.toContain('__CHWF_SIDEBAR_MENU__');
  });

  it('Dockerfile loads both frontend hooks with the n8n ";" separator', () => {
    expect(dockerfile).toContain('/assets/oidc-frontend-hook.js;/assets/sidebar-menu-frontend-hook.js');
  });
});
