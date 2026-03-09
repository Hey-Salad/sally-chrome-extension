# GitHub Bootstrap Plan

This is the migration plan to launch a standalone `Sally Chrome Extension` repository with clear public/private boundaries and autonomous delivery flow.

## Target Repositories

- Public: `Hey-Salad/sally-chrome-extension`
- Private: `Hey-Salad/sally-api` and other policy/enforcement services

## What Moves to Public Repo

- `manifest.json`
- `sidepanel/`
- `popup/`
- `background/`
- `content-scripts/`
- `icons/`
- `tests/`
- Public docs and CI workflows

## What Stays Private

- Backend policy engines
- Entitlement internals and fraud controls
- Sensitive selectors/rules and anti-abuse logic
- Secrets and private deployment config

## Initial Repo Setup

1. Create GitHub repo: `sally-chrome-extension`.
2. Push this directory as the initial codebase.
3. Enable branch protection on `main`:
   - PR required
   - status checks required (`CI`)
   - code owner review required
4. Add repository secrets only if release publishing requires them.
5. Enable GitHub Releases for tag-based artifacts.

### Command Sequence (GitHub CLI)

```bash
# From the extension directory
cd heysalad-ai-shopper

# Create public repository under Hey-Salad org
gh repo create Hey-Salad/sally-chrome-extension --public --source=. --remote=origin --push

# Ensure main branch exists remotely and is current default
git branch -M main
git push -u origin main

# Set branch protection for main (PR + required checks + code owners)
gh api --method PUT repos/Hey-Salad/sally-chrome-extension/branches/main/protection \
  --field required_status_checks.strict=true \
  --raw-field required_status_checks.contexts[]="CI" \
  --field enforce_admins=true \
  --field required_pull_request_reviews.required_approving_review_count=1 \
  --field required_pull_request_reviews.require_code_owner_reviews=true \
  --field restrictions=
```

## CI/CD Baseline

- `ci.yml` runs on PR and main push.
- `release.yml` runs on version tags (`v*`) and attaches extension zip artifact.
- `secret-scan.yml` runs gitleaks on PR and main push.
- `manifest-permissions-guard.yml` blocks PRs that change extension permissions without explicit handling.

## Fully Autonomous Dev Flow

1. Developer or agent creates feature branch.
2. PR opened with template checklist.
3. CI gates merge (`npm test` required).
4. Merge to `main`.
5. Create tag `vX.Y.Z`.
6. Release workflow publishes artifact automatically.
7. Upload zip to Chrome Web Store dashboard or connect API-based publishing later.

## Next Hardening Steps

- Add smoke tests for parser and side panel boot flow.
- Add signed release provenance (attestations) for release zip artifacts.
