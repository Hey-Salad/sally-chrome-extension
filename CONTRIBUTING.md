# Contributing

## Development Setup

```bash
npm install
npm test
```

Load unpacked extension from this directory in `chrome://extensions`.

## Branching

- Use short-lived branches from `main`.
- Keep PRs focused and small.
- Reference related issue IDs in PR description.

## Pull Request Requirements

- Tests pass locally.
- No secrets or private service details in changed files.
- Manifest permission changes include rationale in PR description.
- UI changes include screenshots or short recording.

## Commit Guidance

- Use clear, scope-first commit messages.
- Prefer one logical change per commit.

## Review Focus

- Behavioral regressions in shopping flow.
- Security impact of permission and API changes.
- Test coverage for parser and automation paths.
