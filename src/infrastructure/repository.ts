import type { UniHubRepository } from '../domain/repositories';
import { fixtureRepository } from './fixture/fixtureRepository';
import { sqliteRepository } from './sqlite/sqliteRepository';

function isRunningInTauri(): boolean {
  return '__TAURI_INTERNALS__' in window;
}

export const appRepository: UniHubRepository =
  isRunningInTauri()
    ? sqliteRepository
    : fixtureRepository;