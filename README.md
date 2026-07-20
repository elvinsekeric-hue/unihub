# UniHub v0.2

UniHub is a desktop study dashboard for ILIAS. Phase 0 proved that the University of Stuttgart ILIAS pages expose folders, files, assignments, deadlines and direct downloads through structured HTML and an authenticated browser session.

## Run the frontend

```powershell
npm.cmd install
npm.cmd run dev
```

## Current architecture

- `src/domain`: stable application entities and repository contracts
- `src/application`: use cases and selectors
- `src/infrastructure/mock`: temporary data adapter
- `src/infrastructure/ilias`: parser/crawler boundary
- `src/shared`: framework-independent helpers
- `src-tauri`: desktop host
- `docs`: decisions, roadmap and domain documentation

The dashboard now consumes a repository interface instead of importing raw arrays. Replacing mock data with ILIAS or SQLite therefore does not require rewriting the UI.
