const BRIDGE_HEALTH_URL =
  'http://127.0.0.1:43127/api/health';

export interface BridgeHealth {
  reachable: boolean;
  queuedScans?: number;
  fullSyncActive?: boolean;
}

/**
 * Reiner Erreichbarkeits-Check der lokalen Rust-Bridge. Sagt nichts
 * darüber aus, ob die Browser-Extension verbunden ist – das kann
 * die App von hier aus grundsätzlich nicht wissen, nur der Browser
 * selbst.
 */
export async function checkBridgeHealth(): Promise<BridgeHealth> {
  try {
    const response = await fetch(BRIDGE_HEALTH_URL, {
      signal: AbortSignal.timeout(2000),
    });

    if (!response.ok) {
      return { reachable: false };
    }

    const data = (await response.json()) as {
      queuedScans?: number;
      fullSyncActive?: boolean;
    };

    return {
      reachable: true,
      queuedScans: data.queuedScans,
      fullSyncActive: data.fullSyncActive,
    };
  } catch {
    return { reachable: false };
  }
}
