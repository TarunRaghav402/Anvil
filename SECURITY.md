# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

**Please do NOT report security vulnerabilities through public GitHub issues, discussions, or pull requests.**

Instead, report vulnerabilities privately using **GitHub Private Vulnerability Reporting** (`Security` tab -> `Advisories` -> `Report a vulnerability` on this repository).

When submitting a report, please include:

- A clear description of the vulnerability and its potential impact
- Step-by-step instructions or a minimal proof of concept to reproduce the issue
- Affected component(s) (for example: preview capability tokens, Yjs WebSocket auth, Git push scrubbing, SQL Connect access control)
- Any suggested remediation if known

We aim to acknowledge reports within **72 hours** and provide an initial assessment and timeline shortly after.

## What Must NEVER Be Posted Publicly

Never share or attach any of the following in public issues, PRs, screenshots, or logs:

- `.env` files, `PREVIEW_TOKEN_SECRET`, or Firebase Admin SDK service account JSON files
- GitHub Personal Access Tokens (PATs) — neither yours nor any captured token
- Private keys (`*.pem`, `*.key`, `*.p12`) or database credentials
- Unredacted production user emails, UIDs, or session invite codes for live deployments

## Security Design Overview

For full details on Anvil's authentication gates, preview sandboxing, PAT memory-only lifecycle, and secret-scanning controls, see [docs/security.md](docs/security.md).
