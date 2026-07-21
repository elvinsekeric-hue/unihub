import {
  loadSyncSnapshots,
  type StoredSyncSnapshot,
} from '../infrastructure/sqlite/fileStore';

function isRunningInTauri(): boolean {
  return '__TAURI_INTERNALS__' in window;
}

export async function loadRecentSyncHistory(
  limit = 5,
): Promise<StoredSyncSnapshot[]> {
  if (!isRunningInTauri()) {
    return [];
  }

  return loadSyncSnapshots(undefined, limit);
}