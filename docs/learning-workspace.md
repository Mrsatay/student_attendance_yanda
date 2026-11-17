# Learning workspace: operation and acceptance

## Upgrade and database safety

1. Stop the application and create a database backup before the first upgraded start: `npm run backup` (or `pnpm backup`). PostgreSQL `pg_dump` must be on PATH; alternatively set `PGBIN` to its directory.
2. Keep the existing `.env`. The upgrade uses the same Node.js 20+ and PostgreSQL dependencies. Set a strong `SESSION_SECRET`. Production HTTPS deployments need the existing secure cookie configuration and appropriate proxy setup.
3. Run `npm start`. Startup creates the original attendance tables if needed, then applies `migrations/001-learning.sql` transactionally. Applied versions are recorded in `schema_migrations`; a failed migration rolls back. Back up the complete database, including files stored in PostgreSQL.
4. Log in as administrator and choose **Learning workspace**. Existing student credentials remain unchanged. Teacher accounts are created under **People & settings** and must be assigned to courses.
5. Populate student cohorts and photographs before creating new sessions. Current students/classes/courses remain managed in the attendance workspace. Session creation captures the active enrolled class roster; activities inherit that snapshot.

Historical migration reconstructs participants from the current enrollment plus existing attendance and leave records. Students removed from enrollment before this upgrade, with no remaining attendance/leave evidence, cannot be recovered automatically. Review historical reports after migration. Identity names remain current; class/cohort membership is preserved in snapshots.

Web login sessions now persist in PostgreSQL across application restarts. Expired cookies are rejected. Backups contain session data, uploaded documents and student records; restrict access to backup files.

### Restore rehearsal

Use a new database first. With PostgreSQL tools on PATH and connection variables configured, for example:

```powershell
createdb attendance_restore_check
pg_restore --no-owner --dbname attendance_restore_check backups/<backup-file>.dump
```

Point a separate application instance at that database and verify login, reports, photos and attachments. Do not restore over the live database as a routine check. Restore/recovery of production data is an explicit operator action. Migration rollback uses the pre-upgrade backup, not dropping individual new tables.

## Roles

- Admin: existing attendance administration, teacher creation/course assignment, cohorts, photos, thresholds, all learning reports.
- Teacher: assigned-course sessions, quizzes/homework, attachments, grading, profiles and analytics. Course and roster administration remains with the admin.
- Student: own available activities, submissions, files and profile. Peer comparisons contain aggregate values only. Keys, scores and feedback are hidden before publication.
- Viewer: existing attendance access; no learning workspace access.

## Teaching workflow

1. Enroll students in a course using the attendance workspace. Assign the course to its teacher. Set cohort labels when cohort comparisons are needed.
2. Create a session for the relevant class. Its participants are fixed at creation; roster edits apply to future sessions.
3. In Learning, create a draft quiz or homework. Add multiple-choice questions and/or essays with topic, maximum points and rubric. Mixed activities are supported. Homework requires a future deadline.
4. Add up to three instruction attachments while in draft, then open the activity. Student answers are accepted only while open and subject to the deadline/late policy. Revisions are allowed only when explicitly enabled.
5. Students submit all answers together, with up to three attachments. An essay/task requires text; the text can describe an attached deliverable. Each revision is a complete submission with its own attachments. Prior versions are retained.
6. Review the instant report. MCQs are automatically scored. Use the latest submission's assessment form for essays; enter a bounded score, feedback, practice flag and assessment reason. Old revisions cannot be regraded. Corrections preserve before/after answers and assessor identity.
7. Close submissions before publishing. Publication requires all submitted latest answers to be graded; students who did not submit remain distinct from incorrect answers. Results can be published or assessed after archiving a closed activity.
8. Download the roster CSV from the report. It uses the latest revision and includes missing students, pending grades and late status.

Activity questions are immutable after creation to keep grading reproducible. Check the draft before opening. For a question mistake, create a replacement activity; this release does not provide a question-edit or delete workflow. Activities may be archived after closing.

