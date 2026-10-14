const state = { user: null, catalog: { students: [], courses: [] }, sessions: [], liveTimer: null };
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const api = async (url, options = {}) => {
  const response = await fetch(url, { headers: { "Content-Type": "application/json", ...(options.headers || {}) }, ...options });
  const data = response.headers.get("content-type")?.includes("application/json") ? await response.json() : await response.text();
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
};
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
const formatDate = (value) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${String(value).slice(0, 10)}T00:00:00`));
const toast = (message, error = false) => { const node = $("#toast"); node.textContent = message; node.className = `toast visible${error ? " error" : ""}`; setTimeout(() => node.className = "toast", 3200); };
const showDialog = (id) => $(id).showModal();
const closeDialogs = () => $$("dialog[open]").forEach((dialog) => dialog.close());

async function boot() {
  const session = await api("/api/auth/me");
  if (session.user) openApp(session.user);
  $("#loginForm").addEventListener("submit", login);
  $("#logoutBtn").addEventListener("click", async () => { await api("/api/auth/logout", { method: "POST" }); location.reload(); });
  $$(".nav-item").forEach((button) => button.addEventListener("click", () => switchSection(button.dataset.section)));
  $$("[data-close-dialog]").forEach((button) => button.addEventListener("click", closeDialogs));
  $("#headerActionBtn").addEventListener("click", () => { switchSection("sessions"); openSessionDialog(); });
  $("#newSessionBtn").addEventListener("click", openSessionDialog);
  $("#newStudentBtn").addEventListener("click", () => openProfileDialog("student"));
  $("#importStudentsBtn").addEventListener("click", () => $("#studentFileInput").click());
  $("#studentFileInput").addEventListener("change", importStudents);
  $("#newCourseBtn").addEventListener("click", () => openProfileDialog("course"));
  $("#sessionForm").addEventListener("submit", createSession);
  $("#studentForm").addEventListener("submit", saveStudent);
  $("#courseForm").addEventListener("submit", saveCourse);
  $("#refreshSessions").addEventListener("click", loadSessions);
  $("#studentSearch").addEventListener("input", renderStudents);
  $("#manageRosterBtn").addEventListener("click", loadRoster);
  $("#coursePicker").addEventListener("change", loadRoster);
  $("#saveRosterBtn").addEventListener("click", saveRoster);
  $("#reportExportBtn").addEventListener("click", exportReport);
  $("#leaveForm").addEventListener("submit", submitLeave);
  $("#refreshStudentSessions").addEventListener("click", loadStudentPortal);
  $("#studentCheckinForm").addEventListener("submit", studentCheckIn);
  $("#studentLeaveForm").addEventListener("submit", studentSubmitLeave);
}

async function login(event) {
  event.preventDefault();
  try { const data = await api("/api/auth/login", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(event.target))) }); openApp(data.user); }
  catch (error) { $("#loginError").textContent = error.message; }
}

function openApp(user) {
  state.user = user; $("#loginView").classList.add("hidden"); $("#appView").classList.remove("hidden");
  $("#userName").textContent = user.username; $("#userRole").textContent = user.role === "admin" ? "Administrator" : user.role === "student" ? "Student" : "Viewer"; $("#userAvatar").textContent = user.username.slice(0, 1).toUpperCase();
  if (user.role !== "admin") $$(".admin-control").forEach((el) => el.classList.add("hidden"));
  $("#todayLabel").textContent = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }).format(new Date());
  if (user.role === "student") {
    $$(".admin-only").forEach((el) => el.classList.add("hidden"));
    $$(".student-only").forEach((el) => el.classList.remove("hidden"));
    $("#headerActionBtn").classList.add("hidden");
    switchSection("studentHome");
    loadStudentPortal();
  } else {
    loadAll();
  }
}

async function loadAll() {
  try {
    await loadCatalog();
    await loadSessions();
    await Promise.all([loadStats(), loadLeaves(), loadAudit()]);
  } catch (error) { toast(error.message, true); }
}

function switchSection(section) {
  $$(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.section === section));
  $$(".section").forEach((element) => element.classList.add("hidden"));
  $(`#${section}Section`).classList.remove("hidden");
  $("#sectionTitle").textContent = ({ overview: "Overview", sessions: "Check-in sessions", students: "Students", courses: "Courses & roster", leaves: "Leave approvals", reports: "Reports", activity: "Activity log", studentHome: "My check-in" })[section];
  if (section === "students") renderStudents();
  if (section === "courses") renderCourses();
  if (section === "leaves") loadLeaves();
}

