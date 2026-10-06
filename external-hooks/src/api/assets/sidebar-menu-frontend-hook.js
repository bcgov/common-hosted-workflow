/**
 * CHWF Sidebar Menu Frontend Hook
 *
 * Programmatically inserts a custom "Workflow Portal" menu item into the n8n
 * left sidebar, positioned directly above the `Insights` entry (with
 * `Help` / `Settings` as fallbacks when Insights is hidden by RBAC).
 *
 * How it works:
 * - Loaded as a plain `<script src>` via n8n's `EXTERNAL_FRONTEND_HOOKS_URLS`
 *   (semicolon-separated; see Dockerfile). It runs in the same window as the
 *   n8n Vue app but outside Vue's VDOM.
 * - It clones the anchor menu item's DOM node so the custom entry inherits
 *   n8n's hashed CSS-module classes, collapsed (`compact`) state, and layout
 *   without hardcoding styles. Only label, href, test-id, and icon are
 *   replaced.
 * - A `MutationObserver` re-inserts the entry whenever Vue re-renders the
 *   bottom menu (route change, collapse toggle, permission refresh), which
 *   would otherwise drop the manually inserted node.
 *
 * Configuration (optional):
 *   window.__CHWF_SIDEBAR_MENU__ = {
 *     label: 'Workflow Portal', // menu text
 *     href: '/ui',              // navigation target (full page load)
 *     testId: 'main-sidebar-chwf-portal',
 *     target: '_self'
 *   };
 */
