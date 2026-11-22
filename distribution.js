(() => {
  "use strict";

  const STORAGE_KEY = "night-logistics-dispatch-v1";
  const INVENTORY_KEY = "night-logistics-v1";
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
      assignments: {},
      activity: []
    };
  }

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (!saved || !Array.isArray(saved.employees)) return freshState();

      const employees = saved.employees.map((employee, index) => ({
        id: String(employee.id || `emp-${index + 1}`),
        name: String(employee.name || `Сотрудник ${index + 1}`),
        departments: Array.isArray(employee.departments)
          ? employee.departments.map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 15)
          : []
      }));
      const completedDepartments = Array.isArray(saved.completedDepartments)
        ? saved.completedDepartments.map(Number).filter((n) => ALL_DEPARTMENTS.includes(n))
        : [];
      const assignments = {};

      // Новая структура назначений: сотрудник -> отдел.
      if (saved.assignments && typeof saved.assignments === "object") {
        Object.entries(saved.assignments).forEach(([employeeId, department]) => {
          const number = Number(department);
          if (employees.some((employee) => employee.id === employeeId) &&
              ALL_DEPARTMENTS.includes(number) && !completedDepartments.includes(number)) {
            assignments[employeeId] = number;
          }
        });
      }

      // Перенос назначений из старой версии, где помощь и общие зоны хранились отдельно.
      if (saved.helpers && typeof saved.helpers === "object") {
        Object.entries(saved.helpers).forEach(([department, employeeId]) => {
          const number = Number(department);
          if (employees.some((employee) => employee.id === employeeId) &&
              ALL_DEPARTMENTS.includes(number) && !completedDepartments.includes(number) &&
              assignments[employeeId] === undefined) {
            assignments[employeeId] = number;
          }
        });
      }
      if (saved.commonAssignments && typeof saved.commonAssignments === "object") {
        Object.entries(saved.commonAssignments).forEach(([employeeId, department]) => {
          const number = Number(department);
          if (employees.some((employee) => employee.id === employeeId) &&
              ALL_DEPARTMENTS.includes(number) && !completedDepartments.includes(number) &&
              assignments[employeeId] === undefined) {
            assignments[employeeId] = number;
          }
        });
      }

      return {
        employees,
        completedDepartments,
        assignments,
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
    return state.employees.find((employee) => employee.departments.includes(Number(department)));
  }

  function employeesAssignedToDepartment(department) {
    return state.employees.filter((employee) => Number(state.assignments[employee.id]) === Number(department));
  }

  function isDepartmentDone(department) {
    return state.completedDepartments.includes(Number(department));
  }

  function employeeStatus(employee) {
    const assignedDepartment = state.assignments[employee.id];
    if (assignedDepartment) {
      return {
        type: "assigned",
        label: `Назначен в отдел ${assignedDepartment}`,
        detail: `Работает в отделе ${assignedDepartment}`
      };
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

    if (!employee.departments.length) {
      return { type: "free", label: "Не назначен", detail: "Можно направить в любой незавершённый отдел" };
    }
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

  function eligibleDepartments() {
    // Все отделы равноправны: нет отдельной категории и автоматического приоритета.
    return ALL_DEPARTMENTS.filter((department) => !isDepartmentDone(department));
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
        delete state.assignments[employee.id];
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

    const hasProgress = state.completedDepartments.length || Object.keys(state.assignments).length;
    if (hasProgress && !confirm("Изменение закреплений сбросит текущие отметки о завершении и распределении. Продолжить?")) return;

    state.employees = proposed;
    state.completedDepartments = [];
    state.assignments = {};
    log("Обновлены основные закрепления сотрудников");
    $("setupStatus").style.color = "#147447";
    $("setupStatus").textContent = "Закрепления сохранены. Текущие отметки смены сброшены.";
    renderAll();
  }

  function renderTasks() {
    taskRoot.innerHTML = "";
    const counts = inventoryCounts();

    ALL_DEPARTMENTS.forEach((department) => {
      const owner = ownerOfDepartment(department);
      const assigned = employeesAssignedToDepartment(department);
      const done = isDepartmentDone(department);
      const card = document.createElement("div");
      card.className = `task-card${done ? " is-done" : ""}`;
      const ownerText = owner ? `Основной: ${escapeHtml(owner.name)}` : "Основной сотрудник не закреплён";
      const assignedText = assigned.length
        ? ` · Дополнительно: ${assigned.map((employee) => escapeHtml(employee.name)).join(", ")}`
        : " · Дополнительно никто не назначен";
      const countText = counts ? `<span>${counts[department] || 0} паллет по ведомости</span>` : "";

      card.innerHTML = `
        <div class="task-number">${department}</div>
        <div class="task-info">
          <strong>Отдел ${department}${department === 10 ? " · пополнение с Z" : ""}</strong>
          <span>${ownerText}${assignedText}</span>
          ${countText}
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
    const released = employeesAssignedToDepartment(department);
    state.completedDepartments.push(Number(department));
    released.forEach((employee) => delete state.assignments[employee.id]);
    const releasedText = released.length
      ? `; освобождены: ${released.map((employee) => employee.name).join(", ")}`
      : "";
    log(`Завершён отдел ${department}${owner ? ` (${owner.name})` : ""}${releasedText}`);
    renderAll();
  }

  function assignEmployee(employeeId, department) {
    const employee = employeeById(employeeId);
    const number = Number(department);
    if (!employee || !isAvailable(employee) || !ALL_DEPARTMENTS.includes(number) || isDepartmentDone(number)) return;

    state.assignments[employeeId] = number;
    log(`${employee.name} направлен в отдел ${number}`);
    renderAll();
  }

  function releaseEmployee(employee) {
    if (!employee || employeeStatus(employee).type !== "main") return;
    const unfinished = employee.departments.filter((department) => !isDepartmentDone(department));
    if (!confirm(`Отметить основные отделы ${unfinished.join(", ")} как завершённые и освободить сотрудника ${employee.name}?`)) return;

    unfinished.forEach((department) => {
      state.completedDepartments.push(department);
      employeesAssignedToDepartment(department).forEach((assignedEmployee) => {
        delete state.assignments[assignedEmployee.id];
      });
    });

    log(`${employee.name} отмечен как освободившийся; завершены отделы ${unfinished.join(", ")}`);
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
      const mainText = employee.departments.length
        ? `Основные отделы: ${employee.departments.join(" → ")}`
        : "Основные отделы не назначены";
      const pillClass = status.type === "free" ? "free" : status.type === "assigned" ? "help" : "";

      card.innerHTML = `
        <h3>${escapeHtml(employee.name)}</h3>
        <div class="employee-state">${escapeHtml(status.detail)}</div>
        <span class="state-pill ${pillClass}">${escapeHtml(status.label)}</span>
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
      } else if (status.type === "assigned") {
        const note = document.createElement("div");
        note.className = "empty-note";
        note.textContent = `Сотрудник освободится после завершения отдела ${state.assignments[employee.id]}.`;
        actions.appendChild(note);
      } else {
        const eligible = eligibleDepartments();
        if (!eligible.length) {
          const note = document.createElement("div");
          note.className = "empty-note";
          note.textContent = "Все отделы завершены.";
          actions.appendChild(note);
        } else {
          const select = document.createElement("select");
          select.className = "assign-select";
          select.setAttribute("aria-label", `Выбрать отдел для сотрудника ${employee.name}`);
          eligible.forEach((department) => {
            const option = document.createElement("option");
            option.value = department;
            const countText = counts ? ` · ${counts[department] || 0} паллет` : "";
            const owner = ownerOfDepartment(department);
            const ownerText = owner ? ` · основной: ${owner.name}` : " · без основного";
            option.textContent = `Отдел ${department}${ownerText}${countText}`;
            select.appendChild(option);
          });

          const row = document.createElement("div");
          row.className = "assign-row";
          const button = document.createElement("button");
          button.type = "button";
          button.className = "assign-button";
          button.textContent = "Направить";
          button.addEventListener("click", () => assignEmployee(employee.id, Number(select.value)));
          row.append(select, button);
          actions.appendChild(row);
        }
      }

      boardRoot.appendChild(card);
    });
  }

  function renderCommon() {
    // Контейнер сохранён для совместимости с текущей HTML-разметкой.
    // Теперь в нём показываются назначения по всем отделам, а не только по четырём общим зонам.
    commonRoot.innerHTML = "";
    ALL_DEPARTMENTS.forEach((department) => {
      const card = document.createElement("div");
      card.className = "common-card";
      const people = employeesAssignedToDepartment(department);
      card.innerHTML = `<h3>Отдел ${department}</h3><div class="common-people"></div>`;
      const peopleRoot = card.querySelector(".common-people");

      if (!people.length) {
        const empty = document.createElement("div");
        empty.className = "empty-note";
        empty.textContent = "Никто дополнительно не назначен";
        peopleRoot.appendChild(empty);
      } else {
        people.forEach((employee) => {
          const chip = document.createElement("span");
          chip.className = "person-chip";
          chip.textContent = employee.name;
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
    if (!confirm("Начать новую смену? Все отметки о завершении и распределении сотрудников будут очищены. Список сотрудников и закрепления сохранятся.")) return;
    state.completedDepartments = [];
    state.assignments = {};
    state.activity = [];
    saveState();
    renderAll();
  });

  renderAll();

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
  }
})();
