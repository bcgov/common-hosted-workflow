/**
 * n8n OIDC Frontend Customization
 *
 * Single asset served at /assets/oidc-frontend-hook.js.
 * Backend env `OIDC_FRONTEND_HOOK_MODE` (redirect|legacy) is injected
 * server-side by `mountAssets` via placeholder replacement.
 *
 * - redirect (default): browser navigation to /login or /signin is replaced with /ui
 * - legacy: SSO button injection on the sign-in form (with ?showLogin=true escape hatch)
 *
 * Logout interception is included in both modes with mode-specific returnTo.
 */
(function () {
  'use strict';

  // Injected server-side; falls back to 'redirect' when served as a static file (e.g. in tests).
  var MODE = '__OIDC_FRONTEND_HOOK_MODE__';
  if (typeof MODE !== 'string' || MODE.indexOf('__') === 0) {
    MODE = 'redirect';
  }
  var isLegacy = MODE === 'legacy';

  // ---------------------------------------------------------------------------
  // Legacy mode: SSO button injection (original oidc-frontend-hook-legacy.js)
  // ---------------------------------------------------------------------------
  if (isLegacy) {
    function shouldShowNormalLogin() {
      return new URLSearchParams(window.location.search).get('showLogin') === 'true';
    }

    function isSigninPage() {
      return window.location.pathname === '/signin' || window.location.pathname === '/login';
    }

    function displayError(form) {
      var error = new URLSearchParams(window.location.search).get('error');
      if (!error || !form || form.querySelector('#oidc-error')) return;

      var errorDiv = document.createElement('div');
      errorDiv.id = 'oidc-error';
      errorDiv.style.cssText =
        'background: var(--color-danger-tint-1, #fee); border: 1px solid var(--color-danger, #fcc); color: var(--color-danger, #c00); padding: 12px; border-radius: 4px; margin: 16px 0;';
      errorDiv.textContent = decodeURIComponent(error);

      var heading = form.querySelector('div[class*="_heading_"]');
      if (heading) heading.after(errorDiv);
      else form.prepend(errorDiv);
    }

    function injectSsoButton() {
      if (shouldShowNormalLogin()) return;
      if (!isSigninPage()) return;

      var form = document.querySelector('[data-test-id="auth-form"]');
      if (!form || form.querySelector('#oidc-sso-button')) return;

      // Find existing button to clone its classes
      var existingButton = form.querySelector('[data-test-id="form-submit-button"]');
      var buttonClasses = existingButton ? existingButton.className : '';

      // Hide the form elements (inputs, buttons, forgot password)
      form
        .querySelectorAll(
          'div[class*="_inputsContainer_"], div[class*="_buttonsContainer_"], div[class*="_actionContainer_"]',
        )
        .forEach(function (el) {
          el.style.display = 'none';
        });

      // Create SSO button container
      var ssoContainer = document.createElement('div');
      ssoContainer.id = 'oidc-sso-container';
      ssoContainer.style.cssText = 'text-align: center;';

      // Create button - use cloned classes or fallback styles
      var button = document.createElement('button');
      button.id = 'oidc-sso-button';
      button.type = 'button';
      button.textContent = 'Sign in with SSO';
      button.onclick = function () {
        window.location.href = '/rest/auth/oidc/login';
      };

      if (buttonClasses) {
        button.className = buttonClasses;
        button.style.width = '100%';
      } else {
        button.style.cssText =
          'width: 100%; padding: 12px 24px; font-size: 14px; font-weight: 600; color: white; background: var(--color-primary, #ea4b30); border: none; border-radius: 4px; cursor: pointer;';
      }

      // Create admin link
      var adminLink = document.createElement('p');
      adminLink.style.cssText = 'margin-top: 16px; font-size: 12px; color: var(--color-text-light, #666);';
      adminLink.innerHTML =
        'Admin? <a href="?showLogin=true" style="color: var(--color-primary, #ea4b30);">Sign in with email</a>';

      ssoContainer.appendChild(button);
      ssoContainer.appendChild(adminLink);

      // Insert after the heading
      var heading = form.querySelector('div[class*="_heading_"]');
      if (heading) heading.after(ssoContainer);
      else form.prepend(ssoContainer);

      displayError(form);
    }

    function observeAndInject() {
      if (shouldShowNormalLogin() || !isSigninPage()) return;

      injectSsoButton();

      var observer = new MutationObserver(function () {
        if (isSigninPage() && !shouldShowNormalLogin()) {
          var form = document.querySelector('[data-test-id="auth-form"]');
          if (form && !form.querySelector('#oidc-sso-button')) {
            injectSsoButton();
          }
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });
      setTimeout(function () {
        observer.disconnect();
      }, 10000);
    }

    function handleNavigation() {
      var origPush = history.pushState;
      var origReplace = history.replaceState;

      history.pushState = function () {
        origPush.apply(this, arguments);
        setTimeout(observeAndInject, 100);
      };

      history.replaceState = function () {
        origReplace.apply(this, arguments);
        setTimeout(observeAndInject, 100);
      };

      window.addEventListener('popstate', function () {
        setTimeout(observeAndInject, 100);
      });
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        observeAndInject();
        handleNavigation();
      });
    } else {
      observeAndInject();
      handleNavigation();
    }

    setTimeout(observeAndInject, 500);
    setTimeout(observeAndInject, 1000);

    // Logout interception: redirect to our OIDC logout endpoint (legacy returns to /)
    function interceptLogoutLegacy() {
      var LOGOUT_SELECTOR = '[data-test-id="main-sidebar-log-out"]';

      document.addEventListener(
        'click',
        function (event) {
          var logoutButton = event.target.closest(LOGOUT_SELECTOR);
          if (!logoutButton) return;

          event.preventDefault();
          event.stopPropagation();

          var returnTo = encodeURIComponent(window.location.origin + '/');
          window.location.assign('/rest/auth/oidc/logout?returnTo=' + returnTo);
        },
        true,
      );
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', interceptLogoutLegacy);
    } else {
      interceptLogoutLegacy();
    }

    console.log('[OIDC Hook] Frontend customization loaded (legacy)');
    return;
  }

  // ---------------------------------------------------------------------------
  // Redirect mode (default): /login and /signin -> /ui
  // ---------------------------------------------------------------------------
  function redirectLoginToUi() {
    if (window.location.pathname !== '/login' && window.location.pathname !== '/signin') return false;

    window.location.replace('/ui');
    return true;
  }

  if (redirectLoginToUi()) {
    // Still need logout interception even when we redirected - but redirect already returned.
    // The early return below mimics original behaviour where logout interception is not installed
    // on the initial /login hit. On subsequent /ui navigation the hook will reload anyway.
    // To preserve exact legacy behaviour, keep early return; otherwise install interception.
    // Original redirect hook did: if (redirect) return; so logout was skipped on that load.
    // We preserve that.
    // However we still log.
    console.log('[OIDC Hook] Frontend customization loaded (redirect)');
    return;
  }

  function watchLoginNavigation() {
    var pushState = window.history.pushState;
    var replaceState = window.history.replaceState;

    function checkAfterNavigation() {
      setTimeout(redirectLoginToUi, 0);
    }

    window.history.pushState = function () {
      var result = pushState.apply(this, arguments);
      checkAfterNavigation();
      return result;
    };

    window.history.replaceState = function () {
      var result = replaceState.apply(this, arguments);
      checkAfterNavigation();
      return result;
    };

    window.addEventListener('popstate', checkAfterNavigation);
  }

  // Logout interception: redirect to our OIDC logout endpoint (redirect mode returns to /ui)
  function interceptLogout() {
    var LOGOUT_SELECTOR = '[data-test-id="main-sidebar-log-out"]';

    document.addEventListener(
      'click',
      function (event) {
        var logoutButton = event.target.closest(LOGOUT_SELECTOR);
        if (!logoutButton) return;

        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === 'function') {
          event.stopImmediatePropagation();
        }

        var returnTo = encodeURIComponent(window.location.origin + '/ui');
        window.location.assign('/rest/auth/oidc/logout?returnTo=' + returnTo);
      },
      true,
    );
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      watchLoginNavigation();
      interceptLogout();
    });
  } else {
    watchLoginNavigation();
    interceptLogout();
  }

  console.log('[OIDC Hook] Frontend customization loaded (redirect)');
})();
