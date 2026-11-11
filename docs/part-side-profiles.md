# Connector side profiles

The canvas uses `part_media` records with `view_type = side_profile`, associated
with the selected connector's stable part ID. The authenticated
`GET /v1/library/media/side-profiles` endpoint only returns media for catalog
parts that the current user may view. Other media administration remains
restricted to administrators.

Nineteen exact-number manufacturer outlines from `Book1.pdf` are bundled under
`apps/web/public/part-media/vpc-side-profiles/`. Their embedded PDF alpha masks
are preserved. `manifest.json` records source page, pixel dimensions and SHA-256
for each extracted PNG. Generic family illustrations and unverified variants
are not assigned to individual catalog records.

## Import into an existing catalog

Deploy the frontend assets before importing media references into the database
used by that frontend. The API changes must also be deployed so ordinary canvas
users can retrieve side profiles. PostgreSQL needs the existing
`032_catalog_sections.sql` migration, which defines `part_media`.

From the repository root, configure the intended `STORE_BACKEND` and database
connection using the same environment settings as the application, then run:

```sh
npm run import:side-profiles -- --dry-run
npm run import:side-profiles -- --apply
```

The default is a read-only dry run. The tool checks all PNGs before opening the
catalog: each must have the declared dimensions, match its checksum, and contain
both fully transparent background pixels and visible part pixels. Import
matches exact part numbers to a single existing frame or module. Missing,
ambiguous, archived, wrong-category, or conflicting-manufacturer records are
reported and skipped; new catalog parts are never created. An existing profile
from this import is updated using a deterministic media ID, so re-running an
unchanged import does not create duplicates.

URLs default to `/part-media/vpc-side-profiles/<partNumber>.png`, resolved on
the frontend origin. If the images are served by another deployment, use its
HTTP(S) origin:

```sh
npm run import:side-profiles -- --dry-run --base-url https://app.example.com
```

For SQLite, stop the API before applying an import so its in-memory catalog
cannot overwrite the new media. The import saves a timestamped database backup
before applying changes. Dry runs open the database read-only and never create
a missing database. PostgreSQL imports use the same store media methods as
the API and preserve unrelated media.

Bundled relative URLs are limited to plain image paths beneath `/part-media/`.
Other relative paths, protocol-relative URLs, dot segments, escapes, query
strings and credentials are rejected.
