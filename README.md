# Student Attendance Management

A PostgreSQL-backed attendance and learning workspace for administrators, teachers, and students. The application combines attendance sessions, course rosters, leave requests, quizzes, homework, grading, learning profiles, teaching activity analytics, and optional OpenRouter-assisted reflection.

## What is included

- Attendance sessions with generated codes, late thresholds, live monitoring, closing, archiving, and CSV reports.
- Course and roster management with active/archived student states.
- Leave requests tied to a specific class meeting, with approval and rejection workflow.
- Role-based workspaces:
  - **Admin:** manages students, courses, rosters, teachers, sessions, leave approvals, reports, photos, cohorts, and learning thresholds.
  - **Teacher:** uses assigned courses, creates activities, reviews submissions, grades essays, publishes results, and records teaching segments.
  - **Student:** enters the Learning workspace after login and uses Home, My activities, My profile, and My check-in without leaving the same page flow.
- Learning activities with multiple-choice questions, essays, homework, revisions, attachments, grading history, and publishing.
- Classroom reports showing completion rate, MCQ accuracy, pending grading, and answers needing attention.
- Student learning profiles with photos or default avatars, cohort, weak knowledge topics, progression, attendance history, and class/cohort comparisons.
- Teaching behavior statistics based on manually recorded teaching, interaction, and board-writing segments.
- Optional OpenRouter analysis using aggregate metrics only. Names, photos, raw answers, and private identifiers are excluded from the AI context.

## Role flow

```text
Admin creates course and students
        |
Admin assigns students to a course roster
        |
Admin assigns a teacher to the course
        |
Teacher creates a class session
        |
Teacher starts the session and shares the check-in code
        |
Student uses My check-in, submits leave requests, and completes activities
        |
Teacher reviews results and analytics
```

A **class session** means one specific class meeting: course, class, date, time window, and attendance code. Leave requests must select a class session because an absence applies to a particular meeting, not to an entire course.

## Run locally

1. Install Node.js 20+ and PostgreSQL.
2. Create a PostgreSQL database, for example `student_attendance`.
3. Copy `.env.example` to `.env` and configure the PostgreSQL connection.
4. Install dependencies:

   ```bash
   pnpm install
   ```

5. Start the application:

   ```bash
   pnpm start
   ```

6. Open `http://localhost:3000`.

The first administrator is created from `ADMIN_USERNAME` and `ADMIN_PASSWORD`. Existing accounts with the same username are preserved.

## OpenRouter configuration

OpenRouter is optional. The application continues to work without an API key, but the AI reflection panel remains unavailable.

Add these values to `.env` on the backend only:

```env
OPENROUTER_API_KEY=your_key_here
OPENROUTER_MODEL=~openai/gpt-sol-latest
OPENROUTER_SITE_URL=http://localhost:3000
OPENROUTER_APP_NAME=Student Attendance Learning Workspace
```

Restart the server after changing `.env`. The AI endpoint uses the OpenRouter Responses API and returns structured fields for Summary, Findings, Recommendations, Limitations, and Confidence. If a provider returns extra Markdown or reasoning, the backend extracts the JSON object before the frontend renders it.

## Demo data

The repository includes a safe synthetic data generator for demonstrations. It creates 100 students, 4 courses, 48 attendance sessions, attendance outcomes, leave requests, 12 learning activities, submissions, grades, pending essays, and teaching segments.

Run after the application has started once and completed migrations:

```bash
npm run seed:demo
```

Demo accounts:

```text
Teacher: DEMO-teacher / DemoTeacher123!
Student: DEMO-STU-001 / DEMO-STU-001
```

To remove and recreate only the synthetic dataset:

```bash
npm run seed:demo:reset
npm run seed:demo
```

All generated records use `DEMO-` identifiers or `Demo ` titles. Do not run the reset command against a production database. See [the demo seed guide](docs/demo-seed.md) for details.

## Main workflows

### Admin

1. Open **Students** and create or import students. Active students can participate in sessions.
2. Open **Courses & roster**, select a course, and manage the selected roster.
3. Assign teachers from **People & settings** in the Learning workspace.
4. Create a class session with course, class, date, time window, late threshold, and method.
5. Start the session to generate an attendance code.
6. Review leave requests and monitor attendance.
7. Close sessions to finalize absent and excused statuses, then export reports.

### Teacher

1. Sign in and open the Learning Home page.
2. Use **Next action** to continue the current workflow.
3. Create a quiz or homework for an assigned course session.
4. Open the activity report to review completion, accuracy, missing submissions, and pending essays.
5. Grade essays, publish results, and review student profiles.
6. Use the teaching timer to record teaching, interaction, and board-writing proportions.
7. Ask the optional AI reflection panel for an evidence-based interpretation of aggregate activity.

### Student

1. Sign in at `http://localhost:3000`; students are redirected to `learning.html` automatically.
2. Use **Home** to see the next action and profile summary.
3. Use **My activities** to submit quizzes and homework.
4. Use **My profile** to view photo/avatar, class, cohort, progress, topics, and attendance history.
5. Use **My check-in** in the same Learning page to enter an attendance code or submit a leave request.

Students only see upcoming or active class sessions in the check-in and leave dropdowns. A teacher or admin must create and start a session before it becomes available.

## Status meanings

- **Draft:** activity is being prepared and is not ready for student submission.
- **Open:** students can submit.
- **Closed:** submissions are no longer accepted.
- **Published:** results are visible to students.
- **Archived:** retained for history and no longer part of active workflows.

## Student photos and cohorts

Only administrators can upload or replace a student photo through **People & settings**. If no photo is uploaded, the UI displays a default initials avatar. Cohorts can be assigned by an administrator and are used for learning profile comparisons.

## Imports, backup, and tests

Attendance CSV import format:

```text
student_id,student_name,class_name,course,attendance_date,status
2351520115,Student Name,Class A,Computer Science,2026-09-21,Punctual
```

Allowed attendance statuses are `Punctual`, `Late`, and `Absent`. Duplicate student/course/date combinations are rejected.

Back up the database before migrations or demonstrations:

```bash
npm run backup
```

Run the available checks:

```bash
npm test
npm run test:integration
```

The integration suite requires a working PostgreSQL connection and uses an isolated schema when configured by the test environment. See [docs/learning-workspace.md](docs/learning-workspace.md) for migration, permissions, file limits, metric definitions, and verification notes.

