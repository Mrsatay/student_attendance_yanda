# Student Attendance Management

Lightweight web application for the Student Attendance Information Management course project.

## Stack

- Node.js and Express
- PostgreSQL through `pg`
- Vanilla HTML, CSS, and JavaScript
- PostgreSQL tables are created automatically on first startup

## Run locally

1. Install Node.js 20+ and PostgreSQL.
2. Create a PostgreSQL database, for example `student_attendance`.
3. Copy `.env.example` to `.env` and fill in the PostgreSQL password and database name.
4. Install dependencies with `pnpm install`.
5. Start the app with `pnpm start`.
6. Open `http://localhost:3000`.

The first administrator is created from `ADMIN_USERNAME` and `ADMIN_PASSWORD`. The application does not overwrite an existing account with the same username.

## Import format

CSV or TXT files should use this column order:

```text
student_id,student_name,class_name,course,attendance_date,status
2351520115,Student Name,2351520115,Computer Science,2026-09-21,Punctual
```

Allowed statuses are `Punctual`, `Late`, and `Absent`. Duplicate combinations of student, course, and date are rejected.
# student_attendance_yanda
