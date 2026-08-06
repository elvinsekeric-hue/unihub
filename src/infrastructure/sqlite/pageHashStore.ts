import { getDatabase } from './database';

export async function getStoredPageHash(
  pageUrl: string,
): Promise<string | undefined> {
  const database = await getDatabase();

  const rows = await database.select<
    Array<{ content_hash: string }>
  >(
    'SELECT content_hash FROM page_content_hashes WHERE page_url = $1',
    [pageUrl],
  );

  return rows[0]?.content_hash;
}

export async function storePageHash(
  pageUrl: string,
  contentHash: string,
): Promise<void> {
  const database = await getDatabase();

  await database.execute(
    `
      INSERT INTO page_content_hashes (
        page_url, content_hash, hashed_at
      )
      VALUES ($1, $2, $3)
      ON CONFLICT(page_url) DO UPDATE SET
        content_hash = excluded.content_hash,
        hashed_at = excluded.hashed_at
    `,
    [pageUrl, contentHash, new Date().toISOString()],
  );
}
