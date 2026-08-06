import { describe, expect, it, vi } from 'vitest';

import { retryWithBackoff } from './retry';

describe('retryWithBackoff', () => {
  it('gibt das Ergebnis beim ersten Erfolg zurück', async () => {
    const fn = vi.fn().mockResolvedValue('ok');

    const result = await retryWithBackoff(
      fn,
      3,
      1,
    );

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('versucht es nach einem Fehlschlag erneut', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue('ok');

    const result = await retryWithBackoff(
      fn,
      3,
      1,
    );

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('wirft den letzten Fehler, wenn alle Versuche fehlschlagen', async () => {
    const fn = vi
      .fn()
      .mockRejectedValue(new Error('boom'));

    await expect(
      retryWithBackoff(fn, 3, 1),
    ).rejects.toThrow('boom');

    expect(fn).toHaveBeenCalledTimes(3);
  });
});