async function loadStudentPortal() {
  try {
    const [profile, sessions, leaves] = await Promise.all([api("/api/student/profile"), api("/api/sessions"), api("/api/leaves")]);
    $("#studentWelcome").textContent = `Welcome, ${profile.student.name}`;
    $("#studentProfileLine").textContent = `${profile.student.studentId} · ${profile.student.className}`;
    $("#studentSessionCount").textContent = `${sessions.rows.length} upcoming or active session${sessions.rows.length === 1 ? "" : "s"}`;
    $("#studentSessionsEmpty").classList.toggle("hidden", sessions.rows.length > 0);
    const options = sessions.rows.map((item) => `<option value="${item.id}">${escapeHtml(item.code)} · ${formatDate(item.sessionDate)} · ${escapeHtml(item.status)}</option>`).join("");
    $("#studentSessionPicker").innerHTML = `<option value="">Select session</option>${options}`;
    $("#studentLeaveSession").innerHTML = `<option value="">Select session</option>${options}`;
    $("#studentSessionsBody").innerHTML = sessions.rows.map((item) => `<tr><td><div class="student-cell"><strong>${escapeHtml(item.code)}</strong><span>${escapeHtml(item.courseName)}</span></div></td><td>${formatDate(item.sessionDate)}</td><td>${String(item.opensAt).slice(11,16)} - ${String(item.closesAt).slice(11,16)}</td><td><span class="pill ${String(item.myStatus).toLowerCase().replaceAll(" ","-")}">${escapeHtml(item.myStatus)}</span></td><td>${item.status === "active" ? "Enter code below" : escapeHtml(item.status)}</td></tr>`).join("");
    $("#studentLeavesBody").innerHTML = leaves.rows.map((row) => `<tr><td>${escapeHtml(row.code)} · ${escapeHtml(row.courseName)}</td><td>${formatDate(row.sessionDate)}</td><td>${escapeHtml(row.reason)}</td><td><span class="pill ${row.status === "Approved" ? "punctual" : row.status === "Rejected" ? "absent" : "late"}">${escapeHtml(row.status)}</span></td></tr>`).join("");
  } catch (error) { toast(error.message, true); }
}

async function studentCheckIn(event) {
  event.preventDefault();
  try {
    await api("/api/check-in", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(event.target))) });
    $("#studentCheckinError").textContent = "";
    event.target.reset();
    toast("Check-in successful.");
    await loadStudentPortal();
  } catch (error) { $("#studentCheckinError").textContent = error.message; }
}

async function studentSubmitLeave(event) {
  event.preventDefault();
  try {
    await api("/api/leaves", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(event.target))) });
    $("#studentLeaveError").textContent = "";
    event.target.reset();
    toast("Leave request submitted.");
    await loadStudentPortal();
  } catch (error) { $("#studentLeaveError").textContent = error.message; }
}

async function loadStats() {
  const data = await api("/api/stats"); const s = data.summary;
  $("#studentMetric").textContent = s.totalStudents || 0; $("#sessionMetric").textContent = s.total || 0; $("#sessionSub").textContent = `${s.active || 0} active now`; $("#checkedMetric").textContent = state.sessions.reduce((total, item) => total + Number(item.checkedIn || 0), 0); $("#leaveMetric").textContent = s.pending || 0;
  $("#classBars").innerHTML = `<div class="overview-callout"><strong>${s.active || 0} live session${s.active === 1 ? "" : "s"}</strong><span>${s.closed || 0} finalized sessions and ${s.approved || 0} approved leave applications</span></div>`;
  $("#recentList").innerHTML = state.sessions.slice(0, 5).map((item) => `<div class="recent-row"><strong>${escapeHtml(item.courseName)}</strong><span>${formatDate(item.sessionDate)} · ${escapeHtml(item.status)}</span></div>`).join("") || "No check-in sessions yet.";
}

async function loadCatalog() {
  state.catalog = await api("/api/catalog");
  const options = state.catalog.courses.map((course) => `<option value="${course.id}">${escapeHtml(course.code)} · ${escapeHtml(course.name)}</option>`).join("");
  $("#sessionCourse").innerHTML = `<option value="">Select course</option>${options}`;
  $("#coursePicker").innerHTML = `<option value="">Select a course</option>${options}`;
  $("#reportCourse").innerHTML = `<option value="">All courses</option>${options}`;
  const classes = [...new Set(state.catalog.students.filter((student) => student.active).map((student) => student.className))];
  $("#sessionClass").innerHTML = `<option value="">Select class</option>${classes.map((item) => `<option>${escapeHtml(item)}</option>`).join("")}`;
  renderStudents(); renderCourses();
}

