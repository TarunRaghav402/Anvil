# Contributing to Anvil

Thank you for helping improve **Anvil**! Please review these guidelines before opening a pull request.

## Prerequisites

- **Node.js LTS** (v20, v22, or v24 — `.nvmrc` pins `22`)
- **npm** (v10+)
- **Git** (`>= 2.30`)
- **Java JDK 21+** (required by Firebase CLI Local Emulator Suite for end-to-end tests)
- **gitleaks** (recommended locally so pre-commit secret scanning runs automatically)

For OS-specific prerequisite installation instructions, see:

- [Windows Setup Guide](docs/setup-windows.md)
- [macOS Setup Guide](docs/setup-macos.md)
- [Linux Setup Guide](docs/setup-linux.md)

## Local Setup

1. Fork and clone the repository:
   ```bash
   git clone https://github.com/YOUR_USERNAME/anvil.git
   cd anvil
   ```
2. Copy the environment template (never commit `.env`):
   - **macOS / Linux:** `cp .env.example .env`
   - **Windows (PowerShell):** `Copy-Item .env.example .env`
3. Install dependencies and configure Git hooks:
   ```bash
   npm install
   ```
   (`npm install` runs `prepare`, which configures `git config core.hooksPath .githooks`.)
4. Run the local workspace (emulators + backend + frontend):
   ```bash
   npm run dev
   ```

## Branch Naming

Use short, descriptive branch names prefixed by category:

- `feat/<short-description>` — new features or capabilities
- `fix/<short-description>` — bug fixes
- `docs/<short-description>` — documentation updates
- `chore/<short-description>` — tooling, CI, or dependency maintenance
- `sec/<short-description>` — security hardening

## Commit Message Style

Follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat: add keyboard shortcut for toggling live preview`
- `fix: preserve cursor awareness state on role change`
- `docs: clarify Firebase web config vs server credentials`
- `chore: update eslint flat config rules`
- `test: add case-insensitive sibling collision coverage`

## Code Style

- **TypeScript strict mode** is enabled across both `backend` and `frontend`.
- **ESLint & Prettier** enforce formatting and static checks:
  ```bash
  npm run lint
  npm run format:check
  ```
- **Cross-OS compatibility**: Keep filename handling, path utilities, and scripts compatible with Windows, macOS, and Linux (`path.join` / POSIX relative paths, NFC normalization, no bash-only Node scripts).
- **Security**: Never commit secrets, `.env`, service account JSON files, or real tokens. Keep GitHub PATs strictly in runtime memory and never log or persist them.

## Pull Request Checklist

Before submitting a PR, verify all checks pass locally:

- [ ] `npm run lint` passes with zero errors
- [ ] `npm run typecheck` passes for both `backend` and `frontend`
- [ ] `npm test` passes for both `backend` and `frontend`
- [ ] `npm run build` succeeds for both `backend` and `frontend`
- [ ] `npm run secrets:scan` (and the pre-commit hook) finds zero leaks
- [ ] Documentation (`README.md`, `docs/`, `.env.example`) is updated if behavior or env variables changed
