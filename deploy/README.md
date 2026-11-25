# Deploying Oxxila to the VPS (FastPanel)

Every push to `main` deploys automatically:

| Repo | Workflow | What happens on the server |
|---|---|---|
| `oxxila-backend-api` | `.github/workflows/deploy.yml` | `/back/oxxila-backend-api`: `git reset --hard origin/main`, `npm ci`, `pm2 reload oxxila`, health check on `:3000` |
| `Oxxila` (frontend) | `.github/workflows/deploy.yml` | build with `BASE_URL`, upload, replace `/var/www/dash_oxxilap_usr/data/www/oxxilapharma.com` (backup kept in `/var/backups/oxxila-web`, last 5) |

Domains (managed by FastPanel, nothing here touches Nginx):
- `oxxilapharma.com` / `www`: static frontend
- `dash.oxxilapharma.com`: Nginx proxy to the API on `127.0.0.1:3000`

## How the GitHub key is locked down
GitHub Actions logs in as root with its own key, but that key's line in
`/root/.ssh/authorized_keys` is `command="/usr/local/bin/oxxila-deploy",restrict ...`.
So it can only run `deploy/oxxila-deploy.sh` with `backend` or `frontend`: no shell, no other command.

If you change `deploy/oxxila-deploy.sh`, copy it to the server again:
```bash
scp deploy/oxxila-deploy.sh root@72.61.178.92:/usr/local/bin/oxxila-deploy
```

## GitHub settings (both repos)
Settings → Environments → `production`:

| Kind | Name | Value |
|---|---|---|
| Secret | `VPS_HOST` | `72.61.178.92` |
| Secret | `VPS_SSH_KEY` | the deploy private key |
| Secret | `VPS_KNOWN_HOSTS` | output of `ssh-keyscan 72.61.178.92` |
| Variable (frontend only) | `BASE_URL` | `https://dash.oxxilapharma.com/api/v1` |

## Day to day
- Deploy: push to `main`, or Actions → Deploy → Run workflow.
- API logs: `ssh root@72.61.178.92 "pm2 logs oxxila"`
- Frontend rollback: `rsync -a --delete /var/backups/oxxila-web/<stamp>/ /var/www/dash_oxxilap_usr/data/www/oxxilapharma.com/`
- Backend rollback: `cd /back/oxxila-backend-api && git reset --hard <old-sha> && npm ci --omit=dev && pm2 reload oxxila`
- Production secrets live only in `/back/oxxila-backend-api/.env` on the server.
