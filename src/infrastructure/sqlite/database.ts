import Database from '@tauri-apps/plugin-sql';

let databasePromise: Promise<Database> | undefined;

async function addColumn(
  database: Database,
  table: string,
  definition: string,
): Promise<void> {
  try {
    await database.execute(`
      ALTER TABLE ${table}
      ADD COLUMN ${definition}
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
      scan_source_id TEXT NOT NULL DEFAULT 'source:legacy',
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

  await addColumn(
    database,
    'learning_files',
    "scan_source_id TEXT NOT NULL DEFAULT 'source:legacy'",
  );

  await addColumn(
    database,
    'learning_files',
    'is_removed INTEGER NOT NULL DEFAULT 0',
  );

  await database.execute(`
    CREATE TABLE IF NOT EXISTS folders (
      id TEXT PRIMARY KEY NOT NULL,
      course_id TEXT NOT NULL,
      scan_source_id TEXT NOT NULL DEFAULT 'source:legacy',
      parent_folder_id TEXT,
      ilias_ref_id TEXT NOT NULL,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      path_json TEXT NOT NULL,
      is_removed INTEGER NOT NULL DEFAULT 0,
      UNIQUE(course_id, scan_source_id, ilias_ref_id)
    )
  `);

  await database.execute(`
    CREATE TABLE IF NOT EXISTS assignments (
      id TEXT PRIMARY KEY NOT NULL,
      course_id TEXT NOT NULL,
      scan_source_id TEXT NOT NULL DEFAULT 'source:legacy',
      folder_id TEXT,
      ilias_ref_id TEXT NOT NULL,
      ilias_assignment_id TEXT,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      description TEXT,
      submission_hint TEXT,
      user_note TEXT,
      starts_at TEXT,
      due_at TEXT,
      submitted_at TEXT,
      status TEXT NOT NULL,
      is_new INTEGER NOT NULL DEFAULT 0,
      is_removed INTEGER NOT NULL DEFAULT 0
    )
  `);

  await addColumn(
    database,
    'assignments',
    'submission_hint TEXT',
  );

  await addColumn(
    database,
    'assignments',
    'user_note TEXT',
  );

  await addColumn(
    database,
    'assignments',
    'achieved_points REAL',
  );

  await addColumn(
    database,
    'assignments',
    'total_points REAL',
  );

  await database.execute(`
  CREATE TABLE IF NOT EXISTS submission_files (
    id TEXT PRIMARY KEY NOT NULL,
    assignment_id TEXT NOT NULL,
    course_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    mime_type TEXT,
    file_size_bytes INTEGER
  )
`);

  await database.execute(`
    CREATE TABLE IF NOT EXISTS submission_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      assignment_id TEXT NOT NULL,
      course_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      achieved_points REAL,
      total_points REAL
    )
  `);

  await database.execute(`
    CREATE INDEX IF NOT EXISTS idx_submission_events_assignment
    ON submission_events(assignment_id)
  `);

  await database.execute(`
    CREATE TABLE IF NOT EXISTS sync_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id TEXT NOT NULL,
      scan_source_id TEXT NOT NULL DEFAULT 'source:legacy',
      started_at TEXT NOT NULL,
      completed_at TEXT NOT NULL,
      status TEXT NOT NULL,
      discovered INTEGER NOT NULL,
      changed INTEGER NOT NULL,
      removed INTEGER NOT NULL,
      error_message TEXT
    )
  `);

  await addColumn(
    database,
    'sync_snapshots',
    "scan_source_id TEXT NOT NULL DEFAULT 'source:legacy'",
  );

  await database.execute(`
    CREATE INDEX IF NOT EXISTS idx_learning_files_course
    ON learning_files(course_id)
  `);

  await database.execute(`
    CREATE INDEX IF NOT EXISTS idx_learning_files_source
    ON learning_files(course_id, scan_source_id)
  `);

  await database.execute(`
    CREATE INDEX IF NOT EXISTS idx_learning_files_folder
    ON learning_files(folder_id)
  `);

  await database.execute(`
    CREATE INDEX IF NOT EXISTS idx_folders_course
    ON folders(course_id)
  `);

  await database.execute(`
    CREATE INDEX IF NOT EXISTS idx_folders_source
    ON folders(course_id, scan_source_id)
  `);

  await database.execute(`
    CREATE INDEX IF NOT EXISTS idx_folders_parent
    ON folders(parent_folder_id)
  `);

  await database.execute(`
    CREATE INDEX IF NOT EXISTS idx_assignments_course
    ON assignments(course_id)
  `);

  await database.execute(`
    CREATE INDEX IF NOT EXISTS idx_assignments_source
    ON assignments(course_id, scan_source_id)
  `);

  await database.execute(`
    CREATE INDEX IF NOT EXISTS idx_assignments_folder
    ON assignments(folder_id)
  `);

  await database.execute(`
    CREATE INDEX IF NOT EXISTS idx_assignments_due
    ON assignments(due_at)
  `);

await database.execute(`
  CREATE INDEX IF NOT EXISTS idx_submission_files_assignment
  ON submission_files(assignment_id)
`);

await database.execute(`
  CREATE INDEX IF NOT EXISTS idx_submission_files_course
  ON submission_files(course_id)
`);

  await database.execute(`
    CREATE INDEX IF NOT EXISTS idx_sync_snapshots_source
    ON sync_snapshots(course_id, scan_source_id)
  `);

  /*
   * Volltextindex für die globale Suche (Command Palette). Wird
   * per rebuildSearchIndex() aus den übrigen Tabellen befüllt,
   * nicht per Trigger – ein einzelnes INSERT…SELECT nach jedem
   * Sync ist einfacher als Trigger auf drei Quelltabellen.
   */
  await database.execute(`
    CREATE VIRTUAL TABLE IF NOT EXISTS search_index
    USING fts5(
      entity_type UNINDEXED,
      entity_id UNINDEXED,
      course_id UNINDEXED,
      title,
      body,
      url UNINDEXED
    )
  `);

  await database.execute(`
    CREATE TABLE IF NOT EXISTS recently_opened (
      id TEXT PRIMARY KEY NOT NULL,
      entity_type TEXT NOT NULL,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      course_id TEXT NOT NULL,
      opened_at TEXT NOT NULL
    )
  `);

  await database.execute(`
    CREATE TABLE IF NOT EXISTS favorites (
      id TEXT PRIMARY KEY NOT NULL,
      entity_type TEXT NOT NULL,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      course_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  await database.execute(`
    CREATE TABLE IF NOT EXISTS tags (
      entity_id TEXT NOT NULL,
      tag TEXT NOT NULL,
      PRIMARY KEY (entity_id, tag)
    )
  `);

  /*
   * Delta-Scan: Hash des zuletzt gesehenen HTML-Inhalts pro Seite.
   * Ist der Hash identisch, hat sich nichts geändert – Parsen,
   * Vergleichen und Speichern können übersprungen werden.
   */
  await database.execute(`
    CREATE TABLE IF NOT EXISTS page_content_hashes (
      page_url TEXT PRIMARY KEY NOT NULL,
      content_hash TEXT NOT NULL,
      hashed_at TEXT NOT NULL
    )
  `);
}

export async function getDatabase(): Promise<Database> {
  if (!databasePromise) {
    databasePromise = Database.load(
      'sqlite:unihub.db',
    ).then(async (database) => {
      await createSchema(database);
      return database;
    });
  }

  return databasePromise;
}