async function loadSessions() {
  const data = await api("/api/sessions"); state.sessions = data.rows;
  $("#leaveSession").innerHTML = `<option value="">Select session</option>${state.sessions.filter((item) => item.status !== "archived").map((item) => `<option value="${item.id}">${escapeHtml(item.code)} · ${formatDate(item.sessionDate)} · ${escapeHtml(item.className)}</option>`).join("")}`;
  const query = ($("#sessionSearch")?.value || "").toLowerCase();
  const rows = state.sessions.filter((item) => `${item.courseName} ${item.code} ${item.className} ${item.sessionDate}`.toLowerCase().includes(query));
  $("#sessionCount").textContent = `${rows.length} session${rows.length === 1 ? "" : "s"}`;
  $("#sessionsBody").innerHTML = rows.map((item) => `<tr><td><div class="student-cell"><strong>${escapeHtml(item.code)} · ${escapeHtml(item.courseName)}</strong><span>${escapeHtml(item.className)} · ${formatDate(item.sessionDate)}</span></div></td><td>${String(item.opensAt).slice(11,16)} - ${String(item.closesAt).slice(11,16)}<small class="table-sub">Late after ${String(item.lateAfter).slice(11,16)}</small></td><td>${item.checkedIn || 0} / ${item.rosterCount || 0}</td><td><span class="live-count">${item.late || 0} late · ${item.excused || 0} excused</span></td><td><span class="pill ${item.status === "active" ? "punctual" : item.status === "closed" ? "late" : "absent"}">${item.status}</span></td><td><div class="row-actions"><button class="text-button" data-monitor="${item.id}">Monitor</button>${item.status === "scheduled" ? `<button class="text-button" data-start="${item.id}">Start</button>` : ""}${["scheduled","active"].includes(item.status) ? `<button class="text-button delete" data-close-session="${item.id}">Close</button>` : ""}${item.status === "closed" && state.user.role === "admin" ? `<button class="text-button delete" data-archive-session="${item.id}">Archive</button>` : ""}</div></td></tr>`).join("");
  $("#sessionsEmpty").classList.toggle("hidden", rows.length > 0);
  $$("[data-start]").forEach((button) => button.onclick = () => sessionAction(button.dataset.start, "start"));
  $$("[data-close-session]").forEach((button) => button.onclick = () => sessionAction(button.dataset.closeSession, "close"));
  $$("[data-archive-session]").forEach((button) => button.onclick = () => archiveSession(button.dataset.archiveSession));
  $$("[data-monitor]").forEach((button) => button.onclick = () => monitorSession(button.dataset.monitor));
  $("#sessionSearch").oninput = () => loadSessions();
}

async function sessionAction(id, action) { try { const data = await api(`/api/sessions/${id}/${action}`, { method: "POST" }); toast(action === "start" ? `Session active. Code: ${data.checkinCode}` : "Session finalized."); await loadAll(); } catch (error) { toast(error.message, true); } }
async function archiveSession(id) { const reason = prompt("Why are you archiving this closed session?"); if (!reason) return; try { await api(`/api/sessions/${id}/archive`, { method: "POST", body: JSON.stringify({ reason }) }); toast("Session archived with audit trail."); await loadAll(); } catch (error) { toast(error.message, true); } }

function renderStudents() {
  const query = ($("#studentSearch")?.value || "").toLowerCase(); const rows = state.catalog.students.filter((item) => `${item.studentId} ${item.name} ${item.className}`.toLowerCase().includes(query));
  $("#studentCount").textContent = `${rows.length} student${rows.length === 1 ? "" : "s"}`;
  $("#studentsBody").innerHTML = rows.map((item) => `<tr><td><div class="student-cell"><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.studentId)}</span></div></td><td>${escapeHtml(item.className)}</td><td>${escapeHtml(item.email || "—")}</td><td><span class="pill ${item.active ? "punctual" : "absent"}">${item.active ? "Active" : "Archived"}</span></td><td class="admin-control ${state.user.role !== "admin" ? "hidden" : ""}"><div class="row-actions">${item.active ? `<button class="text-button" data-edit-student="${item.id}">Edit</button><button class="text-button delete" data-archive-student="${item.id}">Archive</button>` : `<button class="text-button" data-restore-student="${item.id}">Restore</button>`}</div></td></tr>`).join("");
  $$("[data-edit-student]").forEach((button) => button.onclick = () => openProfileDialog("student", state.catalog.students.find((item) => String(item.id) === button.dataset.editStudent)));
  $$("[data-archive-student]").forEach((button) => button.onclick = () => archiveStudent(button.dataset.archiveStudent));
  $$("[data-restore-student]").forEach((button) => button.onclick = () => restoreStudent(button.dataset.restoreStudent));
}

