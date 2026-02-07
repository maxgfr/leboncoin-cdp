import { expect, test, describe } from 'vitest';
import { formatDate, getNextJsProps, delay } from '../utils';

describe('getNextJsProps', () => {
  test('extracts __NEXT_DATA__ from valid HTML', () => {
    const html = `
      <html><body>
        <script id="__NEXT_DATA__" type="application/json">{"buildId":"abc123","props":{"pageProps":{"ok":true}}}</script>
      </body></html>
    `;
    const result = getNextJsProps(html);
    expect(result).toEqual({
      buildId: 'abc123',
      props: { pageProps: { ok: true } },
    });
  });

  test('throws on missing __NEXT_DATA__', () => {
    const html = '<html><body><p>Hello</p></body></html>';
    expect(() => getNextJsProps(html)).toThrow(
      'Could not extract __NEXT_DATA__',
    );
  });

  test('throws on empty __NEXT_DATA__', () => {
    const html =
      '<html><body><script id="__NEXT_DATA__" type="application/json"></script></body></html>';
    expect(() => getNextJsProps(html)).toThrow(
      'Could not extract __NEXT_DATA__',
    );
  });
});

describe('formatDate', () => {
  test('formats date without hour', () => {
    const date = new Date(2026, 1, 7); // Feb 7, 2026
    expect(formatDate(date)).toBe('2026-2-7');
  });

  test('formats date with hour', () => {
    const date = new Date(2026, 1, 7, 14, 30, 45);
    expect(formatDate(date, true)).toBe('2026-2-7 14:30:45');
  });

  test('handles single-digit months/days', () => {
    const date = new Date(2026, 0, 5); // Jan 5, 2026
    expect(formatDate(date)).toBe('2026-1-5');
  });
});

describe('delay', () => {
  test('resolves after specified ms', async () => {
    const start = Date.now();
    await delay(50);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(40); // Allow for timer imprecision
    expect(elapsed).toBeLessThan(200);
  });

  test('resolves with void', async () => {
    const result = await delay(10);
    expect(result).toBeUndefined();
  });
});
