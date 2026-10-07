# Internal To Public Sync (Sally Chrome Extension)

This repository (`heysalad-payme`) is the internal source of truth.
The public mirror is:

- `Hey-Salad/sally-chrome-extension`

## Sync Pipeline

- Workflow file: `.github/workflows/sally-extension-sync.yml` (repo root)
- Trigger:
  - Push to `main` that changes `heysalad-ai-shopper/**`
  - Manual dispatch (`dry_run` supported)
- Flow:
  1. Run extension tests in `heysalad-ai-shopper`
  2. Export allowlisted public snapshot
  3. Force-update public branch `sync/internal-main`
  4. Open/update PR from `sync/internal-main` to `main`

## Required Secret

Add this in **private repo** `Hey-Salad/heysalad-payme`:

- `SALLY_EXTENSION_SYNC_TOKEN`
  - GitHub PAT for bot/service account
  - Minimum permission: `Contents: Read and Write` on `Hey-Salad/sally-chrome-extension`

## Export Boundary

The public export is controlled by:

- `heysalad-ai-shopper/scripts/export_public_snapshot.sh`

Only allowlisted files/folders are copied. This is the main safety boundary against leaking internal content.

## Operations

Manual dry run:

1. Open Actions in private repo
2. Run workflow: `Sync Sally Extension To Public Repo`
3. Set `dry_run=true`
4. Check logs and diff behavior

Manual real sync:

1. Run same workflow with `dry_run=false`
2. Confirm PR update in public repo
3. Merge public PR after checks pass

## Hardening Recommendations

- Keep public repo protected branch on `main`
- Restrict who can edit sync workflow in private repo
- Use a dedicated bot account/token (not personal)
- Rotate `SALLY_EXTENSION_SYNC_TOKEN` on a regular schedule
