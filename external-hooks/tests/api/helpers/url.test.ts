import { describe, expect, it } from 'vitest';
import { appendQueryParam } from '../../../src/api/helpers/url';

describe('appendQueryParam', () => {
  it('appends a parameter to an absolute URL', () => {
    expect(appendQueryParam('https://app.example.com/ui', 'signedOut', '1')).toBe(
      'https://app.example.com/ui?signedOut=1',
    );
  });

  it('appends a parameter to a relative path', () => {
    expect(appendQueryParam('/ui/projects', 'session', 'abc')).toBe('/ui/projects?session=abc');
  });

  it('preserves existing query parameters and fragments on relative paths', () => {
    expect(appendQueryParam('/ui?continue=%2F#frag', 'session', 'abc')).toBe('/ui?continue=%2F&session=abc#frag');
  });

  it('replaces an existing parameter instead of duplicating it', () => {
    expect(appendQueryParam('/ui?session=old&x=1', 'session', 'new')).toBe('/ui?session=new&x=1');
  });

  it('replaces an existing parameter on absolute URLs too', () => {
    expect(appendQueryParam('https://app.example.com/ui?session=old', 'session', 'new')).toBe(
      'https://app.example.com/ui?session=new',
    );
  });

  it('preserves fragments on absolute URLs', () => {
    expect(appendQueryParam('https://app.example.com/ui#frag', 'continue', '/ui/x')).toBe(
      'https://app.example.com/ui?continue=%2Fui%2Fx#frag',
    );
  });
});
