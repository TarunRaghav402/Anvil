# Roadmap

## v0.1.0 (Current Open-Source Release)

- Cloud project tree backed by Firebase SQL Connect (PostgreSQL) and Firebase Storage
- Real-time multi-cursor editing with Yjs CRDTs and Monaco Editor
- Live Server preview pane with sandboxed capability tokens and auto-reload
- Role tags (`Coder`, `Designer`, `Animator`, `Tester`) and live presence tracking
- Line-pinned and asset-pinned comment threads with resolve/reopen
- One-click GitHub Commit & Push (runtime PAT) and `.zip` export
- Cross-OS filename rules and pre-commit + CI secret scanning

## Future Paid Tier (Scaffolded, Currently Disabled)

The database schema and backend already include scaffolding for **persistent hosted sessions** as a future paid tier:

- `users.plan_tier` (`free` by default in `dataconnect/schema/schema.gql`)
- `sessions.is_persistent` (boolean flag in SQL Connect)
- `ENABLE_PAID_TIERS=false` in `.env` / `backend/src/config/env.ts`
- `canSessionPersist(session)` in `backend/src/services/db.ts`

When `ENABLE_PAID_TIERS=false` (the only active mode in v0.1.0), `canSessionPersist()` always returns `false`, meaning live sessions stay active only while the host is connected (with a 30-second grace window on refresh) and end automatically when the host leaves.

## Planned Milestones

- [ ] Built-in diff viewer before GitHub Commit & Push
- [ ] Project templates marketplace (Phaser, PixiJS, Three.js, vanilla web)
- [ ] Optional billing integration to unlock `ENABLE_PAID_TIERS=true` persistent 24/7 sessions
- [ ] Collaborative terminal / build runner sandbox
- [ ] In-browser sprite & tilemap editor enhancements
