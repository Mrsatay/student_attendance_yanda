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
    CREATE TABLE IF NOT EXISTS students (
      id BIGSERIAL PRIMARY KEY,
      student_id VARCHAR(32) UNIQUE NOT NULL,
      name VARCHAR(100) NOT NULL,
      class_name VARCHAR(80) NOT NULL,
      email VARCHAR(160),
      active BOOLEAN NOT NULL DEFAULT TRUE,
      archived_at TIMESTAMPTZ,
      archived_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
      archive_reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS courses (
      id BIGSERIAL PRIMARY KEY,
      code VARCHAR(24) UNIQUE NOT NULL,
      name VARCHAR(120) NOT NULL,
      semester VARCHAR(40) NOT NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      archived_at TIMESTAMPTZ,
      archived_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
      archive_reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS enrollments (
      student_id BIGINT REFERENCES students(id) ON DELETE RESTRICT,
      course_id BIGINT REFERENCES courses(id) ON DELETE RESTRICT,
      enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (student_id, course_id)
    );
    CREATE TABLE IF NOT EXISTS checkin_sessions (
      id BIGSERIAL PRIMARY KEY,
      course_id BIGINT NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
      class_name VARCHAR(80) NOT NULL,
      session_date DATE NOT NULL,
      opens_at TIMESTAMP NOT NULL,
      closes_at TIMESTAMP NOT NULL,
      late_after TIMESTAMP NOT NULL,
      checkin_method VARCHAR(20) NOT NULL DEFAULT 'code' CHECK (checkin_method IN ('code', 'manual')),
      checkin_code VARCHAR(12) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'active', 'closed', 'archived')),
      created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
      archived_at TIMESTAMPTZ,
      archived_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
      archive_reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (course_id, class_name, session_date)
    );
    CREATE TABLE IF NOT EXISTS session_attendance (
      session_id BIGINT REFERENCES checkin_sessions(id) ON DELETE RESTRICT,
      student_id BIGINT REFERENCES students(id) ON DELETE RESTRICT,
      checked_in_at TIMESTAMP,
      status VARCHAR(20) NOT NULL DEFAULT 'Not checked in' CHECK (status IN ('Punctual', 'Late', 'Absent', 'Excused', 'Not checked in')),
      method VARCHAR(20) NOT NULL DEFAULT 'code',
      correction_reason TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (session_id, student_id)
    );
    CREATE TABLE IF NOT EXISTS leave_applications (
      id BIGSERIAL PRIMARY KEY,
      session_id BIGINT NOT NULL REFERENCES checkin_sessions(id) ON DELETE RESTRICT,
      student_id BIGINT NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
      reason VARCHAR(80) NOT NULL,
      description TEXT NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Rejected')),
      reviewed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
      reviewed_at TIMESTAMPTZ,
      review_note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (session_id, student_id)
    );
    CREATE INDEX IF NOT EXISTS idx_session_date ON checkin_sessions(session_date);
    CREATE INDEX IF NOT EXISTS idx_session_status ON checkin_sessions(status);
    CREATE INDEX IF NOT EXISTS idx_students_class ON students(class_name);
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
  await migrateLegacyAttendance();
}