## Definitions

| Measure | Definition |
| --- | --- |
| Completion | Latest submitted participant count / fixed participant count. |
| MCQ accuracy | Correct submitted MCQ answers / graded submitted MCQ answers, without point weighting. |
| Attainment | Earned points / available points for graded answers. Pending answers are excluded. |
| Final activity score | Sum of latest answer scores / total points, displayed only once all questions are graded. |
| Needs practice | Attainment below configured threshold, with the configured minimum graded-answer count. Defaults: 60%, three graded answers. Evidence lists source activities/questions. |
| Class/cohort comparison | Weighted graded-answer attainment on the same activity IDs and matching snapshot class/cohort. No unrelated test comparisons. Participant and pending counts are shown. |
| Response time | Activity opening to latest submission; includes revision time. |
| Grading time | Latest submission to latest manual grading event, excluding purely automatic MCQ scoring. This is not feedback-publication time. |

No-data rates are represented as `null`/“No data”, not zero. Teacher statistics can be provisional when grading is incomplete. Student learning profiles currently include published activities only; attendance is shown independently. Missing submissions remain missing rather than automatically scored zero.

Class/grade averages are available where students share the same assessment. In the activity editor, expand Share this assessment with other classes and select additional sessions from the same course. Participants from those snapshots answer the identical questions, allowing class and cohort comparisons. Each student is counted once; primary-session membership takes precedence if the student belongs to several selected sessions. Course/date filters use the primary session. There is no normalization of unrelated exams.

## Teaching behavior

Teachers select an active session and start Teaching, Interaction or Board writing. Switching mode closes the previous segment; Pause closes it without starting another. A teacher can have only one running timer across all sessions. Closing a session stops its timers. Segments persist across page refreshes and login restarts.

Timers are self-recorded. Leaving the page or logging out does not pause a running timer. Remind teachers to pause; a forgotten timer will overstate duration. Analytics exposes start/end times for inspection. This release does not infer attention, camera activity, head-raising or actual blackboard behavior.

## Files

Student photos accept PNG/JPEG, at most 2 MB. Instruction/submission attachments accept PNG/JPEG/PDF/TXT, at most 5 MB each. Uploads are signature/type checked, stored in PostgreSQL, and downloaded through authenticated, role-checked endpoints. Attachments are delivered as downloads; they are not published as static files. Other office formats and malware scanning are not included.

## Existing attendance improvements

- Leave descriptions require at least five characters with an explicit validation message; students must belong to the session snapshot.
- Course archive errors list sessions blocking the action. All sessions must be archived first, including closed sessions.
- Attendance export starts with a preview using the same query and includes closed and archived sessions. Invalid date ranges are rejected. Empty previews explain what to check.
- Session participant counts no longer multiply due to joins against attendance records.

## Verification

```powershell
npm test
npm run test:integration
```

Unit tests cover metric definitions, grading bounds, validation and CSV formula escaping. Integration tests require a reachable PostgreSQL instance configured through `.env`; they create a randomly named, isolated schema, start a server on an available port, test real HTTP APIs, then remove only their own schema. The database role needs CREATE SCHEMA permission. Application tables in the normal schema are not test fixtures.

The integration suite checks admin/teacher/student authorization, hidden answer keys and grades, peer file denial, photo formats, revision history, deadline rules, publication, grade corrections, persistent login, repeat startup, timers, roster snapshots and archived attendance exports.

For an isolated manual UI rehearsal, set `LEARNING_TEST_HOLD=1` before running the integration test. It prints a temporary URL and synthetic account credentials, and waits for Enter before cleaning up. Do not close the terminal without letting cleanup complete.

Manual acceptance should cover desktop/mobile layout, building a mixed quiz, a student submission with a file, grading/publishing, profiles, timers, file downloads and empty reports. Automated API success alone does not establish visual usability or the five-second update target on the customer's network.
