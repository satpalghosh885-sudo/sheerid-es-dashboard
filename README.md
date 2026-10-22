# SheerID-ES Production Tool

A shared iMerit production tracker with password login, server-enforced roles, persistent SQLite storage, ticket timing, QC, dashboards and Excel/CSV/PDF exports. No demo accounts or sample operational data are seeded. The uploaded workbook's historical records have not been imported.

## Deploy on Render — no local Node.js installation

1. Sign in to Render with an organization-approved account and connect the GitHub repository `satpalghosh885-sudo/sheerid-es-dashboard`.
2. Choose **New → Blueprint**, select the repository and its `main` branch, and use the included `render.yaml`.
3. Review the paid Starter web service and 1 GB persistent disk configuration. A persistent disk is required; a free or ephemeral filesystem will lose data on restart/redeployment. This app uses exactly one service instance with the disk mounted at `/var/data`.
4. Set `ADMIN_EMAIL` to your own work email and `ADMIN_PASSWORD` to a unique password of at least 12 characters in Render's secure environment-variable form. Do not put credentials in GitHub, tickets or chat. `ADMIN_NAME` is optional. The first administrator is created only if the database has no users.
5. Deploy the Blueprint. Wait for the build and `/healthz` check to pass. Open the HTTPS URL shown on Render's service page and sign in. The requested service name is `sheerid-es-production-tool`; Render determines the available final hostname. No public URL is assigned by these files alone.
6. Remove `ADMIN_PASSWORD` from Render environment settings after verifying the first login; the stored account remains in SQLite. Future password changes are made from the profile icon, and admins can reset member passwords from Team.
7. Add real users from **Team → Add member**, assign Operator, QC Reviewer or Admin, and securely share initial credentials outside this application. Each user can change their password after signing in. There is no email-invitation or email-recovery integration.

If using a custom domain, add `PUBLIC_ORIGIN=https://your-exact-hostname` without a trailing slash. Otherwise the service uses Render's `RENDER_EXTERNAL_URL` automatically. Cross-origin state-changing requests are rejected. HTTPS is required in production for the secure session cookie.

Render hosting deployment is separate from publishing the Codex development environment. No deployment can happen until Render is connected and its account owner confirms the service and paid resources.

## Local development (optional)

Node 24 is required (uses the built-in `node:sqlite` API). Use the existing checkout; do not create a worktree unless explicitly requested.

```sh
npm ci --cache /tmp/npm-cache
npm run build
npm test
```

Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` through your shell's secure environment mechanism on the first start; do not commit a secret file. Run `npm start` for the backend on port 3000, and `npm run dev -- --port 5173` in another terminal for Vite with its API proxy. The development request origin defaults to `http://localhost:5173`. To serve the production build directly on port 3000 locally, set `PUBLIC_ORIGIN=http://localhost:3000`. `DATABASE_PATH` defaults to `./data/sheerid.sqlite`, which is ignored by Git. `NODE_ENV=production` turns on secure cookies and requires an HTTPS hosting proxy.

## Permissions and security behavior

- Operators: create tickets in their own name, change their own ticket statuses, view/export their own tickets and reviews, and change their password. They cannot manage members, change targets, or submit QC reviews.
- QC Reviewers: view team reports and submit quality reviews; edit only their own tickets. They cannot manage accounts or settings.
- Admins: view all reports, manage accounts, change settings, review tickets and change any ticket status. An admin cannot deactivate themselves or change their own role, preserving at least one administrator.
- Deactivation preserves tickets and audit history and immediately invalidates sessions. Role changes and admin password resets revoke sessions. Password changes revoke other sessions.
- Passwords are salted and hashed using scrypt. Session tokens are random, stored as SHA-256 hashes, expire after eight hours, and use HttpOnly/SameSite=Strict cookies with Secure in production. Login attempts are rate-limited per IP and account. Request payloads are limited. The backend chooses ownership, timestamps, reviewer identity and scores; submitted client values cannot override them.
- Admin-only `/api/audit` returns the latest 200 audit events. The app uses single-process in-memory request rate limiting in addition to persistent account login limits.

## Metrics and workflow

