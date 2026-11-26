# Changelog

All notable changes to **Anvil** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-11-26

### Added

- VS Code Dark+ inspired collaborative cloud IDE built with React, TypeScript, Tailwind CSS, and Monaco Editor.
- Real-time multi-cursor CRDT editing via Yjs + `y-monaco` + `y-websocket` with role tags (`Coder`, `Designer`, `Animator`, `Tester`).
- Firebase Auth with strict email-verification gate and unique case-insensitive usernames.
- Firebase SQL Connect (Data Connect / PostgreSQL) cloud project tree, session management, and pinned code/asset comment threads.
- Firebase Storage asset upload, sprite/image viewer (zoom & checkerboard), audio player, font previewer, and `.zip` export.
- Sandboxed Live Preview pane secured with short-lived HMAC capability tokens and auto-reload.
- One-click GitHub Commit & Push from cloud storage using user-supplied runtime-only PATs with log/error token scrubbing.
- Cross-OS (Windows, macOS, Linux) filename and path validation rules.
- Public repository security hygiene: `.gitignore`, `.gitleaks.toml`, cross-platform Node pre-commit hook, GitHub Actions CI + secret scanning, and comprehensive OS setup guides.
