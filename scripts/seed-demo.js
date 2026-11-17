import 'dotenv/config';
import pg from 'pg';
import crypto from 'node:crypto';

const { Pool } = pg;
pg.types.setTypeParser(1082, (value) => value);
const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE || 'student_attendance',
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || '',
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false
});

const DEMO_PREFIX = 'DEMO-';
const reset = process.argv.includes('--reset');
const hashPassword = (password, salt = crypto.randomBytes(16).toString('hex')) => `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;
const date = (offset) => {
  const value = new Date(Date.UTC(2026, 9, 6 + offset * 7));
  return value.toISOString().slice(0, 10);
};
const timestamp = (day, hour = 8) => `${day} ${String(hour).padStart(2, '0')}:00:00`;
const classes = ['Class A', 'Class B', 'Class C', 'Class D'];
const courseSeeds = [
  ['DEMO-ENG', 'Academic English', '2026 Demo'],
  ['DEMO-MATH', 'Applied Mathematics', '2026 Demo'],
  ['DEMO-SCI', 'General Science', '2026 Demo'],
  ['DEMO-HIST', 'World History', '2026 Demo']
];
const questions = [
  { type: 'mcq', prompt: 'Which option best matches the lesson concept?', topic: 'Core concept', points: 10, options: ['Option A', 'Option B', 'Option C', 'Option D'], correct: 1 },
  { type: 'mcq', prompt: 'Which example applies the concept correctly?', topic: 'Application', points: 10, options: ['Example A', 'Example B', 'Example C', 'Example D'], correct: 2 },
  { type: 'essay', prompt: 'Explain the concept in your own words and give one example.', topic: 'Explanation', points: 20, rubric: 'Accurate explanation, relevant example, and clear reasoning.' }
];

async function query(client, text, params = []) { return (await client.query(text, params)).rows; }

async function resetDemo(client) {
  const activityLike = 'Demo %';
  const courseLike = `${DEMO_PREFIX}%`;
  const studentLike = `${DEMO_PREFIX}STU-%`;
  const statements = [
    ['DELETE FROM grade_history WHERE submission_id IN (SELECT s.id FROM learning_submissions s JOIN learning_activities a ON a.id=s.activity_id WHERE a.title LIKE $1)', [activityLike]],
    ['DELETE FROM learning_files WHERE name LIKE $1', [activityLike]],
    ['DELETE FROM learning_submissions WHERE activity_id IN (SELECT id FROM learning_activities WHERE title LIKE $1)', [activityLike]],
    ['DELETE FROM activity_participants WHERE activity_id IN (SELECT id FROM learning_activities WHERE title LIKE $1)', [activityLike]],
    ['DELETE FROM activity_sessions WHERE activity_id IN (SELECT id FROM learning_activities WHERE title LIKE $1)', [activityLike]],
    ['DELETE FROM learning_activities WHERE title LIKE $1', [activityLike]],
    ['DELETE FROM teaching_segments WHERE session_id IN (SELECT id FROM checkin_sessions WHERE course_id IN (SELECT id FROM courses WHERE code LIKE $1))', [courseLike]],
    ['DELETE FROM leave_applications WHERE session_id IN (SELECT id FROM checkin_sessions WHERE course_id IN (SELECT id FROM courses WHERE code LIKE $1))', [courseLike]],
    ['DELETE FROM session_attendance WHERE session_id IN (SELECT id FROM checkin_sessions WHERE course_id IN (SELECT id FROM courses WHERE code LIKE $1))', [courseLike]],
    ['DELETE FROM session_participants WHERE session_id IN (SELECT id FROM checkin_sessions WHERE course_id IN (SELECT id FROM courses WHERE code LIKE $1))', [courseLike]],
    ['DELETE FROM checkin_sessions WHERE course_id IN (SELECT id FROM courses WHERE code LIKE $1)', [courseLike]],
    ['DELETE FROM enrollments WHERE course_id IN (SELECT id FROM courses WHERE code LIKE $1) OR student_id IN (SELECT id FROM students WHERE student_id LIKE $2)', [courseLike, studentLike]],
    ["DELETE FROM attendance WHERE student_id LIKE $1 OR course LIKE 'Demo %'", [studentLike]],
    ['DELETE FROM course_teachers WHERE course_id IN (SELECT id FROM courses WHERE code LIKE $1)', [courseLike]],
    ['DELETE FROM users WHERE username LIKE $1 OR student_id IN (SELECT id FROM students WHERE student_id LIKE $2)', [`${DEMO_PREFIX}%`, studentLike]],
    ['DELETE FROM students WHERE student_id LIKE $1', [studentLike]],
    ['DELETE FROM courses WHERE code LIKE $1', [courseLike]]
  ];
  for (const [sql, params] of statements) await client.query(sql, params);
}

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (reset) await resetDemo(client);

    const admin = (await query(client, "SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1"))[0];
    if (!admin) throw new Error('Create the initial admin account by starting the application once before seeding demo data.');
    const teacher = (await query(client, `
      INSERT INTO users(username,password_hash,role) VALUES($1,$2,'teacher')
      ON CONFLICT(username) DO UPDATE SET role='teacher'
      RETURNING id
    `, [`${DEMO_PREFIX}teacher`, hashPassword('DemoTeacher123!')]))[0];

    const courses = [];
    for (const [code, name, semester] of courseSeeds) {
      courses.push((await query(client, `INSERT INTO courses(code,name,semester) VALUES($1,$2,$3) ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name,active=true RETURNING id,code`, [code, name, semester]))[0]);
    }
    for (const course of courses) await client.query('INSERT INTO course_teachers(course_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [course.id, teacher.id]);

    const students = [];
    for (let i = 1; i <= 100; i += 1) {
      const studentId = `${DEMO_PREFIX}STU-${String(i).padStart(3, '0')}`;
      const className = classes[(i - 1) % classes.length];
      const student = (await query(client, `
        INSERT INTO students(student_id,name,class_name,email,cohort,active)
        VALUES($1,$2,$3,$4,'2026',true)
        ON CONFLICT(student_id) DO UPDATE SET name=EXCLUDED.name,class_name=EXCLUDED.class_name,email=EXCLUDED.email,cohort=EXCLUDED.cohort,active=true
        RETURNING id,student_id,class_name
      `, [studentId, `Demo Student ${String(i).padStart(3, '0')}`, className, `${studentId.toLowerCase()}@demo.local`]))[0];
      students.push(student);
      await client.query(`INSERT INTO users(username,password_hash,role,student_id) VALUES($1,$2,'student',$3) ON CONFLICT(username) DO UPDATE SET student_id=EXCLUDED.student_id,role='student'`, [student.student_id, hashPassword(student.student_id), student.id]);
      for (const course of courses) await client.query('INSERT INTO enrollments(student_id,course_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [student.id, course.id]);
    }

    const sessions = [];
    for (let courseIndex = 0; courseIndex < courses.length; courseIndex += 1) {
      for (let classIndex = 0; classIndex < classes.length; classIndex += 1) {
        for (let week = 0; week < 3; week += 1) {
          const sessionDate = date(week + classIndex * 3 + courseIndex * 2);
          const row = (await query(client, `
            INSERT INTO checkin_sessions(course_id,class_name,session_date,opens_at,closes_at,late_after,checkin_method,checkin_code,status,created_by)
            VALUES($1,$2,$3::date,$4::timestamp,$5::timestamp,$6::timestamp,'code',$7,'closed',$8)
            ON CONFLICT(course_id,class_name,session_date) DO UPDATE SET status='closed'
            RETURNING id,course_id,class_name,session_date
          `, [courses[courseIndex].id, classes[classIndex], sessionDate, timestamp(sessionDate, 8), timestamp(sessionDate, 10), timestamp(sessionDate, 8), `D${courseIndex}${classIndex}${week}`, admin.id]))[0];
          sessions.push(row);
          const roster = await query(client, 'SELECT student_id FROM session_participants WHERE session_id=$1', [row.id]);
          for (const [position, participant] of roster.entries()) {
            const roll = (position + week + classIndex + courseIndex) % 20;
            const status = roll === 0 ? 'Excused' : roll < 2 ? 'Absent' : roll < 5 ? 'Late' : 'Punctual';
            await client.query(`INSERT INTO session_attendance(session_id,student_id,checked_in_at,status,method) VALUES($1,$2,$3,$4,'demo') ON CONFLICT(session_id,student_id) DO UPDATE SET status=EXCLUDED.status,checked_in_at=EXCLUDED.checked_in_at`, [row.id, participant.student_id, status === 'Absent' || status === 'Excused' ? null : timestamp(sessionDate, status === 'Late' ? 8 : 7), status]);
            if (status === 'Excused') await client.query(`INSERT INTO leave_applications(session_id,student_id,reason,description,status,reviewed_by,reviewed_at,review_note) VALUES($1,$2,'Medical','Demo approved leave request','Approved',$3,now(),'Demo seed approval') ON CONFLICT(session_id,student_id) DO NOTHING`, [row.id, participant.student_id, admin.id]);
          }
        }
      }
    }

    for (const course of courses) {
      const courseSessions = sessions.filter((session) => session.course_id === course.id && session.class_name === 'Class A');
      for (let index = 0; index < 3; index += 1) {
        const session = courseSessions[index];
        const activity = (await query(client, `
          INSERT INTO learning_activities(session_id,title,kind,instructions,questions,status,due_at,allow_late,allow_revision,published,opened_at,created_by)
          VALUES($1,$2,$3,'Demo activity for classroom analytics',$4::jsonb,'closed',$5::timestamptz,true,true,true,$6::timestamptz,$7)
          RETURNING id,session_id,questions
        `, [session.id, `Demo ${course.code} Activity ${index + 1}`, index === 1 ? 'homework' : 'quiz', JSON.stringify(questions), `${session.session_date} 23:59:00`, `${session.session_date} 08:00:00`, teacher.id]))[0];
        await client.query('INSERT INTO activity_sessions(activity_id,session_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [activity.id, session.id]);
        await client.query('INSERT INTO activity_participants(activity_id,student_id,class_name,cohort) SELECT $1,student_id,class_name,cohort FROM session_participants WHERE session_id=$2 ON CONFLICT DO NOTHING', [activity.id, session.id]);
        const participants = await query(client, 'SELECT student_id FROM activity_participants WHERE activity_id=$1 ORDER BY student_id', [activity.id]);
        for (const [position, participant] of participants.entries()) {
          if ((position + index) % 10 === 0) continue;
          const correctA = position % 4 === 0 ? 0 : 1;
          const correctB = position % 5 === 0 ? 1 : 2;
          const pending = position % 13 === 0;
          const answers = [{ answer: correctA, score: correctA === 1 ? 10 : 0, feedback: '', needsPractice: correctA !== 1 }, { answer: correctB, score: correctB === 2 ? 10 : 0, feedback: '', needsPractice: correctB !== 2 }, { answer: 'This is a demo explanation with a relevant example.', score: pending ? null : 16 + (position % 5), feedback: pending ? '' : 'Demo rubric feedback.', needsPractice: !pending && position % 7 === 0 }];
          await client.query(`INSERT INTO learning_submissions(activity_id,student_id,revision,answers,submitted_at,late,graded_at,graded_by) VALUES($1,$2,1,$3::jsonb,$4::timestamptz,$5,$6::timestamptz,$7) ON CONFLICT(activity_id,student_id,revision) DO NOTHING`, [activity.id, participant.student_id, JSON.stringify(answers), `${session.session_date} ${position % 2 ? '10:30:00' : '09:15:00'}`, position % 9 === 0, pending ? null : `${session.session_date} 12:00:00`, pending ? null : teacher.id]);
        }
      }
    }

    for (const session of sessions.filter((value) => value.class_name === 'Class A').slice(0, 12)) {
      for (const [mode, startHour, minutes] of [['teaching', 8, 25], ['interaction', 8, 18], ['board', 9, 12]]) {
        await client.query(`INSERT INTO teaching_segments(session_id,user_id,mode,started_at,ended_at) VALUES($1,$2,$3,$4::timestamp,$5::timestamp)`, [session.id, teacher.id, mode, timestamp(session.session_date, startHour), `${session.session_date} ${String(startHour).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`]);
      }
    }

    await client.query('COMMIT');
    console.log(JSON.stringify({ ok: true, reset, students: 100, courses: courses.length, sessions: sessions.length, activities: courses.length * 3, studentLogin: 'DEMO-STU-001 / DEMO-STU-001', teacherLogin: 'DEMO-teacher / DemoTeacher123!' }, null, 2));
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(error.stack || error.message);
    process.exitCode = 1;
  } finally { client.release(); await pool.end(); }
}

seed();