- TPT: `(stop - start)` in minutes; seven minutes is the default benchmark. Leaving New records the server stop time. Moving between non-New statuses retains it. Reopening clears stop and measures from the original start, including intervening time. Multiple New tickets are permitted.
- Utilization: processed tickets / expected tickets × 100. Default expectation: 10 per productive hour × 7 productive hours = **70/person/day**. Tickets that have left New count as processed, including Pending and Escalated. Values may exceed 100%.
- Today uses **Asia/Kolkata**. All time uses the number of activity dates represented in the report, with a full shift per represented person/day. It does not infer attendance, holidays or empty working days. For a single day, 70 processed tickets equals 100% utilization. Cross-midnight tickets are grouped by start date.
- QC weights: Greeting 5, Intro 6, Closing 5, Empathy 5, Tone 8, Readability 8, Spelling and Grammar 5, Solution 18, Comprehension 5, Client Name 3, Segment 3, Full Path 9, Redaction 20. Section Quality is excluded. Criteria are rated 0–5 and normalized to a weighted percentage. The backend calculates and stores scores using weights in effect at review time. Repeat reviews are retained and averaged.
- Team metrics retain historical data for deactivated members. Overview and Production export filtered ticket data; Team exports metrics; QC exports review ratings. PDF exports compact summary fields. Spreadsheet formula-like text is escaped for Excel/CSV. Export libraries load on demand.
- Other team members' changes refresh within 15 seconds. Failed server saves show an error and are not presented as saved.

## Delete selected tickets or QC reviews (admins only)

1. Export any records you need to retain before deleting.
2. In **Production**, tick the checkboxes beside selected tickets, then click **Delete selected**. The header checkbox selects up to 100 visible tickets.
3. In **Quality control**, select individual reviews using their checkboxes and review IDs, then click **Delete selected**. Deleting a review keeps its ticket.
4. Check the exact list in the dialog. Type `DELETE SELECTED TICKETS` or `DELETE SELECTED QC REVIEWS`, as shown, then confirm. Cancel makes no changes.

Deleting a ticket also deletes all its linked QC reviews. Deletions are permanent in the tool and update the performance metrics. User accounts, settings and audit events remain. Each batch is atomic: if any selected record no longer exists, the entire batch is rejected. Only admins may call these endpoints; operators and QC reviewers cannot delete. The API allows at most 100 selected records per request and validates the typed confirmation independently of the UI.

After updating GitHub, existing Render services must use **Manual Deploy → Deploy latest commit** because automatic deployments are disabled in the supplied Blueprint. No database reset is required for this feature.

## Data durability and backups

A persistent disk preserves the database through restarts/deployments but does not replace a backup policy. Before operational use, configure organization-approved off-service backups and verify restoration. Use the Render shell to run:

```sh
npm run backup -- /var/data/backups/sheerid-backup.sqlite
```

This uses SQLite's online backup API for a consistent copy while the app runs. Transfer the copy to approved private storage outside the service disk and restrict access because it includes personal and operational data. Automating off-site backup retention requires a selected storage destination and credentials; it is not configured here. Never copy only the live `.sqlite` file while WAL writes are active.

For restoration: stop the service, preserve the existing database and its `-wal`/`-shm` companions, restore a verified backup to `DATABASE_PATH` without stale companion files, restart, then verify login, ticket counts and recent reviews. Test this in a separate environment before restoring production. Changing hosting providers or scaling to multiple instances requires migrating to a shared database such as PostgreSQL rather than mounting this file in multiple services.

## Validation

`npm test` runs an isolated API integration test with disposable credentials/database: authentication and secure cookie flags, CSRF origin rejection, role restrictions, server-owned timestamps, duplicate-ticket rejection, weighted QC, deactivation/session revocation, audit logging and storage across a server restart. Browser checks additionally exercise sign-in, ticket creation/stopping, reload, QC, member creation/password reset, logout and operator scope against the built server.

Build: `npm run build`. Dependency audit: `npm audit --omit=dev`. The uuid override is a patched compatible v11 version used by ExcelJS. Browser export checks verified Excel, CSV and PDF in the earlier local version; those export implementations are retained.
