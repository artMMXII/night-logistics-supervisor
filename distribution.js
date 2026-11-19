(() => {
  "use strict";

  const STORAGE_KEY = "night-logistics-dispatch-v1";
  const INVENTORY_KEY = "night-logistics-v1";
  const COMMON_DEPARTMENTS = [2, 6, 7, 14];
  const ALL_DEPARTMENTS = Array.from({ length: 15 }, (_, index) => index + 1);
  const DEFAULT_EMPLOYEES = [
    { id: "emp-a", name: "Сотрудник А", departments: [13, 12] },
    { id: "emp-b", name: "Сотрудник Б", departments: [4, 3] },
    { id: "emp-c", name: "Сотрудник В", departments: [5, 15] },
    { id: "emp-d", name: "Сотрудник Г", departments: [8] },
    { id: "emp-e", name: "Сотрудник Д", departments: [9] },
    { id: "emp-f", name: "Сотрудник Е", departments: [11, 10] },
    { id: "emp-g", name: "Сотрудник Ж", departments: [1] }
  ];

  const $ = (id) => document.getElementById(id);
  const setupRoot = $("employeeSetup");
  const taskRoot = $("mainDepartments");
  const boardRoot = $("employeeBoard");
  const commonRoot = $("commonDepartments");
  let setupExpanded = true;
  let state = loadState();

  function freshState() {
    return {
      employees: DEFAULT_EMPLOYEES.map((employee) => ({ ...employee, departments: [...employee.departments] })),
      completedDepartments: [],
      helpers: {},
      commonAssignments: {},
      activity: []
    };
  }

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (!saved || !Array.isArray(saved.employees)) return freshState();
      return {
        employees: saved.employees.map((employee, index) => ({
          id: String(employee.id || `emp-${index + 1}`),
          name: String(employee.name || `Сотрудник ${index + 1}`),
          departments: Array.isArray(employee.departments)
            ? employee.departments.map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 15)
            : []
        })),
        completedDepartments: Array.isArray(saved.completedDepartments)
          ? saved.completedDepartments.map(Number).filter((n) => ALL_DEPARTMENTS.includes(n)) : [],
        helpers: saved.helpers && typeof saved.helpers === "object" ? saved.helpers : {},
        commonAssignments: saved.commonAssignments && typeof saved.commonAssignments === "object" ? saved.commonAssignments : {},
        activity: Array.isArray(saved.activity) ? saved.activity : []
      };
    } catch {
      return freshState();
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function log(message) {
    state.activity.unshift({ at: new Date().toISOString(), message });
    state.activity = state.activity.slice(0, 40);
    saveState();
  }

  function employeeById(id) {
    return state.employees.find((employee) => employee.id === id);
  }

  function ownerOfDepartment(department) {
    return state.employees.find((employee) => employee.departments.includes(department));
  }

  function isDepartmentDone(department) {
    return state.completedDepartments.includes(Number(department));
  }

  function helperDepartment(employeeId) {
    return Object.entries(state.helpers).find(([, helperId]) => helperId === employeeId)?.[0] || null;
  }

  function employeeStatus(employee) {
    const helping = helperDepartment(employee.id);
    if (helping) return { type: "help", label: `Помогает в отделе ${helping}`, detail: `Помощник отдела ${helping}` };
    if (state.commonAssignments[employee.id]) {
      const department = state.commonAssignments[employee.id];
      return { type: "common", label: `Общая зона · отдел ${department}`, detail: `Работает в общей зоне, отдел ${department}` };
    }
    const unfinished = employee.departments.filter((department) => !isDepartmentDone(department));
    if (employee.departments.length && unfinished.length) {
      const completed = employee.departments.length - unfinished.length;
      return {
        type: "main",
        label: "Основная работа",
        detail: `Осталось: ${unfinished.join(", ")}` + (completed ? ` · завершено ${completed} из ${employee.departments.length}` : "")
      };
    }
    if (!employee.departments.length) return { type: "free", label: "Не назначен", detail: "Можно назначить в общую зону или изменить закрепление" };
    return { type: "free", label: "Свободен", detail: "Основные отделы завершены" };
  }

  function isAvailable(employee) {
    return employeeStatus(employee).type === "free";
  }

  function inventoryCounts() {
    try {
      const saved = JSON.parse(localStorage.getItem(INVENTORY_KEY) || "null");
      if (!saved || typeof saved !== "object") return null;
      const counts = {};
      ALL_DEPARTMENTS.forEach((department) => {
        const item = saved[department] || saved[String(department)] || {};
        const incoming = Number(item.incoming) || 0;
        const returns = Number(item.returns) || 0;
        counts[department] = Math.max(0, incoming) + Math.max(0, returns);
      });
      return Object.values(counts).some((count) => count > 0) ? counts : null;
    } catch {
      return null;
    }
  }

  function eligibleHelpDepartments(employee) {
    const counts = inventoryCounts();
    return state.employees
      .flatMap((owner) => owner.departments.map((department) => ({ department, owner })))
      .filter(({ department, owner }) =>
        owner.id !== employee.id &&
        !isDepartmentDone(department) &&
        !state.helpers[String(department)] &&
        !state.commonAssignments[employee.id]
      )
      .sort((a, b) => {
        if (counts) return (counts[b.department] || 0) - (counts[a.department] || 0) || a.department - b.department;
        return a.department - b.department;
      });
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[character]);
  }

  function renderSetup() {
    setupRoot.innerHTML = "";
    state.employees.forEach((employee) => {
      const row = document.createElement("div");
      row.className = "setup-row";
      row.dataset.employeeId = employee.id;
      row.innerHTML = `
        <input class="employee-name-input" aria-label="Имя сотрудника" value="${escapeHtml(employee.name)}" placeholder="Имя сотрудника">
        <input class="employee-departments-input" aria-label="Основные отделы" value="${employee.departments.join(", ")}" placeholder="Например: 13, 12">
        <button type="button" class="remove-employee" aria-label="Удалить сотрудника" title="Удалить сотрудника">×</button>`;
      row.querySelector(".remove-employee").addEventListener("click", () => {
        if (!confirm(`Удалить ${employee.name} из текущей схемы?`)) return;
        state.employees = state.employees.filter((item) => item.id !== employee.id);
        delete state.commonAssignments[employee.id];
        Object.keys(state.helpers).forEach((department) => {
          if (state.helpers[department] === employee.id) delete state.helpers[department];
        });
        saveState();
        renderAll();
      });
      setupRoot.appendChild(row);
    });
  }

  function parseDepartments(raw) {
    if (!raw.trim()) return [];
    const parts = raw.split(/[;,\s]+/).filter(Boolean);
    const values = parts.map(Number);
    if (values.some((number) => !Number.isInteger(number) || number < 1 || number > 15)) {
      throw new Error("В отделах допустимы только номера от 1 до 15.");
    }
    if (new Set(values).size !== values.length) throw new Error("В одном закреплении номер отдела не должен повторяться.");
    return values;
  }

  function saveSetup() {
    const rows = [...setupRoot.querySelectorAll(".setup-row")];
    const proposed = [];
    const usedDepartments = new Map();
    try {
      rows.forEach((row, index) => {
        const old = employeeById(row.dataset.employeeId);
        const name = row.querySelector(".employee-name-input").value.trim() || `Сотрудник ${index + 1}`;
        const departments = parseDepartments(row.querySelector(".employee-departments-input").value);
        departments.forEach((department) => {
          if (usedDepartments.has(department)) throw new Error(`Отдел ${department} указан у нескольких сотрудников.`);
          usedDepartments.set(department, name);
        });
        proposed.push({ id: old?.id || `emp-${Date.now()}-${index}`, name, departments });
      });
    } catch (error) {
      $("setupStatus").textContent = error.message;
      $("setupStatus").style.color = "#a33b3b";
      return;
    }

    const hasProgress = state.completedDepartments.length || Object.keys(state.helpers).length || Object.keys(state.commonAssignments).length;
    if (hasProgress && !confirm("Изменение закреплений сбросит текущие отметки о завершении и распределении. Продолжить?")) return;

    state.employees = proposed;
    state.completedDepartments = [];
    state.helpers = {};
    state.commonAssignments = {};
    log("Обновлены основные закрепления сотрудников");
    $("setupStatus").style.color = "#147447";
    $("setupStatus").textContent = "Закрепления сохранены. Текущие отметки смены сброшены.";
    renderAll();
  }

  function renderTasks() {
    taskRoot.innerHTML = "";
    const departments = [...new Set(state.employees.flatMap((employee) => employee.departments))].sort((a, b) => a - b);
    if (!departments.length) {
      taskRoot.innerHTML = '<p class="empty-note">Пока нет основных закреплений. Добавь сотрудников и отделы выше.</p>';
      return;
    }
    departments.forEach((department) => {
      const owner = ownerOfDepartment(department);
      const helperId = state.helpers[String(department)];
      const helper = helperId ? employeeById(helperId) : null;
      const done = isDepartmentDone(department);
      const isZ = department === 10;
      const card = document.createElement("div");
      card.className = `task-card${done ? " is-done" : ""}`;
      card.innerHTML = `
        <div class="task-number">${department}</div>
        <div class="task-info">
          <strong>Отдел ${department}${isZ ? " · пополнение с Z" : ""}</strong>
          <span>${owner ? `Основной: ${escapeHtml(owner.name)}` : "Без закреплённого сотрудника"}${helper ? ` · Помощник: ${escapeHtml(helper.name)}` : " · Помощника нет"}</span>
          ${done ? '<span class="state-pill free">Завершён</span>' : '<span class="state-pill">В работе</span>'}
        </div>
        <div class="task-actions">${done ? '<span class="state-pill free">Готово</span>' : '<button type="button" class="done-button">Отдел завершён</button>'}</div>`;
      const button = card.querySelector(".done-button");
      if (button) button.addEventListener("click", () => completeDepartment(department));
      taskRoot.appendChild(card);
    });
  }

  function completeDepartment(department) {
    if (isDepartmentDone(department)) return;
    const owner = ownerOfDepartment(department);
    const helperId = state.helpers[String(department)];
    state.completedDepartments.push(department);
    delete state.helpers[String(department)];
    log(`Завершён отдел ${department}${owner ? ` (${owner.name})` : ""}${helperId && employeeById(helperId) ? `; освобождён помощник ${employeeById(helperId).name}` : ""}`);
    renderAll();
  }

  function assignHelp(employeeId, department) {
    const employee = employeeById(employeeId);
    const owner = ownerOfDepartment(department);
    if (!employee || !owner || !isAvailable(employee) || owner.id === employee.id || isDepartmentDone(department) || state.helpers[String(department)]) return;
    delete state.commonAssignments[employeeId];
    state.helpers[String(department)] = employeeId;
    log(`${employee.name} направлен помогать в отдел ${department}`);
    renderAll();
  }

  function assignCommon(employeeId, department) {
    const employee = employeeById(employeeId);
    if (!employee || !isAvailable(employee) || !COMMON_DEPARTMENTS.includes(Number(department))) return;
    state.commonAssignments[employeeId] = Number(department);
    log(`${employee.name} направлен в общую зону, отдел ${department}`);
    renderAll();
  }

  function releaseEmployee(employee) {
    if (!employee || employeeStatus(employee).type !== "main") return;
    const unfinished = employee.departments.filter((department) => !isDepartmentDone(department));
    if (!confirm(`Отметить основные отделы ${unfinished.join(", ")} как завершённые и освободить сотрудника ${employee.name}?`)) return;
    unfinished.forEach((department) => {
      state.completedDepartments.push(department);
      delete state.helpers[String(department)];
    });
    log(`${employee.name} отмечен как освободившийся; завершены отделы ${unfinished.join(", ")}`);
    renderAll();
  }

  function finishCommon(employeeId) {
    const employee = employeeById(employeeId);
    if (!employee || !state.commonAssignments[employeeId]) return;
    const department = state.commonAssignments[employeeId];
    delete state.commonAssignments[employeeId];
    log(`${employee.name} завершил задачу в общей зоне, отдел ${department}`);
    renderAll();
  }

  function renderBoard() {
    boardRoot.innerHTML = "";
    if (!state.employees.length) {
      boardRoot.innerHTML = '<p class="empty-note">Добавь сотрудников в блоке основных закреплений.</p>';
      return;
    }
    const counts = inventoryCounts();
    state.employees.forEach((employee) => {
      const status = employeeStatus(employee);
      const card = document.createElement("article");
      card.className = "employee-card";
      const mainText = employee.departments.length ? `Основные отделы: ${employee.departments.join(" → ")}` : "Основные отделы не назначены";
      card.innerHTML = `
        <h3>${escapeHtml(employee.name)}</h3>
        <div class="employee-state">${escapeHtml(status.detail)}</div>
        <span class="state-pill ${status.type === "free" ? "free" : status.type === "help" ? "help" : status.type === "common" ? "common" : ""}">${escapeHtml(status.label)}</span>
        <div class="employee-meta">${escapeHtml(mainText)}</div>
        <div class="employee-actions"></div>`;
      const actions = card.querySelector(".employee-actions");

      if (status.type === "main") {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "release-button";
        button.textContent = "Освободился";
        button.addEventListener("click", () => releaseEmployee(employee));
        actions.appendChild(button);
      } else if (status.type === "help") {
        const note = document.createElement("div");
        note.className = "empty-note";
        note.textContent = "Ожидает завершения отдела основным сотрудником.";
        actions.appendChild(note);
      } else if (status.type === "common") {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "release-button";
        button.textContent = "Завершил задачу в общей зоне";
        button.addEventListener("click", () => finishCommon(employee.id));
        actions.appendChild(button);
      } else {
        const eligible = eligibleHelpDepartments(employee);
        if (eligible.length) {
          const suggestion = eligible[0];
          const select = document.createElement("select");
          select.className = "assign-select";
          select.setAttribute("aria-label", `Выбрать отдел для помощи сотруднику ${employee.name}`);
          eligible.forEach(({ department, owner }) => {
            const option = document.createElement("option");
            option.value = department;
            const countText = counts ? ` · ${counts[department] || 0} паллет` : "";
            option.textContent = `Отдел ${department} — ${owner.name}${countText}`;
            select.appendChild(option);
          });
          const label = document.createElement("div");
          label.className = "empty-note";
          label.textContent = counts
            ? `Предложение: отдел ${suggestion.department} — наибольший остаток по ведомости.`
            : `Предложение: отдел ${suggestion.department}. Остатки не заполнены — можно выбрать вручную.`;
          const row = document.createElement("div");
          row.className = "assign-row";
          const button = document.createElement("button");
          button.type = "button";
          button.className = "assign-button";
          button.textContent = "Назначить";
          button.addEventListener("click", () => assignHelp(employee.id, Number(select.value)));
          row.append(select, button);
          actions.append(label, row);
        } else {
          const select = document.createElement("select");
          select.className = "assign-select";
          select.setAttribute("aria-label", `Выбрать отдел общей зоны для ${employee.name}`);
          COMMON_DEPARTMENTS.forEach((department) => {
            const option = document.createElement("option");
            option.value = department;
            option.textContent = `Общая зона · отдел ${department}`;
            select.appendChild(option);
          });
          const button = document.createElement("button");
          button.type = "button";
          button.className = "assign-button";
          button.textContent = "В общую зону";
          button.addEventListener("click", () => assignCommon(employee.id, Number(select.value)));
          actions.append(select, button);
        }
      }
      boardRoot.appendChild(card);
    });
  }

  function renderCommon() {
    commonRoot.innerHTML = "";
    COMMON_DEPARTMENTS.forEach((department) => {
      const card = document.createElement("div");
      card.className = "common-card";
      const people = state.employees.filter((employee) => Number(state.commonAssignments[employee.id]) === department);
      card.innerHTML = `<h3>Отдел ${department}</h3><p>${department === 2 ? "Столярка · габаритный товар" : department === 6 ? "Общая зона" : department === 7 ? "Чуть более трудоёмкий участок" : "Переменный объём поступлений"}</p><div class="common-people"></div>`;
      const peopleRoot = card.querySelector(".common-people");
      if (!people.length) {
        const empty = document.createElement("div");
        empty.className = "empty-note";
        empty.textContent = "Пока никого нет";
        peopleRoot.appendChild(empty);
      } else {
        people.forEach((employee) => {
          const chip = document.createElement("span");
          chip.className = "person-chip";
          chip.textContent = employee.name;
          const finish = document.createElement("button");
          finish.type = "button";
          finish.setAttribute("aria-label", `Освободить ${employee.name}`);
          finish.textContent = "×";
          finish.addEventListener("click", () => finishCommon(employee.id));
          chip.appendChild(finish);
          peopleRoot.appendChild(chip);
        });
      }
      commonRoot.appendChild(card);
    });
  }

  function renderSummary() {
    const main = state.employees.filter((employee) => employeeStatus(employee).type === "main").length;
    const free = state.employees.filter((employee) => employeeStatus(employee).type === "free").length;
    const active = state.employees.length - main - free;
    $("countMain").textContent = main;
    $("countFree").textContent = free;
    $("countActive").textContent = active;
  }

  function renderAll() {
    renderSetup();
    renderTasks();
    renderBoard();
    renderCommon();
    renderSummary();
    saveState();
  }

  $("addEmployee").addEventListener("click", () => {
    const id = `emp-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    state.employees.push({ id, name: `Сотрудник ${state.employees.length + 1}`, departments: [] });
    saveState();
    renderSetup();
    const inputs = setupRoot.querySelectorAll(".employee-name-input");
    inputs[inputs.length - 1]?.focus();
  });

  $("saveSetup").addEventListener("click", saveSetup);

  $("toggleSetup").addEventListener("click", () => {
    setupExpanded = !setupExpanded;
    $("setupContent").hidden = !setupExpanded;
    $("toggleSetup").textContent = setupExpanded ? "Свернуть" : "Изменить";
  });

  $("resetShift").addEventListener("click", () => {
    if (!confirm("Начать новую смену? Все отметки о завершении, помощи и общей зоне будут очищены. Список сотрудников и закрепления сохранятся.")) return;
    state.completedDepartments = [];
    state.helpers = {};
    state.commonAssignments = {};
    state.activity = [];
    saveState();
    renderAll();
  });

  renderAll();

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
  }
})();
