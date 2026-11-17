ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin','viewer','student','teacher'));
ALTER TABLE students ADD COLUMN IF NOT EXISTS cohort VARCHAR(80) NOT NULL DEFAULT '';
CREATE TABLE course_teachers (
  course_id BIGINT REFERENCES courses(id), user_id BIGINT REFERENCES users(id), PRIMARY KEY(course_id,user_id)
);
CREATE TABLE session_participants (
  session_id BIGINT REFERENCES checkin_sessions(id), student_id BIGINT REFERENCES students(id),
  class_name VARCHAR(80) NOT NULL, cohort VARCHAR(80) NOT NULL DEFAULT '', PRIMARY KEY(session_id,student_id)
);
-- Historical rosters can only be reconstructed from the data still available.
INSERT INTO session_participants
SELECT cs.id,s.id,cs.class_name,s.cohort FROM checkin_sessions cs
JOIN enrollments e ON e.course_id=cs.course_id JOIN students s ON s.id=e.student_id AND s.class_name=cs.class_name
UNION SELECT cs.id,s.id,cs.class_name,s.cohort FROM session_attendance sa
JOIN checkin_sessions cs ON cs.id=sa.session_id JOIN students s ON s.id=sa.student_id
UNION SELECT cs.id,s.id,cs.class_name,s.cohort FROM leave_applications la
JOIN checkin_sessions cs ON cs.id=la.session_id JOIN students s ON s.id=la.student_id;
CREATE FUNCTION snapshot_session_roster() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO session_participants(session_id,student_id,class_name,cohort)
  SELECT NEW.id,s.id,s.class_name,s.cohort FROM enrollments e JOIN students s ON s.id=e.student_id
  WHERE e.course_id=NEW.course_id AND s.class_name=NEW.class_name AND s.active=true;
  RETURN NEW;
END $$;
CREATE TRIGGER snapshot_session AFTER INSERT ON checkin_sessions FOR EACH ROW EXECUTE FUNCTION snapshot_session_roster();
CREATE TABLE learning_activities (
  id BIGSERIAL PRIMARY KEY, session_id BIGINT NOT NULL REFERENCES checkin_sessions(id),
  title VARCHAR(160) NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('quiz','homework')),
  instructions TEXT NOT NULL DEFAULT '', questions JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','open','closed','archived')),
  due_at TIMESTAMPTZ, allow_late BOOLEAN NOT NULL DEFAULT false, allow_revision BOOLEAN NOT NULL DEFAULT false,
  published BOOLEAN NOT NULL DEFAULT false, opened_at TIMESTAMPTZ,
  created_by BIGINT NOT NULL REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE activity_participants (
  activity_id BIGINT REFERENCES learning_activities(id), student_id BIGINT REFERENCES students(id),
  class_name VARCHAR(80) NOT NULL, cohort VARCHAR(80) NOT NULL DEFAULT '', PRIMARY KEY(activity_id,student_id)
);
CREATE TABLE activity_sessions (
  activity_id BIGINT REFERENCES learning_activities(id), session_id BIGINT REFERENCES checkin_sessions(id),
  PRIMARY KEY(activity_id,session_id)
);
CREATE TABLE learning_submissions (
  id BIGSERIAL PRIMARY KEY, activity_id BIGINT NOT NULL REFERENCES learning_activities(id),
  student_id BIGINT NOT NULL REFERENCES students(id), revision INTEGER NOT NULL CHECK(revision>0),
  answers JSONB NOT NULL, submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(), late BOOLEAN NOT NULL,
  graded_at TIMESTAMPTZ, graded_by BIGINT REFERENCES users(id),
  UNIQUE(activity_id,student_id,revision)
);
CREATE INDEX learning_submissions_latest ON learning_submissions(activity_id,student_id,revision DESC);
CREATE TABLE grade_history (
  id BIGSERIAL PRIMARY KEY, submission_id BIGINT NOT NULL REFERENCES learning_submissions(id),
  previous_answers JSONB NOT NULL, new_answers JSONB NOT NULL, reason TEXT NOT NULL,
  actor BIGINT NOT NULL REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE learning_files (
  id BIGSERIAL PRIMARY KEY, owner_id BIGINT NOT NULL REFERENCES users(id),
  student_id BIGINT REFERENCES students(id), activity_id BIGINT REFERENCES learning_activities(id),
  submission_id BIGINT REFERENCES learning_submissions(id),
  purpose TEXT NOT NULL CHECK(purpose IN ('photo','instruction','submission')),
  name VARCHAR(180) NOT NULL, mime TEXT NOT NULL, contents BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((purpose='photo' AND student_id IS NOT NULL) OR (purpose='instruction' AND activity_id IS NOT NULL) OR (purpose='submission' AND submission_id IS NOT NULL))
);
CREATE UNIQUE INDEX one_student_photo ON learning_files(student_id) WHERE purpose='photo';
CREATE TABLE teaching_segments (
  id BIGSERIAL PRIMARY KEY, session_id BIGINT NOT NULL REFERENCES checkin_sessions(id),
  user_id BIGINT NOT NULL REFERENCES users(id), mode TEXT NOT NULL CHECK(mode IN ('teaching','interaction','board')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(), ended_at TIMESTAMPTZ,
  CHECK(ended_at IS NULL OR ended_at>=started_at)
);
CREATE UNIQUE INDEX one_running_timer ON teaching_segments(user_id) WHERE ended_at IS NULL;
CREATE TABLE learning_settings (singleton BOOLEAN PRIMARY KEY DEFAULT true CHECK(singleton), weak_threshold INTEGER NOT NULL DEFAULT 60 CHECK(weak_threshold BETWEEN 0 AND 100), min_questions INTEGER NOT NULL DEFAULT 3 CHECK(min_questions BETWEEN 1 AND 100));
INSERT INTO learning_settings(singleton) VALUES(true);
CREATE TABLE web_sessions (sid TEXT PRIMARY KEY, data JSONB NOT NULL, expires_at TIMESTAMPTZ NOT NULL);
CREATE INDEX web_sessions_expiry ON web_sessions(expires_at);
