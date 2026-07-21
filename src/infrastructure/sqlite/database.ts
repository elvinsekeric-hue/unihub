import Database from '@tauri-apps/plugin-sql';

let databasePromise: Promise<Database> | undefined;

async function addRemovedColumn(
  database: Database,
): Promise<void> {
  try {
    await database.execute(`
      ALTER TABLE learning_files
      ADD COLUMN is_removed INTEGER NOT NULL DEFAULT 0
    `);
  } catch (error) {
    const message = String(error).toLowerCase();

    if (!message.includes('duplicate column')) {
      throw error;
    }
  }
}

async function createSchema(
  database: Database,
): Promise<void> {
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
      is_downloaded INTEGER NOT NULL DEFAULT 0,
      is_removed INTEGER NOT NULL DEFAULT 0
    )
  `);

  await addRemovedColumn(database);

  await database.execute(`
    CREATE TABLE IF NOT EXISTS sync_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id TEXT NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT NOT NULL,
      status TEXT NOT NULL,
      discovered INTEGER NOT NULL,
      changed INTEGER NOT NULL,
      removed INTEGER NOT NULL,
      error_message TEXT
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