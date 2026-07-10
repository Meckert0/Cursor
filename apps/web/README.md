This is the browser frontend for the Cable Design Tool backend.

## Getting Started

1. Copy environment template:

```bash
copy .env.example .env.local
```

2. From repository root, start backend + frontend together:

```bash
npm run dev:full
```

3. Open the frontend in your browser:

```text
http://localhost:3001
```

Notes:

- The frontend calls the backend via server-side requests using `API_BASE_URL`.
- Normal flow uses `/login` and `/register`, then forwards the session cookie to backend APIs.
- Optional temporary legacy header mode can be enabled with:
  - `API_LEGACY_AUTH_HEADERS=true`
  - plus `API_ROLE` / `API_USER_ID`

Current browser routes:

- `/login` - sign in page for existing users
- `/register` - create account page
- `/` - health, project list, create project
- `/library` - catalog search/filter for components (family, active/inactive, stock status)
- `/library/[componentId]` - component detail and compatibility hints
- `/admin/datastores` - owner-focused unreviewed library review queue with filters and approve actions
- `/projects/[projectId]` - project members/policy, filterable/sortable harness list, and create harness
- `/harnesses/[harnessId]` - harness workspace and revision links
- `/harnesses/[harnessId]/canvas` - graphical authoring MVP (drag connectors, add simple connector/path topology, then hand off into structured revision editor)
- `/harnesses/[harnessId]/revisions/new` - structured revision builder with connector helper hints, local draft persistence, pre-submit diff review, and JSON preview
- `/revisions/[revisionId]` - validation panel, export actions, status auto-refresh, artifact links, and retry for failed exports

## Standalone Frontend Commands

If you only want to run frontend commands:

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run test
npm run test:e2e
```

## Test Coverage Notes

- Vitest covers API client request/error helpers and revision builder transformation/validation utilities.
- Playwright covers:
  - home/library rendering smoke
  - critical path flow: create project/harness -> create revision -> validate -> export -> submit
  - blocked submit guard messaging when validation preconditions are missing
  - admin datastore moderation flow: filter queue -> bulk approve -> archive
