"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.appendQueryParam = appendQueryParam;
exports.appendTokenToReturnTo = appendTokenToReturnTo;
exports.appendSessionToReturnTo = appendSessionToReturnTo;
exports.buildUiAppUrl = buildUiAppUrl;
const _config_1 = require("@config");
const RELATIVE_URL_BASE = 'https://relative.invalid';
function isAbsoluteUrl(value) {
    return /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value);
}
/**
 * Set a query parameter on an absolute or relative URL using
 * `URL.searchParams.set()` semantics: existing occurrences of the key are
 * replaced (exactly one remains), existing query parameters and fragments
 * are preserved.
 */
function appendQueryParam(urlOrPath, key, value) {
    const url = isAbsoluteUrl(urlOrPath) ? new URL(urlOrPath) : new URL(urlOrPath, RELATIVE_URL_BASE);
    url.searchParams.set(key, value);
    return isAbsoluteUrl(urlOrPath) ? url.toString() : `${url.pathname}${url.search}${url.hash}`;
}
function appendTokenToReturnTo(returnTo, token) {
    return appendQueryParam(returnTo, 'token', token);
}
function appendSessionToReturnTo(returnTo, session) {
    return appendQueryParam(returnTo, 'session', session);
}
function buildUiAppUrl(path) {
    const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
    if (_config_1.UI_APP_BASE_URL.startsWith('http://') || _config_1.UI_APP_BASE_URL.startsWith('https://')) {
        const baseUrl = _config_1.UI_APP_BASE_URL.endsWith('/') ? _config_1.UI_APP_BASE_URL : `${_config_1.UI_APP_BASE_URL}/`;
        return new URL(normalizedPath, baseUrl).toString();
    }
    const basePath = _config_1.UI_APP_BASE_URL === '/' ? '' : _config_1.UI_APP_BASE_URL.replace(/\/$/, '');
    return `${basePath}/${normalizedPath}`;
}
