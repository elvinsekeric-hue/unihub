import type {
  FavoriteEntry,
  RecentlyOpenedEntry,
} from '../domain/models';
import {
  addTag,
  loadAllTags,
  loadFavorites,
  loadRecentlyOpened,
  recordRecentlyOpened,
  removeTag,
  toggleFavorite,
  type TrackableEntry,
} from '../infrastructure/sqlite/organizationStore';

function isRunningInTauri(): boolean {
  return '__TAURI_INTERNALS__' in window;
}

export async function trackRecentlyOpened(
  entry: TrackableEntry,
): Promise<void> {
  if (!isRunningInTauri()) {
    return;
  }

  await recordRecentlyOpened(entry);
}

export async function getRecentlyOpened(
  limit = 8,
): Promise<RecentlyOpenedEntry[]> {
  if (!isRunningInTauri()) {
    return [];
  }

  return loadRecentlyOpened(limit);
}

export async function toggleFavoriteEntry(
  entry: TrackableEntry,
): Promise<boolean> {
  if (!isRunningInTauri()) {
    return false;
  }

  return toggleFavorite(entry);
}

export async function getFavorites(): Promise<
  FavoriteEntry[]
> {
  if (!isRunningInTauri()) {
    return [];
  }

  return loadFavorites();
}

export async function getAllTags(): Promise<
  Map<string, string[]>
> {
  if (!isRunningInTauri()) {
    return new Map();
  }

  return loadAllTags();
}

export async function addEntityTag(
  entityId: string,
  tag: string,
): Promise<void> {
  if (!isRunningInTauri()) {
    return;
  }

  await addTag(entityId, tag);
}

export async function removeEntityTag(
  entityId: string,
  tag: string,
): Promise<void> {
  if (!isRunningInTauri()) {
    return;
  }

  await removeTag(entityId, tag);
}

export type { TrackableEntry };
