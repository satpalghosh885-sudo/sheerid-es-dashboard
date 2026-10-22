import express from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { DatabaseSync } from "node:sqlite";
import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const production = process.env.NODE_ENV === "production";
const dbPath = process.env.DATABASE_PATH || "./data/sheerid.sqlite";
mkdirSync(dirname(dbPath), { recursive: true, mode: 0o700 });
const db = new DatabaseSync(dbPath);
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, role TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, password TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS tickets(id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), client TEXT NOT NULL, status TEXT NOT NULL, start INTEGER NOT NULL, stop INTEGER, notes TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS reviews(id INTEGER PRIMARY KEY, ticket TEXT NOT NULL REFERENCES tickets(id), reviewer_id INTEGER NOT NULL REFERENCES users(id), date INTEGER NOT NULL, ratings TEXT NOT NULL, score REAL NOT NULL, feedback TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings(id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY, user_id INTEGER, action TEXT NOT NULL, target TEXT, date INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS login_attempts(key TEXT PRIMARY KEY, count INTEGER NOT NULL, since INTEGER NOT NULL);`);
const defaults = {
  best: 7,
  shift: 420,
  hourly: 10,
  weights: [5, 6, 5, 5, 8, 8, 5, 18, 5, 3, 3, 9, 20],
};
db.prepare("INSERT OR IGNORE INTO settings VALUES(1,?)").run(
  JSON.stringify(defaults),
);
const hashToken = (value) => createHash("sha256").update(value).digest("hex");
function passwordHash(password) {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + scryptSync(password, salt, 64).toString("hex");
}
function verify(password, stored) {
  const [salt, key] = stored.split(":");
  return timingSafeEqual(
    Buffer.from(key, "hex"),
    scryptSync(password, salt, 64),
  );
}
function validPassword(p) {
  return typeof p === "string" && p.length >= 12 && p.length <= 256;
}
function safeUser(u) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    active: !!u.active,
  };
}
function text(v, max = 200) {
  return typeof v === "string" && v.trim().length > 0 && v.length <= max;
}
const roles = ["Admin", "QC Reviewer", "Operator"];
function audit(user, action, target) {
  db.prepare(
    "INSERT INTO audit(user_id,action,target,date) VALUES(?,?,?,?)",
  ).run(user, action, String(target), Date.now());
}
if (!db.prepare("SELECT id FROM users LIMIT 1").get()) {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase(),
    password = process.env.ADMIN_PASSWORD;
  if (
    email &&
    validPassword(password) &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    db.prepare(
      "INSERT INTO users(name,email,role,password) VALUES(?,?,?,?)",
    ).run(
      process.env.ADMIN_NAME || "Workspace Admin",
      email,
      "Admin",
      passwordHash(password),
    );
    console.log(
      "Initial administrator created. Remove ADMIN_PASSWORD from hosting settings after first login.",
    );
  } else
    console.log(
      "No administrator exists. Set ADMIN_EMAIL and ADMIN_PASSWORD (at least 12 characters) securely in hosting settings, then restart.",
    );
}
delete process.env.ADMIN_PASSWORD;
const app = express();
if (production) app.set("trust proxy", 1);
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: production ? [] : null,
      },
    },
  }),
);
app.use(express.json({ limit: "32kb" }));
app.get("/healthz", (req, res) => {
  db.prepare("SELECT 1").get();
  res.json({ ok: true });
});
app.use("/api", (req, res, next) => {
  res.set("Cache-Control", "no-store");
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    const expected =
      process.env.PUBLIC_ORIGIN ||
      process.env.RENDER_EXTERNAL_URL ||
      "http://localhost:5173";
    if (req.get("origin") !== expected)
      return res.status(403).json({ error: "Request origin not permitted" });
  }
  next();
});
app.use(
  "/api",
  rateLimit({
    windowMs: 60000,
    limit: 300,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  }),
);
app.post(
  "/api/login",
  rateLimit({
    windowMs: 15 * 60000,
    limit: 30,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  }),
  (req, res) => {
    const { email, password } = req.body;
    if (!text(email) || !validPassword(password))
      return res.status(401).json({ error: "Invalid email or password" });
    const key = hashToken(email.trim().toLowerCase()),
      now = Date.now();
    const attempt = db
      .prepare("SELECT * FROM login_attempts WHERE key=?")
      .get(key);
    if (attempt && attempt.since > now - 15 * 60000 && attempt.count >= 10)
      return res
        .status(429)
        .json({ error: "Too many attempts. Try again in 15 minutes." });
    const user = db
      .prepare("SELECT * FROM users WHERE email=?")
      .get(email.trim().toLowerCase());
    // Always run scrypt, including unknown users, to reduce account enumeration.
    const dummy = "00000000000000000000000000000000:" + "00".repeat(64);
    if (!verify(password, user?.password || dummy) || !user?.active) {
      db.prepare(
        `INSERT INTO login_attempts VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN since<? THEN 1 ELSE count+1 END,since=CASE WHEN since<? THEN excluded.since ELSE since END`,
      ).run(key, now, now - 15 * 60000, now - 15 * 60000);
      return res.status(401).json({ error: "Invalid email or password" });
    }
    db.prepare("DELETE FROM login_attempts WHERE key=?").run(key);
    db.prepare("DELETE FROM sessions WHERE expires<?").run(now);
    const token = randomBytes(32).toString("hex");
    db.prepare("INSERT INTO sessions VALUES(?,?,?)").run(
      hashToken(token),
      user.id,
      now + 8 * 3600000,
    );
    res.cookie("sheer_session", token, {
      httpOnly: true,
      secure: production,
      sameSite: "strict",
      maxAge: 8 * 3600000,
      path: "/",
    });
    audit(user.id, "login", user.id);
    res.json({ user: safeUser(user) });
  },
);
app.use("/api", (req, res, next) => {
  const token = req.headers.cookie
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith("sheer_session="))
    ?.slice(14);
  const user =
    token &&
    db
      .prepare(
        "SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token=? AND s.expires>? AND u.active=1",
      )
      .get(hashToken(token), Date.now());
  if (!user) return res.status(401).json({ error: "Please sign in" });
  req.user = user;
  req.sessionToken = token;
  next();
});
const admin = (req, res, next) =>
  req.user.role === "Admin"
    ? next()
    : res.status(403).json({ error: "Administrator permission required" });
const reviewer = (req, res, next) =>
  roles.slice(0, 2).includes(req.user.role)
    ? next()
    : res.status(403).json({ error: "Reviewer permission required" });
app.post("/api/logout", (req, res) => {
  db.prepare("DELETE FROM sessions WHERE token=?").run(
    hashToken(req.sessionToken),
  );
  res.clearCookie("sheer_session", { path: "/" });
  res.json({ ok: true });
});
app.post("/api/password", (req, res) => {
  const { current, password } = req.body;
  if (
    !validPassword(current) ||
    !validPassword(password) ||
    !verify(current, req.user.password)
  )
    return res
      .status(400)
      .json({
        error:
          "Current password incorrect or new password shorter than 12 characters",
      });
  db.prepare("UPDATE users SET password=? WHERE id=?").run(
    passwordHash(password),
    req.user.id,
  );
  db.prepare("DELETE FROM sessions WHERE user_id=? AND token<>?").run(
    req.user.id,
    hashToken(req.sessionToken),
  );
  audit(req.user.id, "password_changed", req.user.id);
  res.json({ ok: true });
});
app.get("/api/state", (req, res) => {
  const operator = req.user.role === "Operator";
  const users = db
    .prepare(
      operator ? "SELECT * FROM users WHERE id=?" : "SELECT * FROM users",
    )
    .all(...(operator ? [req.user.id] : []))
    .map(safeUser);
  const tickets = db
    .prepare(
      `SELECT t.*,u.name operator FROM tickets t JOIN users u ON u.id=t.user_id ${operator ? "WHERE t.user_id=?" : ""} ORDER BY t.start DESC`,
    )
    .all(...(operator ? [req.user.id] : []));
  const reviews = db
    .prepare(
      `SELECT r.*,u.name reviewer FROM reviews r JOIN users u ON u.id=r.reviewer_id JOIN tickets t ON t.id=r.ticket ${operator ? "WHERE t.user_id=?" : ""} ORDER BY r.date DESC`,
    )
    .all(...(operator ? [req.user.id] : []))
    .map((r) => ({ ...r, ratings: JSON.parse(r.ratings) }));
  res.json({
    user: safeUser(req.user),
    users,
    tickets,
    reviews,
    settings: JSON.parse(
      db.prepare("SELECT value FROM settings WHERE id=1").get().value,
    ),
  });
});
app.post("/api/tickets", (req, res) => {
  const { id, client, notes = "" } = req.body;
  if (
    !text(id, 100) ||
    !/^[A-Za-z0-9_-]+$/.test(id) ||
    !text(client) ||
    typeof notes !== "string" ||
    notes.length > 5000
  )
    return res
      .status(400)
      .json({
        error:
          "Use a ticket ID with letters, numbers, hyphens or underscores, and a client name",
      });
  if (db.prepare("SELECT id FROM tickets WHERE lower(id)=lower(?)").get(id))
    return res.status(409).json({ error: "This ticket ID already exists" });
  db.prepare("INSERT INTO tickets VALUES(?,?,?,?,?,?,?)").run(
    id,
    req.user.id,
    client.trim(),
    "New",
    Date.now(),
    null,
    notes,
  );
  audit(req.user.id, "ticket_created", id);
  res.status(201).json({ ok: true });
});
app.patch("/api/tickets/:id", (req, res) => {
  const ticket = db
    .prepare("SELECT * FROM tickets WHERE id=?")
    .get(req.params.id);
  if (!ticket) return res.status(404).json({ error: "Ticket not found" });
  if (req.user.role !== "Admin" && ticket.user_id !== req.user.id)
    return res
      .status(403)
      .json({ error: "You can only change your own tickets" });
  if (
    !["New", "Pending", "Solved", "Escalated", "Closed"].includes(
      req.body.status,
    )
  )
    return res.status(400).json({ error: "Invalid ticket status" });
  db.prepare("UPDATE tickets SET status=?,stop=? WHERE id=?").run(
    req.body.status,
    req.body.status === "New" ? null : ticket.stop || Date.now(),
    ticket.id,
  );
  audit(req.user.id, "ticket_status:" + req.body.status, ticket.id);
  res.json({ ok: true });
});
app.post("/api/users", admin, (req, res) => {
  const { name, email, role, password } = req.body;
  if (
    !text(name, 100) ||
    !text(email) ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    !roles.includes(role) ||
    !validPassword(password)
  )
    return res
      .status(400)
      .json({
        error:
          "Name, valid email, role and password of at least 12 characters are required",
      });
  if (
    db
      .prepare("SELECT id FROM users WHERE email=?")
      .get(email.toLowerCase().trim())
  )
    return res.status(409).json({ error: "This email is already registered" });
  const r = db
    .prepare("INSERT INTO users(name,email,role,password) VALUES(?,?,?,?)")
    .run(name.trim(), email.toLowerCase().trim(), role, passwordHash(password));
  audit(req.user.id, "user_created", r.lastInsertRowid);
  res.status(201).json({ ok: true });
});
app.patch("/api/users/:id", admin, (req, res) => {
  const user = db
    .prepare("SELECT * FROM users WHERE id=?")
    .get(Number(req.params.id));
  if (!user) return res.status(404).json({ error: "Member not found" });
  if (user.id === req.user.id)
    return res
      .status(400)
      .json({ error: "You cannot change your own role or active status" });
  const role = req.body.role ?? user.role,
    active = req.body.active ?? !!user.active;
  if (!roles.includes(role) || typeof active !== "boolean")
    return res.status(400).json({ error: "Invalid member settings" });
  db.prepare("UPDATE users SET role=?,active=? WHERE id=?").run(
    role,
    Number(active),
    user.id,
  );
  db.prepare("DELETE FROM sessions WHERE user_id=?").run(user.id);
  audit(req.user.id, "user_updated", user.id);
  res.json({ ok: true });
});
app.post("/api/users/:id/password", admin, (req, res) => {
  const user = db
    .prepare("SELECT id FROM users WHERE id=?")
    .get(Number(req.params.id));
  if (!user) return res.status(404).json({ error: "Member not found" });
  if (!validPassword(req.body.password))
    return res
      .status(400)
      .json({ error: "Password must contain at least 12 characters" });
  db.prepare("UPDATE users SET password=? WHERE id=?").run(
    passwordHash(req.body.password),
    user.id,
  );
  db.prepare("DELETE FROM sessions WHERE user_id=?").run(user.id);
  audit(req.user.id, "admin_password_reset", user.id);
  res.json({ ok: true });
});
app.put("/api/settings", admin, (req, res) => {
  const { best, shift, hourly, weights } = req.body;
  if (
    !Number.isFinite(best) ||
    best <= 0 ||
    best > 1440 ||
    !Number.isFinite(shift) ||
    shift < 1 ||
    shift > 1440 ||
    !Number.isFinite(hourly) ||
    hourly <= 0 ||
    hourly > 1000 ||
    !Array.isArray(weights) ||
    weights.length !== 13 ||
    weights.some((w) => !Number.isFinite(w) || w < 0 || w > 100) ||
    weights.reduce((a, b) => a + b, 0) <= 0
  )
    return res
      .status(400)
      .json({ error: "Invalid production targets or QC weights" });
  db.prepare("UPDATE settings SET value=? WHERE id=1").run(
    JSON.stringify({ best, shift, hourly, weights }),
  );
  audit(req.user.id, "settings_updated", 1);
  res.json({ ok: true });
});
app.post("/api/reviews", reviewer, (req, res) => {
  const { ticket, ratings, feedback = "" } = req.body;
  if (
    !text(ticket, 100) ||
    !Array.isArray(ratings) ||
    ratings.length !== 13 ||
    ratings.some((r) => !Number.isInteger(r) || r < 0 || r > 5) ||
    typeof feedback !== "string" ||
    feedback.length > 5000
  )
    return res.status(400).json({ error: "Invalid review" });
  const t = db.prepare("SELECT * FROM tickets WHERE id=?").get(ticket);
  if (!t?.stop)
    return res.status(400).json({ error: "Select a processed ticket" });
  const { weights } = JSON.parse(
    db.prepare("SELECT value FROM settings WHERE id=1").get().value,
  );
  const score =
    (ratings.reduce((a, r, i) => a + (r / 5) * weights[i], 0) /
      weights.reduce((a, b) => a + b, 0)) *
    100;
  db.prepare(
    "INSERT INTO reviews(ticket,reviewer_id,date,ratings,score,feedback) VALUES(?,?,?,?,?,?)",
  ).run(
    ticket,
    req.user.id,
    Date.now(),
    JSON.stringify(ratings),
    score,
    feedback,
  );
  audit(req.user.id, "review_created", ticket);
  res.status(201).json({ ok: true });
});
app.get("/api/audit", admin, (req, res) =>
  res.json(
    db
      .prepare(
        "SELECT a.*,u.name FROM audit a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 200",
      )
      .all(),
  ),
);
app.use("/api", (req, res) => res.status(404).json({ error: "Not found" }));
app.use(express.static(resolve("dist"), { index: false }));
app.get("/{*path}", (req, res) => res.sendFile(resolve("dist/index.html")));
app.use((err, req, res, next) => {
  console.error("Request failed:", err.code || err.name);
  res
    .status(err.status || 500)
    .json({
      error:
        err.status === 400
          ? "Invalid request"
          : "The server could not complete this request",
    });
});
app.listen(Number(process.env.PORT) || 3000, "0.0.0.0", () =>
  console.log("SheerID ES server listening."),
);
