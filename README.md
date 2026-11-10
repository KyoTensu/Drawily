# Drawily

Self-hosted tracker for daily Procreate drawings. Send a drawing from the iPad share sheet, see it in a
grid or timeline, and keep every export format of the same drawing together.

**Status:** early setup — no code yet. See [CLAUDE.md](CLAUDE.md) for the stack and design decisions.

## Planned usage

```bash
cp .env.example .env   # set APP_TOKEN
docker compose up -d
```

Then add an iOS Shortcut that uploads the shared file to `https://<your-host>/api/upload` with the header
`Authorization: Bearer <APP_TOKEN>`.
