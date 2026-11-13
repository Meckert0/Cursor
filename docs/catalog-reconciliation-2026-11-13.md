# Workbook catalog reconciliation

Applied to the main database on November 13, 2026, from `Untitled spreadsheet.xlsx`.
Source SHA-256: `5cb44cd8408c85692029876bb76fa5442df28498fb33a8ed07b00070a2f29ca7`.
The workbook was treated as catalog data.

All **114 items** and **163 source compatibility rows** were compared with the live catalog.
The source rows form 157 distinct rules after six rows with identical scopes and statuses are grouped.
The update added **10 items, 14 rules, and 14 target links**. All existing workbook target sets,
position scopes, normalized statuses, wire gauges, and wire interfaces already matched.

| Added part | Category | Description |
| --- | --- | --- |
| 310113456 | Strain relief | iCon receiver plate |
| 310113531 | Strain relief | i1/D1 receiver/ITA plate |
| 310113582 | Strain relief | iCon/D1/i1 receiver stand-off kit |
| 310113727 | Backshell | i1 receiver with large cable clamp |
| 310113794 | Backshell | iCon receiver with large cable clamp |
| 410123102-1 | Frame | iCon EMI ITA, straight exit |
| 410123102-2 | Frame | iCon EMI ITA, 45-degree exit |
| 410128102-1 | Frame | i1 EMI ITA, straight exit |
| 410128102-2 | Frame | i1 EMI ITA, 45-degree exit |
| 510109572 | Strain relief | iCon/i1 high-power receiver kit |

Part **310113531** has the four frame relationships listed in the workbook:
`310128101`, `410128101`, `410128102`, and `410128106`.
The `410128106` rule retains the note to verify whether the separate plate is required
with the selected rear configuration.

The three stand-off rules remain `review` because their source status is `CONDITIONAL`.
Backshell rules retain the restriction to cable-to-cable/standalone receiver use,
excluding rack/panel mounting. The high-power kit is explicitly linked to receiver
module `510160124` using `STRAIN_RELIEF_ALLOWED`; the original relationship type,
required-per-module status, and one-kit-per-module condition are preserved.
Each new rule records its workbook row, source status, conditions, and workbook hash.

The four added housing variants have no explicit compatibility rows in the workbook.
They were added with their stated capacity, integrated clamp type, and bundle diameter;
no compatibility was inferred from a base housing. Frames with integrated strain relief
retain their existing blank-module fits, including `310123102` to `510160100`.

Verification confirmed:

- All 114 source items and 157 distinct rules exist on main; no unresolved targets remain.
- The original 104 catalog items, 143 rule headers, and 479 target links are unchanged.
  Full-row checksums before and after the update matched for the original records.
- The catalog now contains 157 rule headers and 493 target links.
- The additive SQL passed against a local PostgreSQL test database seeded from main,
  including a second application that produced no duplicates or changes.
- The application store can return `310113531` to a regular user, and canonical
  relationship lookups resolve its frame fits in both directions.
- Import tests, TypeScript checks, 167 validation tests, and 67 API tests passed
  (one optional API test was skipped).

The importer now recognizes copied sheet names, the accessory part types, the new
confirmation statuses, and the additional metadata and conditions. Accessory extension
rows are written for backshells and strain reliefs.

The applied, additive SQL is recorded in
[`db/catalog-reconciliations/2026-11-13-vpc-accessories.sql`](../db/catalog-reconciliations/2026-11-13-vpc-accessories.sql).
It inserts missing records without updating or deleting existing catalog data.
It is separate from schema migrations and is not run automatically during deployment.
