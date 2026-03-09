# Sally Chrome Extension Open Source Scope

This document defines what is safe to publish in the public `sally-chrome-extension` repository and what must stay private.

## Public (Open Source)

- Extension UI shell and side panel screens.
- Browser runtime integration (`manifest`, background worker orchestration, content script framework).
- Typed tool interfaces and request/response schemas (without private endpoints or secrets).
- Local mocks, fixtures, and deterministic parser/evaluation tests.
- Contributor-facing documentation and CI workflows.

## Private (Do Not Open Source)

- Production API credentials, service tokens, account IDs, and signing keys.
- Revenue and entitlement internals (pricing logic, paid feature gating internals, fraud heuristics).
- Abuse prevention internals and anti-automation countermeasure logic.
- Sensitive store automation selectors/rules that increase misuse risk.
- User data pipelines, telemetry internals, and private analytics dashboards.
- Incident playbooks that reveal defensive controls.

## Boundary Rules

- Public repo only calls public, documented API contracts.
- Private backends enforce auth, policy checks, and tool allowlists.
- No hardcoded secrets in source, tests, workflows, or examples.
- Security-sensitive implementation details belong in private repos only.

## API Contract Strategy

- Keep request/response schemas versioned and public.
- Keep implementation and policy enforcement private.
- Use environment variables for all backend base URLs and keys.

## License Recommendation

- Prefer `Apache-2.0` for public repo flexibility and patent clarity.
- Keep private services proprietary.

## Release Safety Checklist

- Secret scan passes.
- No private hostnames or internal identifiers leaked.
- No sensitive selectors/rules committed.
- Public docs reflect current API contracts.