(function () {
  'use strict';

  var DEFAULTS = {
    label: 'Workflow Portal',
    href: '/ui',
    testId: 'main-sidebar-chwf-portal',
    target: '_self',
  };

  // Anchors in preference order: insert before the first one found.
  // Insights is the primary anchor (custom menu goes directly above it).
  var ANCHOR_TEST_IDS = ['main-sidebar-insights', 'main-sidebar-help', 'main-sidebar-settings'];

  var MARKER_ATTR = 'data-chwf-custom-menu';
  var LOG_PREFIX = '[CHWF Sidebar]';
  var logged = false;

  var SHOW_TEXT = 4;
  try {
    if (window.NodeFilter && window.NodeFilter.SHOW_TEXT) SHOW_TEXT = window.NodeFilter.SHOW_TEXT;
  } catch (e) {
    /* ignore */
  }

  function log(message) {
    if (logged) return;
    logged = true;
    try {
      console.log(LOG_PREFIX + ' ' + message);
    } catch (e) {
      /* ignore */
    }
  }

  function getConfig() {
    var override;
    try {
      override = window.__CHWF_SIDEBAR_MENU__ || window.CHWF_SIDEBAR_MENU || {};
    } catch (e) {
      override = {};
    }
    var rawTestId = typeof override.testId === 'string' && override.testId ? override.testId : DEFAULTS.testId;
    return {
      label: typeof override.label === 'string' && override.label ? override.label : DEFAULTS.label,
      href: typeof override.href === 'string' && override.href ? override.href : DEFAULTS.href,
      // The id is interpolated into a querySelector, so only allow safe
      // characters — anything else falls back to the default.
      testId: /^[A-Za-z0-9_-]+$/.test(rawTestId) ? rawTestId : DEFAULTS.testId,
      target: typeof override.target === 'string' && override.target ? override.target : DEFAULTS.target,
    };
  }

  function queryByTestId(testId) {
    try {
      return document.querySelector('[data-test-id="' + testId + '"]');
    } catch (e) {
      return null;
    }
  }

  function findAnchor() {
    for (var i = 0; i < ANCHOR_TEST_IDS.length; i++) {
      var node = queryByTestId(ANCHOR_TEST_IDS[i]);
      if (node) return node;
    }
    return null;
  }

  function isActiveTemplate(node) {
    try {
      if (node.querySelector('.router-link-active, .router-link-exact-active, [aria-current="page"]')) {
        return true;
      }
      var clickable = findClickable(node);
      if (clickable && clickable !== node) {
        if (
          clickable.classList &&
          (clickable.classList.contains('router-link-active') ||
            clickable.classList.contains('router-link-exact-active'))
        ) {
          return true;
        }
        if (clickable.getAttribute && clickable.getAttribute('aria-current') === 'page') {
          return true;
        }
      }
    } catch (e) {
      /* ignore */
    }
    return false;
  }

  function findTemplate(anchor) {
    // Prefer a non-active anchor as the clone template so the custom entry
    // never inherits a highlighted (active) state.
    for (var i = 0; i < ANCHOR_TEST_IDS.length; i++) {
      var candidate = queryByTestId(ANCHOR_TEST_IDS[i]);
      if (candidate && !isActiveTemplate(candidate)) return candidate;
    }
    return anchor;
  }

  function findClickable(clone) {
    try {
      var el = clone.querySelector('a[href], a, [role="menuitem"], [data-test-id="menu-item"]') || clone;
      return el;
    } catch (e) {
      return clone;
    }
  }

  function replaceLabel(clone, label) {
    try {
      var walker = document.createTreeWalker(clone, SHOW_TEXT);
      var node = walker ? walker.nextNode() : null;
      while (node) {
        var parent = node.parentNode;
        var inSvg = false;
        try {
          if (
            parent &&
            (parent.namespaceURI === 'http://www.w3.org/2000/svg' || (parent.closest && parent.closest('svg')))
          ) {
            inSvg = true;
          }
        } catch (e) {
          inSvg = false;
        }
        if (!inSvg && node.nodeValue && node.nodeValue.trim() !== '') {
          node.nodeValue = label;
          return true;
        }
        node = walker.nextNode();
      }
    } catch (e) {
      /* fall through to query fallback */
    }
    // Fallback: replace the first non-empty leaf span/div.
    try {
      var candidates = clone.querySelectorAll('span, div, p');
      for (var i = 0; i < candidates.length; i++) {
        var el = candidates[i];
        if (el.children.length === 0 && el.textContent && el.textContent.trim() !== '') {
          el.textContent = label;
          return true;
        }
      }
    } catch (e) {
      /* ignore */
    }
    return false;
  }

  function replaceIcon(clone) {
    try {
      var svg = clone.querySelector('svg');
      if (!svg) return false;
      var wrapper = svg.parentNode;
      if (!wrapper) return false;
      var ns = 'http://www.w3.org/2000/svg';
      var icon = document.createElementNS(ns, 'svg');
      icon.setAttribute('width', '18');
      icon.setAttribute('height', '18');
      icon.setAttribute('viewBox', '0 0 24 24');
      icon.setAttribute('fill', 'none');
      icon.setAttribute('stroke', 'currentColor');
      icon.setAttribute('stroke-width', '2');
      icon.setAttribute('stroke-linecap', 'round');
      icon.setAttribute('stroke-linejoin', 'round');
      icon.setAttribute('aria-hidden', 'true');
      var paths = ['M3 3h7v7H3z', 'M14 3h7v7h-7z', 'M3 14h7v7H3z', 'M14 14h7v7h-7z'];
      for (var i = 0; i < paths.length; i++) {
        var path = document.createElementNS(ns, 'path');
        path.setAttribute('d', paths[i]);
        icon.appendChild(path);
      }
      wrapper.replaceChild(icon, svg);
      return true;
    } catch (e) {
      return false;
    }
  }

  function stripActiveState(clone) {
    try {
      var actives = clone.querySelectorAll('.router-link-active, .router-link-exact-active, [aria-current]');
      for (var i = 0; i < actives.length; i++) {
        actives[i].classList.remove('router-link-active', 'router-link-exact-active');
        actives[i].removeAttribute('aria-current');
      }
      if (clone.classList) {
        clone.classList.remove('router-link-active', 'router-link-exact-active');
      }
      clone.removeAttribute('aria-current');
    } catch (e) {
      /* ignore */
    }
  }

  function buildMenuItem(template, config) {
    var clone = template.cloneNode(true);

    clone.setAttribute('data-test-id', config.testId);
    clone.setAttribute(MARKER_ATTR, 'true');
    // Avoid duplicate DOM ids if the template carried one.
    try {
      clone.removeAttribute('id');
    } catch (e) {
      /* ignore */
    }

    stripActiveState(clone);
    replaceLabel(clone, config.label);
    replaceIcon(clone);

    var clickable = findClickable(clone);
    try {
      if (clickable.setAttribute) {
        clickable.setAttribute('aria-label', config.label);
        clickable.setAttribute('title', config.label);
      }
      var tag = clickable.tagName ? clickable.tagName.toUpperCase() : '';
      if (tag === 'A') {
        clickable.setAttribute('href', config.href);
        clickable.setAttribute('target', config.target);
        // Same-tab same-origin navigation performs a full page load, which is
        // what we want for `/ui` (outside the Vue router).
        if (config.target === '_blank') {
          clickable.setAttribute('rel', 'noopener');
        } else {
          clickable.removeAttribute('rel');
        }
      } else if (clickable.addEventListener) {
        clickable.addEventListener('click', function (event) {
          event.preventDefault();
          if (config.target === '_blank') {
            window.open(config.href, '_blank', 'noopener');
          } else {
            window.location.assign(config.href);
          }
        });
      }
    } catch (e) {
      /* ignore */
    }

    return clone;
  }

  function removeStaleMenus(config) {
    // If the configured test id changed at runtime, entries created under a
    // previous id would otherwise accumulate as duplicates.
    var stale;
    try {
      stale = document.querySelectorAll('[' + MARKER_ATTR + '="true"]');
    } catch (e) {
      return;
    }
    for (var i = 0; i < stale.length; i++) {
      try {
        if (stale[i].getAttribute('data-test-id') !== config.testId && stale[i].parentNode) {
          stale[i].parentNode.removeChild(stale[i]);
        }
      } catch (e) {
        /* ignore */
      }
    }
  }

  function ensureMenu() {
    var config = getConfig();
    removeStaleMenus(config);
    if (queryByTestId(config.testId)) return true;

    var anchor = findAnchor();
    if (!anchor || !anchor.parentNode) return false;

    try {
      var template = findTemplate(anchor);
      var menu = buildMenuItem(template, config);
      anchor.parentNode.insertBefore(menu, anchor);
      log('custom menu "' + config.label + '" added above ' + anchor.getAttribute('data-test-id'));
      return true;
    } catch (e) {
      return false;
    }
  }

  function start() {
    ensureMenu();

    // Re-insert whenever Vue re-renders the sidebar (route change, collapse
    // toggle, permission refresh), which drops manually inserted nodes.
    try {
      if (typeof MutationObserver !== 'undefined') {
        var observer = new MutationObserver(function () {
          ensureMenu();
        });
        var target = document.documentElement || document.body;
        if (target) {
          observer.observe(target, { childList: true, subtree: true });
        }
      } else {
        setInterval(ensureMenu, 2000);
      }
    } catch (e) {
      /* ignore */
    }

    // Delayed retries for slow Vue boot (script is injected in <head>).
    try {
      setTimeout(ensureMenu, 500);
      setTimeout(ensureMenu, 1500);
      setTimeout(ensureMenu, 3000);
    } catch (e) {
      /* ignore */
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
