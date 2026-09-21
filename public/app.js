const state = { user: null, records: [], editingId: null };
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const api = async (url, options = {}) => {
  const response = await fetch(url, { headers: { "Content-Type": "application/json", ...(options.headers || {}) }, ...options });
  const data = response.headers.get("content-type")?.includes("application/json") ? await response.json() : await response.text();
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
};
const formatDate = (value) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${String(value).slice(0, 10)}T00:00:00`));
const showToast = (message, error = false) => { const toast = $("#toast"); toast.textContent = message; toast.className = `toast visible${error ? " error" : ""}`; setTimeout(() => { toast.className = "toast"; }, 3200); };
const setLoading = (button, loading) => { button.disabled = loading; button.dataset.original = button.dataset.original || button.innerHTML; button.innerHTML = loading ? "Working…" : button.dataset.original; };

async function boot() {
  const session = await api("/api/auth/me");
  if (session.user) openApp(session.user);
  $("#loginForm").addEventListener("submit", login);
  $("#logoutBtn").addEventListener("click", logout);
  $$(".nav-item").forEach((button) => button.addEventListener("click", () => switchSection(button.dataset.section)));
  $("#addRecordBtn").addEventListener("click", () => openDialog());
  $("#closeDialog").addEventListener("click", closeDialog);
  $("#cancelDialog").addEventListener("click", closeDialog);
  $("#recordForm").addEventListener("submit", saveRecord);
  $("#searchInput").addEventListener("input", debounce(loadRecords, 250));
  ["classFilter", "courseFilter", "statusFilter"].forEach((id) => $(`#${id}`).addEventListener("change", loadRecords));
  $("#resetFilters").addEventListener("click", () => { $("#searchInput").value = ""; $("#classFilter").value = ""; $("#courseFilter").value = ""; $("#statusFilter").value = ""; loadRecords(); });
  $("#exportBtn").addEventListener("click", exportRecords);
  $("#importBtn").addEventListener("click", () => $("#fileInput").click());
  $("#fileInput").addEventListener("change", importRecords);
}

async function login(event) {
  event.preventDefault();
  const button = event.submitter;
  setLoading(button, true);
  $("#loginError").textContent = "";
  try {
    const data = await api("/api/auth/login", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(event.target))) });
    openApp(data.user);
  } catch (error) { $("#loginError").textContent = error.message; } finally { setLoading(button, false); }
}

function openApp(user) {
  state.user = user;
  $("#loginView").classList.add("hidden"); $("#appView").classList.remove("hidden");
  $("#userName").textContent = user.username; $("#userRole").textContent = user.role === "admin" ? "Administrator" : "Viewer"; $("#userAvatar").textContent = user.username.slice(0, 1).toUpperCase();
  if (user.role !== "admin") $$(".admin-control").forEach((el) => el.classList.add("hidden"));
  $("#todayLabel").textContent = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }).format(new Date());
  loadDashboard(); loadRecords(); loadOptions();
}

async function logout() { await api("/api/auth/logout", { method: "POST" }); location.reload(); }
function switchSection(section) { $$(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.section === section)); $$(".section").forEach((element) => element.classList.add("hidden")); $(`#${section}Section`).classList.remove("hidden"); $("#sectionTitle").textContent = section === "records" ? "Attendance records" : section === "activity" ? "Activity log" : "Overview"; if (section === "activity") loadAudit(); }

async function loadDashboard() {
  try {
    const data = await api("/api/stats"); const summary = data.summary;
    $("#totalMetric").textContent = summary.total; $("#punctualMetric").textContent = summary.punctual; $("#lateMetric").textContent = summary.late; $("#absentMetric").textContent = summary.absent; $("#studentMetric").textContent = `${summary.students} students tracked`; $("#punctualRate").textContent = `${summary.total ? Math.round(summary.punctual / summary.total * 100) : 0}% of records`;
    $("#classBars").innerHTML = data.classes.length ? data.classes.map((row) => `<div class="bar-row"><span class="bar-label" title="${escapeHtml(row.className)}">${escapeHtml(row.className)}</span><div class="bar-track"><div class="bar-fill" style="width:${row.punctualRate || 0}%"></div></div><span class="bar-rate">${row.punctualRate || 0}%</span></div>`).join("") : "No attendance data yet.";
    $("#recentList").innerHTML = data.recent.length ? data.recent.map((row) => `<div class="recent-row"><strong>${formatDate(row.date)}</strong><span>${row.total} record${row.total === 1 ? "" : "s"}</span></div>`).join("") : "No attendance data yet.";
  } catch (error) { showToast(error.message, true); }
}

