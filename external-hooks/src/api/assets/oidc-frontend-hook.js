/**
 * n8n OIDC Frontend Customization
 *
 * This script surgically modifies the login form to show an SSO button.
 * To access the normal login form, add ?showLogin=true to the URL.
 */
(function () {
  'use strict';

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

  console.log('[OIDC Hook] Frontend customization loaded');

  // Logout interception: redirect to our OIDC logout endpoint
  function interceptLogout() {
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
    document.addEventListener('DOMContentLoaded', interceptLogout);
  } else {
    interceptLogout();
  }
})();
