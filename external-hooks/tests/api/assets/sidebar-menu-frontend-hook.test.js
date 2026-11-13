"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const node_url_1 = require("node:url");
const node_vm_1 = __importDefault(require("node:vm"));
const vitest_1 = require("vitest");
const testDir = (0, node_path_1.dirname)((0, node_url_1.fileURLToPath)(import.meta.url));
const hookPath = (0, node_path_1.resolve)(testDir, '../../../src/api/assets/sidebar-menu-frontend-hook.js');
const hookScript = (0, node_fs_1.readFileSync)(hookPath, 'utf8');
const oidcHookPath = (0, node_path_1.resolve)(testDir, '../../../src/api/assets/oidc-frontend-hook.js');
const oidcHookScript = (0, node_fs_1.readFileSync)(oidcHookPath, 'utf8');
const dockerfilePath = (0, node_path_1.resolve)(testDir, '../../../../Dockerfile');
const dockerfile = (0, node_fs_1.readFileSync)(dockerfilePath, 'utf8');
// ---------------------------------------------------------------------------
// Minimal fake DOM (enough fidelity for the sidebar hook under vm)
// ---------------------------------------------------------------------------
class FakeClassList {
    items = new Set();
    constructor(initial = '') {
        for (const part of initial.split(/\s+/).filter(Boolean))
            this.items.add(part);
    }
    add(...tokens) {
        for (const token of tokens)
            this.items.add(token);
    }
    remove(...tokens) {
        for (const token of tokens)
            this.items.delete(token);
    }
    contains(token) {
        return this.items.has(token);
    }
    sync(value) {
        this.items = new Set(value.split(/\s+/).filter(Boolean));
    }
}
class FakeTextNode {
    parentNode = null;
    nodeValue;
    tagName = '#TEXT';
    constructor(text) {
        this.nodeValue = text;
    }
}
function isElement(node) {
    return node instanceof FakeElement;
}
class FakeElement {
    tagName;
    attrs = new Map();
    children = [];
    parentNode = null;
    classList;
    namespaceURI = null;
    listeners = new Map();
    constructor(tag, attrs = {}) {
        this.tagName = tag.toUpperCase();
        for (const [key, value] of Object.entries(attrs))
            this.attrs.set(key, value);
        this.classList = new FakeClassList(attrs['class'] ?? '');
    }
    getAttribute(name) {
        return this.attrs.has(name) ? this.attrs.get(name) : null;
    }
    setAttribute(name, value) {
        this.attrs.set(name, String(value));
        if (name === 'class')
            this.classList.sync(String(value));
    }
    removeAttribute(name) {
        this.attrs.delete(name);
    }
    appendChild(child) {
        child.parentNode = this;
        this.children.push(child);
        return child;
    }
    insertBefore(child, ref) {
        child.parentNode = this;
        if (!ref) {
            this.children.push(child);
            return child;
        }
        const index = this.children.indexOf(ref);
        if (index === -1) {
            this.children.push(child);
        }
        else {
            this.children.splice(index, 0, child);
        }
        return child;
    }
    replaceChild(child, old) {
        const index = this.children.indexOf(old);
        if (index !== -1) {
            this.children[index] = child;
            child.parentNode = this;
            old.parentNode = null;
        }
        return child;
    }
    removeChild(child) {
        const index = this.children.indexOf(child);
        if (index !== -1) {
            this.children.splice(index, 1);
            child.parentNode = null;
        }
        return child;
    }
    cloneNode(deep = false) {
        const clone = new FakeElement(this.tagName.toLowerCase());
        for (const [key, value] of this.attrs)
            clone.attrs.set(key, value);
        clone.classList = new FakeClassList(this.getAttribute('class') ?? '');
        clone.namespaceURI = this.namespaceURI;
        if (deep) {
            for (const child of this.children) {
                if (isElement(child))
                    clone.appendChild(child.cloneNode(true));
                else
                    clone.appendChild(new FakeTextNode(child.nodeValue));
            }
        }
        return clone;
    }
    querySelector(selector) {
        return querySelectorAllIn(this, selector, false)[0] ?? null;
    }
    querySelectorAll(selector) {
        return querySelectorAllIn(this, selector, false);
    }
    closest(selector) {
        return closestUp(this, selector);
    }
    addEventListener(type, listener) {
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
        for (const listener of this.listeners.get('click') ?? [])
            listener(event);
        return event;
    }
    get textContent() {
        return this.children.map((child) => (isElement(child) ? child.textContent : child.nodeValue)).join('');
    }
    set textContent(value) {
        for (const child of this.children)
            child.parentNode = null;
        this.children = [];
        if (value !== '') {
            const text = new FakeTextNode(value);
            text.parentNode = this;
            this.children.push(text);
        }
    }
}
function matchesSimple(element, selector) {
    const simple = selector.trim();
    if (!simple)
        return false;
    let tag = null;
    let rest = simple;
    if (!simple.startsWith('[') && !simple.startsWith('.')) {
        const tagMatch = /^([a-zA-Z][a-zA-Z0-9-]*|\*)(.*)$/.exec(simple);
        if (tagMatch) {
            tag = tagMatch[1].toLowerCase();
            rest = tagMatch[2];
        }
    }
    if (tag && tag !== '*' && element.tagName.toLowerCase() !== tag)
        return false;
    for (const classMatch of rest.matchAll(/\.([a-zA-Z0-9_-]+)/g)) {
        if (!element.classList.contains(classMatch[1]))
            return false;
    }
    for (const attrMatch of rest.matchAll(/\[([a-zA-Z0-9_-]+)(?:="([^"]*)")?\]/g)) {
        const actual = element.getAttribute(attrMatch[1]);
        if (attrMatch[2] === undefined) {
            if (actual === null)
                return false;
        }
        else if (actual !== attrMatch[2]) {
            return false;
        }
    }
    return true;
}
function matchesSelectorGroup(element, group) {
    return group
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
        .some((part) => matchesSimple(element, part));
}
function closestUp(node, selector) {
    let current = node;
    while (current) {
        if (matchesSelectorGroup(current, selector))
            return current;
        current = current.parentNode;
    }
    return null;
}
function querySelectorAllIn(root, group, includeSelf) {
    const found = [];
    const visit = (node, isRoot) => {
        if ((includeSelf || !isRoot) && matchesSelectorGroup(node, group))
            found.push(node);
        for (const child of node.children) {
            if (isElement(child))
                visit(child, false);
        }
    };
    visit(root, true);
    return found;
}
class FakeDocument {
    documentElement;
    body;
    readyState;
    listeners = new Map();
    constructor(readyState = 'complete') {
        this.readyState = readyState;
        this.documentElement = new FakeElement('html');
        this.body = new FakeElement('body');
        this.documentElement.appendChild(this.body);
    }
    querySelector(selector) {
        return querySelectorAllIn(this.documentElement, selector, true)[0] ?? null;
    }
    querySelectorAll(selector) {
        return querySelectorAllIn(this.documentElement, selector, true);
    }
    createElementNS(namespace, tag) {
        const element = new FakeElement(tag);
        element.namespaceURI = namespace;
        return element;
    }
    createTreeWalker(root, whatToShow) {
        void whatToShow;
        const texts = [];
        const collect = (node) => {
            if (!isElement(node)) {
                texts.push(node);
                return;
            }
            for (const child of node.children)
                collect(child);
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
    addEventListener(type, listener) {
        const existing = this.listeners.get(type) ?? [];
        existing.push(listener);
        this.listeners.set(type, existing);
    }
    dispatch(type) {
        for (const listener of this.listeners.get(type) ?? [])
            listener();
    }
}
function buildMenuItem(testId, label, href, active = false, asDiv = false) {
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
function runHook(options = {}) {
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
    const assignedTo = [];
    const opened = [];
    const logs = [];
    const timers = [];
    const intervals = [];
    const mutationCallbacks = [];
    let mutationObserved = false;
    class FakeMutationObserver {
        callback;
        constructor(callback) {
            this.callback = callback;
            mutationCallbacks.push(callback);
        }
        observe() {
            mutationObserved = true;
        }
    }
    const windowValue = {
        NodeFilter: { SHOW_TEXT: 4 },
        location: {
            assign: (url) => {
                assignedTo.push(url);
            },
        },
        open: (url, target) => {
            opened.push({ url: String(url), target: String(target) });
            return null;
        },
    };
    if (options.menuOverride) {
        windowValue['__CHWF_SIDEBAR_MENU__'] = options.menuOverride;
    }
    const context = node_vm_1.default.createContext({
        console: {
            log: (...args) => logs.push(args),
        },
        document,
        window: windowValue,
        MutationObserver: FakeMutationObserver,
        setTimeout: (callback) => {
            timers.push(callback);
            return timers.length;
        },
        setInterval: (callback) => {
            intervals.push(callback);
            return intervals.length;
        },
    });
    node_vm_1.default.runInContext(hookScript, context);
    const testId = String(options.menuOverride?.testId ?? 'main-sidebar-chwf-portal');
    return {
        assignedTo,
        byTestId: (id) => document.querySelector(`[data-test-id="${id}"]`),
        setOverride: (override) => {
            windowValue['__CHWF_SIDEBAR_MENU__'] = override;
        },
        childrenTestIds: () => container.children.filter(isElement).map((child) => child.getAttribute('data-test-id')),
        container,
        document,
        fireMutations: () => {
            for (const callback of [...mutationCallbacks])
                callback();
        },
        logs,
        menu: () => document.querySelector(`[data-test-id="${testId}"]`),
        mutationObserved,
        opened,
        runTimers: () => {
            for (const timer of timers.splice(0))
                timer();
        },
    };
}
(0, vitest_1.describe)('sidebar menu frontend hook', () => {
    (0, vitest_1.it)('inserts Workflow Portal directly above Insights', () => {
        const harness = runHook();
        const menu = harness.menu();
        (0, vitest_1.expect)(menu).not.toBeNull();
        (0, vitest_1.expect)(harness.childrenTestIds()).toEqual([
            'main-sidebar-chwf-portal',
            'main-sidebar-insights',
            'main-sidebar-help',
            'main-sidebar-settings',
        ]);
        (0, vitest_1.expect)(menu?.getAttribute('data-chwf-custom-menu')).toBe('true');
        const link = menu?.querySelector('a');
        (0, vitest_1.expect)(link?.getAttribute('href')).toBe('/ui');
        (0, vitest_1.expect)(link?.getAttribute('target')).toBe('_self');
        (0, vitest_1.expect)(link?.getAttribute('aria-label')).toBe('Workflow Portal');
        (0, vitest_1.expect)(link?.getAttribute('title')).toBe('Workflow Portal');
        (0, vitest_1.expect)(link?.textContent).toContain('Workflow Portal');
        (0, vitest_1.expect)(link?.textContent).not.toContain('Insights');
        // Icon is replaced with the portal grid glyph instead of the clone's chart icon
        const svg = menu?.querySelector('svg');
        (0, vitest_1.expect)(svg).not.toBeNull();
        (0, vitest_1.expect)(svg?.querySelectorAll('path').length).toBe(4);
    });
    (0, vitest_1.it)('is idempotent across mutation observer callbacks and timers', () => {
        const harness = runHook();
        harness.fireMutations();
        harness.runTimers();
        harness.fireMutations();
        (0, vitest_1.expect)(harness.childrenTestIds()).toEqual([
            'main-sidebar-chwf-portal',
            'main-sidebar-insights',
            'main-sidebar-help',
            'main-sidebar-settings',
        ]);
        (0, vitest_1.expect)(harness.menu()).not.toBeNull();
    });
    (0, vitest_1.it)('re-inserts the menu when Vue re-renders and drops it', () => {
        const harness = runHook();
        const menu = harness.menu();
        (0, vitest_1.expect)(menu).not.toBeNull();
        // Simulate a Vue bottom-menu re-render that removes non-VDOM nodes
        harness.container.removeChild(menu);
        (0, vitest_1.expect)(harness.menu()).toBeNull();
        harness.fireMutations();
        (0, vitest_1.expect)(harness.menu()).not.toBeNull();
        (0, vitest_1.expect)(harness.childrenTestIds()[0]).toBe('main-sidebar-chwf-portal');
    });
    (0, vitest_1.it)('falls back to Help when Insights is hidden', () => {
        const harness = runHook({
            anchors: [
                { testId: 'main-sidebar-help', label: 'Help', href: '/help' },
                { testId: 'main-sidebar-settings', label: 'Settings', href: '/settings' },
            ],
        });
        (0, vitest_1.expect)(harness.childrenTestIds()).toEqual([
            'main-sidebar-chwf-portal',
            'main-sidebar-help',
            'main-sidebar-settings',
        ]);
    });
    (0, vitest_1.it)('falls back to Settings when Insights and Help are hidden', () => {
        const harness = runHook({
            anchors: [{ testId: 'main-sidebar-settings', label: 'Settings', href: '/settings' }],
        });
        (0, vitest_1.expect)(harness.childrenTestIds()).toEqual(['main-sidebar-chwf-portal', 'main-sidebar-settings']);
    });
    (0, vitest_1.it)('does nothing when the sidebar is absent (e.g. login page)', () => {
        const harness = runHook({ anchors: [] });
        (0, vitest_1.expect)(harness.menu()).toBeNull();
        (0, vitest_1.expect)(harness.childrenTestIds()).toEqual([]);
    });
    (0, vitest_1.it)('never inherits the active state from the template item', () => {
        const harness = runHook({
            anchors: [
                { testId: 'main-sidebar-insights', label: 'Insights', href: '/insights', active: true },
                { testId: 'main-sidebar-help', label: 'Help', href: '/help' },
            ],
        });
        const menu = harness.menu();
        (0, vitest_1.expect)(menu).not.toBeNull();
        (0, vitest_1.expect)(menu?.querySelector('.router-link-active')).toBeNull();
        (0, vitest_1.expect)(menu?.querySelector('[aria-current="page"]')).toBeNull();
        const link = menu?.querySelector('a');
        (0, vitest_1.expect)(link?.getAttribute('aria-current')).toBeNull();
        (0, vitest_1.expect)(link?.getAttribute('href')).toBe('/ui');
    });
    (0, vitest_1.it)('respects window.__CHWF_SIDEBAR_MENU__ overrides', () => {
        const harness = runHook({
            menuOverride: { label: 'Docs', href: 'https://docs.example.test', testId: 'main-sidebar-docs' },
        });
        const menu = harness.document.querySelector('[data-test-id="main-sidebar-docs"]');
        (0, vitest_1.expect)(menu).not.toBeNull();
        (0, vitest_1.expect)(menu?.querySelector('a')?.getAttribute('href')).toBe('https://docs.example.test');
        (0, vitest_1.expect)(menu?.querySelector('a')?.textContent).toContain('Docs');
    });
    (0, vitest_1.it)('navigates via location.assign when the template has no anchor element', () => {
        const harness = runHook({
            anchors: [{ testId: 'main-sidebar-help', label: 'Help', href: '/help', asDiv: true }],
        });
        const clickable = harness.menu()?.querySelector('[role="menuitem"]');
        (0, vitest_1.expect)(clickable?.tagName).toBe('DIV');
        clickable?.click();
        (0, vitest_1.expect)(harness.assignedTo).toEqual(['/ui']);
    });
    (0, vitest_1.it)('opens a new tab for target _blank on non-anchor templates', () => {
        const harness = runHook({
            anchors: [{ testId: 'main-sidebar-help', label: 'Help', href: '/help', asDiv: true }],
            menuOverride: { href: 'https://docs.example.test', target: '_blank' },
        });
        harness.menu()?.querySelector('[role="menuitem"]')?.click();
        (0, vitest_1.expect)(harness.opened).toEqual([{ url: 'https://docs.example.test', target: '_blank' }]);
    });
    (0, vitest_1.it)('removes the stale entry when the configured test id changes', () => {
        const harness = runHook();
        (0, vitest_1.expect)(harness.menu()).not.toBeNull();
        harness.setOverride({ testId: 'main-sidebar-portal-v2', label: 'Portal V2' });
        harness.fireMutations();
        (0, vitest_1.expect)(harness.menu()).toBeNull();
        const updated = harness.byTestId('main-sidebar-portal-v2');
        (0, vitest_1.expect)(updated).not.toBeNull();
        (0, vitest_1.expect)(updated?.querySelector('[data-test-id="menu-item"]')?.textContent).toContain('Portal V2');
        (0, vitest_1.expect)(harness.childrenTestIds()).toEqual([
            'main-sidebar-portal-v2',
            'main-sidebar-insights',
            'main-sidebar-help',
            'main-sidebar-settings',
        ]);
    });
    (0, vitest_1.it)('falls back to the default test id for unsafe overrides', () => {
        const harness = runHook({ menuOverride: { testId: 'bad"id onmouseover="x' } });
        (0, vitest_1.expect)(harness.byTestId('main-sidebar-chwf-portal')).not.toBeNull();
        (0, vitest_1.expect)(harness.childrenTestIds()[0]).toBe('main-sidebar-chwf-portal');
    });
    (0, vitest_1.it)('starts on DOMContentLoaded when the script loads before the DOM', () => {
        const harness = runHook({ readyState: 'loading' });
        (0, vitest_1.expect)(harness.menu()).toBeNull();
        harness.document.dispatch('DOMContentLoaded');
        (0, vitest_1.expect)(harness.menu()).not.toBeNull();
    });
    (0, vitest_1.it)('observes DOM mutations so SPA re-renders are covered', () => {
        const harness = runHook();
        (0, vitest_1.expect)(harness.mutationObserved).toBe(true);
    });
});
(0, vitest_1.describe)('sidebar menu hook wiring', () => {
    (0, vitest_1.it)('hook script carries the expected markers', () => {
        (0, vitest_1.expect)(hookScript).toContain('__CHWF_SIDEBAR_MENU__');
        (0, vitest_1.expect)(hookScript).toContain('main-sidebar-insights');
        (0, vitest_1.expect)(hookScript).toContain('main-sidebar-chwf-portal');
        (0, vitest_1.expect)(hookScript).toContain('Workflow Portal');
        (0, vitest_1.expect)(hookScript).toContain('MutationObserver');
        (0, vitest_1.expect)(hookScript).toContain('data-chwf-custom-menu');
    });
    (0, vitest_1.it)('OIDC hook stays redirect-only and untouched by sidebar logic', () => {
        (0, vitest_1.expect)(oidcHookScript).not.toContain('chwf-portal');
        (0, vitest_1.expect)(oidcHookScript).not.toContain('main-sidebar-insights');
        (0, vitest_1.expect)(oidcHookScript).not.toContain('__CHWF_SIDEBAR_MENU__');
    });
    (0, vitest_1.it)('Dockerfile loads both frontend hooks with the n8n ";" separator', () => {
        (0, vitest_1.expect)(dockerfile).toContain('/assets/oidc-frontend-hook.js;/assets/sidebar-menu-frontend-hook.js');
    });
});
