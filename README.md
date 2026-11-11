# Drawily

Self-hosted tracker for daily Procreate drawings. Send a drawing from the iPad share sheet, see it in a
grid or timeline, and keep every export format of the same drawing together.

**Status:** early — upload, previews, grid and timeline views, and merging/splitting drawings work. See [CLAUDE.md](CLAUDE.md) for the stack and design decisions,
and [CONTRIBUTING.md](CONTRIBUTING.md) for the branch and release workflow.

## Planned usage

```bash
cp .env.example .env   # set APP_TOKEN
docker compose up -d
```

Then add an iOS Shortcut that uploads the shared file as the form field `file` (multipart) to
`https://<your-host>/api/upload` with the header
`Authorization: Bearer <APP_TOKEN>`.
