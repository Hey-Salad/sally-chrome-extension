# Security Policy

## Supported Versions

Security updates are provided for the default branch and latest release tag.

## Reporting a Vulnerability

- Do not open public issues for vulnerabilities.
- Report privately to `peter@heysalad.io`.
- Include:
  - impact summary
  - reproduction steps
  - affected files/versions
  - proof-of-concept if available

## Response Targets

- Initial response within 3 business days.
- Triage and severity classification within 7 business days.
- Fix timeline depends on severity and exploitability.

## Security Requirements for Contributors

- Never commit secrets, tokens, or private keys.
- Keep all backend credentials in environment variables.
- Avoid introducing unreviewed third-party scripts.
- Preserve least-privilege permissions in extension manifest changes.
