// =========================
// DEXIE DB SETUP
// =========================
var db = new Dexie("MBWorkStation");
db.version(1).stores({
  users:       "++id, username",
  projects:    "++id",
  tasks:       "++id, projectId",
  assets:      "++id",
  members:     "++id",
  contractors: "++id",
  comments:    "++id, taskId, projectId",
  events:      "++id"
});

// =========================
// UTILITY
// =========================
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  var d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric" });
}

function isOverdue(dateStr) {
  if (!dateStr) return false;
  var today = new Date(); today.setHours(0,0,0,0);
  var due   = new Date(dateStr + "T00:00:00");
  return due < today;
}

// =========================
// THEME
// =========================
function initTheme() {
  var saved = localStorage.getItem("mbws-theme") || "light-mode";
  document.body.className = saved;
  updateThemeButton(saved);
}

function updateThemeButton(mode) {
  var btn = document.getElementById("theme-toggle");
  if (!btn) return;
  if (mode === "dark-mode") {
    btn.innerHTML = '<span class="icon">☀️</span><span class="label">Light Mode</span>';
  } else {
    btn.innerHTML = '<span class="icon">🌙</span><span class="label">Dark Mode</span>';
  }
}

function toggleTheme() {
  var isDark = document.body.classList.contains("dark-mode");
  var next   = isDark ? "light-mode" : "dark-mode";
  document.body.className = next;
  localStorage.setItem("mbws-theme", next);
  updateThemeButton(next);
}

// =========================
// AUTH
// =========================
async function hashPin(pin) {
  var buf    = new TextEncoder().encode(pin);
  var digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map(function(b) { return b.toString(16).padStart(2,"0"); }).join("");
}

async function registerUser(name, username, pin) {
  var existing = await db.users.where("username").equalsIgnoreCase(username).first();
  if (existing) return { success: false, error: "Username already taken." };
  var hashed = await hashPin(pin);
  var id     = await db.users.add({ name: name, username: username, pin: hashed });
  var user   = await db.users.get(id);
  localStorage.setItem("mbws-user-id", id);
  return { success: true, user: user };
}

async function loginUser(username, pin) {
  var user = await db.users.where("username").equalsIgnoreCase(username).first();
  if (!user) return { success: false, error: "Username not found." };
  var hashed = await hashPin(pin);
  if (hashed !== user.pin) return { success: false, error: "Incorrect PIN." };
  localStorage.setItem("mbws-user-id", user.id);
  return { success: true, user: user };
}

async function getCurrentUser() {
  var id = localStorage.getItem("mbws-user-id");
  if (!id) return null;
  return await db.users.get(Number(id)) || null;
}

function logoutUser() {
  localStorage.removeItem("mbws-user-id");
  location.reload();
}

// =========================
// LOGIN SCREEN
// =========================
async function initLoginScreen() {
  var loginScreen  = document.getElementById("login-screen");
  var loginForm    = document.getElementById("login-form");
  var registerForm = document.getElementById("register-form");
  if (!loginScreen || !loginForm || !registerForm) return null;

  var user = await getCurrentUser();
  if (user) { loginScreen.style.display = "none"; return user; }

  loginScreen.style.display = "flex";

  document.getElementById("show-register").addEventListener("click", function() {
    loginForm.classList.add("hidden");
    registerForm.classList.remove("hidden");
    document.getElementById("register-error").classList.add("hidden");
  });

  document.getElementById("show-login").addEventListener("click", function() {
    registerForm.classList.add("hidden");
    loginForm.classList.remove("hidden");
    document.getElementById("login-error").classList.add("hidden");
  });

  document.getElementById("login-btn").addEventListener("click", async function() {
    var username = document.getElementById("login-username").value.trim();
    var pin      = document.getElementById("login-pin").value.trim();
    var errorEl  = document.getElementById("login-error");
    if (!username || !pin) {
      errorEl.textContent = "Please enter username and PIN.";
      errorEl.classList.remove("hidden"); return;
    }
    // FIX #6: enforce minimum PIN length on login
    if (pin.length < 4) {
      errorEl.textContent = "PIN must be at least 4 digits.";
      errorEl.classList.remove("hidden"); return;
    }
    var result = await loginUser(username, pin);
    if (result.success) {
      errorEl.classList.add("hidden");
      loginScreen.style.display = "none";
      await initApp(result.user);
    } else {
      errorEl.textContent = "❌ " + result.error;
      errorEl.classList.remove("hidden");
    }
  });

  document.getElementById("login-pin").addEventListener("keydown", function(e) {
    if (e.key === "Enter") document.getElementById("login-btn").click();
  });

  document.getElementById("register-btn").addEventListener("click", async function() {
    var name       = document.getElementById("register-name").value.trim();
    var username   = document.getElementById("register-username").value.trim();
    var pin        = document.getElementById("register-pin").value.trim();
    var pinConfirm = document.getElementById("register-pin-confirm").value.trim();
    var errorEl    = document.getElementById("register-error");
    if (!name || !username || !pin || !pinConfirm) {
      errorEl.textContent = "All fields are required.";
      errorEl.classList.remove("hidden"); return;
    }
    if (pin !== pinConfirm) {
      errorEl.textContent = "PINs do not match.";
      errorEl.classList.remove("hidden"); return;
    }
    if (pin.length < 4) {
      errorEl.textContent = "PIN must be at least 4 digits.";
      errorEl.classList.remove("hidden"); return;
    }
    var result = await registerUser(name, username, pin);
    if (result.success) {
      errorEl.classList.add("hidden");
      loginScreen.style.display = "none";
      await initApp(result.user);
    } else {
      errorEl.textContent = "❌ " + result.error;
      errorEl.classList.remove("hidden");
    }
  });

  document.getElementById("register-pin-confirm").addEventListener("keydown", function(e) {
    if (e.key === "Enter") document.getElementById("register-btn").click();
  });

  return null;
}

// =========================
// NAVIGATION
// =========================
function initNavigation() {
  document.querySelectorAll(".nav-link").forEach(function(link) {
    link.addEventListener("click", function() {
      document.querySelectorAll(".nav-link").forEach(function(l) {
        l.classList.remove("active");
      });
      document.querySelectorAll(".section").forEach(function(s) {
        s.classList.remove("active");
      });
      link.classList.add("active");
      var sectionId = link.getAttribute("data-section");
      var section   = document.getElementById(sectionId);
      if (section) section.classList.add("active");
      if (sectionId === "dashboard")  loadDashboard();
      if (sectionId === "projects")   loadProjects();
      if (sectionId === "tasks")      { loadTasksTable(); loadKanban(); }
      if (sectionId === "assets")     loadAssets();
      if (sectionId === "reports")    loadReports();
      if (sectionId === "settings")   loadSettings();
      if (sectionId === "scheduler")  loadScheduler();

      // close mobile sidebar on nav click
      var sidebar = document.getElementById("sidebar");
      if (sidebar) sidebar.classList.remove("open");
    });
  });

  var mobileBtn = document.getElementById("mobile-menu-btn");
  if (mobileBtn) {
    mobileBtn.addEventListener("click", function() {
      document.getElementById("sidebar").classList.toggle("open");
    });
  }
}

// =========================
// DASHBOARD
// =========================
var chartStatus   = null;
var chartProjects = null;

