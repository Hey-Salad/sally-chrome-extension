# Instructions for coding agents

1. Read and follow [STANDARD.md](STANDARD.md) (in HeySalad repos, the standard lives at github.com/Hey-Salad/engineering-standard).
2. Work on a branch `<agent>/<type>-<topic>`; open a **draft PR**; keep it small; Conventional Commit messages.
3. Run lint, typecheck and tests locally before pushing; paste results in the PR.
4. Never commit secrets; never deploy, publish or make a repo public without Peter's explicit approval.
5. New repos: private, created from this template.
6. AI changes: update the eval set first; report cost and latency.
7. Add PostHog events using object_action snake_case into project "HeySalad AI".
