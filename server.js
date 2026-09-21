import "dotenv/config";
import express from "express";
import session from "express-session";
import pg from "pg";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 3000);
const pool = new Pool({
  host: process.env.PGHOST || "localhost",
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE || "student_attendance",
  user: process.env.PGUSER || "postgres",
  password: process.env.PGPASSWORD || "",
  ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : false
});

app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: false }));
app.use(session({
  secret: process.env.SESSION_SECRET || "local-development-secret",
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 8 * 60 * 60 * 1000 }
}));
app.use(express.static(path.join(__dirname, "public")));

const allowedStatuses = new Set(["Punctual", "Late", "Absent"]);
const adminOnly = (req, res, next) => {
  if (!req.session.user) return res.status(401).json({ error: "Authentication required." });
  if (req.session.user.role !== "admin") return res.status(403).json({ error: "Administrator permission required." });
  next();
};
const authenticated = (req, res, next) => {
  if (!req.session.user) return res.status(401).json({ error: "Authentication required." });
  next();
};

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, expected] = String(stored).split(":");
  if (!salt || !expected) return false;
  const actual = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
}

function cleanAttendance(input) {
  const value = {
    studentId: String(input.studentId || "").trim(),
    studentName: String(input.studentName || "").trim(),
    className: String(input.className || "").trim(),
    course: String(input.course || "").trim(),
    attendanceDate: String(input.attendanceDate || "").trim(),
    status: String(input.status || "").trim()
  };
  const errors = [];
  if (!/^[A-Za-z0-9-]{4,32}$/.test(value.studentId)) errors.push("Student ID must be 4-32 letters, numbers, or hyphens.");
  if (!/^[\p{L} .'-]{2,100}$/u.test(value.studentName)) errors.push("Student name contains invalid characters.");
  if (value.className.length < 2 || value.className.length > 80) errors.push("Class is required.");
  if (value.course.length < 2 || value.course.length > 120) errors.push("Course is required.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.attendanceDate) || Number.isNaN(Date.parse(value.attendanceDate))) errors.push("Use a valid attendance date.");
  if (value.attendanceDate > new Date().toISOString().slice(0, 10)) errors.push("Attendance date cannot be in the future.");
  if (!allowedStatuses.has(value.status)) errors.push("Status must be Punctual, Late, or Absent.");
  return { value, errors };
}

async function audit(client, userId, action, entityId, details) {
  await client.query(
    "INSERT INTO audit_logs (user_id, action, entity_id, details) VALUES ($1, $2, $3, $4)",
    [userId, action, entityId || null, details || null]
  );
}

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      username VARCHAR(80) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role VARCHAR(20) NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'viewer')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS attendance (
      id BIGSERIAL PRIMARY KEY,
      student_id VARCHAR(32) NOT NULL,
      student_name VARCHAR(100) NOT NULL,
      class_name VARCHAR(80) NOT NULL,
      course VARCHAR(120) NOT NULL,
      attendance_date DATE NOT NULL,
      status VARCHAR(20) NOT NULL CHECK (status IN ('Punctual', 'Late', 'Absent')),
      created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (student_id, course, attendance_date)
    );
    CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(attendance_date);
    CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance(student_id);
    CREATE INDEX IF NOT EXISTS idx_attendance_class ON attendance(class_name);
    CREATE TABLE IF NOT EXISTS audit_logs (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
      action VARCHAR(40) NOT NULL,
      entity_id BIGINT,
      details TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  const username = process.env.ADMIN_USERNAME || "admin";
  const password = process.env.ADMIN_PASSWORD || "admin123";
  const existing = await pool.query("SELECT id FROM users WHERE username = $1", [username]);
  if (!existing.rowCount) {
    await pool.query("INSERT INTO users (username, password_hash, role) VALUES ($1, $2, 'admin')", [username, hashPassword(password)]);
    console.log(`Created initial administrator: ${username}`);
  }
}

app.post("/api/auth/login", async (req, res) => {
  try {
    const result = await pool.query("SELECT id, username, password_hash, role FROM users WHERE username = $1", [String(req.body.username || "").trim()]);
    const user = result.rows[0];
    if (!user || !verifyPassword(String(req.body.password || ""), user.password_hash)) {
      return res.status(401).json({ error: "Invalid username or password." });
    }
    req.session.user = { id: user.id, username: user.username, role: user.role };
    res.json({ user: req.session.user });
  } catch (error) {
    res.status(500).json({ error: "Database connection is not ready." });
  }
});

app.post("/api/auth/logout", (req, res) => req.session.destroy(() => res.json({ ok: true })));
app.get("/api/auth/me", (req, res) => res.json({ user: req.session.user || null }));

app.get("/api/attendance", authenticated, async (req, res) => {
  const values = [];
  const where = [];
  const add = (condition, value) => { values.push(value); where.push(condition.replace("?", `$${values.length}`)); };
  const search = String(req.query.search || "").trim();
  if (search) {
    values.push(`%${search}%`);
    values.push(`%${search}%`);
    where.push(`(student_id ILIKE $${values.length - 1} OR student_name ILIKE $${values.length})`);
  }
  if (req.query.className) add("class_name = ?", String(req.query.className));
  if (req.query.course) add("course = ?", String(req.query.course));
  if (req.query.status) add("status = ?", String(req.query.status));
  if (req.query.from) add("attendance_date >= ?", String(req.query.from));
  if (req.query.to) add("attendance_date <= ?", String(req.query.to));
  const query = `SELECT id, student_id AS "studentId", student_name AS "studentName", class_name AS "className", course, attendance_date AS "attendanceDate", status, updated_at AS "updatedAt" FROM attendance ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY attendance_date DESC, id DESC`;
  const result = await pool.query(query, values);
  res.json({ rows: result.rows });
});

app.post("/api/attendance", adminOnly, async (req, res) => {
  const { value, errors } = cleanAttendance(req.body);
  if (errors.length) return res.status(400).json({ error: errors.join(" ") });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `INSERT INTO attendance (student_id, student_name, class_name, course, attendance_date, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [value.studentId, value.studentName, value.className, value.course, value.attendanceDate, value.status, req.session.user.id]
    );
    await audit(client, req.session.user.id, "CREATE_ATTENDANCE", result.rows[0].id, `${value.studentId} / ${value.attendanceDate}`);
    await client.query("COMMIT");
    res.status(201).json({ id: result.rows[0].id });
  } catch (error) {
    await client.query("ROLLBACK");
    res.status(error.code === "23505" ? 409 : 500).json({ error: error.code === "23505" ? "A record for this student, course, and date already exists." : "Unable to create attendance record." });
  } finally {
    client.release();
  }
});

app.put("/api/attendance/:id", adminOnly, async (req, res) => {
  const { value, errors } = cleanAttendance(req.body);
  if (errors.length) return res.status(400).json({ error: errors.join(" ") });
  try {
    const result = await pool.query(
      `UPDATE attendance SET student_id=$1, student_name=$2, class_name=$3, course=$4, attendance_date=$5, status=$6, updated_at=NOW()
       WHERE id=$7 RETURNING id`,
      [value.studentId, value.studentName, value.className, value.course, value.attendanceDate, value.status, req.params.id]
    );
    if (!result.rowCount) return res.status(404).json({ error: "Attendance record not found." });
    await audit(pool, req.session.user.id, "UPDATE_ATTENDANCE", req.params.id, `${value.studentId} / ${value.attendanceDate}`);
    res.json({ ok: true });
  } catch (error) {
    res.status(error.code === "23505" ? 409 : 500).json({ error: error.code === "23505" ? "A record for this student, course, and date already exists." : "Unable to update attendance record." });
  }
});

app.delete("/api/attendance/:id", adminOnly, async (req, res) => {
  const result = await pool.query("DELETE FROM attendance WHERE id=$1 RETURNING student_id", [req.params.id]);
  if (!result.rowCount) return res.status(404).json({ error: "Attendance record not found." });
  await audit(pool, req.session.user.id, "DELETE_ATTENDANCE", req.params.id, result.rows[0].student_id);
  res.json({ ok: true });
});

app.get("/api/stats", authenticated, async (req, res) => {
  const [summary, classes, recent] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status='Punctual')::int AS punctual, COUNT(*) FILTER (WHERE status='Late')::int AS late, COUNT(*) FILTER (WHERE status='Absent')::int AS absent, COUNT(DISTINCT student_id)::int AS students FROM attendance`),
    pool.query(`SELECT class_name AS "className", COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status='Punctual')::int AS punctual, ROUND(100.0 * COUNT(*) FILTER (WHERE status='Punctual') / NULLIF(COUNT(*), 0), 1) AS "punctualRate" FROM attendance GROUP BY class_name ORDER BY "punctualRate" ASC, class_name LIMIT 8`),
    pool.query(`SELECT attendance_date AS date, COUNT(*)::int AS total FROM attendance GROUP BY attendance_date ORDER BY attendance_date DESC LIMIT 7`)
  ]);
  res.json({ summary: summary.rows[0], classes: classes.rows, recent: recent.rows });
});