async function migrateLegacyAttendance() {
  const legacy = await pool.query("SELECT DISTINCT student_id, student_name, class_name, course, attendance_date FROM attendance");
  for (const row of legacy.rows) {
    await pool.query(
      `INSERT INTO students (student_id, name, class_name) VALUES ($1, $2, $3)
       ON CONFLICT (student_id) DO UPDATE SET name=EXCLUDED.name, class_name=EXCLUDED.class_name`,
      [row.student_id, row.student_name, row.class_name]
    );
    const code = `LEGACY-${crypto.createHash("md5").update(row.course).digest("hex").slice(0, 8)}`;
    await pool.query(
      `INSERT INTO courses (code, name, semester) VALUES ($1, $2, 'Legacy import')
       ON CONFLICT (code) DO NOTHING`,
      [code, row.course]
    );
    await pool.query(
      `INSERT INTO enrollments (student_id, course_id)
       SELECT s.id, c.id FROM students s, courses c WHERE s.student_id=$1 AND c.code=$2
       ON CONFLICT DO NOTHING`,
      [row.student_id, code]
    );
    await pool.query(
      `INSERT INTO checkin_sessions (course_id, class_name, session_date, opens_at, closes_at, late_after, checkin_method, checkin_code, status)
       SELECT c.id, $1, $2::date, $2::date + TIME '00:00', $2::date + TIME '23:59', $2::date + TIME '00:10', 'manual', 'LEGACY', 'closed'
       FROM courses c WHERE c.code=$3 ON CONFLICT DO NOTHING`,
      [row.class_name, row.attendance_date, code]
    );
  }
  await pool.query(`
    INSERT INTO session_attendance (session_id, student_id, checked_in_at, status, method)
    SELECT cs.id, s.id, NULL, a.status, 'manual'
    FROM attendance a
    JOIN students s ON s.student_id=a.student_id
    JOIN courses c ON c.name=a.course AND c.code LIKE 'LEGACY-%'
    JOIN checkin_sessions cs ON cs.course_id=c.id AND cs.class_name=a.class_name AND cs.session_date=a.attendance_date
    ON CONFLICT (session_id, student_id) DO NOTHING
  `);
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

app.get("/api/legacy-stats", authenticated, async (req, res) => {
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

function cleanStudent(input) {
  const data = {
    studentId: String(input.studentId || "").trim(),
    name: String(input.name || "").trim(),
    className: String(input.className || "").trim(),
    email: String(input.email || "").trim() || null
  };
  const errors = [];
  if (!/^[A-Za-z0-9-]{4,32}$/.test(data.studentId)) errors.push("Student ID must be 4-32 letters, numbers, or hyphens.");
  if (!/^[\p{L} .'-]{2,100}$/u.test(data.name)) errors.push("Student name contains invalid characters.");
  if (data.className.length < 2 || data.className.length > 80) errors.push("Class is required.");
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) errors.push("Email is invalid.");
  return { data, errors };
}

function cleanCourse(input) {
  const data = { code: String(input.code || "").trim().toUpperCase(), name: String(input.name || "").trim(), semester: String(input.semester || "").trim() };
  const errors = [];
  if (!/^[A-Z0-9-]{2,24}$/.test(data.code)) errors.push("Course code must contain 2-24 letters, numbers, or hyphens.");
  if (data.name.length < 2 || data.name.length > 120) errors.push("Course name is required.");
  if (data.semester.length < 2 || data.semester.length > 40) errors.push("Semester is required.");
  return { data, errors };
}

function cleanSession(input) {
  const data = {
    courseId: Number(input.courseId),
    className: String(input.className || "").trim(),
    sessionDate: String(input.sessionDate || "").trim(),
    startTime: String(input.startTime || "").trim(),
    endTime: String(input.endTime || "").trim(),
    lateAfter: String(input.lateAfter || "").trim(),
    method: String(input.method || "code").trim()
  };
  const errors = [];
  if (!Number.isInteger(data.courseId)) errors.push("Choose a course.");
  if (data.className.length < 2) errors.push("Choose a class.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.sessionDate)) errors.push("Use a valid session date.");
  if (!/^\d{2}:\d{2}$/.test(data.startTime) || !/^\d{2}:\d{2}$/.test(data.endTime) || !/^\d{2}:\d{2}$/.test(data.lateAfter)) errors.push("Use valid times.");
  if (data.startTime >= data.endTime) errors.push("Closing time must be after opening time.");
  if (data.lateAfter < data.startTime || data.lateAfter > data.endTime) errors.push("Late threshold must be inside the session window.");
  if (!["code", "manual"].includes(data.method)) errors.push("Choose a check-in method.");
  return { data, errors };
}

app.get("/api/catalog", authenticated, async (req, res) => {
  const [students, courses] = await Promise.all([
    pool.query(`SELECT id, student_id AS "studentId", name, class_name AS "className", email, active, archived_at AS "archivedAt" FROM students ORDER BY active DESC, class_name, student_id`),
    pool.query(`SELECT c.id, c.code, c.name, c.semester, c.active, COUNT(e.student_id)::int AS "rosterCount" FROM courses c LEFT JOIN enrollments e ON e.course_id=c.id WHERE c.active=true GROUP BY c.id ORDER BY c.code`)
  ]);
  res.json({ students: students.rows, courses: courses.rows });
});

app.post("/api/students", adminOnly, async (req, res) => {
  const { data, errors } = cleanStudent(req.body);
  if (errors.length) return res.status(400).json({ error: errors.join(" ") });
  try {
    const result = await pool.query("INSERT INTO students (student_id,name,class_name,email) VALUES ($1,$2,$3,$4) RETURNING id", [data.studentId, data.name, data.className, data.email]);
    await audit(pool, req.session.user.id, "CREATE_STUDENT", result.rows[0].id, `${data.studentId} / ${data.name}`);
    res.status(201).json({ id: result.rows[0].id });
  } catch (error) {
    res.status(error.code === "23505" ? 409 : 500).json({ error: error.code === "23505" ? "Student ID already exists." : "Unable to create student." });
  }
});

app.put("/api/students/:id", adminOnly, async (req, res) => {
  const { data, errors } = cleanStudent(req.body);
  if (errors.length) return res.status(400).json({ error: errors.join(" ") });
  const result = await pool.query("UPDATE students SET student_id=$1,name=$2,class_name=$3,email=$4,updated_at=NOW() WHERE id=$5 AND active=true RETURNING id", [data.studentId, data.name, data.className, data.email, req.params.id]);
  if (!result.rowCount) return res.status(404).json({ error: "Active student not found." });
  await audit(pool, req.session.user.id, "UPDATE_STUDENT", req.params.id, `${data.studentId} / ${data.name}`);
  res.json({ ok: true });
});

app.post("/api/students/:id/archive", adminOnly, async (req, res) => {
  const reason = String(req.body.reason || "").trim();
  if (reason.length < 5) return res.status(400).json({ error: "Archive reason must be at least 5 characters." });
  const result = await pool.query("UPDATE students SET active=false,archived_at=NOW(),archived_by=$1,archive_reason=$2 WHERE id=$3 AND active=true RETURNING student_id", [req.session.user.id, reason, req.params.id]);
  if (!result.rowCount) return res.status(404).json({ error: "Active student not found." });
  await audit(pool, req.session.user.id, "ARCHIVE_STUDENT", req.params.id, `${result.rows[0].student_id}: ${reason}`);
  res.json({ ok: true });
});

app.post("/api/students/:id/restore", adminOnly, async (req, res) => {
  const result = await pool.query("UPDATE students SET active=true,archived_at=NULL,archived_by=NULL,archive_reason=NULL,updated_at=NOW() WHERE id=$1 RETURNING student_id", [req.params.id]);
  if (!result.rowCount) return res.status(404).json({ error: "Student not found." });
  await audit(pool, req.session.user.id, "RESTORE_STUDENT", req.params.id, result.rows[0].student_id);
  res.json({ ok: true });
});

app.post("/api/courses", adminOnly, async (req, res) => {
  const { data, errors } = cleanCourse(req.body);
  if (errors.length) return res.status(400).json({ error: errors.join(" ") });
  try {
    const result = await pool.query("INSERT INTO courses (code,name,semester) VALUES ($1,$2,$3) RETURNING id", [data.code, data.name, data.semester]);
    await audit(pool, req.session.user.id, "CREATE_COURSE", result.rows[0].id, `${data.code} / ${data.name}`);
    res.status(201).json({ id: result.rows[0].id });
  } catch (error) {
    res.status(error.code === "23505" ? 409 : 500).json({ error: error.code === "23505" ? "Course code already exists." : "Unable to create course." });
  }
});

app.put("/api/courses/:id", adminOnly, async (req, res) => {
  const { data, errors } = cleanCourse(req.body);
  if (errors.length) return res.status(400).json({ error: errors.join(" ") });
  const result = await pool.query("UPDATE courses SET code=$1,name=$2,semester=$3,updated_at=NOW() WHERE id=$4 AND active=true RETURNING id", [data.code, data.name, data.semester, req.params.id]);
  if (!result.rowCount) return res.status(404).json({ error: "Active course not found." });
  await audit(pool, req.session.user.id, "UPDATE_COURSE", req.params.id, `${data.code} / ${data.name}`);
  res.json({ ok: true });
});

app.post("/api/courses/:id/archive", adminOnly, async (req, res) => {
  const reason = String(req.body.reason || "").trim();
  if (reason.length < 5) return res.status(400).json({ error: "Archive reason must be at least 5 characters." });
  const used = await pool.query("SELECT COUNT(*)::int AS count FROM checkin_sessions WHERE course_id=$1 AND status <> 'archived'", [req.params.id]);
  if (used.rows[0].count > 0) return res.status(409).json({ error: "Close/archive this course's sessions before archiving the course." });
  const result = await pool.query("UPDATE courses SET active=false,archived_at=NOW(),archived_by=$1,archive_reason=$2 WHERE id=$3 AND active=true RETURNING code", [req.session.user.id, reason, req.params.id]);
  if (!result.rowCount) return res.status(404).json({ error: "Active course not found." });
  await audit(pool, req.session.user.id, "ARCHIVE_COURSE", req.params.id, `${result.rows[0].code}: ${reason}`);
  res.json({ ok: true });
});

app.get("/api/courses/:id/roster", authenticated, async (req, res) => {
  const result = await pool.query(`SELECT s.id,s.student_id AS "studentId",s.name,s.class_name AS "className",s.email,(e.student_id IS NOT NULL) AS enrolled FROM students s LEFT JOIN enrollments e ON e.student_id=s.id AND e.course_id=$1 WHERE s.active=true ORDER BY s.class_name,s.student_id`, [req.params.id]);
  res.json({ rows: result.rows });
});

app.put("/api/courses/:id/roster", adminOnly, async (req, res) => {
  const studentIds = Array.isArray(req.body.studentIds) ? req.body.studentIds.map(Number).filter(Number.isInteger) : [];
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM enrollments WHERE course_id=$1", [req.params.id]);
    for (const studentId of studentIds) await client.query("INSERT INTO enrollments (student_id,course_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [studentId, req.params.id]);
    await audit(client, req.session.user.id, "UPDATE_ROSTER", req.params.id, `${studentIds.length} enrolled student(s)`);
    await client.query("COMMIT");
    res.json({ ok: true, count: studentIds.length });
  } catch {
    await client.query("ROLLBACK");
    res.status(500).json({ error: "Unable to update roster." });
  } finally { client.release(); }
});

app.get("/api/sessions", authenticated, async (req, res) => {
  const result = await pool.query(`
    SELECT cs.id,cs.class_name AS "className",cs.session_date AS "sessionDate",cs.opens_at AS "opensAt",
      cs.closes_at AS "closesAt",cs.late_after AS "lateAfter",cs.checkin_method AS method,
      cs.checkin_code AS "checkinCode",cs.status,c.id AS "courseId",c.code,c.name AS "courseName",
      COUNT(e.student_id)::int AS "rosterCount",
      COUNT(sa.student_id) FILTER (WHERE sa.status IN ('Punctual','Late'))::int AS "checkedIn",
      COUNT(sa.student_id) FILTER (WHERE sa.status='Late')::int AS late,
      COUNT(sa.student_id) FILTER (WHERE sa.status='Excused')::int AS excused
    FROM checkin_sessions cs JOIN courses c ON c.id=cs.course_id
    LEFT JOIN enrollments e ON e.course_id=cs.course_id AND e.student_id IN (SELECT id FROM students WHERE class_name=cs.class_name AND active=true)
    LEFT JOIN session_attendance sa ON sa.session_id=cs.id
    WHERE cs.status <> 'archived'
    GROUP BY cs.id,c.id ORDER BY cs.session_date DESC,cs.opens_at DESC`);
  res.json({ rows: result.rows });
});

app.post("/api/sessions", adminOnly, async (req, res) => {
  const { data, errors } = cleanSession(req.body);
  if (errors.length) return res.status(400).json({ error: errors.join(" ") });
  const roster = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM enrollments e JOIN students s ON s.id=e.student_id
     WHERE e.course_id=$1 AND s.class_name=$2 AND s.active=true`,
    [data.courseId, data.className]
  );
  if (roster.rows[0].count === 0) return res.status(400).json({ error: "The selected class has no active students enrolled in this course." });
  const code = crypto.randomBytes(3).toString("hex").toUpperCase();
  try {
    const result = await pool.query(
      `INSERT INTO checkin_sessions (course_id,class_name,session_date,opens_at,closes_at,late_after,checkin_method,checkin_code,created_by)
       VALUES ($1,$2,$3::date,$3::date+$4::time,$3::date+$5::time,$3::date+$6::time,$7,$8,$9) RETURNING id,checkin_code AS "checkinCode"`,
      [data.courseId,data.className,data.sessionDate,data.startTime,data.endTime,data.lateAfter,data.method,code,req.session.user.id]
    );
    await audit(pool, req.session.user.id, "CREATE_SESSION", result.rows[0].id, `${data.sessionDate} / ${data.className}`);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(error.code === "23505" ? 409 : 500).json({ error: error.code === "23505" ? "A session already exists for this course, class, and date." : "Unable to create check-in session." });
  }
});

app.post("/api/sessions/:id/start", adminOnly, async (req, res) => {
  const result = await pool.query("UPDATE checkin_sessions SET status='active' WHERE id=$1 AND status='scheduled' RETURNING id,checkin_code AS \"checkinCode\"", [req.params.id]);
  if (!result.rowCount) return res.status(409).json({ error: "Only scheduled sessions can be started." });
  await audit(pool, req.session.user.id, "START_SESSION", req.params.id, "Check-in session started");
  res.json({ ok: true, checkinCode: result.rows[0].checkinCode });
});

app.post("/api/sessions/:id/close", adminOnly, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const sessionResult = await client.query("UPDATE checkin_sessions SET status='closed' WHERE id=$1 AND status IN ('scheduled','active') RETURNING course_id,class_name", [req.params.id]);
    if (!sessionResult.rowCount) return res.status(409).json({ error: "This session is already closed or archived." });
    await client.query(`
      INSERT INTO session_attendance (session_id,student_id,status,method)
      SELECT $1,s.id,CASE WHEN la.status='Approved' THEN 'Excused' ELSE 'Absent' END,'system'
      FROM students s JOIN enrollments e ON e.student_id=s.id AND e.course_id=$2
      LEFT JOIN leave_applications la ON la.session_id=$1 AND la.student_id=s.id AND la.status='Approved'
      WHERE s.active=true AND s.class_name=$3
      ON CONFLICT (session_id,student_id) DO UPDATE SET status=CASE WHEN session_attendance.status IN ('Punctual','Late') THEN session_attendance.status ELSE EXCLUDED.status END,updated_at=NOW()
    `, [req.params.id,sessionResult.rows[0].course_id,sessionResult.rows[0].class_name]);
    await audit(client, req.session.user.id, "CLOSE_SESSION", req.params.id, "Session finalized with absent/excused statuses");
    await client.query("COMMIT");
    res.json({ ok: true });
  } catch {
    await client.query("ROLLBACK");
    if (!res.headersSent) res.status(500).json({ error: "Unable to close session." });
  } finally { client.release(); }
});

app.post("/api/sessions/:id/regenerate-code", adminOnly, async (req, res) => {
  const code = crypto.randomBytes(3).toString("hex").toUpperCase();
  const result = await pool.query("UPDATE checkin_sessions SET checkin_code=$1 WHERE id=$2 AND status='active' RETURNING checkin_code AS \"checkinCode\"", [code, req.params.id]);
  if (!result.rowCount) return res.status(409).json({ error: "Only active sessions can regenerate a code." });
  await audit(pool, req.session.user.id, "REGENERATE_CODE", req.params.id, "Attendance code regenerated");
  res.json(result.rows[0]);
});

app.post("/api/sessions/:id/archive", adminOnly, async (req, res) => {
  const reason = String(req.body.reason || "").trim();
  if (reason.length < 5) return res.status(400).json({ error: "Archive reason must be at least 5 characters." });
  const result = await pool.query("UPDATE checkin_sessions SET status='archived',archived_at=NOW(),archived_by=$1,archive_reason=$2 WHERE id=$3 AND status='closed' RETURNING id", [req.session.user.id,reason,req.params.id]);
  if (!result.rowCount) return res.status(409).json({ error: "Only closed sessions can be archived." });
  await audit(pool, req.session.user.id, "ARCHIVE_SESSION", req.params.id, reason);
  res.json({ ok: true });
});

app.get("/api/sessions/:id/status", authenticated, async (req, res) => {
  const result = await pool.query(`
    SELECT s.id,s.student_id AS "studentId",s.name,s.class_name AS "className",
      COALESCE(sa.status,CASE WHEN la.status='Approved' THEN 'Excused' ELSE 'Not checked in' END) AS status,
      sa.checked_in_at AS "checkedInAt",sa.method,la.status AS "leaveStatus"
    FROM checkin_sessions cs JOIN enrollments e ON e.course_id=cs.course_id
    JOIN students s ON s.id=e.student_id AND s.class_name=cs.class_name AND s.active=true
    LEFT JOIN session_attendance sa ON sa.session_id=cs.id AND sa.student_id=s.id
    LEFT JOIN leave_applications la ON la.session_id=cs.id AND la.student_id=s.id
    WHERE cs.id=$1 ORDER BY s.student_id`, [req.params.id]);
  res.json({ rows: result.rows });
});

app.post("/api/check-in", authenticated, async (req, res) => {
  const sessionId = Number(req.body.sessionId);
  const studentId = String(req.body.studentId || "").trim();
  const code = String(req.body.code || "").trim().toUpperCase();
  if (!Number.isInteger(sessionId) || !studentId || !code) return res.status(400).json({ error: "Session, student ID, and code are required." });
  const current = await pool.query(`SELECT cs.*,s.id AS student_pk FROM checkin_sessions cs JOIN students s ON s.student_id=$2 AND s.active=true JOIN enrollments e ON e.course_id=cs.course_id AND e.student_id=s.id AND s.class_name=cs.class_name WHERE cs.id=$1`, [sessionId,studentId]);
  const row = current.rows[0];
  if (!row) return res.status(404).json({ error: "Student is not enrolled in this session." });
  if (row.status !== "active") return res.status(409).json({ error: "This check-in session is not active." });
  if (row.checkin_method !== "code") return res.status(409).json({ error: "This session uses manual check-in." });
  if (row.checkin_code !== code) return res.status(401).json({ error: "Invalid attendance code." });
  const approved = await pool.query("SELECT 1 FROM leave_applications WHERE session_id=$1 AND student_id=$2 AND status='Approved'", [sessionId,row.student_pk]);
  if (approved.rowCount) return res.status(409).json({ error: "This student has approved leave for this session." });
  const status = new Date() <= new Date(row.late_after) ? "Punctual" : "Late";
  await pool.query("INSERT INTO session_attendance (session_id,student_id,checked_in_at,status,method) VALUES ($1,$2,NOW(),$3,'code') ON CONFLICT (session_id,student_id) DO NOTHING", [sessionId,row.student_pk,status]);
  res.json({ ok: true,status });
});

app.get("/api/leaves", authenticated, async (req, res) => {
  const result = await pool.query(`SELECT la.id,la.reason,la.description,la.status,la.created_at AS "createdAt",la.review_note AS "reviewNote",s.student_id AS "studentId",s.name,cs.session_date AS "sessionDate",c.code,c.name AS "courseName",cs.class_name AS "className" FROM leave_applications la JOIN students s ON s.id=la.student_id JOIN checkin_sessions cs ON cs.id=la.session_id JOIN courses c ON c.id=cs.course_id ORDER BY CASE WHEN la.status='Pending' THEN 0 ELSE 1 END,la.created_at DESC`);
  res.json({ rows: result.rows });
});

app.post("/api/leaves", authenticated, async (req, res) => {
  const sessionId = Number(req.body.sessionId);
  const studentId = String(req.body.studentId || "").trim();
  const reason = String(req.body.reason || "").trim();
  const description = String(req.body.description || "").trim();
  if (!Number.isInteger(sessionId) || !studentId || reason.length < 2 || description.length < 5) return res.status(400).json({ error: "Session, student ID, reason, and a detailed description are required." });
  const student = await pool.query("SELECT id FROM students WHERE student_id=$1 AND active=true", [studentId]);
  if (!student.rowCount) return res.status(404).json({ error: "Student not found." });
  try {
    const result = await pool.query("INSERT INTO leave_applications (session_id,student_id,reason,description) VALUES ($1,$2,$3,$4) RETURNING id", [sessionId,student.rows[0].id,reason,description]);
    await audit(pool, req.session.user.id, "SUBMIT_LEAVE", result.rows[0].id, `${studentId}: ${reason}`);
    res.status(201).json({ id: result.rows[0].id });
  } catch (error) {
    res.status(error.code === "23505" ? 409 : 500).json({ error: error.code === "23505" ? "A leave application already exists for this student and session." : "Unable to submit leave application." });
  }
});

app.put("/api/leaves/:id/review", adminOnly, async (req, res) => {
  const status = String(req.body.status || "").trim();
  const note = String(req.body.note || "").trim();
  if (!["Approved","Rejected"].includes(status)) return res.status(400).json({ error: "Review status must be Approved or Rejected." });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query("UPDATE leave_applications SET status=$1,reviewed_by=$2,reviewed_at=NOW(),review_note=$3 WHERE id=$4 AND status='Pending' RETURNING session_id,student_id", [status,req.session.user.id,note || null,req.params.id]);
    if (!result.rowCount) return res.status(409).json({ error: "This application has already been reviewed." });
    if (status === "Approved") await client.query("INSERT INTO session_attendance (session_id,student_id,status,method) VALUES ($1,$2,'Excused','leave') ON CONFLICT (session_id,student_id) DO UPDATE SET status='Excused',method='leave',updated_at=NOW()", [result.rows[0].session_id,result.rows[0].student_id]);
    await audit(client, req.session.user.id, `${status.toUpperCase()}_LEAVE`, req.params.id, note || "Leave reviewed");
    await client.query("COMMIT");
    res.json({ ok: true });
  } catch {
    await client.query("ROLLBACK");
    if (!res.headersSent) res.status(500).json({ error: "Unable to review leave application." });
  } finally { client.release(); }
});

app.get("/api/stats", authenticated, async (req, res) => {
  const [summary, sessions, leaves] = await Promise.all([
    pool.query("SELECT COUNT(*)::int AS \"totalStudents\" FROM students WHERE active=true"),
    pool.query("SELECT COUNT(*)::int AS total,COUNT(*) FILTER (WHERE status='active')::int AS active,COUNT(*) FILTER (WHERE status='closed')::int AS closed FROM checkin_sessions WHERE status <> 'archived'"),
    pool.query("SELECT COUNT(*) FILTER (WHERE status='Pending')::int AS pending,COUNT(*) FILTER (WHERE status='Approved')::int AS approved FROM leave_applications")
  ]);
  res.json({ summary: { ...summary.rows[0], ...sessions.rows[0], ...leaves.rows[0] } });
});

app.get("/api/reports/export", adminOnly, async (req, res) => {
  const params = [];
  const where = [];
  if (req.query.courseId) { params.push(Number(req.query.courseId)); where.push(`cs.course_id=$${params.length}`); }
  if (req.query.from) { params.push(String(req.query.from)); where.push(`cs.session_date >= $${params.length}`); }
  if (req.query.to) { params.push(String(req.query.to)); where.push(`cs.session_date <= $${params.length}`); }
  const result = await pool.query(`
    SELECT s.student_id,s.name,s.class_name,c.code AS course_code,c.name AS course_name,cs.session_date,
      COALESCE(sa.status,CASE WHEN la.status='Approved' THEN 'Excused' ELSE 'Absent' END) AS status,sa.checked_in_at
    FROM checkin_sessions cs JOIN courses c ON c.id=cs.course_id JOIN enrollments e ON e.course_id=cs.course_id
    JOIN students s ON s.id=e.student_id AND s.class_name=cs.class_name
    LEFT JOIN session_attendance sa ON sa.session_id=cs.id AND sa.student_id=s.id
    LEFT JOIN leave_applications la ON la.session_id=cs.id AND la.student_id=s.id
    WHERE cs.status='closed' ${where.length ? `AND ${where.join(" AND ")}` : ""} ORDER BY cs.session_date,s.student_id`, params);
  const header = "student_id,student_name,class_name,course_code,course_name,session_date,status,checked_in_at";
  const csv = [header, ...result.rows.map((row) => [row.student_id,row.name,row.class_name,row.course_code,row.course_name,String(row.session_date).slice(0,10),row.status,row.checked_in_at || ""].map((item) => `"${String(item).replaceAll('"','""')}"`).join(","))].join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="attendance-report-${new Date().toISOString().slice(0,10)}.csv"`);
  res.send(csv);
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
