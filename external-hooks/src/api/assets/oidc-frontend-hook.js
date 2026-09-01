/**
 * n8n OIDC Frontend Customization (redirect-only)
 *
 * Browser navigation to /login or /signin is replaced with /ui
 * and logout delegation returns through /ui cleanup.
 */
(function () {
  'use strict';

  function redirectLoginToUi() {
    if (window.location.pathname !== '/login' && window.location.pathname !== '/signin') return false;

    window.location.replace('/ui');
    return true;
  }

  if (redirectLoginToUi()) {
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
