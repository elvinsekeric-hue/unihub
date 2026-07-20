# UniHub architecture

## Principle

The UI never depends on raw ILIAS HTML. A dedicated engine converts ILIAS pages into stable domain objects.

```text
ILIAS WebView/session
        ↓
Crawler + parsers (Rust)
        ↓
Normalized domain model
        ↓
SQLite repository
        ↓
Sync/change detection
        ↓
React dashboard
```

## Modules

- `auth`: embedded login webview and session lifecycle
- `crawler`: traverses course and folder URLs
- `parsers`: ILIAS-version-specific DOM/HTML parsers
- `storage`: SQLite schema and repositories
- `sync`: snapshots, new/changed/deleted detection
- `downloads`: optional offline file cache
- `notifications`: deadlines and new-content alerts
- `ui`: React application consuming normalized data only

## First vertical slice

1. Add one course URL.
2. Open login webview if session is missing.
3. Fetch the course page using the authenticated session.
4. Discover folder links.
5. Crawl one level recursively.
6. Parse files and exercises.
7. Persist a snapshot.
8. Show new items on the dashboard.
