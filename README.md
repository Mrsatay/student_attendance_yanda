# Student Attendance Management

Lightweight PostgreSQL-backed web application for the Student Attendance Information Management course project. The current design follows the supervisor revision: teachers initiate check-in sessions, monitor live attendance, manage rosters, review leave applications, and export finalized reports.

## Stack

- Node.js and Express
- PostgreSQL through `pg`
- Vanilla HTML, CSS, and JavaScript
- PostgreSQL tables are created automatically on first startup
- Session-based check-in with generated attendance code and late threshold
- Student, course, enrollment, leave, audit, and archive workflows

## Run locally

1. Install Node.js 20+ and PostgreSQL.
2. Create a PostgreSQL database, for example `student_attendance`.
3. Copy `.env.example` to `.env` and fill in the PostgreSQL password and database name.
4. Install dependencies with `pnpm install`.
5. Start the app with `pnpm start`.
6. Open `http://localhost:3000`.

The first administrator is created from `ADMIN_USERNAME` and `ADMIN_PASSWORD`. The application does not overwrite an existing account with the same username.

## Supervisor workflow

1. Create students and courses.
2. Open `Courses & roster` and enroll students in a course.
3. Use `Check-in sessions` to set the class, time window, late threshold, and check-in method.
4. Start the session and show the generated code.
5. Open `Monitor` to view live roster status; the page polls every four seconds.
6. Submit and approve/reject leave applications in `Leave approvals`.
7. Close a session to finalize absent and excused statuses.
8. Export a filtered CSV from `Reports`.

Student and course removal uses archive/restore with a required reason, preserving history for auditability.

## Import format

CSV or TXT files should use this column order:

```text
student_id,student_name,class_name,course,attendance_date,status
2351520115,Student Name,2351520115,Computer Science,2026-09-21,Punctual
```

Allowed statuses are `Punctual`, `Late`, and `Absent`. Duplicate combinations of student, course, and date are rejected.
# student_attendance_yanda
