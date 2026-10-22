import { DatabaseSync, backup } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
const source = process.env.DATABASE_PATH || "./data/sheerid.sqlite";
const destination = process.argv[2];
if (!destination || resolve(source) === resolve(destination)) {
  console.error(
    "Provide a separate destination path: npm run backup -- /secure/path/backup.sqlite",
  );
  process.exit(1);
}
mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
const db = new DatabaseSync(source, { readOnly: true });
try {
  await backup(db, destination);
  console.log(
    "Consistent database backup completed. Store it securely outside the service disk.",
  );
} finally {
  db.close();
}
