import express from 'express';
import { askOpenRouter, openRouterConfigured } from './openrouter.js';
import { check, id, textValue, questions, scoreAnswers, gradeAnswers, metrics, percent, csv, dateRange } from './learning-domain.js';

export function learningApi(pool, hashPassword) {
  const router = express.Router();
  const rows = async (sql, params = [], db = pool) => (await db.query(sql, params)).rows;
  const one = async (sql, params = [], db = pool) => (await rows(sql, params, db))[0];
  async function transaction(fn) {
    const db = await pool.connect();
    try { await db.query('BEGIN'); const result = await fn(db); await db.query('COMMIT'); return result; }
    catch (error) { await db.query('ROLLBACK'); throw error; }
    finally { db.release(); }
  }
  const staff = (user) => check(['admin', 'teacher'].includes(user.role), 'Teacher permission required.', 403);
  const admin = (user) => check(user.role === 'admin', 'Administrator permission required.', 403);
  async function courseAccess(user, courseId, db = pool) {
    staff(user);
    check(await one('SELECT id FROM courses WHERE id=$1', [courseId], db), 'Course not found.', 404);
    if (user.role !== 'admin') check(await one('SELECT 1 FROM course_teachers WHERE user_id=$1 AND course_id=$2', [user.id, courseId], db), 'This course is not assigned to you.', 403);
  }
  async function studentAccess(user, studentId) {
    if (user.role === 'admin') return;
    if (user.role === 'student') return check(String(user.studentPk) === String(studentId), 'Access denied.', 403);
    staff(user);
    check(await one(`SELECT 1 FROM course_teachers ct WHERE ct.user_id=$1 AND (
      EXISTS(SELECT 1 FROM enrollments e WHERE e.course_id=ct.course_id AND e.student_id=$2) OR
      EXISTS(SELECT 1 FROM session_participants sp JOIN checkin_sessions cs ON cs.id=sp.session_id WHERE cs.course_id=ct.course_id AND sp.student_id=$2))`, [user.id, studentId]), 'Student is outside your courses.', 403);
  }
  async function activityAccess(user, activityId, db = pool, lock = false) {
    const activity = await one(`SELECT a.*,cs.course_id FROM learning_activities a JOIN checkin_sessions cs ON cs.id=a.session_id WHERE a.id=$1 ${lock ? 'FOR UPDATE OF a' : ''}`, [id(activityId)], db);
    check(activity, 'Activity not found.', 404);
    if (user.role === 'student') {
      check(activity.status !== 'draft' && await one('SELECT 1 FROM activity_participants WHERE activity_id=$1 AND student_id=$2', [activity.id, user.studentPk], db), 'Activity is not available to you.', 403);
    } else await courseAccess(user, activity.course_id, db);
    return activity;
  }
  const latestSql = `SELECT DISTINCT ON(student_id) * FROM learning_submissions WHERE activity_id=$1 ORDER BY student_id,revision DESC`;
  async function activityDetail(user, activityId) {
    const activity = await activityAccess(user, activityId);
    const isStudent = user.role === 'student';
    const submissions = await rows(`SELECT sub.*,s.name,s.student_id AS student_code FROM learning_submissions sub JOIN students s ON s.id=sub.student_id WHERE sub.activity_id=$1 ${isStudent ? 'AND sub.student_id=$2' : ''} ORDER BY sub.student_id,sub.revision DESC`, isStudent ? [activity.id, user.studentPk] : [activity.id]);
    const files = await rows(`SELECT id,name,purpose,submission_id,student_id FROM learning_files WHERE activity_id=$1 OR submission_id IN(SELECT id FROM learning_submissions WHERE activity_id=$1 ${isStudent ? 'AND student_id=$2' : ''})`, isStudent ? [activity.id, user.studentPk] : [activity.id]);
    if (isStudent && !activity.published) {
      activity.questions = activity.questions.map(({ correct, ...q }) => q);
      submissions.forEach((sub) => { sub.answers = sub.answers.map(({ answer }) => ({ answer, score: null })); sub.graded_at = null; sub.graded_by = null; });
    }
    const participants = isStudent ? [] : await rows(`SELECT ap.*,s.name,s.student_id AS student_code,f.id AS photo_id FROM activity_participants ap JOIN students s ON s.id=ap.student_id LEFT JOIN learning_files f ON f.student_id=s.id AND f.purpose='photo' WHERE ap.activity_id=$1 ORDER BY s.name`, [activity.id]);
    const latest = submissions.filter((sub, index) => submissions.findIndex((item) => item.student_id === sub.student_id) === index);
    const history = isStudent ? [] : await rows(`SELECT gh.*,u.username FROM grade_history gh JOIN users u ON u.id=gh.actor JOIN learning_submissions sub ON sub.id=gh.submission_id WHERE sub.activity_id=$1 ORDER BY gh.created_at DESC`, [activity.id]);
    const groups = await rows('SELECT DISTINCT class_name,cohort FROM activity_participants WHERE activity_id=$1 ORDER BY class_name,cohort', [activity.id]);
    return { activity, groups, submissions, files, participants, history, metrics: isStudent ? null : metrics(activity.questions, participants.length, latest) };
  }
  router.use(async (req, res, next) => {
    check(req.session.user, 'Authentication required.', 401);
    check(req.session.user.role !== 'viewer', 'Learning access requires a student, teacher, or administrator account.', 403);
    if (req.session.user.role === 'student') check(await one('SELECT 1 FROM students WHERE id=$1 AND active=true', [req.session.user.studentPk]), 'Student account is inactive.', 403);
    next();
  });

  router.get('/catalog', async (req, res) => {
    const u = req.session.user;
    const courses = await rows(`SELECT c.* FROM courses c WHERE $1='admin' OR ($1='teacher' AND EXISTS(SELECT 1 FROM course_teachers ct WHERE ct.course_id=c.id AND ct.user_id=$2)) OR ($1='student' AND (EXISTS(SELECT 1 FROM enrollments e WHERE e.course_id=c.id AND e.student_id=$3) OR EXISTS(SELECT 1 FROM session_participants sp JOIN checkin_sessions cs ON cs.id=sp.session_id WHERE cs.course_id=c.id AND sp.student_id=$3))) ORDER BY c.code`, [u.role, u.id, u.studentPk]);
    const ids = courses.map((c) => c.id);
    const sessions = await rows(`SELECT cs.*,c.code FROM checkin_sessions cs JOIN courses c ON c.id=cs.course_id WHERE cs.course_id=ANY($1::bigint[]) ${u.role === 'student' ? 'AND EXISTS(SELECT 1 FROM session_participants WHERE session_id=cs.id AND student_id=$2)' : ''} ORDER BY cs.session_date DESC`, u.role === 'student' ? [ids, u.studentPk] : [ids]);
    if (u.role === 'student') sessions.forEach((s) => { delete s.checkin_code; });
    const students = await rows(`SELECT DISTINCT s.id,s.student_id,s.name,s.class_name,s.cohort,s.active,f.id AS photo_id FROM students s LEFT JOIN learning_files f ON f.student_id=s.id AND f.purpose='photo' WHERE $1='admin' OR ($1='student' AND s.id=$2) OR ($1='teacher' AND (EXISTS(SELECT 1 FROM enrollments WHERE student_id=s.id AND course_id=ANY($3::bigint[])) OR EXISTS(SELECT 1 FROM session_participants sp JOIN checkin_sessions cs ON cs.id=sp.session_id WHERE sp.student_id=s.id AND cs.course_id=ANY($3::bigint[])))) ORDER BY s.name`, [u.role, u.studentPk, ids]);
    const teachers = u.role === 'admin' ? await rows("SELECT id,username FROM users WHERE role='teacher' ORDER BY username") : [];
    const assignments = u.role === 'admin' ? await rows('SELECT * FROM course_teachers') : [];
    res.json({ user: u, courses, sessions, students, teachers, assignments, settings: await one('SELECT * FROM learning_settings') });
  });
  router.post('/teachers', async (req, res) => {
    admin(req.session.user);
    const username = textValue(req.body.username, 'Username', 3, 80);
    const password = textValue(req.body.password, 'Password', 10, 128);
    res.status(201).json(await one("INSERT INTO users(username,password_hash,role) VALUES($1,$2,'teacher') RETURNING id,username", [username, hashPassword(password)]));
  });
  router.put('/courses/:id/teachers', async (req, res) => {
    admin(req.session.user);
    const courseId = id(req.params.id);
    check(Array.isArray(req.body.teacherIds), 'Select teachers.');
    const teacherIds = [...new Set(req.body.teacherIds.map(id))];
    await transaction(async (db) => {
      check((await rows("SELECT id FROM users WHERE id=ANY($1::bigint[]) AND role='teacher'", [teacherIds], db)).length === teacherIds.length, 'Invalid teacher selection.');
      await db.query('SELECT id FROM courses WHERE id=$1 FOR UPDATE', [courseId]);
      await db.query('DELETE FROM course_teachers WHERE course_id=$1', [courseId]);
      for (const teacherId of teacherIds) await db.query('INSERT INTO course_teachers VALUES($1,$2)', [courseId, teacherId]);
    });
    res.json({ ok: true });
  });
  router.put('/students/:id/cohort', async (req, res) => {
    admin(req.session.user);
    const result = await one('UPDATE students SET cohort=$1 WHERE id=$2 RETURNING id', [textValue(req.body.cohort, 'Cohort', 0, 80), id(req.params.id)]);
    check(result, 'Student not found.', 404); res.json(result);
  });
  router.put('/settings', async (req, res) => {
    admin(req.session.user);
    const threshold = Number(req.body.weakThreshold), minimum = Number(req.body.minQuestions);
    check(Number.isInteger(threshold) && threshold >= 0 && threshold <= 100 && Number.isInteger(minimum) && minimum >= 1 && minimum <= 100, 'Use a threshold of 0-100 and a minimum of 1-100 questions.');
    await pool.query('UPDATE learning_settings SET weak_threshold=$1,min_questions=$2', [threshold, minimum]); res.json({ ok: true });
  });

  router.get('/activities', async (req, res) => {
    const u = req.session.user;
    res.json({ rows: await rows(`SELECT a.id,a.title,a.kind,a.status,a.published,a.due_at,a.session_id,c.code,cs.class_name,cs.session_date FROM learning_activities a JOIN checkin_sessions cs ON cs.id=a.session_id JOIN courses c ON c.id=cs.course_id WHERE ($1='admin' OR ($1='teacher' AND EXISTS(SELECT 1 FROM course_teachers ct WHERE ct.course_id=c.id AND ct.user_id=$2)) OR ($1='student' AND a.status<>'draft' AND EXISTS(SELECT 1 FROM activity_participants ap WHERE ap.activity_id=a.id AND ap.student_id=$3))) ORDER BY a.created_at DESC`, [u.role, u.id, u.studentPk]) });
  });
  router.post('/activities', async (req, res) => {
    staff(req.session.user);
    const sessionId = id(req.body.sessionId);
    const session = await one('SELECT * FROM checkin_sessions WHERE id=$1', [sessionId]);
    check(session, 'Session not found.', 404); await courseAccess(req.session.user, session.course_id);
    check(session.status !== 'archived', 'Choose a session that is not archived.');
    const title = textValue(req.body.title, 'Title', 2, 160);
    check(['quiz', 'homework'].includes(req.body.kind), 'Choose quiz or homework.');
    const items = questions(req.body.questions);
    const due = req.body.dueAt ? new Date(req.body.dueAt) : null;
    check(!due || (!Number.isNaN(+due) && due > new Date()), 'Deadline must be in the future.');
    check(req.body.kind !== 'homework' || due, 'Homework needs a deadline.');
    const result = await transaction(async (db) => {
      check(!req.body.additionalSessionIds || Array.isArray(req.body.additionalSessionIds), 'Choose valid additional sessions.');
      const sessionIds = [...new Set([sessionId,...(req.body.additionalSessionIds || []).map(id)])];
      const selectedSessions = await rows("SELECT id FROM checkin_sessions WHERE id=ANY($1::bigint[]) AND course_id=$2 AND status<>'archived'", [sessionIds,session.course_id], db);
      check(selectedSessions.length === sessionIds.length, 'Shared assessments must use non-archived sessions from the same course.');
      const a = await one(`INSERT INTO learning_activities(session_id,title,kind,instructions,questions,due_at,allow_late,allow_revision,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`, [sessionId, title, req.body.kind, textValue(req.body.instructions, 'Instructions', 0, 10000), JSON.stringify(items), due, req.body.allowLate === true, req.body.allowRevision === true, req.session.user.id], db);
      for (const selected of sessionIds) await db.query('INSERT INTO activity_sessions VALUES($1,$2)', [a.id,selected]);
      await db.query('INSERT INTO activity_participants SELECT DISTINCT ON(student_id) $1,student_id,class_name,cohort FROM session_participants WHERE session_id=ANY($2::bigint[]) ORDER BY student_id,(session_id=$3) DESC,session_id', [a.id, sessionIds,sessionId]);
      check(await one('SELECT 1 FROM activity_participants WHERE activity_id=$1', [a.id], db), 'This session has no participants. Create a session after enrolling students.');
      return a;
    }); res.status(201).json(result);
  });
  router.get('/activities/:id', async (req, res) => res.json(await activityDetail(req.session.user, req.params.id)));
  router.post('/activities/:id/state', async (req, res) => {
    staff(req.session.user);
    await transaction(async (db) => {
      const a = await activityAccess(req.session.user, req.params.id, db, true);
      const action = req.body.action;
      if (action === 'publish') {
        check(a.status === 'closed' || a.status === 'archived', 'Close the activity before publishing results.');
        check(!(await one(`SELECT 1 FROM (${latestSql}) sub CROSS JOIN LATERAL jsonb_array_elements(sub.answers) answer WHERE answer->>'score' IS NULL LIMIT 1`, [a.id], db)), 'Grade all latest submissions before publishing.');
        await db.query('UPDATE learning_activities SET published=true WHERE id=$1', [a.id]);
      } else {
        const transitions = { open: ['draft', 'open'], close: ['open', 'closed'], archive: ['closed', 'archived'] };
        check(transitions[action] && a.status === transitions[action][0], 'This activity cannot make that transition.');
        if (action === 'open') check(!a.due_at || a.allow_late || new Date(a.due_at) > new Date(), 'The deadline has passed. Create a new activity with a future deadline.');
        await db.query("UPDATE learning_activities SET status=$2,opened_at=CASE WHEN $2='open' THEN now() ELSE opened_at END WHERE id=$1", [a.id, transitions[action][1]]);
      }
    }); res.json({ ok: true });
  });
  router.post('/activities/:id/submissions', async (req, res) => {
    check(req.session.user.role === 'student', 'Use a student account to submit.', 403);
    const result = await transaction(async (db) => {
      // Serialize submission, closure, and grading against the activity to avoid deadline/revision races.
      const a = await activityAccess(req.session.user, req.params.id, db, true);
      check(a.status === 'open', 'This activity is not open.', 409);
      const now = new Date(), late = a.due_at ? now > new Date(a.due_at) : false;
      check(!late || a.allow_late, 'The submission deadline has passed.', 409);
      const previous = await one('SELECT * FROM learning_submissions WHERE activity_id=$1 AND student_id=$2 ORDER BY revision DESC LIMIT 1', [a.id, req.session.user.studentPk], db);
      check(!previous || a.allow_revision, 'Revisions are not allowed for this activity.', 409);
      const answers = scoreAnswers(a.questions, req.body.answers);
      const sub = await one(`INSERT INTO learning_submissions(activity_id,student_id,revision,answers,late,graded_at) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,revision`, [a.id, req.session.user.studentPk, (previous?.revision || 0) + 1, JSON.stringify(answers), late, answers.every((v) => v.score !== null) ? now : null], db);
      const files = req.body.files || [];
      check(Array.isArray(files) && files.length <= 3, 'Attach at most three files.');
      for (const file of files) await saveFile(req.session.user, file, { purpose: 'submission', submissionId: sub.id }, db);
      return sub;
    }); res.status(201).json(result);
  });
  router.put('/submissions/:id/grade', async (req, res) => {
    staff(req.session.user);
    await transaction(async (db) => {
      const sub = await one('SELECT * FROM learning_submissions WHERE id=$1', [id(req.params.id)], db);
      check(sub, 'Submission not found.', 404);
      const a = await activityAccess(req.session.user, sub.activity_id, db, true);
      const latest = await one('SELECT * FROM learning_submissions WHERE activity_id=$1 AND student_id=$2 ORDER BY revision DESC LIMIT 1', [a.id, sub.student_id], db);
      check(latest.id === sub.id, 'A newer revision exists. Grade the latest submission.', 409);
      const reason = textValue(req.body.reason, 'Reason for assessment/correction', 5, 1000);
      const answers = gradeAnswers(a.questions, latest.answers, req.body.grades);
      await db.query('INSERT INTO grade_history(submission_id,previous_answers,new_answers,reason,actor) VALUES($1,$2,$3,$4,$5)', [sub.id, JSON.stringify(latest.answers), JSON.stringify(answers), reason, req.session.user.id]);
      await db.query('UPDATE learning_submissions SET answers=$1,graded_at=now(),graded_by=$2 WHERE id=$3', [JSON.stringify(answers), req.session.user.id, sub.id]);
    }); res.json({ ok: true });
  });
  router.get('/activities/:id/export', async (req, res) => {
    staff(req.session.user);
    const data = await activityDetail(req.session.user, req.params.id);
    const table = [['student_id', 'name', 'class', 'revision', 'submitted_at', 'late', 'score', 'max_score', 'grading_status']];
    for (const p of data.participants) {
      const sub = data.submissions.find((s) => s.student_id === p.student_id);
      const complete = sub?.answers.every((a) => a.score !== null);
      table.push([p.student_code, p.name, p.class_name, sub?.revision, sub?.submitted_at?.toISOString(), sub?.late, complete ? sub.answers.reduce((n, a) => n + a.score, 0) : '', data.activity.questions.reduce((n, q) => n + q.points, 0), !sub ? 'Not submitted' : complete ? 'Graded' : 'Pending grading']);
    }
    res.set('Content-Disposition', `attachment; filename="activity-${data.activity.id}.csv"`).type('text/csv').send(csv(table));
  });

  async function saveFile(user, input, context, db = pool) {
    const name = textValue(input.name, 'File name', 1, 180).replace(/[\\/\r\n"]/g, '_');
    check(typeof input.data === 'string' && /^[A-Za-z0-9+/]*={0,2}$/.test(input.data), 'Invalid file encoding.');
    const buffer = Buffer.from(input.data, 'base64');
    const limit = context.purpose === 'photo' ? 2 * 1024 * 1024 : 5 * 1024 * 1024;
    check(buffer.length > 0 && buffer.length <= limit, `File must be smaller than ${limit / 1024 / 1024} MB.`);
    let mime;
    if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) mime = 'image/png';
    else if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) mime = 'image/jpeg';
    else if (buffer.subarray(0, 5).toString() === '%PDF-') mime = 'application/pdf';
    else if (/\.txt$/i.test(name) && !buffer.includes(0)) mime = 'text/plain';
    check(mime && (context.purpose !== 'photo' || mime.startsWith('image/')), 'Use PNG/JPEG for photos; PNG, JPEG, PDF, or TXT for attachments.');
    if (context.purpose === 'photo') await db.query("DELETE FROM learning_files WHERE student_id=$1 AND purpose='photo'", [context.studentId]);
    return one('INSERT INTO learning_files(owner_id,student_id,activity_id,submission_id,purpose,name,mime,contents) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,name', [user.id, context.studentId || null, context.activityId || null, context.submissionId || null, context.purpose, name, mime, buffer], db);
  }
  router.post('/students/:id/photo', async (req, res) => {
    admin(req.session.user);
    res.status(201).json(await transaction((db) => saveFile(req.session.user, req.body, { purpose: 'photo', studentId: id(req.params.id) }, db)));
  });
  router.post('/activities/:id/files', async (req, res) => {
    staff(req.session.user);
    res.status(201).json(await transaction(async (db) => {
      const a = await activityAccess(req.session.user, req.params.id, db, true);
      check(a.status === 'draft', 'Attach instructions before opening the activity.');
      check((await rows('SELECT id FROM learning_files WHERE activity_id=$1', [a.id], db)).length < 3, 'At most three instruction attachments.');
      return saveFile(req.session.user, req.body, { purpose: 'instruction', activityId: a.id }, db);
    }));
  });
  router.get('/files/:id', async (req, res) => {
    const file = await one('SELECT * FROM learning_files WHERE id=$1', [id(req.params.id)]);
    check(file, 'File not found.', 404);
    if (file.purpose === 'photo') await studentAccess(req.session.user, file.student_id);
    else if (file.purpose === 'instruction') await activityAccess(req.session.user, file.activity_id);
    else {
      const sub = await one('SELECT * FROM learning_submissions WHERE id=$1', [file.submission_id]);
      await activityAccess(req.session.user, sub.activity_id);
      if (req.session.user.role === 'student') check(String(sub.student_id) === String(req.session.user.studentPk), 'Access denied.', 403);
    }
    res.set('Cache-Control', 'private, no-store').set('X-Content-Type-Options', 'nosniff');
    res.set('Content-Disposition', `${file.purpose === 'photo' ? 'inline' : 'attachment'}; filename="${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}"`);
    res.type(file.mime).send(file.contents);
  });

  async function learningRecords(user, query) {
    const range = dateRange(query);
    if (query.courseId) { if (user.role !== 'student') await courseAccess(user, id(query.courseId)); else id(query.courseId); }
    return rows(`SELECT a.id AS activity_id,a.title,a.kind,a.questions,a.published,a.opened_at,ap.student_id,ap.class_name,ap.cohort,sub.id AS submission_id,sub.answers,sub.submitted_at,sub.late,sub.graded_at
      FROM learning_activities a JOIN checkin_sessions cs ON cs.id=a.session_id JOIN activity_participants ap ON ap.activity_id=a.id
      LEFT JOIN LATERAL(SELECT * FROM learning_submissions WHERE activity_id=a.id AND student_id=ap.student_id ORDER BY revision DESC LIMIT 1) sub ON true
      WHERE a.status<>'draft' AND ($1='admin' OR ($1='teacher' AND EXISTS(SELECT 1 FROM course_teachers ct WHERE ct.course_id=cs.course_id AND ct.user_id=$2)) OR ($1='student' AND a.published AND EXISTS(SELECT 1 FROM activity_participants me WHERE me.activity_id=a.id AND me.student_id=$3)))
      AND ($4::bigint IS NULL OR cs.course_id=$4) AND ($5::date IS NULL OR cs.session_date>=$5) AND ($6::date IS NULL OR cs.session_date<=$6) ORDER BY a.created_at`, [user.role, user.id, user.studentPk, query.courseId || null, range.from || null, range.to || null]);
  }
  function summarize(records, settings) {
    const topics = new Map(); let earned = 0, maximum = 0, graded = 0;
    for (const r of records) {
      r.answers?.forEach((answer, i) => {
        if (answer.score === null) return;
        const q = r.questions[i];
        earned += answer.score; maximum += q.points; graded++;
        const topic = topics.get(q.topic) || { topic: q.topic, earned: 0, maximum: 0, count: 0, sources: [] };
        topic.earned += answer.score; topic.maximum += q.points; topic.count++;
        topic.sources.push({ activityId: r.activity_id, title: r.title, question: i + 1, score: answer.score, maximum: q.points });
        topics.set(q.topic, topic);
      });
    }
    return { assigned: records.length, submitted: records.filter((r) => r.submission_id).length, late: records.filter((r) => r.late).length, pending: records.filter((r) => r.answers?.some((a) => a.score === null)).length, attainment: percent(earned, maximum), gradedQuestions: graded,
      topics: [...topics.values()].map((t) => ({ ...t, attainment: percent(t.earned, t.maximum), status: t.count < settings.min_questions ? 'Insufficient data' : percent(t.earned, t.maximum) < settings.weak_threshold ? 'Needs practice' : 'On track' })) };
  }
  router.get('/profiles/:id', async (req, res) => {
    const studentId = id(req.params.id), u = req.session.user;
    await studentAccess(u, studentId);
    const student = await one(`SELECT s.id,s.student_id,s.name,s.class_name,s.cohort,f.id AS photo_id FROM students s LEFT JOIN learning_files f ON f.student_id=s.id AND f.purpose='photo' WHERE s.id=$1`, [studentId]);
    check(student, 'Student not found.', 404);
    const settings = await one('SELECT * FROM learning_settings');
    const records = await learningRecords(u, req.query);
    const own = records.filter((r) => Number(r.student_id) === studentId);
    // Compare only identical assessments and snapshot groups; never mix unrelated tests.
    const comparable = (cohort) => records.filter((r) => own.some((o) => o.activity_id === r.activity_id && (cohort ? o.cohort && o.cohort === r.cohort : o.class_name === r.class_name)));
    const comparison = (group) => { const summary = summarize(group, settings); return { attainment: summary.attainment, gradedQuestions: summary.gradedQuestions, participants: new Set(group.map((r) => r.student_id)).size, pending: summary.pending }; };
    const range = dateRange(req.query);
    const attendance = await rows(`SELECT cs.session_date,cs.class_name,c.code,COALESCE(sa.status,CASE WHEN cs.status IN ('closed','archived') THEN 'Absent' ELSE 'Not checked in' END) AS status FROM session_participants sp JOIN checkin_sessions cs ON cs.id=sp.session_id JOIN courses c ON c.id=cs.course_id LEFT JOIN session_attendance sa ON sa.session_id=sp.session_id AND sa.student_id=sp.student_id WHERE sp.student_id=$1 AND ($2<>'teacher' OR EXISTS(SELECT 1 FROM course_teachers ct WHERE ct.course_id=cs.course_id AND ct.user_id=$3)) AND ($4::bigint IS NULL OR cs.course_id=$4) AND ($5::date IS NULL OR cs.session_date>=$5) AND ($6::date IS NULL OR cs.session_date<=$6) ORDER BY cs.session_date`, [studentId,u.role,u.id,req.query.courseId || null,range.from || null,range.to || null]);
    res.json({ student, summary: summarize(own, settings), settings, classAverage: comparison(comparable(false)), cohortAverage: comparison(comparable(true)), attendance,
      timeline: own.map((r) => ({ activityId: r.activity_id,title: r.title,kind: r.kind,submittedAt: r.submitted_at,late: r.late,published: r.published,score: r.answers?.every((a) => a.score !== null) ? percent(r.answers.reduce((sum, a) => sum + a.score, 0), r.questions.reduce((sum, q) => sum + q.points, 0)) : null,status: !r.submission_id ? 'Not submitted' : r.answers.some((a) => a.score === null) ? 'Pending grading' : 'Graded' })) });
  });
  router.post('/timer', async (req, res) => {
    staff(req.session.user);
    const sessionId = id(req.body.sessionId), mode = req.body.mode;
    check(['teaching','interaction','board','pause'].includes(mode), 'Choose a valid activity mode.');
    await transaction(async (db) => {
      await db.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [req.session.user.id]);
      const cs = await one('SELECT * FROM checkin_sessions WHERE id=$1', [sessionId], db);
      check(cs, 'Session not found.', 404); await courseAccess(req.session.user, cs.course_id, db);
      check(mode === 'pause' || cs.status === 'active', 'Start the attendance session before recording teaching time.');
      await db.query('UPDATE teaching_segments SET ended_at=now() WHERE user_id=$1 AND ended_at IS NULL', [req.session.user.id]);
      if (mode !== 'pause') await db.query('INSERT INTO teaching_segments(session_id,user_id,mode) VALUES($1,$2,$3)', [sessionId,req.session.user.id,mode]);
    }); res.json({ ok: true });
  });
  router.get('/analytics', async (req, res) => {
    staff(req.session.user);
    const records = await learningRecords(req.session.user, req.query);
    const settings = await one('SELECT * FROM learning_settings');
    const range = dateRange(req.query), u = req.session.user;
    const params = [u.role,u.id,req.query.courseId || null,range.from || null,range.to || null];
    const scope = `($1='admin' OR EXISTS(SELECT 1 FROM course_teachers ct WHERE ct.course_id=cs.course_id AND ct.user_id=$2)) AND ($3::bigint IS NULL OR cs.course_id=$3) AND ($4::date IS NULL OR cs.session_date>=$4) AND ($5::date IS NULL OR cs.session_date<=$5)`;
    const segments = await rows(`SELECT t.*,u.username,c.code,cs.session_date,EXTRACT(EPOCH FROM (COALESCE(t.ended_at,now())-t.started_at))::float AS seconds FROM teaching_segments t JOIN users u ON u.id=t.user_id JOIN checkin_sessions cs ON cs.id=t.session_id JOIN courses c ON c.id=cs.course_id WHERE ${scope} ORDER BY t.started_at DESC`, params);
    const sessions = await rows(`SELECT cs.id,cs.session_date,cs.status,c.code FROM checkin_sessions cs JOIN courses c ON c.id=cs.course_id WHERE ${scope} ORDER BY cs.session_date DESC`, params);
    const activities = await rows(`SELECT a.id,a.title,a.kind,a.status,a.published,a.created_at FROM learning_activities a JOIN checkin_sessions cs ON cs.id=a.session_id WHERE ${scope} ORDER BY a.created_at DESC`, params);
    const responses = records.filter((r) => r.submitted_at && r.opened_at).map((r) => (+new Date(r.submitted_at) - +new Date(r.opened_at)) / 1000);
    const feedback = records.filter((r) => r.graded_at && r.questions.some((q) => q.type === 'essay')).map((r) => (+new Date(r.graded_at) - +new Date(r.submitted_at)) / 1000);
    const average = (values) => values.length ? values.reduce((a,b) => a+b,0) / values.length : null;
    res.json({ summary: summarize(records, settings), settings, sessions, activities, segments, responseSeconds: average(responses), feedbackSeconds: average(feedback), running: await one('SELECT * FROM teaching_segments WHERE user_id=$1 AND ended_at IS NULL', [u.id]) || null, aiConfigured: openRouterConfigured() });
  });
  router.post('/analytics/ai', async (req, res) => {
    staff(req.session.user);
    const records = await learningRecords(req.session.user, req.body.filters || {});
    const settings = await one('SELECT * FROM learning_settings');
    const summary = summarize(records, settings);
    const question = textValue(req.body.question, 'Question', 5, 1000);
    const context = { summary, period: req.body.filters || {}, note: 'Aggregate web activity only. No names, photos, raw answers, or private identifiers are provided.' };
    res.json(await askOpenRouter({ question, context }));
  });
  return router;
}