async function loadDashboard() {
  var projects = await db.projects.toArray();
  var tasks    = await db.tasks.toArray();
  var today    = new Date(); today.setHours(0,0,0,0);

  var inProgress = tasks.filter(function(t) { return t.status === "In Progress"; }).length;
  var overdue    = tasks.filter(function(t) {
    return t.dueDate && new Date(t.dueDate + "T00:00:00") < today && t.status !== "Completed";
  }).length;

  var sp = document.getElementById("stat-projects");
  var st = document.getElementById("stat-tasks");
  var si = document.getElementById("stat-inprogress");
  var so = document.getElementById("stat-overdue");
  if (sp) sp.textContent = projects.length;
  if (st) st.textContent = tasks.length;
  if (si) si.textContent = inProgress;
  if (so) so.textContent = overdue;

  var user = await getCurrentUser();
  var greet = document.getElementById("welcome-greeting");
  if (greet && user) greet.textContent = "Welcome back, " + user.name + "! 👋";

  // Status chart
  var statusCounts = { "Not Started": 0, "In Progress": 0, "On Hold": 0, "Completed": 0 };
  tasks.forEach(function(t) { if (statusCounts[t.status] !== undefined) statusCounts[t.status]++; });

  // FIX #5: only render charts if canvas is visible/in DOM
  var ctx1 = document.getElementById("chart-status");
  if (ctx1 && ctx1.offsetParent !== null) {
    if (chartStatus) chartStatus.destroy();
    chartStatus = new Chart(ctx1, {
      type: "doughnut",
      data: {
        labels: Object.keys(statusCounts),
        datasets: [{
          data: Object.values(statusCounts),
          backgroundColor: ["#94a3b8","#3b82f6","#f59e0b","#22c55e"]
        }]
      },
      options: { responsive: true, plugins: { legend: { position: "bottom" } } }
    });
  }

  // Projects chart
  var projCounts = {};
  projects.forEach(function(p) { projCounts[p.title] = 0; });
  tasks.forEach(function(t) {
    var proj = projects.find(function(p) { return p.id === t.projectId; });
    if (proj) projCounts[proj.title] = (projCounts[proj.title] || 0) + 1;
  });

  var ctx2 = document.getElementById("chart-projects");
  if (ctx2 && ctx2.offsetParent !== null) {
    if (chartProjects) chartProjects.destroy();
    chartProjects = new Chart(ctx2, {
      type: "bar",
      data: {
        labels: Object.keys(projCounts),
        datasets: [{
          label: "Tasks",
          data:  Object.values(projCounts),
          backgroundColor: "#3b82f6"
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales:  { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
      }
    });
  }
}

// =========================
// PROJECTS
// =========================
var projectSort = { field: "title", dir: "asc" };
var editingProjectId = null;

async function loadProjects() {
  var projects = await db.projects.toArray();
  var tasks    = await db.tasks.toArray();

  var search  = (document.getElementById("projects-search")          || {}).value || "";
  var fStatus = (document.getElementById("projects-filter-status")   || {}).value || "";
  var fPrio   = (document.getElementById("projects-filter-priority") || {}).value || "";

  projects = projects.filter(function(p) {
    var ms = !search  || (p.title || "").toLowerCase().includes(search.toLowerCase());
    var mv = !fStatus || p.status   === fStatus;
    var mp = !fPrio   || p.priority === fPrio;
    return ms && mv && mp;
  });

  var field = projectSort.field;
  var dir   = projectSort.dir === "asc" ? 1 : -1;
  projects.sort(function(a,b) {
    var av = (a[field] || "").toString().toLowerCase();
    var bv = (b[field] || "").toString().toLowerCase();
    return av < bv ? -dir : av > bv ? dir : 0;
  });

  var tbody = document.getElementById("projects-tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (projects.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-row">No projects found.</td></tr>';
    return;
  }

  projects.forEach(function(proj) {
    var taskCount = tasks.filter(function(t) { return t.projectId === proj.id; }).length;
    var overdue   = proj.dueDate && isOverdue(proj.dueDate) && proj.status !== "Completed";
    var tr = document.createElement("tr");
    tr.innerHTML =
      '<td><strong>' + escapeHtml(proj.title) + '</strong>' +
        (proj.description ? '<br><small style="color:var(--text-muted)">' +
          escapeHtml(proj.description) + '</small>' : '') +
      '</td>' +
      '<td><span class="badge badge-status-' +
        (proj.status || "").toLowerCase().replace(/ /g,"-") + '">' +
        escapeHtml(proj.status) + '</span></td>' +
      '<td><span class="badge badge-priority-' +
        (proj.priority || "").toLowerCase() + '">' +
        escapeHtml(proj.priority) + '</span></td>' +
      '<td class="' + (overdue ? "overdue-date" : "") + '">' +
        formatDate(proj.dueDate) + '</td>' +
      '<td>' + taskCount + '</td>' +
      '<td class="actions-cell">' +
        '<button class="btn-icon proj-edit-btn" data-id="' + proj.id +
          '" title="Edit">✏️</button>' +
        '<button class="btn-icon proj-comment-btn" data-id="' + proj.id +
          '" title="Comments">💬</button>' +
        '<button class="btn-icon btn-delete proj-delete-btn" data-id="' + proj.id +
          '" title="Delete">🗑️</button>' +
      '</td>';
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll(".proj-edit-btn").forEach(function(btn) {
    btn.addEventListener("click", function() { openProjectModal(parseInt(this.dataset.id)); });
  });
  tbody.querySelectorAll(".proj-comment-btn").forEach(function(btn) {
    btn.addEventListener("click", function() { openProjectComments(parseInt(this.dataset.id)); });
  });
  tbody.querySelectorAll(".proj-delete-btn").forEach(function(btn) {
    btn.addEventListener("click", function() { confirmDeleteProject(parseInt(this.dataset.id)); });
  });
}

function openProjectModal(projectId) {
  editingProjectId = projectId || null;
  var modal = document.getElementById("project-modal");
  var title = document.getElementById("project-modal-title");
  if (!modal) return;
  if (projectId) {
    title.textContent = "Edit Project";
    db.projects.get(projectId).then(function(proj) {
      if (!proj) return;
      document.getElementById("proj-name").value       = proj.title       || "";
      document.getElementById("proj-desc").value       = proj.description || "";
      document.getElementById("proj-start-date").value = proj.startDate   || "";
      document.getElementById("proj-due-date").value   = proj.dueDate     || "";
      document.getElementById("proj-status").value     = proj.status      || "Not Started";
      document.getElementById("proj-priority").value   = proj.priority    || "Medium";
      document.getElementById("proj-notes").value      = proj.notes       || "";
    });
  } else {
    title.textContent = "Add Project";
    ["proj-name","proj-desc","proj-start-date","proj-due-date","proj-notes"]
      .forEach(function(id) { document.getElementById(id).value = ""; });
    document.getElementById("proj-status").value   = "Not Started";
    document.getElementById("proj-priority").value = "Medium";
  }
  modal.style.display = "flex";
}

async function saveProject() {
  var name = document.getElementById("proj-name").value.trim();
  if (!name) { alert("Project name is required."); return; }
  var data = {
    title:       name,
    description: document.getElementById("proj-desc").value.trim(),
    startDate:   document.getElementById("proj-start-date").value,
    dueDate:     document.getElementById("proj-due-date").value,
    status:      document.getElementById("proj-status").value,
    priority:    document.getElementById("proj-priority").value,
    notes:       document.getElementById("proj-notes").value.trim()
  };
  if (editingProjectId) {
    await db.projects.update(editingProjectId, data);
  } else {
    await db.projects.add(data);
  }
  document.getElementById("project-modal").style.display = "none";
  loadProjects();
}

async function confirmDeleteProject(projectId) {
  var proj = await db.projects.get(projectId);
  if (!proj) return;
  document.getElementById("delete-project-name").textContent = proj.title;
  var modal = document.getElementById("delete-project-modal");
  modal.style.display = "flex";
  document.getElementById("delete-project-confirm").onclick = async function() {
    await db.tasks.where("projectId").equals(projectId).delete();
    await db.projects.delete(projectId);
    modal.style.display = "none";
    loadProjects();
  };
}

async function openProjectComments(projectId) {
  var proj  = await db.projects.get(projectId);
  var modal = document.getElementById("project-comments-modal");
  if (!modal || !proj) return;
  document.getElementById("project-comments-title").textContent =
    "💬 Comments — " + proj.title;
  modal.style.display = "flex";
  loadProjectComments(projectId);

  document.getElementById("project-add-comment-btn").onclick = async function() {
    var input = document.getElementById("project-comment-input");
    var text  = input.value.trim();
    if (!text) return;
    var user  = await getCurrentUser();
    await db.comments.add({
      projectId: projectId,
      taskId:    null,
      text:      text,
      author:    user ? user.name : "Unknown",
      createdAt: new Date().toISOString()
    });
    input.value = "";
    loadProjectComments(projectId);
  };
}

async function loadProjectComments(projectId) {
  var comments = await db.comments.where("projectId").equals(projectId).toArray();
  var list     = document.getElementById("project-comments-list");
  if (!list) return;
  if (comments.length === 0) {
    list.innerHTML = '<p style="color:var(--text-muted);font-style:italic;">No comments yet.</p>';
    return;
  }
  list.innerHTML = comments.map(function(c) {
    return '<div class="comment-item">' +
      '<strong>' + escapeHtml(c.author) + '</strong>' +
      '<span class="comment-date">' +
        new Date(c.createdAt).toLocaleString() + '</span>' +
      '<p>' + escapeHtml(c.text) + '</p>' +
      '</div>';
  }).join("");
}

function initProjectListeners() {
  var addBtn = document.getElementById("add-project-btn");
  if (addBtn) addBtn.addEventListener("click", function() { openProjectModal(null); });

  var saveBtn = document.getElementById("project-modal-save");
  if (saveBtn) saveBtn.addEventListener("click", saveProject);

  var closeBtn = document.getElementById("project-modal-close");
  if (closeBtn) closeBtn.addEventListener("click", function() {
    document.getElementById("project-modal").style.display = "none";
  });

  var cancelBtn = document.getElementById("project-modal-cancel");
  if (cancelBtn) cancelBtn.addEventListener("click", function() {
    document.getElementById("project-modal").style.display = "none";
  });

  var delClose = document.getElementById("delete-project-close");
  if (delClose) delClose.addEventListener("click", function() {
    document.getElementById("delete-project-modal").style.display = "none";
  });

  var delCancel = document.getElementById("delete-project-cancel");
  if (delCancel) delCancel.addEventListener("click", function() {
    document.getElementById("delete-project-modal").style.display = "none";
  });

  var commClose = document.getElementById("project-close-comments-btn");
  if (commClose) commClose.addEventListener("click", function() {
    document.getElementById("project-comments-modal").style.display = "none";
  });

  var search = document.getElementById("projects-search");
  if (search) search.addEventListener("input", loadProjects);

  var fStatus = document.getElementById("projects-filter-status");
  if (fStatus) fStatus.addEventListener("change", loadProjects);

  var fPrio = document.getElementById("projects-filter-priority");
  if (fPrio) fPrio.addEventListener("change", loadProjects);

  document.querySelectorAll("#projects-table th[data-sort]").forEach(function(th) {
    th.addEventListener("click", function() {
      var f = this.dataset.sort;
      if (projectSort.field === f) {
        projectSort.dir = projectSort.dir === "asc" ? "desc" : "asc";
      } else {
        projectSort.field = f; projectSort.dir = "asc";
      }
      loadProjects();
    });
  });
}

// =========================
// TASKS
// =========================
var taskSort = { field: "title", dir: "asc" };
var editingTaskId = null;
var tasksView = "table";

async function populateTaskProjectFilter() {
  var projects = await db.projects.toArray();
  var sel      = document.getElementById("tasks-filter-project");
  if (!sel) return;
  var cur = sel.value;
  sel.innerHTML = '<option value="">All Projects</option>';
  projects.forEach(function(p) {
    sel.innerHTML += '<option value="' + p.id + '">' + escapeHtml(p.title) + '</option>';
  });
  sel.value = cur;
}

async function loadTasksTable() {
  await populateTaskProjectFilter();
  await populateTaskLineFilter();

  var tasks    = await db.tasks.toArray();
  var projects = await db.projects.toArray();

  var search   = (document.getElementById("tasks-search")          || {}).value || "";
  var fProject = (document.getElementById("tasks-filter-project")  || {}).value || "";
  var fStatus  = (document.getElementById("tasks-filter-status")   || {}).value || "";
  var fPrio    = (document.getElementById("tasks-filter-priority") || {}).value || "";
  var fLine    = (document.getElementById("tasks-filter-line")     || {}).value || "";
  var hideComp = (document.getElementById("tasks-hide-completed")  || {}).checked || false;

  tasks = tasks.filter(function(t) {
    var ms = !search   || (t.title || "").toLowerCase().includes(search.toLowerCase());
    var mp = !fProject || String(t.projectId) === String(fProject);
    var mv = !fStatus  || t.status   === fStatus;
    var mpr= !fPrio    || t.priority === fPrio;
    var ml = !fLine    || t.line     === fLine;
    var mc = !hideComp || t.status   !== "Completed";
    return ms && mp && mv && mpr && ml && mc;  // ← mb removed
  });

  var field = taskSort.field;
  var dir   = taskSort.dir === "asc" ? 1 : -1;
  tasks.sort(function(a,b) {
    var av = (a[field] || "").toString().toLowerCase();
    var bv = (b[field] || "").toString().toLowerCase();
    return av < bv ? -dir : av > bv ? dir : 0;
  });

  var tbody = document.getElementById("tasks-tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (tasks.length === 0) {
    tbody.innerHTML = '<tr><td colspan="11" class="empty-row">No tasks found.</td></tr>';
    return;
  }

  // Collect all asset lookups first, then render
  var assetNumbers = tasks.map(function(t) { return t.assetNumber || ""; });
  var assets = await db.assets.toArray();

  tasks.forEach(function(task) {
    var proj    = projects.find(function(p) { return p.id === task.projectId; });
    var asset   = assets.find(function(a) { return a.assetNumber === task.assetNumber; });
    var overdue = task.dueDate && isOverdue(task.dueDate) && task.status !== "Completed";
    var assigned = Array.isArray(task.assignedMembers)
      ? task.assignedMembers.join(", ") : "";
    var assetName = asset ? asset.assetName : "";

    var tr = document.createElement("tr");
    tr.innerHTML =
      '<td><strong>' + escapeHtml(task.title) + '</strong></td>' +
      '<td><span class="badge badge-status-' +
        (task.status || "").toLowerCase().replace(/ /g,"-") + '">' +
        escapeHtml(task.status) + '</span></td>' +
      '<td><span class="badge badge-priority-' +
        (task.priority || "").toLowerCase() + '">' +
        escapeHtml(task.priority) + '</span></td>' +
      '<td>' + escapeHtml(task.line        || "") + '</td>' +
      '<td>' + escapeHtml(task.assetNumber || "") + '</td>' +
      '<td>' + escapeHtml(assetName)              + '</td>' +
      '<td>' + formatDate(task.startDate)         + '</td>' +
      '<td class="' + (overdue ? "overdue-date" : "") + '">' +
        formatDate(task.dueDate) + '</td>' +
      '<td>' + escapeHtml(proj ? proj.title : "") + '</td>' +
      '<td>' + escapeHtml(assigned) + '</td>' +
      '<td class="actions-cell">' +
        '<button class="btn-icon task-edit-btn" data-id="' + task.id +
          '" title="Edit">✏️</button>' +
        '<button class="btn-icon btn-delete task-delete-btn" data-id="' + task.id +
          '" title="Delete">🗑️</button>' +
      '</td>';
    tbody.appendChild(tr);

    tr.querySelectorAll(".task-edit-btn").forEach(function(btn) {
      btn.addEventListener("click", function() {
        openTaskModal(parseInt(this.dataset.id));
      });
    });
    tr.querySelectorAll(".task-delete-btn").forEach(function(btn) {
      btn.addEventListener("click", function() {
        confirmDeleteTask(parseInt(this.dataset.id));
      });
    });
  });
} // ← closing brace for loadTasksTable()

async function loadKanban() {
  var tasks    = await db.tasks.toArray();
  var projects = await db.projects.toArray();
  var cols     = ["Not Started","In Progress","On Hold","Completed"];
  var colIds   = {
    "Not Started": "kanban-not-started",
    "In Progress": "kanban-in-progress",
    "On Hold":     "kanban-on-hold",
    "Completed":   "kanban-completed"
  };

  cols.forEach(function(status) {
    var col    = document.getElementById(colIds[status]);
    if (!col) return;
    var subset = tasks.filter(function(t) { return t.status === status; });
    if (subset.length === 0) {
      col.innerHTML = '<div class="kanban-empty">No tasks</div>'; return;
    }
    col.innerHTML = subset.map(function(t) {
      var proj = projects.find(function(p) { return p.id === t.projectId; });
      return '<div class="kanban-card" data-id="' + t.id + '">' +
        '<div class="kanban-card-title">' + escapeHtml(t.title) + '</div>' +
        '<div class="kanban-card-meta">' +
          '<span class="badge badge-priority-' +
            (t.priority || "").toLowerCase() + '">' +
            escapeHtml(t.priority) + '</span>' +
        '</div>' +
        (proj ? '<div class="kanban-project">📁 ' + escapeHtml(proj.title) + '</div>' : '') +
        (t.building ? '<div class="kanban-building">🏭 ' + escapeHtml(t.building) + '</div>' : '') +
        (t.dueDate  ? '<div class="kanban-due' +
          (isOverdue(t.dueDate) && t.status !== "Completed" ? " overdue-date" : "") +
          '">📅 ' + formatDate(t.dueDate) + '</div>' : '') +
        '</div>';
    }).join("");

    col.querySelectorAll(".kanban-card").forEach(function(card) {
      card.addEventListener("click", function() {
        openTaskModal(parseInt(this.dataset.id));
      });
    });
  });
}

async function openTaskModal(taskId) {
  editingTaskId = taskId || null;
  var modal = document.getElementById("task-modal");
  var title = document.getElementById("task-modal-title");
  if (!modal) return;

  var projects     = await db.projects.toArray();
  var members      = await db.members.toArray();
  var contractors  = await db.contractors.toArray();

  // Populate project dropdown
  var projSel = document.getElementById("task-project");
  projSel.innerHTML = '<option value="">— No Project —</option>';
  projects.forEach(function(p) {
    projSel.innerHTML += '<option value="' + p.id + '">' + escapeHtml(p.title) + '</option>';
  });

  // Populate contractor dropdown
  var contrSel = document.getElementById("task-contractor");
  contrSel.innerHTML = '<option value="">— No Contractor —</option>';
  contractors.forEach(function(c) {
    contrSel.innerHTML += '<option value="' + c.id + '">' +
      escapeHtml(c.name) + (c.company ? " (" + escapeHtml(c.company) + ")" : "") +
      '</option>';
  });

  // Members checklist
  var membersList = document.getElementById("task-members-list");
  membersList.innerHTML = "";
  members.forEach(function(m) {
    var label = document.createElement("label");
    label.className = "member-check";
    label.innerHTML = '<input type="checkbox" value="' + escapeHtml(m.name) + '" /> ' +
      escapeHtml(m.name);
    membersList.appendChild(label);
  });

  var commSection = document.getElementById("task-comments-section");

  if (taskId) {
    title.textContent = "Edit Task";
    var task = await db.tasks.get(taskId);
    if (!task) return;
    document.getElementById("task-title").value         = task.title       || "";
    document.getElementById("task-status").value        = task.status      || "Not Started";
    document.getElementById("task-priority").value      = task.priority    || "Medium";
    document.getElementById("task-building").value      = task.building    || "";
    document.getElementById("task-line").value          = task.line        || "";
    document.getElementById("task-asset-number").value  = task.assetNumber || "";
    document.getElementById("task-start-date").value    = task.startDate   || "";
    document.getElementById("task-due-date").value      = task.dueDate     || "";
    document.getElementById("task-plc-make").value      = task.plcMake     || "";
    document.getElementById("task-plc-ip").value        = task.plcIp       || "";
    document.getElementById("task-splc-make").value     = task.splcMake    || "";
    document.getElementById("task-splc-ip").value       = task.splcIp      || "";
    document.getElementById("task-notes").value         = task.notes       || "";
    projSel.value  = task.projectId    || "";
    contrSel.value = task.contractorId || "";

    var assigned = Array.isArray(task.assignedMembers) ? task.assignedMembers : [];
    membersList.querySelectorAll("input[type=checkbox]").forEach(function(cb) {
      cb.checked = assigned.includes(cb.value);
    });

    if (commSection) {
      commSection.style.display = "block";
      loadTaskComments(taskId);
    }
  } else {
    title.textContent = "Add Task";
    ["task-title","task-building","task-line","task-asset-number",
     "task-start-date","task-due-date","task-plc-make","task-plc-ip",
     "task-splc-make","task-splc-ip","task-notes"
    ].forEach(function(id) { document.getElementById(id).value = ""; });
    document.getElementById("task-status").value   = "Not Started";
    document.getElementById("task-priority").value = "Medium";
    if (commSection) commSection.style.display = "none";
  }

  modal.style.display = "flex";
}

async function saveTask() {
  var titleEl = document.getElementById("task-title");
  if (!titleEl || !titleEl.value.trim()) { alert("Task title is required."); return; }

  var assigned = [];
  document.querySelectorAll("#task-members-list input[type=checkbox]:checked")
    .forEach(function(cb) { assigned.push(cb.value); });

  var data = {
    title:           titleEl.value.trim(),
    status:          document.getElementById("task-status").value,
    priority:        document.getElementById("task-priority").value,
    building:        document.getElementById("task-building").value.trim(),
    line:            document.getElementById("task-line").value.trim(),
    assetNumber:     document.getElementById("task-asset-number").value.trim(),
    startDate:       document.getElementById("task-start-date").value,
    dueDate:         document.getElementById("task-due-date").value,
    plcMake:         document.getElementById("task-plc-make").value.trim(),
    plcIp:           document.getElementById("task-plc-ip").value.trim(),
    splcMake:        document.getElementById("task-splc-make").value.trim(),
    splcIp:          document.getElementById("task-splc-ip").value.trim(),
    notes:           document.getElementById("task-notes").value.trim(),
    projectId:       parseInt(document.getElementById("task-project").value) || null,
    contractorId:    parseInt(document.getElementById("task-contractor").value) || null,
    assignedMembers: assigned
  };

  if (editingTaskId) {
    await db.tasks.update(editingTaskId, data);
  } else {
    await db.tasks.add(data);
  }

  document.getElementById("task-modal").style.display = "none";
  loadTasksTable();
  loadKanban();
}

async function confirmDeleteTask(taskId) {
  var task = await db.tasks.get(taskId);
  if (!task) return;
  document.getElementById("delete-task-name").textContent = task.title;
  var modal = document.getElementById("delete-task-modal");
  modal.style.display = "flex";
  document.getElementById("delete-task-confirm").onclick = async function() {
    await db.tasks.delete(taskId);
    modal.style.display = "none";
    loadTasksTable();
    loadKanban();
  };
}

async function loadTaskComments(taskId) {
  var comments = await db.comments.where("taskId").equals(taskId).toArray();
  var list     = document.getElementById("task-comments-list");
  if (!list) return;
  if (comments.length === 0) {
    list.innerHTML = '<p style="color:var(--text-muted);font-style:italic;">No comments yet.</p>';
    return;
  }
  list.innerHTML = comments.map(function(c) {
    return '<div class="comment-item">' +
      '<strong>' + escapeHtml(c.author) + '</strong>' +
      '<span class="comment-date">' + new Date(c.createdAt).toLocaleString() + '</span>' +
      '<p>' + escapeHtml(c.text) + '</p></div>';
  }).join("");

  var submitBtn = document.getElementById("task-comment-submit");
  if (submitBtn) {
    submitBtn.onclick = async function() {
      var input = document.getElementById("task-comment-input");
      var text  = input.value.trim();
      if (!text) return;
      var user = await getCurrentUser();
      await db.comments.add({
        taskId:    taskId,
        projectId: null,
        text:      text,
        author:    user ? user.name : "Unknown",
        createdAt: new Date().toISOString()
      });
      input.value = "";
      loadTaskComments(taskId);
    };
  }
}

async function populateTaskLineFilter() {
  var tasks     = await db.tasks.toArray();
  var lines = [...new Set(tasks.map(function(t) { return t.line; })
    .filter(Boolean))].sort();
  var sel = document.getElementById("tasks-filter-line");
  if (!sel) return;
  var cur = sel.value;
  sel.innerHTML = '<option value="">All Lines</option>';
  lines.forEach(function(b) {
    sel.innerHTML += '<option value="' + escapeHtml(b) + '">' + escapeHtml(b) + '</option>';
  });
  sel.value = cur;
}

function initTaskListeners() {
  var addBtn = document.getElementById("add-task-btn");
  if (addBtn) addBtn.addEventListener("click", function() { openTaskModal(null); });

  var saveBtn = document.getElementById("task-modal-save");
  if (saveBtn) saveBtn.addEventListener("click", saveTask);

  var closeBtn = document.getElementById("task-modal-close");
  if (closeBtn) closeBtn.addEventListener("click", function() {
    document.getElementById("task-modal").style.display = "none";
  });

  var cancelBtn = document.getElementById("task-modal-cancel");
  if (cancelBtn) cancelBtn.addEventListener("click", function() {
    document.getElementById("task-modal").style.display = "none";
  });

  var delClose = document.getElementById("delete-task-close");
  if (delClose) delClose.addEventListener("click", function() {
    document.getElementById("delete-task-modal").style.display = "none";
  });

  var delCancel = document.getElementById("delete-task-cancel");
  if (delCancel) delCancel.addEventListener("click", function() {
    document.getElementById("delete-task-modal").style.display = "none";
  });

  var viewTable  = document.getElementById("tasks-view-table");
  var viewKanban = document.getElementById("tasks-view-kanban");
  var tableView  = document.getElementById("tasks-table-view");
  var kanbanView = document.getElementById("tasks-kanban-view");

  if (viewTable) viewTable.addEventListener("click", function() {
    tasksView = "table";
    tableView.style.display  = "block";
    kanbanView.style.display = "none";
    loadTasksTable();
  });

  if (viewKanban) viewKanban.addEventListener("click", function() {
    tasksView = "kanban";
    tableView.style.display  = "none";
    kanbanView.style.display = "block";
    loadKanban();
  });

  ["tasks-search","tasks-filter-project","tasks-filter-status",
   "tasks-filter-priority","tasks-filter-line"
  ].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener(id.includes("search") ? "input" : "change", loadTasksTable);
  });

  var hideComp = document.getElementById("tasks-hide-completed");
  if (hideComp) hideComp.addEventListener("change", loadTasksTable);

  document.querySelectorAll("#tasks-table th[data-sort]").forEach(function(th) {
    th.addEventListener("click", function() {
      var f = this.dataset.sort;
      if (taskSort.field === f) {
        taskSort.dir = taskSort.dir === "asc" ? "desc" : "asc";
      } else {
        taskSort.field = f; taskSort.dir = "asc";
      }
      loadTasksTable();
    });
  });
}

// =========================
// ASSETS
// =========================
var assetSort = { field: "assetNumber", dir: "asc" };
var assetColVisibility = {
  plcMake: false, splcMake: false,
  plcIp:   false, splcIp:   false, opDescription: false
};

function initAssetColumnToggles() {
  var toggleMap = {
    "col-toggle-plcMake":  "plcMake",
    "col-toggle-splcMake": "splcMake",
    "col-toggle-plcIp":    "plcIp",
    "col-toggle-splcIp":   "splcIp",
    "col-toggle-opDesc":   "opDescription"
  };
  Object.keys(toggleMap).forEach(function(toggleId) {
    var col = toggleMap[toggleId];
    var cb  = document.getElementById(toggleId);
    if (!cb) return;
    cb.checked = assetColVisibility[col];
    cb.addEventListener("change", function() {
      assetColVisibility[col] = cb.checked;
      applyAssetColumnVisibility();
    });
  });
  applyAssetColumnVisibility();
}

function applyAssetColumnVisibility() {
  var classMap = {
    plcMake: "col-plcMake", splcMake: "col-splcMake",
    plcIp:   "col-plcIp",   splcIp:   "col-splcIp",
    opDescription: "col-opDesc"
  };
  Object.keys(classMap).forEach(function(col) {
    var visible = assetColVisibility[col];
    document.querySelectorAll("." + classMap[col]).forEach(function(el) {
      el.style.display = visible ? "" : "none";
    });
  });
}

async function populateAssetFilters() {
  var assets    = await db.assets.toArray();
  var buildings = [...new Set(assets.map(function(a) { return a.building; }).filter(Boolean))].sort();
  var lines     = [...new Set(assets.map(function(a) { return a.line;     }).filter(Boolean))].sort();

  var bSel = document.getElementById("assets-filter-building");
  var lSel = document.getElementById("assets-filter-line");
  if (bSel) {
    bSel.innerHTML = '<option value="">All Buildings</option>';
    buildings.forEach(function(b) {
      bSel.innerHTML += '<option value="' + escapeHtml(b) + '">' + escapeHtml(b) + '</option>';
    });
  }
  if (lSel) {
    lSel.innerHTML = '<option value="">All Lines</option>';
    lines.forEach(function(l) {
      lSel.innerHTML += '<option value="' + escapeHtml(l) + '">' + escapeHtml(l) + '</option>';
    });
  }
}

async function loadAssets() {
  var assets    = await db.assets.toArray();
  var search    = (document.getElementById("assets-search")          || {}).value || "";
  var fBuilding = (document.getElementById("assets-filter-building") || {}).value || "";
  var fLine     = (document.getElementById("assets-filter-line")     || {}).value || "";

  assets = assets.filter(function(a) {
    var ms = !search ||
      (a.assetNumber  || "").toLowerCase().includes(search.toLowerCase()) ||
      (a.assetName    || "").toLowerCase().includes(search.toLowerCase()) ||
      (a.opNumber     || "").toLowerCase().includes(search.toLowerCase()) ||
      (a.building     || "").toLowerCase().includes(search.toLowerCase()) ||
      (a.line         || "").toLowerCase().includes(search.toLowerCase()) ||
      (a.vendor       || "").toLowerCase().includes(search.toLowerCase());
    var mb = !fBuilding || a.building === fBuilding;
    var ml = !fLine     || a.line     === fLine;
    return ms && mb && ml;
  });

  var field = assetSort.field;
  var dir   = assetSort.dir === "asc" ? 1 : -1;
  assets.sort(function(a,b) {
    var av = (a[field] || "").toString().toLowerCase();
    var bv = (b[field] || "").toString().toLowerCase();
    return av < bv ? -dir : av > bv ? dir : 0;
  });

  var tbody = document.getElementById("assets-table-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (assets.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="12" class="empty-row">No assets found. Add one below!</td></tr>';
    return;
  }

  assets.forEach(function(asset) {
    var tr = document.createElement("tr");
    tr.innerHTML =
      '<td><a class="asset-number-link" data-id="' + asset.id + '">' +
        escapeHtml(asset.assetNumber || "") + '</a></td>' +
      '<td>' + escapeHtml(asset.assetName    || "") + '</td>' +
      '<td>' + escapeHtml(asset.opNumber     || "") + '</td>' +
      '<td class="col-opDesc">'  + escapeHtml(asset.opDescription || "") + '</td>' +
      '<td>' + escapeHtml(asset.building     || "") + '</td>' +
      '<td>' + escapeHtml(asset.line         || "") + '</td>' +
      '<td>' + escapeHtml(asset.vendor       || "") + '</td>' +
      '<td class="col-plcMake">'  + escapeHtml(asset.plcMake  || "") + '</td>' +
      '<td class="col-splcMake">' + escapeHtml(asset.splcMake || "") + '</td>' +
      '<td class="col-plcIp">'   + escapeHtml(asset.plcIp    || "") + '</td>' +
      '<td class="col-splcIp">'  + escapeHtml(asset.splcIp   || "") + '</td>' +
      '<td class="actions-cell">' +
        '<button class="btn-icon btn-delete asset-delete-btn" data-id="' + asset.id +
          '" title="Delete">🗑️</button>' +
      '</td>';
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll(".asset-number-link").forEach(function(el) {
    el.addEventListener("click", function() {
      openAssetDetailModal(parseInt(this.dataset.id));
    });
  });

  tbody.querySelectorAll(".asset-delete-btn").forEach(function(btn) {
    btn.addEventListener("click", function() {
      deleteAsset(parseInt(this.dataset.id));
    });
  });

  applyAssetColumnVisibility();
  await populateAssetFilters();
}

async function addAsset() {
  var numEl = document.getElementById("new-asset-number");
  if (!numEl || !numEl.value.trim()) { alert("Asset number is required."); return; }
  await db.assets.add({
    assetNumber:   numEl.value.trim(),
    assetName:     (document.getElementById("new-asset-name")           || {}).value || "",
    opNumber:      (document.getElementById("new-asset-op-number")      || {}).value || "",
    opDescription: (document.getElementById("new-asset-op-description") || {}).value || "",
    building:      (document.getElementById("new-asset-building")       || {}).value || "",
    line:          (document.getElementById("new-asset-line")           || {}).value || "",
    vendor:        (document.getElementById("new-asset-vendor")         || {}).value || "",
    plcMake:       (document.getElementById("new-asset-plc-make")       || {}).value || "",
    splcMake:      (document.getElementById("new-asset-splc-make")      || {}).value || "",
    plcIp:         (document.getElementById("new-asset-plc-ip")         || {}).value || "",
    splcIp:        (document.getElementById("new-asset-splc-ip")        || {}).value || "",
    notes:         (document.getElementById("new-asset-notes")          || {}).value || ""
  });
  // Clear all fields
  ["new-asset-number","new-asset-name","new-asset-op-number",
   "new-asset-op-description","new-asset-building","new-asset-line",
   "new-asset-vendor","new-asset-plc-make","new-asset-splc-make",
   "new-asset-plc-ip","new-asset-splc-ip","new-asset-notes"
  ].forEach(function(id) {
    var el = document.getElementById(id); if (el) el.value = "";
  });
  document.getElementById("asset-add-modal").style.display = "none";
  loadAssets();
}

async function deleteAsset(assetId) {
  if (!confirm("Delete this asset?")) return;
  await db.assets.delete(Number(assetId));
  loadAssets();
}

async function openAssetDetailModal(assetId) {
  var asset = await db.assets.get(Number(assetId));
  if (!asset) return;
  var modal = document.getElementById("asset-detail-modal");
  if (!modal) return;
  document.getElementById("asset-modal-title").textContent = "Asset: " + (asset.assetNumber || "");
  document.getElementById("ad-asset-number").value   = asset.assetNumber   || "";
  document.getElementById("ad-asset-name").value     = asset.assetName     || "";
  document.getElementById("ad-op-number").value      = asset.opNumber      || "";
  document.getElementById("ad-op-description").value = asset.opDescription || "";
  document.getElementById("ad-building").value       = asset.building      || "";
  document.getElementById("ad-line").value           = asset.line          || "";
  document.getElementById("ad-vendor").value         = asset.vendor        || "";
  document.getElementById("ad-plc-make").value       = asset.plcMake       || "";
  document.getElementById("ad-splc-make").value      = asset.splcMake      || "";
  document.getElementById("ad-plc-ip").value         = asset.plcIp         || "";
  document.getElementById("ad-splc-ip").value        = asset.splcIp        || "";
  document.getElementById("ad-notes").value          = asset.notes         || "";
  modal.classList.remove("hidden");

  document.getElementById("asset-modal-save").onclick = async function() {
    await db.assets.update(Number(assetId), {
      assetNumber:   document.getElementById("ad-asset-number").value.trim(),
      assetName:     document.getElementById("ad-asset-name").value.trim(),
      opNumber:      document.getElementById("ad-op-number").value.trim(),
      opDescription: document.getElementById("ad-op-description").value.trim(),
      building:      document.getElementById("ad-building").value.trim(),
      line:          document.getElementById("ad-line").value.trim(),
      vendor:        document.getElementById("ad-vendor").value.trim(),
      plcMake:       document.getElementById("ad-plc-make").value.trim(),
      splcMake:      document.getElementById("ad-splc-make").value.trim(),
      plcIp:         document.getElementById("ad-plc-ip").value.trim(),
      splcIp:        document.getElementById("ad-splc-ip").value.trim(),
      notes:         document.getElementById("ad-notes").value.trim()
    });
    modal.classList.add("hidden");
    loadAssets();
  };
  document.getElementById("asset-modal-close").onclick  = function() { modal.classList.add("hidden"); };
  document.getElementById("asset-modal-cancel").onclick = function() { modal.classList.add("hidden"); };
  modal.onclick = function(e) { if (e.target === modal) modal.classList.add("hidden"); };
}

function initAssetListeners() {
  // + Add Asset button opens modal
  var addBtn = document.getElementById("add-asset-btn");
  if (addBtn) addBtn.addEventListener("click", function() {
    // Clear fields before opening
    ["new-asset-number","new-asset-name","new-asset-op-number",
     "new-asset-op-description","new-asset-building","new-asset-line",
     "new-asset-vendor","new-asset-plc-make","new-asset-splc-make",
     "new-asset-plc-ip","new-asset-splc-ip","new-asset-notes"
    ].forEach(function(id) {
      var el = document.getElementById(id); if (el) el.value = "";
    });
    document.getElementById("asset-add-modal-title").textContent = "Add Asset";
    document.getElementById("asset-add-modal").style.display = "flex";
  });

  // Modal save
  var saveBtn = document.getElementById("asset-add-modal-save");
  if (saveBtn) saveBtn.addEventListener("click", addAsset);

  // Modal close / cancel
  var closeBtn  = document.getElementById("asset-add-modal-close");
  var cancelBtn = document.getElementById("asset-add-modal-cancel");
  if (closeBtn)  closeBtn.addEventListener("click", function() {
    document.getElementById("asset-add-modal").style.display = "none";
  });
  if (cancelBtn) cancelBtn.addEventListener("click", function() {
    document.getElementById("asset-add-modal").style.display = "none";
  });

  // Click outside modal to close
  var modal = document.getElementById("asset-add-modal");
  if (modal) modal.addEventListener("click", function(e) {
    if (e.target === modal) modal.style.display = "none";
  });

  // Search & filters
  var search = document.getElementById("assets-search");
  if (search) search.addEventListener("input", loadAssets);

  var fBuilding = document.getElementById("assets-filter-building");
  var fLine     = document.getElementById("assets-filter-line");
  if (fBuilding) fBuilding.addEventListener("change", loadAssets);
  if (fLine)     fLine.addEventListener("change",     loadAssets);

  // Column sort
  document.querySelectorAll("#assets-table th[data-sort]").forEach(function(th) {
    th.addEventListener("click", function() {
      var f = this.dataset.sort;
      if (assetSort.field === f) {
        assetSort.dir = assetSort.dir === "asc" ? "desc" : "asc";
      } else {
        assetSort.field = f; assetSort.dir = "asc";
      }
      loadAssets();
    });
  });

  initAssetColumnToggles();
}

// =========================
// REPORTS
// =========================
async function loadReports() {
  var output = document.getElementById("reportOutput");
  if (output) output.innerHTML = "";

  var genProj = document.getElementById("generateProjectReport");
  var genTask = document.getElementById("generateTaskReport");
  var print   = document.getElementById("printReport");

  if (genProj) genProj.onclick = async function() {
    var projects = await db.projects.toArray();
    var tasks    = await db.tasks.toArray();
    var html = '<h3 style="margin-bottom:1rem;">📁 Project Report</h3>';
    html += '<table class="data-table"><thead><tr>' +
      '<th>Project</th><th>Status</th><th>Priority</th><th>Due Date</th><th>Tasks</th>' +
      '</tr></thead><tbody>';
    projects.forEach(function(p) {
      var tc = tasks.filter(function(t) { return t.projectId === p.id; }).length;
      html += '<tr>' +
        '<td>' + escapeHtml(p.title)    + '</td>' +
        '<td>' + escapeHtml(p.status)   + '</td>' +
        '<td>' + escapeHtml(p.priority) + '</td>' +
        '<td>' + formatDate(p.dueDate)  + '</td>' +
        '<td>' + tc + '</td></tr>';
    });
    html += '</tbody></table>';
    if (output) output.innerHTML = html;
  };

  if (genTask) genTask.onclick = async function() {
    var tasks    = await db.tasks.toArray();
    var projects = await db.projects.toArray();
    var html = '<h3 style="margin-bottom:1rem;">✅ Task Report</h3>';
    html += '<table class="data-table"><thead><tr>' +
      '<th>Task</th><th>Status</th><th>Priority</th>' +
      '<th>Building</th><th>Due Date</th><th>Project</th>' +
      '</tr></thead><tbody>';
    tasks.forEach(function(t) {
      var proj = projects.find(function(p) { return p.id === t.projectId; });
      html += '<tr>' +
        '<td>' + escapeHtml(t.title)    + '</td>' +
        '<td>' + escapeHtml(t.status)   + '</td>' +
        '<td>' + escapeHtml(t.priority) + '</td>' +
        '<td>' + escapeHtml(t.building || "") + '</td>' +
        '<td>' + formatDate(t.dueDate)  + '</td>' +
        '<td>' + escapeHtml(proj ? proj.title : "") + '</td></tr>';
    });
    html += '</tbody></table>';
    if (output) output.innerHTML = html;
  };

  if (print) print.onclick = function() { window.print(); };
}

// =========================
// SETTINGS
// =========================

// FIX #3: guard flag to prevent re-registering event listeners
var settingsInitialized = false;

async function loadSettings() {
  var user = await getCurrentUser();
  var usernameInput = document.getElementById("settings-username");
  if (usernameInput && user) usernameInput.value = user.name;

  var saveBtn = document.getElementById("save-username-btn");
  if (saveBtn) saveBtn.onclick = async function() {
    var newName = usernameInput.value.trim();
    if (!newName) return;
    await db.users.update(user.id, { name: newName });
    alert("Name saved!");
  };

  loadMembers();
  loadContractors();

  if (settingsInitialized) return;
  settingsInitialized = true;

  var addMember = document.getElementById("add-member-btn");
  if (addMember) addMember.onclick = async function() {
    var name  = (document.getElementById("member-name")  || {}).value || "";
    var group = (document.getElementById("member-group") || {}).value || "";
    if (!name.trim()) { alert("Member name required."); return; }
    await db.members.add({ name: name.trim(), group: group.trim() });
    document.getElementById("member-name").value  = "";
    document.getElementById("member-group").value = "";
    loadMembers();
  };

  var addContractor = document.getElementById("add-contractor-btn");
  if (addContractor) addContractor.onclick = async function() {
    var name = (document.getElementById("contractor-name") || {}).value || "";
    if (!name.trim()) { alert("Contractor name required."); return; }
    await db.contractors.add({
      name:    name.trim(),
      company: (document.getElementById("contractor-company") || {}).value || "",
      trade:   (document.getElementById("contractor-trade")   || {}).value || "",
      phone:   (document.getElementById("contractor-phone")   || {}).value || "",
      email:   (document.getElementById("contractor-email")   || {}).value || ""
    });
    ["contractor-name","contractor-company","contractor-trade",
     "contractor-phone","contractor-email"
    ].forEach(function(id) {
      var el = document.getElementById(id); if (el) el.value = "";
    });
    loadContractors();
  };

  var exportBtn = document.getElementById("export-data-btn");
  if (exportBtn) exportBtn.onclick = exportData;

  var importBtn  = document.getElementById("import-data-btn");
  var importFile = document.getElementById("import-file");
  if (importBtn)  importBtn.onclick  = function() { importFile.click(); };
  if (importFile) importFile.onchange = importData;
}

async function loadMembers() {
  var members = await db.members.toArray();
  var list    = document.getElementById("members-list");
  if (!list) return;
  if (members.length === 0) {
    list.innerHTML = '<p style="color:var(--text-muted);font-style:italic;">No members yet.</p>';
    return;
  }
  list.innerHTML = members.map(function(m) {
    return '<div class="member-item">' +
      '<span>' + escapeHtml(m.name) +
        (m.group ? ' <small style="color:var(--text-muted)">(' + escapeHtml(m.group) + ')</small>' : '') +
      '</span>' +
      '<button class="btn-icon btn-delete" onclick="deleteMember(' + m.id + ')">🗑️</button>' +
      '</div>';
  }).join("");
}

async function deleteMember(id) {
  if (!confirm("Delete this member?")) return;
  await db.members.delete(id);
  loadMembers();
}

async function loadContractors() {
  var contractors = await db.contractors.toArray();
  var list        = document.getElementById("contractors-list");
  if (!list) return;
  if (contractors.length === 0) {
    list.innerHTML = '<p style="color:var(--text-muted);font-style:italic;">No contractors yet.</p>';
    return;
  }
  list.innerHTML = contractors.map(function(c) {
    return '<div class="member-item">' +
      '<span>' + escapeHtml(c.name) +
        (c.company ? ' — ' + escapeHtml(c.company) : '') +
        (c.trade   ? ' <small style="color:var(--text-muted)">(' + escapeHtml(c.trade) + ')</small>' : '') +
      '</span>' +
      '<button class="btn-icon btn-delete" onclick="deleteContractor(' + c.id + ')">🗑️</button>' +
      '</div>';
  }).join("");
}

async function deleteContractor(id) {
  if (!confirm("Delete this contractor?")) return;
  await db.contractors.delete(id);
  loadContractors();
}

async function exportData() {
  var data = {
    projects:    await db.projects.toArray(),
    tasks:       await db.tasks.toArray(),
    assets:      await db.assets.toArray(),
    members:     await db.members.toArray(),
    contractors: await db.contractors.toArray(),
    comments:    await db.comments.toArray()
  };
  var blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  var url  = URL.createObjectURL(blob);
  var a    = document.createElement("a");
  a.href   = url;
  a.download = "mbworkstation-backup-" + new Date().toISOString().slice(0,10) + ".json";
  a.click();
  URL.revokeObjectURL(url);
}

async function importData(e) {
  var file = e.target.files[0];
  if (!file) return;
  var text = await file.text();
  var data;
  try { data = JSON.parse(text); } catch(err) { alert("Invalid backup file."); return; }
  if (!confirm("This will replace all current data. Continue?")) return;
  await db.projects.clear();
  await db.tasks.clear();
  await db.assets.clear();
  await db.members.clear();
  await db.contractors.clear();
  await db.comments.clear();
  if (data.projects)    await db.projects.bulkAdd(data.projects);
  if (data.tasks)       await db.tasks.bulkAdd(data.tasks);
  if (data.assets)      await db.assets.bulkAdd(data.assets);
  if (data.members)     await db.members.bulkAdd(data.members);
  if (data.contractors) await db.contractors.bulkAdd(data.contractors);
  if (data.comments)    await db.comments.bulkAdd(data.comments);
  alert("Import successful!");
  location.reload();
}

// =========================
// PWA
// =========================
var deferredPrompt = null;
function initPWA() {
  window.addEventListener("beforeinstallprompt", function(e) {
    e.preventDefault();
    deferredPrompt = e;
    var banner = document.getElementById("pwa-install-banner");
    if (banner) banner.classList.remove("hidden");
  });

  var installBtn = document.getElementById("pwa-install-btn");
  if (installBtn) installBtn.addEventListener("click", function() {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function() { deferredPrompt = null; });
    }
    var banner = document.getElementById("pwa-install-banner");
    if (banner) banner.classList.add("hidden");
  });

  var dismissBtn = document.getElementById("pwa-install-dismiss");
  if (dismissBtn) dismissBtn.addEventListener("click", function() {
    var banner = document.getElementById("pwa-install-banner");
    if (banner) banner.classList.add("hidden");
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").then(function(reg) {
      console.log("SW registered:", reg.scope);
    }).catch(function(err) {
      console.log("SW registration failed:", err);
    });
  }
}

// =========================
// SCHEDULER
// =========================
var calView       = "month";
var calDate       = new Date();
var editingEventId = null;

var eventTypeColors = {
  "Scheduled Work": "#3b82f6",
  "Meeting":        "#8b5cf6",
  "Personal":       "#22c55e",
  "Training":       "#f59e0b",
  "My Schedule":    "#ec4899"
};

var eventTypeChipClass = {
  "Scheduled Work": "chip-scheduled-work",
  "Meeting":        "chip-meeting",
  "Personal":       "chip-personal",
  "Training":       "chip-training",
  "My Schedule":    "chip-my-schedule"
};

function formatTime(timeStr) {
  if (!timeStr) return "";
  var parts = timeStr.split(":");
  var h = parseInt(parts[0]);
  var m = parts[1];
  var ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return h + ":" + m + " " + ampm;
}

async function loadScheduler() {
  updateCalTitle();
  var filterType = (document.getElementById("cal-filter-type") || {}).value || "";
  var allEvents  = await db.events.toArray();
  var allTasks   = await db.tasks.toArray();
  var user       = await getCurrentUser();

  var events = allEvents.filter(function(e) {
    return !filterType || e.type === filterType;
  });

  // "My Schedule" filter also shows tasks assigned to current user
  var myTasks = allTasks.filter(function(t) {
    if (!user) return false;
    return Array.isArray(t.assignedMembers) &&
      t.assignedMembers.includes(user.name);
  });

  if (calView === "month")  renderMonthView(events, myTasks, filterType);
  if (calView === "week")   renderWeekView(events, myTasks, filterType);
  if (calView === "day")    renderDayView(events, myTasks);
}

function updateCalTitle() {
  var el = document.getElementById("cal-title");
  if (!el) return;
  var months = ["January","February","March","April","May","June",
                "July","August","September","October","November","December"];
  if (calView === "month") {
    el.textContent = months[calDate.getMonth()] + " " + calDate.getFullYear();
  } else if (calView === "week") {
    var start = getWeekStart(calDate);
    var end   = new Date(start); end.setDate(end.getDate() + 6);
    el.textContent = months[start.getMonth()] + " " + start.getDate() +
      " – " + months[end.getMonth()] + " " + end.getDate() +
      ", " + end.getFullYear();
  } else {
    var days = ["Sunday","Monday","Tuesday","Wednesday",
                "Thursday","Friday","Saturday"];
    el.textContent = days[calDate.getDay()] + ", " +
      months[calDate.getMonth()] + " " + calDate.getDate() +
      ", " + calDate.getFullYear();
  }
}

function getWeekStart(date) {
  var d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0,0,0,0);
  return d;
}

function dateStr(date) {
  return date.getFullYear() + "-" +
    String(date.getMonth()+1).padStart(2,"0") + "-" +
    String(date.getDate()).padStart(2,"0");
}

function eventOnDate(ev, ds) {
  var start = ev.startDate || "";
  var end   = ev.endDate   || ev.startDate || "";
  return ds >= start && ds <= end;
}

// ---- MONTH VIEW ----
function renderMonthView(events, myTasks, filterType) {
  var grid = document.getElementById("cal-month-grid");
  if (!grid) return;
  grid.innerHTML = "";

  var dayNames = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  dayNames.forEach(function(d) {
    var hdr = document.createElement("div");
    hdr.className = "cal-month-header";
    hdr.textContent = d;
    grid.appendChild(hdr);
  });

  var year  = calDate.getFullYear();
  var month = calDate.getMonth();
  var first = new Date(year, month, 1);
  var last  = new Date(year, month+1, 0);
  var today = dateStr(new Date());

  // Pad start
  for (var i = 0; i < first.getDay(); i++) {
    var blank = document.createElement("div");
    blank.className = "cal-day-cell other-month";
    var prevDay = new Date(year, month, -first.getDay() + i + 1);
    blank.innerHTML = '<div class="cal-day-number">' + prevDay.getDate() + '</div>';
    grid.appendChild(blank);
  }

  // Days of month
  for (var d = 1; d <= last.getDate(); d++) {
    var ds   = dateStr(new Date(year, month, d));
    var cell = document.createElement("div");
    cell.className = "cal-day-cell" + (ds === today ? " today" : "");
    cell.innerHTML = '<div class="cal-day-number">' + d + '</div>';

    // Add event chips
    events.filter(function(e) { return eventOnDate(e, ds); })
      .slice(0, 3)
      .forEach(function(e) {
        var chip = document.createElement("div");
        chip.className = "cal-event-chip " +
          (eventTypeChipClass[e.type] || "chip-scheduled-work");
        chip.textContent = (e.startTime ? formatTime(e.startTime) + " " : "") + e.name;
        cell.appendChild(chip);
      });

    // Add task chips (only if not filtering by type, or type is My Schedule)
    if (!filterType || filterType === "My Schedule") {
      myTasks.filter(function(t) {
        return t.dueDate === ds || t.startDate === ds;
      }).slice(0, 2).forEach(function(t) {
        var chip = document.createElement("div");
        chip.className = "cal-event-chip chip-task";
        chip.textContent = "✅ " + t.title;
        cell.appendChild(chip);
      });
    }

    cell.addEventListener("click", function(ds) {
      return function() { openDayDetail(ds); };
    }(ds));

    grid.appendChild(cell);
  }

  // Pad end
  var remaining = 7 - ((first.getDay() + last.getDate()) % 7);
  if (remaining < 7) {
    for (var j = 1; j <= remaining; j++) {
      var endBlank = document.createElement("div");
      endBlank.className = "cal-day-cell other-month";
      endBlank.innerHTML = '<div class="cal-day-number">' + j + '</div>';
      grid.appendChild(endBlank);
    }
  }
}

// ---- WEEK VIEW ----
function renderWeekView(events, myTasks, filterType) {
  var grid = document.getElementById("cal-week-grid");
  if (!grid) return;
  grid.innerHTML = "";

  var weekStart = getWeekStart(calDate);
  var today     = dateStr(new Date());
  var dayNames  = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

  for (var i = 0; i < 7; i++) {
    var day = new Date(weekStart);
    day.setDate(day.getDate() + i);
    var ds = dateStr(day);

    var col = document.createElement("div");
    col.className = "cal-week-col";

    var hdr = document.createElement("div");
    hdr.className = "cal-week-col-header" + (ds === today ? " today-header" : "");
    hdr.textContent = dayNames[i] + " " + day.getDate();
    col.appendChild(hdr);

    var body = document.createElement("div");
    body.className = "cal-week-col-body";

    events.filter(function(e) { return eventOnDate(e, ds); })
      .forEach(function(e) {
        var chip = document.createElement("div");
        chip.className = "cal-event-chip " +
          (eventTypeChipClass[e.type] || "chip-scheduled-work");
        chip.style.marginBottom = "3px";
        chip.textContent = (e.startTime ? formatTime(e.startTime) + " " : "") + e.name;
        chip.addEventListener("click", function() { openEventModal(e.id); });
        body.appendChild(chip);
      });

    if (!filterType || filterType === "My Schedule") {
      myTasks.filter(function(t) {
        return t.dueDate === ds || t.startDate === ds;
      }).forEach(function(t) {
        var chip = document.createElement("div");
        chip.className = "cal-event-chip chip-task";
        chip.textContent = "✅ " + t.title;
        body.appendChild(chip);
      });
    }

    col.appendChild(body);
    col.addEventListener("click", function(ds) {
      return function(e) {
        if (e.target === col || e.target === body) openDayDetail(ds);
      };
    }(ds));
    grid.appendChild(col);
  }
}

// ---- DAY VIEW ----
function renderDayView(events, myTasks) {
  var container = document.getElementById("cal-day-container");
  if (!container) return;
  container.innerHTML = "";

  var ds = dateStr(calDate);

  var title = document.createElement("div");
  title.className = "cal-day-title";
  title.textContent = calDate.toLocaleDateString("en-US",
    { weekday:"long", month:"long", day:"numeric", year:"numeric" });
  container.appendChild(title);

  var dayEvents = events.filter(function(e) { return eventOnDate(e, ds); });
  var dayTasks  = myTasks.filter(function(t) {
    return t.dueDate === ds || t.startDate === ds;
  });

  if (dayEvents.length === 0 && dayTasks.length === 0) {
    container.innerHTML += '<p style="color:var(--text-muted);font-style:italic;">No events or tasks for this day.</p>';
    return;
  }

  // Sort events by start time
  dayEvents.sort(function(a,b) {
    return (a.startTime || "").localeCompare(b.startTime || "");
  });

  dayEvents.forEach(function(e) {
    var item = document.createElement("div");
    item.className = "cal-day-item";
    item.style.borderLeftColor = eventTypeColors[e.type] || "#3b82f6";
    item.innerHTML =
      '<div class="cal-day-item-time">' +
        (e.startTime ? formatTime(e.startTime) : "All Day") +
        (e.endTime   ? " – " + formatTime(e.endTime) : "") +
      '</div>' +
      '<div>' +
        '<div class="cal-day-item-title">' + escapeHtml(e.name) + '</div>' +
        '<div class="cal-day-item-meta">' +
          escapeHtml(e.type || "") +
          (e.location ? " · 📍 " + escapeHtml(e.location) : "") +
        '</div>' +
      '</div>';
    item.addEventListener("click", function() { openEventModal(e.id); });
    container.appendChild(item);
  });

  dayTasks.forEach(function(t) {
    var item = document.createElement("div");
    item.className = "cal-day-item";
    item.style.borderLeftColor = "#64748b";
    item.innerHTML =
      '<div class="cal-day-item-time">Task</div>' +
      '<div>' +
        '<div class="cal-day-item-title">✅ ' + escapeHtml(t.title) + '</div>' +
        '<div class="cal-day-item-meta">' +
          escapeHtml(t.status || "") +
          (t.dueDate ? " · Due: " + formatDate(t.dueDate) : "") +
        '</div>' +
      '</div>';
    container.appendChild(item);
  });
}

// ---- DAY DETAIL MODAL ----
async function openDayDetail(ds) {
  var modal = document.getElementById("day-detail-modal");
  if (!modal) return;

  var date = new Date(ds + "T00:00:00");
  document.getElementById("day-detail-title").textContent =
    date.toLocaleDateString("en-US",
      { weekday:"long", month:"long", day:"numeric", year:"numeric" });

  var filterType = (document.getElementById("cal-filter-type") || {}).value || "";
  var allEvents  = await db.events.toArray();
  var allTasks   = await db.tasks.toArray();
  var user       = await getCurrentUser();

  var dayEvents = allEvents.filter(function(e) {
    return eventOnDate(e, ds) && (!filterType || e.type === filterType);
  });

  var dayTasks = allTasks.filter(function(t) {
    var onDay = t.dueDate === ds || t.startDate === ds;
    var mine  = user && Array.isArray(t.assignedMembers) &&
      t.assignedMembers.includes(user.name);
    return onDay && (!filterType || filterType === "My Schedule") && mine;
  });

  var evDiv = document.getElementById("day-detail-events");
  var tkDiv = document.getElementById("day-detail-tasks");

  if (dayEvents.length > 0) {
    evDiv.innerHTML = '<div class="day-detail-section-title">📅 Events</div>' +
      dayEvents.map(function(e) {
        return '<div class="day-detail-event-item" data-id="' + e.id + '" ' +
          'style="border-left-color:' + (eventTypeColors[e.type] || "#3b82f6") + '">' +
          '<strong>' + escapeHtml(e.name) + '</strong>' +
          '<span style="font-size:0.8rem;color:var(--text-muted)">' +
            (e.startTime ? formatTime(e.startTime) : "All Day") +
            (e.endTime   ? " – " + formatTime(e.endTime) : "") +
            (e.location  ? " · 📍 " + escapeHtml(e.location) : "") +
          '</span>' +
          '<span style="font-size:0.75rem;color:var(--text-muted)">' +
            escapeHtml(e.type || "") + '</span>' +
        '</div>';
      }).join("");

    evDiv.querySelectorAll(".day-detail-event-item").forEach(function(el) {
      el.addEventListener("click", function() {
        modal.style.display = "none";
        openEventModal(parseInt(this.dataset.id));
      });
    });
  } else {
    evDiv.innerHTML = '<p style="color:var(--text-muted);font-style:italic;font-size:0.9rem;">No events this day.</p>';
  }

  if (dayTasks.length > 0) {
    tkDiv.innerHTML = '<div class="day-detail-section-title">✅ My Tasks</div>' +
      dayTasks.map(function(t) {
        return '<div class="day-detail-event-item" style="border-left-color:#64748b">' +
          '<strong>' + escapeHtml(t.title) + '</strong>' +
          '<span style="font-size:0.8rem;color:var(--text-muted)">' +
            escapeHtml(t.status || "") +
            (t.dueDate ? " · Due: " + formatDate(t.dueDate) : "") +
          '</span>' +
        '</div>';
      }).join("");
  } else {
    tkDiv.innerHTML = "";
  }

  modal.style.display = "flex";
}

// ---- EVENT MODAL (Add / Edit) ----
async function openEventModal(eventId) {
  editingEventId = eventId || null;
  var modal = document.getElementById("event-modal");
  if (!modal) return;

  if (eventId) {
    var ev = await db.events.get(eventId);
    if (!ev) return;
    document.getElementById("event-modal-title").textContent  = "Edit Event";
    document.getElementById("event-name").value               = ev.name       || "";
    document.getElementById("event-start-date").value         = ev.startDate  || "";
    document.getElementById("event-end-date").value           = ev.endDate    || "";
    document.getElementById("event-start-time").value         = ev.startTime  || "";
    document.getElementById("event-end-time").value           = ev.endTime    || "";
    document.getElementById("event-location").value           = ev.location   || "";
    document.getElementById("event-type").value               = ev.type       || "Scheduled Work";
    document.getElementById("event-notes").value              = ev.notes      || "";
  } else {
    document.getElementById("event-modal-title").textContent  = "Add Event";
    ["event-name","event-start-date","event-end-date",
     "event-start-time","event-end-time","event-location","event-notes"
    ].forEach(function(id) { document.getElementById(id).value = ""; });
    document.getElementById("event-type").value = "Scheduled Work";
  }

  modal.style.display = "flex";
}

async function saveEvent() {
  var name = document.getElementById("event-name").value.trim();
  var startDate = document.getElementById("event-start-date").value;
  if (!name)      { alert("Event name is required.");   return; }
  if (!startDate) { alert("Start date is required."); return; }

  var data = {
    name:      name,
    startDate: startDate,
    endDate:   document.getElementById("event-end-date").value  || startDate,
    startTime: document.getElementById("event-start-time").value,
    endTime:   document.getElementById("event-end-time").value,
    location:  document.getElementById("event-location").value.trim(),
    type:      document.getElementById("event-type").value,
    notes:     document.getElementById("event-notes").value.trim()
  };

  if (editingEventId) {
    await db.events.update(editingEventId, data);
  } else {
    await db.events.add(data);
  }

  document.getElementById("event-modal").style.display = "none";
  loadScheduler();
}

function initSchedulerListeners() {
  // ── Add Event button ──────────────────────────────────────
  var addBtn = document.getElementById("add-event-btn");
  if (addBtn) addBtn.addEventListener("click", function() {
    openEventModal(null);
  });

  // ── Save event ────────────────────────────────────────────
  var saveBtn = document.getElementById("event-modal-save");
  if (saveBtn) saveBtn.addEventListener("click", saveEvent);

  // ── Close / cancel event modal ────────────────────────────
  var closeBtn  = document.getElementById("event-modal-close");
  var cancelBtn = document.getElementById("event-modal-cancel");
  if (closeBtn) closeBtn.addEventListener("click", function() {
    document.getElementById("event-modal").style.display = "none";
  });
  if (cancelBtn) cancelBtn.addEventListener("click", function() {
    document.getElementById("event-modal").style.display = "none";
  });

  // ── Click outside event modal to close ───────────────────
  var evModal = document.getElementById("event-modal");
  if (evModal) evModal.addEventListener("click", function(e) {
    if (e.target === evModal) evModal.style.display = "none";
  });

  // ── Day detail modal close ────────────────────────────────
  var ddClose = document.getElementById("day-detail-close");
  if (ddClose) ddClose.addEventListener("click", function() {
    document.getElementById("day-detail-modal").style.display = "none";
  });

  // ── Click outside day detail modal to close ───────────────
  var ddModal = document.getElementById("day-detail-modal");
  if (ddModal) ddModal.addEventListener("click", function(e) {
    if (e.target === ddModal) ddModal.style.display = "none";
  });

  // ── View switcher ─────────────────────────────────────────
  var btnMonth = document.getElementById("cal-view-month");
  var btnWeek  = document.getElementById("cal-view-week");
  var btnDay   = document.getElementById("cal-view-day");

  function setView(view) {
    calView = view;
    document.getElementById("cal-month-view").style.display =
      view === "month" ? "" : "none";
    document.getElementById("cal-week-view").style.display  =
      view === "week"  ? "" : "none";
    document.getElementById("cal-day-view").style.display   =
      view === "day"   ? "" : "none";
    [btnMonth, btnWeek, btnDay].forEach(function(b) {
      if (b) b.classList.remove("active-view");
    });
    if (view === "month" && btnMonth) btnMonth.classList.add("active-view");
    if (view === "week"  && btnWeek)  btnWeek.classList.add("active-view");
    if (view === "day"   && btnDay)   btnDay.classList.add("active-view");
    loadScheduler();
  }

  if (btnMonth) btnMonth.addEventListener("click", function() { setView("month"); });
  if (btnWeek)  btnWeek.addEventListener("click",  function() { setView("week");  });
  if (btnDay)   btnDay.addEventListener("click",   function() { setView("day");   });

  // ── Prev / Next / Today ───────────────────────────────────
  var prevBtn  = document.getElementById("cal-prev");
  var nextBtn  = document.getElementById("cal-next");
  var todayBtn = document.getElementById("cal-today");

  if (prevBtn) prevBtn.addEventListener("click", function() {
    var d = new Date(calDate);
    if (calView === "month") d.setMonth(d.getMonth() - 1);
    if (calView === "week")  d.setDate(d.getDate()   - 7);
    if (calView === "day")   d.setDate(d.getDate()   - 1);
    calDate = d;
    loadScheduler();
  });

  if (nextBtn) nextBtn.addEventListener("click", function() {
    var d = new Date(calDate);
    if (calView === "month") d.setMonth(d.getMonth() + 1);
    if (calView === "week")  d.setDate(d.getDate()   + 7);
    if (calView === "day")   d.setDate(d.getDate()   + 1);
    calDate = d;
    loadScheduler();
  });

  if (todayBtn) todayBtn.addEventListener("click", function() {
    calDate = new Date();
    loadScheduler();
  });

  // ── Filter by Entry Type ──────────────────────────────────
  var filterSel = document.getElementById("cal-filter-type");
  if (filterSel) filterSel.addEventListener("click", loadScheduler);
}

// =========================
// INIT APP
// =========================
async function initApp(user) {
  var appShell = document.getElementById("app-shell");
  if (appShell) appShell.style.display = "flex";

  var themeBtn = document.getElementById("theme-toggle");
  if (themeBtn) themeBtn.addEventListener("click", toggleTheme);

  var logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) logoutBtn.addEventListener("click", logoutUser);

  initNavigation();
  initProjectListeners();
  initTaskListeners();
  initAssetListeners();
  initSchedulerListeners(); // ← THIS WAS MISSING

  await loadDashboard();
  await populateTaskLineFilter();
}

// =========================
// BOOT
// =========================
document.addEventListener("DOMContentLoaded", async function() {
  initTheme();
  initPWA();
  var user = await initLoginScreen();
  if (user) await initApp(user);
});