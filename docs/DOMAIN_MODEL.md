# UniHub domain model

The domain layer is independent from React, Tauri, ILIAS HTML and SQLite.

## Core entities

- `Semester`: groups courses and identifies the active study period.
- `Course`: stable local identity plus the ILIAS `ref_id` and URL.
- `Folder`: supports nested course structures through `parentFolderId` and `path`.
- `LearningFile`: PDF/document metadata, availability, server identity and local download state.
- `Assignment`: due date, submission state and ILIAS assignment identity.
- `Announcement`: course news.
- `ActivityItem`: union used by dashboard feeds.
- `SyncSnapshot`: result of one synchronization run.

## Dependency rule

`domain` knows no infrastructure. React, the ILIAS parser and SQLite depend on the domain, never the other way around.