app.get("/api/options", authenticated, async (req, res) => {
  const [classes, courses] = await Promise.all([
    pool.query("SELECT DISTINCT class_name AS value FROM attendance ORDER BY value"),
    pool.query("SELECT DISTINCT course AS value FROM attendance ORDER BY value")
  ]);
  res.json({ classes: classes.rows.map((row) => row.value), courses: courses.rows.map((row) => row.value) });
});

app.get("/api/audit", adminOnly, async (req, res) => {
  const result = await pool.query(`SELECT a.id, a.action, a.entity_id AS "entityId", a.details, a.created_at AS "createdAt", COALESCE(u.username, 'system') AS username FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.created_at DESC LIMIT 30`);
  res.json({ rows: result.rows });
});

app.get("/api/export", adminOnly, async (req, res) => {
  const result = await pool.query("SELECT student_id, student_name, class_name, course, attendance_date, status FROM attendance ORDER BY attendance_date, student_id");
  const header = "student_id,student_name,class_name,course,attendance_date,status";
  const csv = [header, ...result.rows.map((row) => [row.student_id, row.student_name, row.class_name, row.course, String(row.attendance_date).slice(0, 10), row.status].map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","))].join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="attendance-export-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(csv);
});

app.post("/api/import", adminOnly, async (req, res) => {
  const content = String(req.body.content || "");
  const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return res.status(400).json({ error: "The file is empty." });
  const first = lines[0].toLowerCase();
  const start = first.includes("student_id") || first.includes("student id") ? 1 : 0;
  let imported = 0;
  const failures = [];
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (let index = start; index < lines.length; index += 1) {
      const columns = lines[index].split(",").map((item) => item.trim().replace(/^"|"$/g, "").replaceAll('""', '"'));
      const [studentId, studentName, className, course, attendanceDate, status] = columns;
      const { value, errors } = cleanAttendance({ studentId, studentName, className, course, attendanceDate, status });
      if (errors.length) { failures.push({ line: index + 1, reason: errors.join(" ") }); continue; }
      try {
        await client.query(
          `INSERT INTO attendance (student_id, student_name, class_name, course, attendance_date, status, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [value.studentId, value.studentName, value.className, value.course, value.attendanceDate, value.status, req.session.user.id]
        );
        imported += 1;
      } catch (error) {
        failures.push({ line: index + 1, reason: error.code === "23505" ? "Duplicate student/course/date." : "Database error." });
      }
    }
    await audit(client, req.session.user.id, "IMPORT_ATTENDANCE", null, `${imported} imported, ${failures.length} failed`);
    await client.query("COMMIT");
    res.json({ imported, failed: failures.length, failures });
  } catch (error) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: "Import failed." });
  } finally {
    client.release();
  }
});

app.get("/{*splat}", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

ensureSchema()
  .then(() => app.listen(port, () => console.log(`Student Attendance Management running at http://localhost:${port}`)))
  .catch((error) => {
    console.error("Unable to initialize PostgreSQL:", error.message);
    if (!process.env.PGPASSWORD) {
      console.error("Set PGPASSWORD in .env, then restart the server.");
    }
    process.exit(1);
  });
