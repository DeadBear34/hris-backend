# Security Policy

## Supported versions

Only the latest minor release receives security fixes.

| Version | Supported |
| ------- | --------- |
| 0.7.x   | Yes       |
| < 0.7   | No        |

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

Report vulnerabilities privately through GitHub: open the **Security** tab of this repository and select **Report a vulnerability**. Include the affected endpoint or file, steps to reproduce, and the impact you observed.

You can expect an acknowledgement within 3 working days. We will keep you informed while we investigate and will credit you in the release notes if you wish.

## Scope

In scope: this backend and its deployment at `api.hris.click`.

Out of scope: denial-of-service testing, social engineering, and automated scanning that generates high traffic against production.

## How this repository is kept safe to publish

- Secrets are never committed. Configuration lives in environment variables on the server and in GitHub Secrets; `.env.example` contains names only.
- Every push and pull request is scanned for secrets with gitleaks.
- Dependencies are monitored by Dependabot and `npm audit` in CI.
- Access control does not depend on hidden code: every endpoint requires authentication and a position feature where applicable, and the generated API documentation is only served to authorized users.
