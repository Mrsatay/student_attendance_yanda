const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const escape = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' })[c]);
const state = { catalog: null, activities: [], view: 'activities', activityId: null, detail: null, poll: null };
const isStaff = () => ['admin','teacher'].includes(state.catalog.user.role);
const date = (v) => v ? new Date(v).toLocaleString() : '-';
const rate = (v) => v == null ? 'No data' : `${v}%`;
const duration = (v) => v == null ? 'No data' : `${Math.round(v / 60)} min`;
const badge = (s) => `<span class="pill ${['open','Graded','On track'].includes(s) ? 'punctual' : ['closed','Pending grading','Insufficient data'].includes(s) ? 'late' : 'absent'}">${escape(s)}</span>`;
const photo = (p) => p.photo_id ? `<img class="photo" src="/api/learning/files/${p.photo_id}" alt="Photo of ${escape(p.name)}" loading="lazy">` : `<span class="photo" aria-label="No profile photo">${escape(p.name?.slice(0,2).toUpperCase())}</span>`;
const metric = (label, value) => `<article class="metric"><div class="metric-label">${escape(label)}</div><strong>${escape(value)}</strong></article>`;
function table(headings, rows) { return `<div class="table-scroll"><table class="learning-table"><thead><tr>${headings.map((h) => `<th>${escape(h)}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${headings.length}">No matching records.</td></tr>`}</tbody></table></div>`; }
function notice(message = '', error = false) { $('#notice').textContent = message; $('#notice').className = error ? 'error' : ''; }
async function api(path, body, method = 'POST') {
  const response = await fetch(path.startsWith('/api/') ? path : `/api/learning${path}`, body === undefined ? {} : { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) { if (response.status === 401) location.href = '/'; throw new Error(data.error || 'Request failed.'); }
  return data;
}
function on(selector, event, fn) {
  $(selector).addEventListener(event, async (e) => { if (event === 'submit') e.preventDefault(); try { notice(); await fn(e); } catch(error) { notice(error.message, true); } });
}
function options(items, label, blank = '') { return `${blank ? `<option value="">${escape(blank)}</option>` : ''}${items.map((i) => `<option value="${i.id}">${escape(label(i))}</option>`).join('')}`; }
async function catalog() {
  const previous = {};
  $$('select').forEach((s) => { if (s.id) previous[s.id] = s.value; });
  state.catalog = await api('/catalog');
  const c = state.catalog;
  $('#identity').textContent = `${c.user.username} (${c.user.role})`;
  $$('.staff').forEach((n) => n.classList.toggle('hidden', !isStaff()));
  $$('.admin').forEach((n) => n.classList.toggle('hidden', c.user.role !== 'admin'));
  $('#attendanceLink').classList.toggle('hidden', c.user.role === 'teacher');
  const isStudent = c.user.role === 'student';
  $('#attendanceLink').textContent = isStudent ? 'My check-in' : 'Attendance workspace';
  $('#attendanceLink').href = isStudent ? '#checkin' : '/?workspace=attendance';
  $('#attendanceLink').onclick = isStudent ? (event) => { event.preventDefault(); run(() => show('checkin')); } : null;
  $('#activitiesNav').textContent = isStudent ? 'My activities' : 'Activities & homework';
  $('#profilesNav').textContent = isStudent ? 'My profile' : 'Learning profiles';
  $('#profileStudentField').classList.toggle('hidden', isStudent);
  $('#statusFilter').innerHTML = isStudent ? '<option value="">All statuses</option><option value="open">Open</option><option value="closed">Closed</option>' : '<option value="">All statuses</option><option>draft</option><option>open</option><option>closed</option><option>archived</option>';
  for (const selector of ['#profileCourse','#analyticsCourse']) $(selector).innerHTML = options(c.courses, (i) => `${i.code} - ${i.name}`, 'All courses');
  for (const selector of ['#assignCourse','#newSessionCourse']) $(selector).innerHTML = options(c.courses.filter((i) => i.active), (i) => `${i.code} - ${i.name}`, 'Select course');
  for (const selector of ['#profileStudent','#extrasStudent']) $(selector).innerHTML = options(c.students, (i) => `${i.student_id} - ${i.name}`);
  if (c.user.role === 'student' && c.students[0]) $('#profileStudent').value = c.students[0].id;
  $('#activitySession').innerHTML = options(c.sessions.filter((s) => s.status !== 'archived'), (s) => `${s.code} / ${s.class_name} / ${String(s.session_date).slice(0,10)} / ${s.status}`, 'Select session');
  $('#timerSession').innerHTML = options(c.sessions.filter((s) => s.status === 'active'), (s) => `${s.code} / ${s.class_name}`,'Select active session');
  $('#newSessionClass').innerHTML = [...new Set(c.students.filter((s) => s.active).map((s) => s.class_name))].map((s) => `<option>${escape(s)}</option>`).join('');
  $('#weakThreshold').value = c.settings.weak_threshold; $('#minQuestions').value = c.settings.min_questions;
  for (const [key, value] of Object.entries(previous)) if (value && $(`#${key}`)?.querySelector(`option[value="${CSS.escape(value)}"]`)) $(`#${key}`).value = value;
  renderAssignments(); syncExtras();
}
function dashboardAction(action, label) { return `<button class="button primary" data-dashboard-view="${escape(action)}">${escape(label)}</button>`; }
async function loadDashboard() {
  const role = state.catalog.user.role;
  const activities = (await api('/activities')).rows;
  const open = activities.find((a) => a.status === 'open');
  const draft = activities.find((a) => a.status === 'draft');
  const closed = activities.find((a) => a.status === 'closed' && !a.published);
  let nextTitle = 'Your workspace is ready';
  let nextText = 'Choose a workspace below to continue.';
  let nextButton = dashboardAction('activities', 'View activities');
  if (role === 'student') {
    nextTitle = open ? 'Complete your next activity' : 'Check your learning progress';
    nextText = open ? `${open.title} is open for submission.` : 'Review your submitted work and learning profile.';
    nextButton = open ? `<button class="button primary" data-dashboard-activity="${open.id}">Open activity</button>` : dashboardAction('profiles', 'View my profile');
  } else if (role === 'teacher') {
    nextTitle = closed ? 'Publish the latest results' : open ? 'Monitor the active activity' : draft ? 'Finish preparing an activity' : 'Review teaching analytics';
    nextText = closed ? `${closed.title} is closed and ready for result publishing.` : open ? `${open.title} is currently accepting submissions.` : draft ? `${draft.title} is still a draft.` : 'Review participation, response time, and teaching segments.';
    nextButton = closed || open || draft ? `<button class="button primary" data-dashboard-activity="${(closed || open || draft).id}">Open activity</button>` : dashboardAction('analytics', 'Open analytics');
  } else if (role === 'admin') {
    nextTitle = 'Review your learning workspace';
    nextText = `${activities.length} activities are available across your courses.`;
    nextButton = dashboardAction('manage', 'Open people & settings');
  }
  const roleLabel = role === 'student' ? 'Student home' : role === 'teacher' ? 'Teacher home' : 'Administrator home';
  const roleDescription = role === 'student' ? 'See what to complete and follow your learning progress.' : role === 'teacher' ? 'Prepare activities, review student work, and reflect on teaching data.' : 'Manage courses, people, sessions, and learning settings.';
  const student = state.catalog.students[0];
  const studentIdentity = role === 'student' && student ? `<div class="student-identity panel"><div>${photo(student)}</div><div><span class="eyebrow">YOUR PROFILE</span><h2>${escape(student.name)}</h2><p>${escape(student.student_id)} · ${escape(student.class_name)} · Cohort ${escape(student.cohort || 'Not assigned')}</p></div><button class="button subtle" data-dashboard-view="profiles">View profile</button></div>` : '';
  $('#dashboardContent').innerHTML = `${studentIdentity}<div class="dashboard-intro"><div><p class="eyebrow">${escape(roleLabel)}</p><h2>Welcome back, ${escape(state.catalog.user.username)}</h2><p class="muted">${escape(roleDescription)}</p></div><span class="role-mark">${escape(role.slice(0, 1).toUpperCase())}</span></div><div class="next-action"><div><span class="eyebrow">NEXT ACTION</span><h2>${escape(nextTitle)}</h2><p>${escape(nextText)}</p></div>${nextButton}</div><div class="workspace-choice"><div class="panel"><span class="workspace-icon">A</span><h2>Attendance</h2><p class="muted">Check-in sessions, class rosters, and leave requests.</p>${role === 'teacher' ? dashboardAction('sessions', 'Manage class sessions') : '<a class="button primary" href="/">Open attendance</a>'}</div><div class="panel"><span class="workspace-icon">L</span><h2>Learning</h2><p class="muted">Activities, submissions, profiles, and teaching analytics.</p>${dashboardAction('activities', 'Open learning')}${isStaff() ? dashboardAction('analytics', 'View analytics') : ''}</div></div><div class="dashboard-summary"><div class="panel"><div class="panel-heading"><div><h2>Activity overview</h2><p class="panel-note">Use the navigation for full details.</p></div></div>${metric('Available activities', activities.length)}${metric('Open now', activities.filter((a) => a.status === 'open').length)}${metric('Published results', activities.filter((a) => a.published).length)}</div><div class="panel"><div class="panel-heading"><div><h2>What the statuses mean</h2><p class="panel-note">A quick guide for new users.</p></div></div><p><strong>Draft</strong> — preparation only</p><p><strong>Open</strong> — students can submit</p><p><strong>Closed</strong> — submissions stopped</p><p><strong>Published</strong> — results are visible</p></div></div>`;
  $$('[data-dashboard-view]').forEach((button) => button.onclick = () => run(() => show(button.dataset.dashboardView)));
  $$('[data-dashboard-activity]').forEach((button) => button.onclick = () => run(() => openActivity(button.dataset.dashboardActivity)));
}
async function show(view) {
  state.view = view; clearTimeout(state.poll);
  $$('.view').forEach((v) => v.classList.toggle('hidden', v.id !== `${view}View`));
  $$('[data-view]').forEach((v) => v.classList.toggle('active', v.dataset.view === view));
  $('#viewTitle').textContent = ({ dashboard:'Home', activities:'Activities & homework', detail:'Classroom report', profiles:'Learning profiles', checkin:'My check-in', analytics:'Teaching analytics', sessions:'Class sessions', manage:'People & settings' })[view];
  if (view === 'dashboard') await loadDashboard();
  if (view === 'activities') await loadActivities();
  if (view === 'profiles') await loadProfile();
  if (view === 'checkin') await loadCheckin();
  if (view === 'analytics') await loadAnalytics();
  if (view === 'sessions') await loadSessions();
}
async function loadActivities() { state.activities = (await api('/activities')).rows; renderActivities(); }
function renderActivities() {
  const search = $('#activitySearch').value.toLowerCase(), kind = $('#kindFilter').value, status = $('#statusFilter').value;
  const activities = state.activities.filter((a) => (!kind || a.kind === kind) && (!status || a.status === status) && `${a.title} ${a.code} ${a.class_name}`.toLowerCase().includes(search));
  $('#activityList').innerHTML = activities.map((a) => `<article class="panel"><p class="eyebrow">${escape(a.kind)} / ${escape(a.code)}</p><h2>${escape(a.title)}</h2><p>${escape(a.class_name)} / ${escape(String(a.session_date).slice(0,10))}</p><div>${badge(a.status)} ${a.published ? badge('Results published') : ''}</div><p class="muted">Deadline: ${escape(date(a.due_at))}</p><button class="button primary" data-open="${a.id}">${isStaff() ? 'Open report' : 'View & submit'}</button></article>`).join('') || '<div class="panel empty-state">No activities match. Teachers can create an activity after preparing a class session.</div>';
  $$('[data-open]').forEach((b) => b.onclick = () => run(() => openActivity(b.dataset.open)));
}
async function run(fn) { try { notice(); await fn(); } catch(error) { notice(error.message, true); } }
function addQuestion(type) {
  const node = document.createElement('fieldset'); node.className = 'question'; node.dataset.type = type;
  node.innerHTML = `<legend>${type === 'mcq' ? 'Multiple choice' : 'Essay / task'}</legend><div class="form-grid"><label class="wide-field">Question<textarea class="q-prompt" required maxlength="5000"></textarea></label><label>Topic<input class="q-topic" required maxlength="100" placeholder="e.g. SQL JOIN"></label><label>Maximum points<input class="q-points" type="number" min="0.1" max="1000" step="0.1" value="10" required></label>${type === 'mcq' ? '<label class="wide-field">Answer options (one per line, 2-8)<textarea class="q-options" required></textarea></label><label>Correct option number (starting at 1)<input class="q-correct" type="number" min="1" max="8" value="1" required></label>' : '<label class="wide-field">Scoring rubric<textarea class="q-rubric" required placeholder="Explain how points are awarded for each criterion."></textarea></label>'}</div><button class="button subtle remove-question" type="button">Remove question</button>`;
  node.querySelector('.remove-question').onclick = () => node.remove(); $('#questionEditor').append(node);
}
function readQuestions() { return $$('#questionEditor .question').map((n) => ({ type:n.dataset.type,prompt:n.querySelector('.q-prompt').value,topic:n.querySelector('.q-topic').value,points:Number(n.querySelector('.q-points').value),...(n.dataset.type === 'mcq' ? { options:n.querySelector('.q-options').value.split('\n').map((s) => s.trim()).filter(Boolean), correct:Number(n.querySelector('.q-correct').value)-1 } : { rubric:n.querySelector('.q-rubric').value }) })); }
function sharedSessions() {
  const selected = state.catalog.sessions.find((s) => s.id === $('#activitySession').value);
  $('#sharedSessions').innerHTML = selected ? state.catalog.sessions.filter((s) => s.id !== selected.id && s.course_id === selected.course_id && s.status !== 'archived').map((s) => `<label class="check-label"><input type="checkbox" value="${s.id}">${escape(s.class_name)} / ${escape(String(s.session_date).slice(0,10))}</label>`).join('') || '<p>No other sessions in this course.</p>' : '<p>Select the primary session first.</p>';
}
async function fileData(file, max = 5 * 1024 * 1024) {
  if (file.size > max) throw new Error(`File exceeds ${max / 1024 / 1024} MB.`);
  return new Promise((resolve,reject) => { const r = new FileReader(); r.onload = () => resolve({ name:file.name,data:r.result.split(',')[1] }); r.onerror = () => reject(new Error('Unable to read file.')); r.readAsDataURL(file); });
}
function filesHtml(files) { return `<div class="files">${files.map((f) => `<a href="/api/learning/files/${f.id}">${escape(f.name)}</a>`).join('')}</div>`; }
async function openActivity(activityId) { state.activityId = activityId; await show('detail'); await loadDetail(); }
async function loadDetail() {
  const requestedId = state.activityId;
  const data = await api(`/activities/${requestedId}`);
  if (state.view !== 'detail' || state.activityId !== requestedId) return;
  state.detail = data;
  const a = data.activity;
  $('#activityDetail').innerHTML = `<div class="panel"><p class="eyebrow">${escape(a.kind)} / ${badge(a.status)}</p><h2>${escape(a.title)}</h2><p class="prewrap">${escape(a.instructions)}</p><p class="muted">Deadline: ${escape(date(a.due_at))} / Late: ${a.allow_late ? 'allowed' : 'not allowed'} / Revisions: ${a.allow_revision ? 'allowed' : 'not allowed'}</p>${filesHtml(data.files.filter((f) => f.purpose === 'instruction'))}<div id="activityActions" class="toolbar"></div></div>${isStaff() ? staffDetail(data) : studentDetail(data)}`;
  if (isStaff()) {
    const actions = [];
    if (a.status === 'draft') actions.push(['open','Open activity']);
    if (a.status === 'open') actions.push(['close','Close submissions']);
    if (a.status === 'closed') actions.push(['archive','Archive']);
    if (['closed','archived'].includes(a.status) && !a.published) actions.push(['publish','Publish results']);
    $('#activityActions').innerHTML = actions.map(([action,label]) => `<button class="button primary" data-action="${action}">${label}</button>`).join('') + `<a class="button subtle" href="/api/learning/activities/${a.id}/export">Export displayed roster CSV</a>${a.published ? badge('Results published') : ''}`;
    $$('[data-action]').forEach((b) => b.onclick = () => run(async () => { await api(`/activities/${a.id}/state`, { action:b.dataset.action }); await loadDetail(); }));
    if ($('#instructionUpload')) on('#instructionUpload','submit',async () => { const file = $('#instructionFile').files[0]; if (!file) throw new Error('Choose an attachment.'); await api(`/activities/${a.id}/files`,await fileData(file)); await loadDetail(); });
    $$('.grade-form').forEach((form) => form.onsubmit = (e) => { e.preventDefault(); run(async () => {
      const sub = data.submissions.find((s) => s.id === form.dataset.submission);
      const grades = a.questions.map((q,i) => q.type === 'mcq' ? {} : { score:form.querySelector(`[name="score-${i}"]`).value,feedback:form.querySelector(`[name="feedback-${i}"]`).value,needsPractice:form.querySelector(`[name="practice-${i}"]`).checked });
      await api(`/submissions/${sub.id}/grade`, { grades,reason:form.elements.reason.value },'PUT'); await loadDetail(); notice('Assessment saved. Previous values are retained in grade history.');
    }); });
    schedulePoll();
  } else if ($('#answerForm')) on('#answerForm','submit',async () => {
    const answers = a.questions.map((q,i) => q.type === 'mcq' ? $(`#answerForm input[name="answer-${i}"]:checked`)?.value ?? '' : $(`#answerForm textarea[name="answer-${i}"]`).value);
    const selected = [...$('#submissionFiles').files]; if (selected.length > 3) throw new Error('Attach at most three files.');
    const files = await Promise.all(selected.map((f) => fileData(f)));
    $('#submitAnswers').disabled = true;
    try { await api(`/activities/${a.id}/submissions`, { answers,files }); await loadDetail(); notice('Submission saved.'); }
    finally { if ($('#submitAnswers')) $('#submitAnswers').disabled = false; }
  });
}
function staffDetail(data) {
  const a = data.activity, m = data.metrics;
  const latest = data.submissions.filter((s,i) => data.submissions.findIndex((v) => v.student_id === s.student_id) === i);
  const rows = data.participants.map((p) => {
    const sub = latest.find((s) => s.student_id === p.student_id);
    const graded = sub?.answers.every((v) => v.score !== null);
    const score = graded ? `${sub.answers.reduce((n,v) => n+v.score,0)} / ${a.questions.reduce((n,q) => n+q.points,0)}` : '-';
    return [`<div class="person">${photo(p)}<span>${escape(p.name)}<br><small>${escape(p.student_code)}</small></span></div>`,badge(!sub ? 'Not submitted' : graded ? 'Graded' : 'Pending grading'),sub ? `${escape(date(sub.submitted_at))}<br>Revision ${sub.revision}${sub.late ? ' / Late' : ''}` : '-',score,sub ? submissionReview(a,sub,data.files,true) : '-'];
  });
  const incorrect = a.questions.map((q,i) => {
    const wrong = latest.filter((s) => s.answers[i]?.needsPractice);
    return `<details><summary>Question ${i+1}: ${escape(q.topic)} - ${wrong.length} ${q.type === 'mcq' ? 'incorrect' : 'need practice'}</summary><p>${escape(q.prompt)}</p>${table(['Student','Answer','Feedback'],wrong.map((s) => [escape(s.name),escape(q.type === 'mcq' ? q.options[s.answers[i].answer] : s.answers[i].answer),escape(s.answers[i].feedback)]))}</details>`;
  }).join('');
  return `<div id="liveStats" class="summary-grid">${metric('Completion',rate(m.completion))}${metric('MCQ accuracy',rate(m.accuracy))}${metric('Submitted',`${m.submitted} / ${m.participants}`)}${metric('Answers awaiting grading',m.pending)}</div><p class="stat-note muted">MCQ accuracy uses graded submitted answers. Missing submissions and ungraded essays are separate. Report refreshes every 4 seconds while no assessment is being edited.</p>${a.status === 'draft' ? '<div class="panel"><form id="instructionUpload" class="toolbar"><label>Instruction attachment (PDF, TXT, PNG, JPEG; max 5 MB)<input id="instructionFile" type="file" accept=".pdf,.txt,.png,.jpg,.jpeg" required></label><button class="button subtle">Attach file</button></form></div>' : ''}<div class="panel"><h2>Participants & latest submissions</h2>${table(['Student','Status','Submission','Score','Answers & assessment'],rows)}</div><div class="panel"><h2>Answers needing attention</h2>${incorrect}</div><div class="panel"><h2>Submission history</h2>${table(['Student','Revision','Submitted','Answers'],data.submissions.map((s) => [escape(s.name),s.revision,escape(date(s.submitted_at)),submissionReview(a,s,data.files,false)]))}</div><div class="panel"><h2>Grade correction history</h2>${table(['When','Assessor','Submission','Reason','Before / after'],data.history.map((h) => [escape(date(h.created_at)),escape(h.username),escape(h.submission_id),escape(h.reason),`<details><summary>View changes</summary><pre class="prewrap">${escape(JSON.stringify({ before:h.previous_answers,after:h.new_answers },null,2))}</pre></details>`]))}</div>`;
}
function submissionReview(a,sub,files,editable) {
  const body = a.questions.map((q,i) => { const answer = sub.answers[i]; return `<div class="question"><strong>Q${i+1}: ${escape(q.prompt)}</strong><p class="answer-text">${escape(q.type === 'mcq' ? q.options[answer.answer] : answer.answer)}</p><p>Score: ${answer.score == null ? 'Pending / not published' : `${answer.score} / ${q.points}`}</p>${q.type === 'essay' ? `<p class="muted">Rubric: ${escape(q.rubric)}</p>` : ''}${editable && q.type === 'essay' ? `<div class="grading-grid"><label>Score (max ${q.points})<input name="score-${i}" type="number" min="0" max="${q.points}" step="0.1" value="${answer.score ?? ''}" required></label><label>Feedback<textarea name="feedback-${i}" maxlength="5000">${escape(answer.feedback)}</textarea></label><label class="check-label"><input type="checkbox" name="practice-${i}" ${answer.needsPractice ? 'checked' : ''}> Needs practice</label></div>` : `<p class="prewrap">${escape(answer.feedback || '')}</p>`}</div>`; }).join('');
  const attachment = filesHtml(files.filter((f) => f.submission_id === sub.id));
  return `<details class="review-details"><summary>View revision ${sub.revision}</summary>${editable && a.questions.some((q) => q.type === 'essay') ? `<form class="grade-form" data-submission="${sub.id}">${body}${attachment}<label>Assessment / correction reason<input name="reason" minlength="5" maxlength="1000" required placeholder="Explain this assessment"></label><button class="button primary">Save assessment</button></form>` : body+attachment}</details>`;
}
function studentDetail(data) {
  const a = data.activity, latest = data.submissions[0];
  const canSubmit = a.status === 'open' && (!latest || a.allow_revision) && (!a.due_at || a.allow_late || new Date(a.due_at) > new Date());
  const form = canSubmit ? `<div class="panel"><h2>${latest ? 'Submit a revision' : 'Your answers'}</h2><form id="answerForm">${a.questions.map((q,i) => `<fieldset class="question"><legend>Question ${i+1} / ${escape(q.topic)} / ${q.points} points</legend><p class="prewrap">${escape(q.prompt)}</p>${q.type === 'mcq' ? q.options.map((o,j) => `<label class="check-label"><input type="radio" name="answer-${i}" value="${j}" ${latest?.answers[i]?.answer === j ? 'checked' : ''} required>${escape(o)}</label>`).join('') : `<p class="muted">Rubric: ${escape(q.rubric)}</p><label>Answer<textarea name="answer-${i}" maxlength="20000" required>${escape(latest?.answers[i]?.answer || '')}</textarea></label>`}</fieldset>`).join('')}<label>Attachments (up to 3, max 5 MB each; PDF, TXT, PNG, JPEG)<input id="submissionFiles" type="file" multiple accept=".pdf,.txt,.png,.jpg,.jpeg"></label><p class="muted">Each revision is a complete submission. Reattach files you want included in the latest revision.</p><button id="submitAnswers" class="button primary">Submit answers</button></form></div>` : '<div class="panel"><p>Submissions are unavailable: check the activity status, deadline, or revision policy.</p></div>';
  return `${form}<div class="panel"><h2>My submission history</h2><p>${a.published ? 'Results published.' : 'Scores and feedback are hidden until the teacher publishes results.'}</p>${data.submissions.map((s) => `<p>${escape(date(s.submitted_at))}${s.late ? ' / Late' : ''}</p>${submissionReview(a,s,data.files,false)}`).join('') || '<p>No submissions yet.</p>'}</div>`;
}
function schedulePoll() {
  clearTimeout(state.poll);
  if (state.view !== 'detail' || state.detail.activity.status !== 'open') return;
  state.poll = setTimeout(async () => {
    if (document.hidden) { schedulePoll(); return; }
    try {
      if ($$('.review-details[open]').length || $('#instructionFile')?.files.length) {
        const data = await api(`/activities/${state.activityId}`), m = data.metrics;
        if (state.view === 'detail' && $('#liveStats')) $('#liveStats').innerHTML = `${metric('Completion',rate(m.completion))}${metric('MCQ accuracy',rate(m.accuracy))}${metric('Submitted',`${m.submitted} / ${m.participants}`)}${metric('Answers awaiting grading',m.pending)}`;
        schedulePoll();
      } else await loadDetail();
    } catch(error) { notice(error.message,true); schedulePoll(); }
  },4000);
}
function filterParams(prefix) { return new URLSearchParams({ courseId:$(`#${prefix}Course`).value,from:$(`#${prefix}From`).value,to:$(`#${prefix}To`).value }); }
function topicsHtml(topics) { return table(['Topic','Attainment','Graded questions','Assessment','Evidence'],topics.map((t) => [escape(t.topic),rate(t.attainment),t.count,badge(t.status),`<details><summary>View evidence</summary>${t.sources.map((s) => `<p>${escape(s.title)} / Q${s.question}: ${s.score}/${s.maximum}</p>`).join('')}</details>`])); }
async function loadProfile() {
  const studentId = $('#profileStudent').value;
  if (!studentId) { $('#profileContent').innerHTML = '<div class="panel">No students available.</div>'; return; }
  const d = await api(`/profiles/${studentId}?${filterParams('profile')}`), s = d.summary;
  $('#profileContent').innerHTML = `<div class="panel"><div class="profile-heading">${photo(d.student)}<div><h2>${escape(d.student.name)}</h2><p>${escape(d.student.student_id)} / ${escape(d.student.class_name)} / ${escape(d.student.cohort || 'No cohort assigned')}</p></div></div></div><div class="summary-grid">${metric('Attainment',rate(s.attainment))}${metric('Submitted',`${s.submitted}/${s.assigned}`)}${metric('Late submissions',s.late)}${metric('Pending assessments',s.pending)}</div><p class="muted">${state.catalog.user.role === 'student' ? 'Learning statistics include published results only.' : 'Learning statistics include graded answers; unfinished assessments remain provisional.'} Attendance history is shown separately.</p><div class="panel"><h2>Comparable assessment averages</h2>${table(['Group','Attainment','Participants','Graded answers','Pending submissions'],[['Class',rate(d.classAverage.attainment),d.classAverage.participants,d.classAverage.gradedQuestions,d.classAverage.pending],['Cohort / grade',rate(d.cohortAverage.attainment),d.cohortAverage.participants,d.cohortAverage.gradedQuestions,d.cohortAverage.pending]])}<p class="muted">Weighted by available question points, using identical activities and recorded class/cohort groups. No comparison is made with unrelated assessments.</p></div><div class="panel"><h2>Knowledge topics</h2><p class="muted">Needs practice below ${d.settings.weak_threshold}%, after ${d.settings.min_questions} graded questions.</p>${topicsHtml(s.topics)}</div><div class="panel"><h2>Learning progression</h2><div class="trend">${d.timeline.filter((t) => t.score !== null).map((t) => `<div class="trend-item" title="${escape(t.title)}"><span>${t.score}%</span><div class="trend-bar" style="height:${t.score}px"></div><span>${escape(t.kind)}</span></div>`).join('')}</div>${table(['Activity','Type','Submitted','Status','Score'],d.timeline.map((t) => [escape(t.title),escape(t.kind),escape(date(t.submittedAt)),badge(t.status)+(t.late ? ' Late' : ''),rate(t.score)]))}</div><div class="panel"><h2>Attendance history</h2>${table(['Course','Class','Date','Status'],d.attendance.map((a) => [escape(a.code),escape(a.class_name),escape(String(a.session_date).slice(0,10)),escape(a.status)]))}</div>`;
}
async function loadCheckin() {
  if (state.catalog.user.role !== 'student') { $('#checkinContent').innerHTML = '<div class="panel"><h2>Attendance</h2><p class="muted">Student check-in is available only for student accounts.</p></div>'; return; }
  const [profile, sessions, leaves] = await Promise.all([api('/api/student/profile'), api('/api/sessions'), api('/api/leaves')]);
  const options = sessions.rows.length ? sessions.rows.map((item) => `<option value="${item.id}">${escape(item.code)} · ${escape(String(item.sessionDate).slice(0,10))} · ${escape(item.status)}</option>`).join('') : '<option value="" disabled>No upcoming or active class sessions</option>';
  const studentCard = state.catalog.students.find((item) => String(item.id) === String(profile.student.id)) || profile.student;
  $('#checkinContent').innerHTML = `<div class="student-welcome panel"><div class="profile-heading">${photo(studentCard)}<div><p class="eyebrow">STUDENT CHECK-IN</p><h2>Welcome, ${escape(profile.student.name)}</h2><p class="muted">${escape(profile.student.studentId)} · ${escape(profile.student.className)} · Cohort ${escape(studentCard.cohort || 'Not assigned')} · Check in without leaving your learning workspace.</p></div></div></div><div class="panel table-panel"><div class="table-meta"><span>${sessions.rows.length} upcoming or active session${sessions.rows.length === 1 ? '' : 's'}</span><button class="button subtle" id="refreshCheckin">Refresh</button></div>${sessions.rows.length ? table(['Course','Date','Window','My status','Action'],sessions.rows.map((item) => [escape(item.code),escape(String(item.sessionDate).slice(0,10)),`${escape(String(item.opensAt).slice(11,16))} - ${escape(String(item.closesAt).slice(11,16))}`,badge(item.myStatus),item.status === 'active' ? 'Enter code below' : escape(item.status)])) : '<div class="empty-state checkin-empty">No upcoming or active sessions. Your teacher must create and start a class session before check-in or leave requests are available.</div>'}</div><div class="checkin-actions"><div class="panel"><div class="panel-heading"><div><p class="eyebrow">CHECK-IN</p><h2>Enter attendance code</h2></div></div><form id="learningCheckinForm" class="stack"><label>Session<select name="sessionId" required><option value="">Select session</option>${options}</select></label><label>Attendance code<input name="code" required placeholder="6-character code" maxlength="12"></label><button class="button primary">Check in now</button><p class="form-error" id="learningCheckinError"></p></form></div><div class="panel"><div class="panel-heading"><div><p class="eyebrow">LEAVE REQUEST</p><h2>Request approved absence</h2></div></div><form id="learningLeaveForm" class="stack"><label>Session<select name="sessionId" required><option value="">Select session</option>${options}</select></label><label>Reason<select name="reason"><option>Medical</option><option>Family emergency</option><option>University activity</option><option>Other</option></select></label><label>Description<textarea name="description" minlength="5" required placeholder="Explain the reason"></textarea></label><button class="button subtle">Submit leave request</button><p class="form-error" id="learningLeaveError"></p></form></div></div><div class="panel table-panel"><div class="table-meta"><span>My leave applications</span></div>${table(['Course','Date','Reason','Status'],leaves.rows.map((row) => [escape(`${row.code} · ${row.courseName}`),escape(String(row.sessionDate).slice(0,10)),escape(row.reason),badge(row.status)]))}</div>`;
  $('#refreshCheckin').onclick = () => run(loadCheckin);
  $('#learningCheckinForm').onsubmit = (event) => run(async () => { event.preventDefault(); await api('/api/check-in', Object.fromEntries(new FormData(event.target))); event.target.reset(); notice('Check-in successful.'); await loadCheckin(); });
  $('#learningLeaveForm').onsubmit = (event) => run(async () => { event.preventDefault(); await api('/api/leaves', Object.fromEntries(new FormData(event.target))); event.target.reset(); notice('Leave request submitted.'); await loadCheckin(); });
}
async function loadAnalytics() {
  const d = await api(`/analytics?${filterParams('analytics')}`), s = d.summary;
  const modes = ['teaching','interaction','board'].map((mode) => ({ mode,seconds:d.segments.filter((t) => t.mode === mode).reduce((n,t) => n+t.seconds,0) }));
  const total = modes.reduce((n,m) => n+m.seconds,0);
  $('#timerStatus').textContent = d.running ? `Recording ${d.running.mode} since ${date(d.running.started_at)} (session ${d.running.session_id}).` : 'Timer paused.';
  $('#analyticsContent').innerHTML = `<div class="summary-grid">${metric('Sessions',d.sessions.length)}${metric('Activities',d.activities.length)}${metric('Participation',rate(s.assigned ? Math.round(s.submitted/s.assigned*1000)/10 : null))}${metric('Pending assessments',s.pending)}</div><div class="summary-grid">${metric('Homework activities',d.activities.filter((a) => a.kind === 'homework').length)}${metric('Published activities',d.activities.filter((a) => a.published).length)}${metric('Mean response time',duration(d.responseSeconds))}${metric('Mean grading time',duration(d.feedbackSeconds))}</div><p class="muted">Response time measures opening to latest submission. Grading time measures submission to latest manual assessment, not publication. These are web activity measures, not attention or head-raising estimates.</p><div class="panel"><h2>Self-recorded teaching proportions</h2>${modes.map((m) => `<div class="bar-row"><span>${escape(m.mode)}</span><div class="bar-track"><div class="bar-fill" style="width:${total ? m.seconds/total*100 : 0}%"></div></div><span>${total ? Math.round(m.seconds/total*100) : 0}%</span></div>`).join('')}<p class="muted">Total recorded: ${duration(total)}. Running segments are included up to the last refresh.</p></div><div class="panel"><h2>Class knowledge topics</h2>${topicsHtml(s.topics)}</div><details class="panel analytics-details"><summary>Activity evidence</summary>${table(['Activity','Type','Status','Published'],d.activities.map((a) => [escape(a.title),escape(a.kind),badge(a.status),a.published ? 'Yes' : 'No']))}</details><details class="panel analytics-details"><summary>Recorded teaching segments</summary>${table(['Teacher','Course','Mode','Started','Ended','Duration'],d.segments.map((t) => [escape(t.username),escape(t.code),escape(t.mode),escape(date(t.started_at)),t.ended_at ? escape(date(t.ended_at)) : 'Running',duration(t.seconds)]))}</details>`;
}
function renderAssignments() {
  const c = state.catalog, courseId = $('#assignCourse').value;
  $('#teacherChoices').innerHTML = c.teachers.map((t) => `<label class="check-label"><input type="checkbox" value="${t.id}" ${c.assignments.some((a) => a.course_id === courseId && a.user_id === t.id) ? 'checked' : ''}>${escape(t.username)}</label>`).join('') || '<p>Create a teacher account first.</p>';
}
function syncExtras() { $('#extrasCohort').value = state.catalog.students.find((s) => s.id === $('#extrasStudent').value)?.cohort || ''; }
async function loadSessions() {
  await catalog();
  $('#sessionList').innerHTML = `<div class="panel">${table(['Course','Class','Date','Status','Actions'],state.catalog.sessions.map((s) => [escape(s.code),escape(s.class_name),escape(String(s.session_date).slice(0,10)),badge(s.status),`${s.status === 'scheduled' ? `<button class="button subtle" data-session="${s.id}" data-session-action="start">Start</button>` : ''}${['scheduled','active'].includes(s.status) ? `<button class="button subtle" data-session="${s.id}" data-session-action="close">Close</button>` : ''}${s.status === 'closed' ? `<button class="button subtle" data-session="${s.id}" data-session-action="archive">Archive</button>` : ''}<button class="button subtle" data-monitor="${s.id}">Monitor</button>`]))}<div id="sessionMonitor"></div></div>`;
  $$('[data-session-action]').forEach((b) => b.onclick = () => run(async () => {
    const action = b.dataset.sessionAction, reason = action === 'archive' ? prompt('Archive reason (at least 5 characters):') : undefined;
    if (action === 'archive' && !reason) return;
    const data = await api(`/api/sessions/${b.dataset.session}/${action}`,reason ? { reason } : {}); await loadSessions(); notice(data.checkinCode ? `Check-in code: ${data.checkinCode}` : 'Session updated.');
  }));
  $$('[data-monitor]').forEach((b) => b.onclick = () => run(async () => { const d = await api(`/api/sessions/${b.dataset.monitor}/status`); $('#sessionMonitor').innerHTML = `<h2>Attendance monitor</h2>${table(['Student','ID','Status'],d.rows.map((r) => [escape(r.name),escape(r.studentId),escape(r.status)]))}`; }));
}
async function boot() {
  await catalog();
  $$('[data-view]').forEach((b) => b.onclick = () => run(() => show(b.dataset.view)));
  on('#logout','click',async () => { await api('/api/auth/logout',{}); location.href = '/'; });
  on('#refresh','click',async () => { await catalog(); if (state.view === 'detail') await loadDetail(); else await show(state.view); });
  for (const selector of ['#activitySearch','#kindFilter','#statusFilter']) on(selector,'input',renderActivities);
  on('#newActivity','click',() => { $('#activityCreate').reset(); $('#questionEditor').innerHTML = ''; $('#editorError').textContent = ''; addQuestion('mcq'); sharedSessions(); $('#activityDue').required = false; $('#activityEditor').showModal(); });
  on('#activitySession','change',sharedSessions);
  on('#closeEditor','click',() => $('#activityEditor').close());
  on('#addMcq','click',() => addQuestion('mcq')); on('#addEssay','click',() => addQuestion('essay'));
  on('#activityKind','change',() => { $('#activityDue').required = $('#activityKind').value === 'homework'; });
  on('#activityCreate','submit',async (e) => {
    const form = e.target, data = Object.fromEntries(new FormData(form));
    try {
      const result = await api('/activities',{ ...data,additionalSessionIds:$$('#sharedSessions input:checked').map((n) => n.value),dueAt:data.dueAt ? new Date(data.dueAt).toISOString() : null,allowLate:form.elements.allowLate.checked,allowRevision:form.elements.allowRevision.checked,questions:readQuestions() });
      $('#activityEditor').close(); await openActivity(result.id);
    } catch(error) { $('#editorError').textContent = error.message; }
  });
  on('#backActivities','click',() => show('activities'));
  on('#loadProfile','click',loadProfile); on('#loadAnalytics','click',loadAnalytics);
  $$('[data-mode]').forEach((b) => b.onclick = () => run(async () => {
    let sessionId = $('#timerSession').value;
    if (b.dataset.mode === 'pause') { const d = await api('/analytics'); sessionId = d.running?.session_id || sessionId; }
    await api('/timer',{ sessionId,mode:b.dataset.mode }); await loadAnalytics();
  }));
  on('#teacherCreate','submit',async (e) => { await api('/teachers',Object.fromEntries(new FormData(e.target))); e.target.reset(); await catalog(); notice('Teacher created. Assign their courses below.'); });
  on('#assignCourse','change',renderAssignments);
  on('#teacherAssign','submit',async () => { await api(`/courses/${$('#assignCourse').value}/teachers`,{ teacherIds:$$('#teacherChoices input:checked').map((i) => i.value) },'PUT'); await catalog(); notice('Course assignments saved.'); });
  on('#extrasStudent','change',syncExtras);
  on('#studentExtras','submit',async () => {
    const sid = $('#extrasStudent').value, file = $('#extrasPhoto').files[0];
    if (file) await api(`/students/${sid}/photo`,await fileData(file,2*1024*1024));
    await api(`/students/${sid}/cohort`,{ cohort:$('#extrasCohort').value },'PUT'); $('#extrasPhoto').value = ''; await catalog(); notice('Student profile updated.');
  });
  on('#settingsForm','submit',async () => { await api('/settings',{ weakThreshold:Number($('#weakThreshold').value),minQuestions:Number($('#minQuestions').value) },'PUT'); await catalog(); notice('Learning thresholds saved.'); });
  on('#sessionCreate','submit',async (e) => { await api('/api/sessions',Object.fromEntries(new FormData(e.target))); await loadSessions(); notice('Session created with a snapshot of enrolled participants.'); });
  await show('dashboard');
}
boot().catch((error) => notice(error.message,true));
// AI reflection panel is created progressively so older deployments keep working.
(function initAiReflectionPanel() {
  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }
  function renderList(items) {
    return Array.isArray(items) && items.length
      ? `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
      : '<p class="muted">No additional points returned.</p>';
  }
  function normalizeResult(result) {
    if (typeof result === 'string') {
      const cleaned = result.trim().replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
      try { result = JSON.parse(cleaned); } catch { return { summary: cleaned, findings: [], recommendations: [], limitations: 'The model response was not structured, so only its summary is shown.', confidence: 'low' }; }
    }
    return result && typeof result === 'object' ? result : {};
  }
  function mount() {
    const analytics = document.querySelector('#analyticsView');
    if (!analytics || document.querySelector('#aiReflectionPanel')) return;
    const panel = document.createElement('section');
    panel.id = 'aiReflectionPanel';
    panel.className = 'panel ai-reflection-panel';
    panel.innerHTML = `
      <div class="section-heading ai-heading"><div><span class="eyebrow">OPENROUTER ASSISTED</span><h2>Teaching behavior reflection</h2><p class="muted">Ask for a concise, evidence-based interpretation of the recorded classroom activity.</p></div><span class="ai-spark">AI</span></div>
      <div class="ai-form"><textarea id="aiQuestion" rows="3" placeholder="Example: What should I improve in the next lesson based on engagement and accuracy?"></textarea><button class="button primary" id="askAi" type="button">Ask AI</button></div>
      <div id="aiAnswer" class="ai-answer muted">The AI reflection is optional and only uses aggregate activity metrics.</div>`;
    analytics.appendChild(panel);
    panel.querySelector('#askAi').addEventListener('click', async () => {
      const button = panel.querySelector('#askAi');
      const answer = panel.querySelector('#aiAnswer');
      const question = panel.querySelector('#aiQuestion').value.trim() || 'Summarize the main teaching behavior signals and suggest practical next steps.';
      button.disabled = true;
      button.textContent = 'Analyzing...';
      answer.className = 'ai-answer muted';
      answer.textContent = 'Preparing an evidence-based reflection...';
      try {
        const response = await fetch('/api/learning/analytics/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'AI analysis failed');
        if (!data.configured) {
          answer.innerHTML = '<strong>OpenRouter is not configured yet.</strong><p class="muted">Add OPENROUTER_API_KEY to the backend .env file, restart the server, and try again.</p>';
          return;
        }
        const result = normalizeResult(data.answer);
        answer.className = 'ai-answer';
        answer.innerHTML = `<div class="ai-summary"><strong>${escapeHtml(result.summary || 'Reflection completed')}</strong><span class="confidence">Confidence: ${escapeHtml(result.confidence || 'moderate')}</span></div><div class="ai-columns"><div><h3>Findings</h3>${renderList(result.findings)}</div><div><h3>Recommendations</h3>${renderList(result.recommendations)}</div></div><div class="ai-limitations"><strong>Limits:</strong> ${escapeHtml(result.limitations || 'Interpretation is based on recorded aggregate activity only.')}</div>`;
      } catch (error) {
        answer.className = 'ai-answer error';
        answer.textContent = error.message || 'Unable to reach the AI service.';
      } finally {
        button.disabled = false;
        button.textContent = 'Ask AI';
      }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
  document.addEventListener('click', () => setTimeout(mount, 0));
})();
