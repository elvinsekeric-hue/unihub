import Database from '@tauri-apps/plugin-sql';

let databasePromise: Promise<Database> | undefined;

async function createSchema(database: Database): Promise<void> {
  await database.execute(`
    CREATE TABLE IF NOT EXISTS learning_files (
      id TEXT PRIMARY KEY NOT NULL,
      course_id TEXT NOT NULL,
      folder_id TEXT,
      ilias_ref_id TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      mime_type TEXT,
      file_size_bytes INTEGER,
      page_count INTEGER,
      description TEXT,
      available_at TEXT,
      uploaded_at TEXT,
      last_modified_at TEXT,
      etag TEXT,
      is_new INTEGER NOT NULL DEFAULT 0,
      is_downloaded INTEGER NOT NULL DEFAULT 0
    )
  `);

  await database.execute(`
    CREATE INDEX IF NOT EXISTS idx_learning_files_course
    ON learning_files(course_id)
  `);

  await database.execute(`
    CREATE INDEX IF NOT EXISTS idx_learning_files_folder
    ON learning_files(folder_id)
  `);
}

export async function getDatabase(): Promise<Database> {
  if (!databasePromise) {
    databasePromise = Database.load('sqlite:unihub.db').then(
      async (database) => {
        await createSchema(database);
        return database;
      },
    );
  }

  return databasePromise;
}