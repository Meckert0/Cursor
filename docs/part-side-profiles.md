# Connector side profiles

The canvas uses `part_media` records with `view_type = side_profile`, associated
with the selected connector's stable part ID. The authenticated
`GET /v1/library/media/side-profiles` endpoint only returns media for catalog
parts that the current user may view. Other media administration remains
restricted to administrators.

The original nineteen exact-number outlines from `Book1.pdf` remain under
`apps/web/public/part-media/vpc-side-profiles/`. The active, versioned images are
under `v2/`: four color housing views matched by their standard, threaded EMI,
or XL cable-exit geometry, plus seven exact manufacturer outlines with an opaque
white interior. Component bodies are opaque; only the exterior background is
transparent. White drawings retain their original line geometry.
`v2/manifest.json` records source page, representation, dimensions and SHA-256.
Family illustrations without a verified housing/variant match are not assigned.

## Canvas plane, cable exits, and module reuse

Active images are upright, normalized to the horizontal plane with the cable
exit facing right (`orientation = cable_exit_right`). The supplied screenshot
is an orientation reference only and is not a catalog asset.
Images mirror horizontally when their connected cable is to the left; they
never rotate to follow a cable's slope. Labels remain upright. For multiple
sections, the first nonvertical section in stable ID order determines the side.
Unconnected and purely vertical connections default to the right.

`src/domain/part-side-profiles.ts` defines normalized cable-exit positions.
Attachments account for the contained image's aspect ratio and mirror with the
artwork. Parts and handles render above cable sections and cable labels,
including hovered labels. Opaque part bodies hide cables underneath.

The iCon frame images retain their original 120px canvas envelope. i1 frames
and standalone iSeries modules use a 97.2px envelope (two successive 10%
reductions in both dimensions). Cable exits, node centers, selection outlines
and drag limits use
these displayed dimensions. The shared sizing policy applies the same factor
to a compatible strain relief when its parent is supplied. The current hosted
catalog does not contain strain-relief parts or images.

The user-approved `510161101` side view is shared by standalone iSeries modules,
including the iCon/i1 catalog. It does not apply to SIM inserts, other module
families, or frames. Slot modules do not create additional canvas images: an
installed module is represented by its frame. An explicitly catalogued exact
module view takes precedence. The client also provides the shared fallback for
new iSeries modules that have not yet received a media record.

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

The default is a read-only dry run. The tool checks all versioned PNGs before opening the
catalog: each must have the declared dimensions, match its checksum, and contain
both fully transparent background pixels and a fully opaque interior sample. Import
matches exact part numbers to a single existing frame or module, then shares the
explicitly approved module image with existing iSeries module records. Missing,
ambiguous, archived, wrong-category, or conflicting-manufacturer records are
reported and skipped; new catalog parts are never created. An existing profile
from this import is updated using a deterministic media ID, so re-running an
unchanged import does not create duplicates.

SQLite URLs default to `/part-media/vpc-side-profiles/v2/<partNumber>.png`, resolved
on the frontend origin. PostgreSQL's existing `part_media` schema requires
absolute HTTP(S) URLs, so `--base-url` is required for PostgreSQL imports. Supply
the frontend's canonical production origin, where the images are deployed:

```sh
npm run import:side-profiles -- --dry-run --base-url https://app.example.com
npm run import:side-profiles -- --apply --base-url https://app.example.com
```

For SQLite, stop the API before applying an import so its in-memory catalog
cannot overwrite the new media. The import saves a timestamped database backup
before applying changes. Dry runs open the database read-only and never create
a missing database. PostgreSQL imports use the same store media methods as
the API and preserve unrelated media.

Bundled relative URLs are limited to plain image paths beneath `/part-media/`.
Other relative paths, protocol-relative URLs, dot segments, escapes, query
strings and credentials are rejected.
