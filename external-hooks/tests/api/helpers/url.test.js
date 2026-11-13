"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const url_1 = require("../../../src/api/helpers/url");
(0, vitest_1.describe)('appendQueryParam', () => {
    (0, vitest_1.it)('appends a parameter to an absolute URL', () => {
        (0, vitest_1.expect)((0, url_1.appendQueryParam)('https://app.example.com/ui', 'signedOut', '1')).toBe('https://app.example.com/ui?signedOut=1');
    });
    (0, vitest_1.it)('appends a parameter to a relative path', () => {
        (0, vitest_1.expect)((0, url_1.appendQueryParam)('/ui/projects', 'session', 'abc')).toBe('/ui/projects?session=abc');
    });
    (0, vitest_1.it)('preserves existing query parameters and fragments on relative paths', () => {
        (0, vitest_1.expect)((0, url_1.appendQueryParam)('/ui?continue=%2F#frag', 'session', 'abc')).toBe('/ui?continue=%2F&session=abc#frag');
    });
    (0, vitest_1.it)('replaces an existing parameter instead of duplicating it', () => {
        (0, vitest_1.expect)((0, url_1.appendQueryParam)('/ui?session=old&x=1', 'session', 'new')).toBe('/ui?session=new&x=1');
    });
    (0, vitest_1.it)('replaces an existing parameter on absolute URLs too', () => {
        (0, vitest_1.expect)((0, url_1.appendQueryParam)('https://app.example.com/ui?session=old', 'session', 'new')).toBe('https://app.example.com/ui?session=new');
    });
    (0, vitest_1.it)('preserves fragments on absolute URLs', () => {
        (0, vitest_1.expect)((0, url_1.appendQueryParam)('https://app.example.com/ui#frag', 'continue', '/ui/x')).toBe('https://app.example.com/ui?continue=%2Fui%2Fx#frag');
    });
});
