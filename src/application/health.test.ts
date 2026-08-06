import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { checkBridgeHealth } from './health';

describe('checkBridgeHealth', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('meldet erreichbar bei erfolgreicher Antwort', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          queuedScans: 2,
          fullSyncActive: false,
        }),
      }),
    );

    const health = await checkBridgeHealth();

    expect(health).toEqual({
      reachable: true,
      queuedScans: 2,
      fullSyncActive: false,
    });
  });

  it('meldet nicht erreichbar bei Netzwerkfehler', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('offline')),
    );

    expect(
      await checkBridgeHealth(),
    ).toEqual({ reachable: false });
  });

  it('meldet nicht erreichbar bei Fehlerstatus', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue({ ok: false, json: async () => ({}) }),
    );

    expect(
      await checkBridgeHealth(),
    ).toEqual({ reachable: false });
  });
});