function renderCourses() {
  $("#courseCount").textContent = `${state.catalog.courses.length} course${state.catalog.courses.length === 1 ? "" : "s"}`;
  $("#coursesBody").innerHTML = state.catalog.courses.map((item) => `<tr><td><div class="student-cell"><strong>${escapeHtml(item.code)}</strong><span>${escapeHtml(item.name)}</span></div></td><td>${escapeHtml(item.semester)}</td><td>${item.rosterCount}</td><td class="admin-control ${state.user.role !== "admin" ? "hidden" : ""}"><div class="row-actions"><button class="text-button" data-edit-course="${item.id}">Edit</button><button class="text-button delete" data-archive-course="${item.id}">Archive</button></div></td></tr>`).join("");
  $$("[data-edit-course]").forEach((button) => button.onclick = () => openProfileDialog("course", state.catalog.courses.find((item) => String(item.id) === button.dataset.editCourse)));
  $$("[data-archive-course]").forEach((button) => button.onclick = () => archiveCourse(button.dataset.archiveCourse));
}

function openProfileDialog(type, record = null) {
  const form = type === "student" ? $("#studentForm") : $("#courseForm"); form.reset(); form.elements.id.value = record?.id || ""; form.querySelector(".dialog-error").textContent = "";
  if (record) Object.entries(record).forEach(([key, val]) => { if (form.elements[key]) form.elements[key].value = val ?? ""; });
  showDialog(type === "student" ? "#studentDialog" : "#courseDialog");
}
async function saveStudent(event) { event.preventDefault(); await saveProfile(event, "student"); }
async function saveCourse(event) { event.preventDefault(); await saveProfile(event, "course"); }
async function saveProfile(event, type) { const form = event.target; try { const body = Object.fromEntries(new FormData(form)); const id = body.id; await api(id ? `/api/${type}s/${id}` : `/api/${type}s`, { method: id ? "PUT" : "POST", body: JSON.stringify(body) }); closeDialogs(); toast(`${type === "student" ? "Student" : "Course"} saved.`); await loadAll(); } catch (error) { form.querySelector(".dialog-error").textContent = error.message; } }
async function importStudents(event) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const content = await file.text();
    const result = await api("/api/students/import", { method: "POST", body: JSON.stringify({ content }) });
    toast(`Imported ${result.imported} student${result.imported === 1 ? "" : "s"}; ${result.failed} failed.`);
    await loadAll();
    if (result.failures.length) alert(result.failures.map((failure) => `Line ${failure.line}: ${failure.reason}`).join("\n"));
  } catch (error) { toast(error.message, true); }
  event.target.value = "";
}
async function archiveStudent(id) { const reason = prompt("Why are you archiving this student?"); if (!reason) return; try { await api(`/api/students/${id}/archive`, { method: "POST", body: JSON.stringify({ reason }) }); toast("Student archived."); await loadAll(); } catch (error) { toast(error.message, true); } }
async function restoreStudent(id) { try { await api(`/api/students/${id}/restore`, { method: "POST" }); toast("Student restored."); await loadAll(); } catch (error) { toast(error.message, true); } }
async function archiveCourse(id) { const reason = prompt("Why are you archiving this course?"); if (!reason) return; try { await api(`/api/courses/${id}/archive`, { method: "POST", body: JSON.stringify({ reason }) }); toast("Course archived."); await loadAll(); } catch (error) { toast(error.message, true); } }

function openSessionDialog() { $("#sessionForm").reset(); $("#sessionForm").elements.sessionDate.value = new Date().toISOString().slice(0,10); $("#sessionForm").querySelector(".dialog-error").textContent = ""; showDialog("#sessionDialog"); }
async function createSession(event) { event.preventDefault(); try { const data = Object.fromEntries(new FormData(event.target)); const result = await api("/api/sessions", { method: "POST", body: JSON.stringify(data) }); closeDialogs(); toast(`Session created. Code: ${result.checkinCode}`); await loadAll(); } catch (error) { event.target.querySelector(".dialog-error").textContent = error.message; } }