async function loadOptions() {
  const data = await api("/api/options");
  $("#classFilter").innerHTML = `<option value="">All classes</option>${data.classes.map((item) => `<option>${escapeHtml(item)}</option>`).join("")}`;
  $("#courseFilter").innerHTML = `<option value="">All courses</option>${data.courses.map((item) => `<option>${escapeHtml(item)}</option>`).join("")}`;
}

async function loadRecords() {
  const params = new URLSearchParams({ search: $("#searchInput").value, className: $("#classFilter").value, course: $("#courseFilter").value, status: $("#statusFilter").value });
  const data = await api(`/api/attendance?${params}`); state.records = data.rows; $("#recordCount").textContent = `${data.rows.length} record${data.rows.length === 1 ? "" : "s"}`;
  $("#tableEmpty").classList.toggle("hidden", data.rows.length > 0);
  $("#recordsBody").innerHTML = data.rows.map((row) => `<tr><td><div class="student-cell"><strong>${escapeHtml(row.studentName)}</strong><span>${escapeHtml(row.studentId)}</span></div></td><td>${escapeHtml(row.className)}</td><td>${escapeHtml(row.course)}</td><td>${formatDate(row.attendanceDate)}</td><td><span class="pill ${row.status.toLowerCase()}">${row.status}</span></td><td class="admin-control ${state.user.role !== "admin" ? "hidden" : ""}"><div class="row-actions"><button class="text-button" data-edit="${row.id}">Edit</button><button class="text-button delete" data-delete="${row.id}">Delete</button></div></td></tr>`).join("");
  $$("[data-edit]").forEach((button) => button.addEventListener("click", () => openDialog(state.records.find((record) => String(record.id) === button.dataset.edit))));
  $$("[data-delete]").forEach((button) => button.addEventListener("click", () => deleteRecord(button.dataset.delete)));
}

async function loadAudit() {
  const data = await api("/api/audit");
  $("#auditBody").innerHTML = data.rows.map((row) => `<tr><td><span class="pill ${row.action.includes("DELETE") ? "absent" : row.action.includes("UPDATE") ? "late" : "punctual"}">${row.action.replaceAll("_", " ")}</span></td><td>${escapeHtml(row.username)}</td><td>${escapeHtml(row.details || "—")}</td><td>${new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(row.createdAt))}</td></tr>`).join("");
}

function openDialog(record = null) {
  state.editingId = record?.id || null; const form = $("#recordForm"); form.reset(); $("#dialogTitle").textContent = record ? "Edit record" : "Add record"; $("#formError").textContent = "";
  if (record) Object.entries(record).forEach(([key, value]) => { if (form.elements[key]) form.elements[key].value = String(value).slice(0, 10); });
  else form.elements.attendanceDate.value = new Date().toISOString().slice(0, 10);
  $("#recordDialog").showModal();
}
function closeDialog() { $("#recordDialog").close(); }
async function saveRecord(event) {
  event.preventDefault(); const button = event.submitter; setLoading(button, true); $("#formError").textContent = "";
  try { const body = Object.fromEntries(new FormData(event.target)); await api(state.editingId ? `/api/attendance/${state.editingId}` : "/api/attendance", { method: state.editingId ? "PUT" : "POST", body: JSON.stringify(body) }); closeDialog(); showToast(state.editingId ? "Record updated." : "Record added."); await Promise.all([loadRecords(), loadDashboard(), loadOptions()]); } catch (error) { $("#formError").textContent = error.message; } finally { setLoading(button, false); }
}
async function deleteRecord(id) { if (!confirm("Delete this attendance record?")) return; try { await api(`/api/attendance/${id}`, { method: "DELETE" }); showToast("Record deleted."); await Promise.all([loadRecords(), loadDashboard(), loadOptions()]); } catch (error) { showToast(error.message, true); } }
async function exportRecords() { window.location.href = "/api/export"; }
async function importRecords(event) { const file = event.target.files[0]; if (!file) return; try { const content = await file.text(); const result = await api("/api/import", { method: "POST", body: JSON.stringify({ content }) }); showToast(`Imported ${result.imported} record${result.imported === 1 ? "" : "s"}; ${result.failed} failed.`); await Promise.all([loadRecords(), loadDashboard(), loadOptions()]); if (result.failures.length) alert(result.failures.map((failure) => `Line ${failure.line}: ${failure.reason}`).join("\n")); } catch (error) { showToast(error.message, true); } event.target.value = ""; }
function debounce(callback, delay) { let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(() => callback(...args), delay); }; }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]); }
boot().catch((error) => { $("#loginError").textContent = error.message; });