async function monitorSession(id) {
  const item = state.sessions.find((session) => String(session.id) === String(id)); $("#statusTitle").textContent = `${item.code} · ${item.className}`; $("#statusCode").textContent = item.status === "active" ? `Live code: ${item.checkinCode}` : `Session ${item.status}`;
  showDialog("#statusDialog"); refreshMonitor(id); clearInterval(state.liveTimer); state.liveTimer = setInterval(() => refreshMonitor(id), 4000);
}
async function refreshMonitor(id) { try { const data = await api(`/api/sessions/${id}/status`); $("#statusGrid").innerHTML = data.rows.map((row) => `<div class="status-student"><div><strong>${escapeHtml(row.name)}</strong><span>${escapeHtml(row.studentId)} · ${escapeHtml(row.className)}</span></div><span class="pill ${row.status.toLowerCase().replaceAll(" ","-")}">${row.status}</span></div>`).join("") || `<div class="empty-state">No enrolled students.</div>`; } catch (error) { toast(error.message, true); } }

async function loadRoster() {
  const courseId = $("#coursePicker").value; if (!courseId) return toast("Choose a course first.", true);
  const data = await api(`/api/courses/${courseId}/roster`); $("#rosterPanel").classList.remove("hidden"); $("#rosterTitle").textContent = "Roster · " + $("#coursePicker").selectedOptions[0].textContent; $("#rosterGrid").innerHTML = data.rows.map((row) => `<label class="roster-item"><input type="checkbox" value="${row.id}" ${row.enrolled ? "checked" : ""}><span><strong>${escapeHtml(row.name)}</strong><small>${escapeHtml(row.studentId)} · ${escapeHtml(row.className)}</small></span></label>`).join("");
}
async function saveRoster() { const courseId = $("#coursePicker").value; const studentIds = $$("#rosterGrid input:checked").map((input) => Number(input.value)); try { await api(`/api/courses/${courseId}/roster`, { method: "PUT", body: JSON.stringify({ studentIds }) }); toast(`Roster saved with ${studentIds.length} students.`); await loadAll(); } catch (error) { toast(error.message, true); } }

async function loadLeaves() { const data = await api("/api/leaves"); $("#leaveCount").textContent = `${data.rows.length} application${data.rows.length === 1 ? "" : "s"}`; $("#leavesBody").innerHTML = data.rows.map((row) => `<tr><td><div class="student-cell"><strong>${escapeHtml(row.name)}</strong><span>${escapeHtml(row.studentId)} · ${escapeHtml(row.className)}</span></div></td><td>${escapeHtml(row.code)} · ${formatDate(row.sessionDate)}</td><td>${escapeHtml(row.reason)}</td><td class="detail-cell">${escapeHtml(row.description)}</td><td><span class="pill ${row.status === "Approved" ? "punctual" : row.status === "Rejected" ? "absent" : "late"}">${row.status}</span></td><td class="admin-control ${state.user.role !== "admin" || row.status !== "Pending" ? "hidden" : ""}"><button class="text-button" data-approve-leave="${row.id}">Approve</button><button class="text-button delete" data-reject-leave="${row.id}">Reject</button></td></tr>`).join(""); $$("[data-approve-leave]").forEach((button) => button.onclick = () => reviewLeave(button.dataset.approveLeave, "Approved")); $$("[data-reject-leave]").forEach((button) => button.onclick = () => reviewLeave(button.dataset.rejectLeave, "Rejected")); }
async function reviewLeave(id, status) { const note = prompt(`${status} note (optional):`) || ""; try { await api(`/api/leaves/${id}/review`, { method: "PUT", body: JSON.stringify({ status, note }) }); toast(`Leave ${status.toLowerCase()}.`); await loadAll(); } catch (error) { toast(error.message, true); } }
async function submitLeave(event) {
  event.preventDefault();
  const form = event.target;
  try {
    await api("/api/leaves", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(form))) });
    form.reset(); $("#leaveFormError").textContent = ""; toast("Leave application submitted."); await loadLeaves();
  } catch (error) { $("#leaveFormError").textContent = error.message; }
}

async function loadAudit() { const data = await api("/api/audit"); $("#auditBody").innerHTML = data.rows.map((row) => `<tr><td><span class="pill ${row.action.includes("ARCHIVE") ? "absent" : row.action.includes("UPDATE") ? "late" : "punctual"}">${row.action.replaceAll("_"," ")}</span></td><td>${escapeHtml(row.username)}</td><td>${escapeHtml(row.details || "—")}</td><td>${new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(row.createdAt))}</td></tr>`).join(""); }
function exportReport() { const params = new URLSearchParams({ courseId: $("#reportCourse").value, from: $("#reportFrom").value, to: $("#reportTo").value }); window.location.href = `/api/reports/export?${params}`; }
boot().catch((error) => { $("#loginError").textContent = error.message; });
