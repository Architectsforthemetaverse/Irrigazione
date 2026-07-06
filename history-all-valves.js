const FIELD_VALVE_IDS = DEFAULT_VALVES
  .filter((valve) => !isGeneralValve(valve))
  .map((valve) => valve.id);
const DECLARED_HISTORY_CYCLES = [
  { start: "2026-05-28", end: "2026-06-03", complete: true },
  { start: "2026-06-06", end: "2026-06-12", complete: true },
  { start: "2026-06-16", end: "2026-06-20", complete: true },
  { start: "2026-06-27", end: "2026-06-29", complete: true },
  { start: "2026-07-01", end: "2026-07-01", complete: true },
  { start: "2026-07-05", end: null, complete: false }
];
const FALLBACK_STOP_DAYS_BETWEEN_CYCLE_EVENTS = 4;

function renderHistory() {
  const cycles = getHistoryCycles();
  const currentCycle = cycles.find((cycle) => !cycle.complete) || null;
  const previousCycles = cycles.filter((cycle) => cycle.complete).reverse();

  historyCount.textContent = currentCycle
    ? `Ciclo in corso dal ${formatShortDate(new Date(currentCycle.startAt))}`
    : "Nessun ciclo in corso";

  const previousButton = createHistoryNavButton("PRECEDENTI", () => renderPreviousCycles(previousCycles));

  if (!currentCycle) {
    const empty = document.createElement("div");
    empty.className = "history-empty";
    empty.textContent = previousCycles.length
      ? "Nessun movimento nel ciclo attuale"
      : "Nessuna apertura registrata";
    historyList.replaceChildren(previousButton, empty);
    return;
  }

  historyList.replaceChildren(
    previousButton,
    ...createCycleDayCards(currentCycle)
  );
}

function renderPreviousCycles(previousCycles) {
  historyCount.textContent = "Cicli precedenti";
  const content = [createHistoryNavButton("TORNA AL CICLO ATTUALE", renderHistory)];

  if (previousCycles.length > 0) {
    const groups = groupCyclesByMonth(previousCycles);
    content.push(...groups.map(createCycleMonthGroup));
  }

  if (content.length === 1) {
    const empty = document.createElement("div");
    empty.className = "history-empty";
    empty.textContent = "Nessuna data precedente archiviata";
    historyList.replaceChildren(...content, empty);
    return;
  }

  historyList.replaceChildren(...content);
}

function renderArchivedCycle(cycle, previousCycles) {
  const cards = createCycleDayCards(cycle);
  const empty = document.createElement("div");
  empty.className = "history-empty";
  empty.textContent = "Nessun movimento salvato per questo ciclo";

  historyCount.textContent = `Ciclo ${formatCycleFullLabel(cycle)}`;
  historyList.replaceChildren(
    createHistoryNavButton("TORNA AI PRECEDENTI", () => renderPreviousCycles(previousCycles)),
    ...(cards.length ? cards : [empty])
  );
}

function getHistoryCycles() {
  const sortedEvents = [...historyEvents]
    .filter((event) => event && event.at && event.action)
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  const declaredCycles = createDeclaredCycles(sortedEvents);
  const unassignedEvents = sortedEvents.filter((event) => !findDeclaredCycleForEvent(event));
  const fallbackCycles = createFallbackCycles(unassignedEvents);

  return [...declaredCycles, ...fallbackCycles]
    .filter((cycle) => cycle.events.length > 0 || cycle.declared)
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
}

function createDeclaredCycles(sortedEvents) {
  return DECLARED_HISTORY_CYCLES.map((config) => {
    const events = sortedEvents.filter((event) => isEventInDeclaredCycle(event, config));
    const lastAt = events.length ? events[events.length - 1].at : declaredCycleEndAt(config);

    return {
      startAt: `${config.start}T00:00:00`,
      endAt: config.end ? `${config.end}T23:59:59` : lastAt,
      complete: config.complete,
      declared: true,
      events,
      lastAt
    };
  });
}

function createFallbackCycles(sortedEvents) {
  const cycles = [];
  let currentCycle = null;

  sortedEvents.forEach((event) => {
    if (currentCycle && shouldStartNewCycle(currentCycle, event)) {
      finishCurrentCycle();
    }

    if (!currentCycle) {
      currentCycle = {
        startAt: event.at,
        endAt: null,
        complete: false,
        events: [],
        lastAt: event.at
      };
    }

    currentCycle.events.push(event);
    currentCycle.lastAt = event.at;
  });

  if (currentCycle) {
    finishCurrentCycle();
  }

  cycles.forEach((cycle, index) => {
    const isFollowedByAnotherCycle = index < cycles.length - 1;
    cycle.complete = isFollowedByAnotherCycle || isCycleComplete(cycle);
  });

  return cycles;

  function finishCurrentCycle() {
    if (!currentCycle) return;
    currentCycle.endAt = getCycleLastAt(currentCycle);
    cycles.push(currentCycle);
    currentCycle = null;
  }
}

function findDeclaredCycleForEvent(event) {
  return DECLARED_HISTORY_CYCLES.find((cycle) => isEventInDeclaredCycle(event, cycle));
}

function isEventInDeclaredCycle(event, cycle) {
  const key = dateKeyFromIso(event.at);
  const end = cycle.end || todayKey();
  return key >= cycle.start && key <= end;
}

function declaredCycleEndAt(cycle) {
  return `${cycle.end || todayKey()}T23:59:59`;
}

function shouldStartNewCycle(cycle, event) {
  const previous = new Date(getCycleLastAt(cycle));
  const next = new Date(event.at);
  const gapDays = Math.floor((startOfDay(next) - startOfDay(previous)) / 86400000);
  const stopDays = Math.max(0, gapDays - 1);
  return stopDays > FALLBACK_STOP_DAYS_BETWEEN_CYCLE_EVENTS;
}

function isCycleComplete(cycle) {
  const closedFieldValves = new Set(
    cycle.events
      .filter((event) => event.action === "CHIUSA" && !isGeneralValveId(event.valve_id))
      .map((event) => event.valve_id)
  );
  const endedBeforeToday = dateKeyFromIso(getCycleLastAt(cycle)) < todayKey();

  return closedFieldValves.size >= FIELD_VALVE_IDS.length || (endedBeforeToday && closedFieldValves.size > 0);
}

function getCycleLastAt(cycle) {
  return cycle.lastAt || cycle.events[cycle.events.length - 1]?.at || cycle.startAt;
}

function createCycleDayCards(cycle) {
  const dayKeys = [...new Set(
    cycle.events
      .map((event) => dateKeyFromIso(event.at))
      .filter(Boolean)
  )].sort();

  return dayKeys.map((dayKey) => createHistoryDayCard(new Date(`${dayKey}T00:00:00`), cycle.events));
}

function createHistoryDayCard(day, cycleEvents = historyEvents) {
  const card = document.createElement("section");
  const title = document.createElement("h3");
  const rows = document.createElement("div");
  const activeValves = DEFAULT_VALVES.filter((valve) => (
    getEventsForValveDay(valve.id, day, cycleEvents).length > 0
  ));

  card.className = "history-day";
  title.textContent = formatShortDate(day);
  rows.className = "history-table";

  if (activeValves.length === 0) {
    const empty = document.createElement("div");
    empty.className = "history-day-empty";
    empty.textContent = "Nessun movimento";
    rows.appendChild(empty);
  } else {
    activeValves.forEach((valve) => rows.appendChild(createHistoryRow(valve, day, cycleEvents)));
  }

  card.append(title, rows);
  return card;
}

function createHistoryRow(valve, day, cycleEvents = historyEvents) {
  const row = document.createElement("div");
  const id = document.createElement("strong");
  const opened = document.createElement("span");
  const closed = document.createElement("span");
  const dayEvents = getEventsForValveDay(valve.id, day, cycleEvents);
  const openEvent = dayEvents.find((event) => event.action === "APERTA");
  const closeEvent = [...dayEvents].reverse().find((event) => event.action === "CHIUSA");

  row.className = "history-row";
  id.textContent = valve.id;
  opened.textContent = formatHistorySlot("APERTO", openEvent);
  closed.textContent = formatHistorySlot("CHIUSO", closeEvent);

  row.append(id, opened, closed);
  return row;
}

function getEventsForValveDay(valveId, day, sourceEvents = historyEvents) {
  const key = dateKeyFromDate(day);
  return sourceEvents
    .filter((event) => event.valve_id === valveId && dateKeyFromIso(event.at) === key)
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

function createHistoryNavButton(label, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "history-nav-button";
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function groupCyclesByMonth(cycles) {
  const groups = [];
  const byKey = new Map();

  cycles.forEach((cycle) => {
    const date = new Date(cycle.startAt);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    if (!byKey.has(key)) {
      const group = { key, title: formatMonthTitle(date), cycles: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    byKey.get(key).cycles.push(cycle);
  });

  return groups;
}

function createCycleMonthGroup(group) {
  const section = document.createElement("section");
  const title = document.createElement("h3");
  const grid = document.createElement("div");
  const previousCycles = getHistoryCycles().filter((cycle) => cycle.complete).reverse();

  section.className = "history-month";
  title.textContent = group.title;
  grid.className = "cycle-grid";

  group.cycles.forEach((cycle) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cycle-card";
    button.innerHTML = `
      <strong>${formatCycleShortLabel(cycle)}</strong>
      <span>${formatCycleFullLabel(cycle)}</span>
    `;
    button.addEventListener("click", () => renderArchivedCycle(cycle, previousCycles));
    grid.appendChild(button);
  });

  section.append(title, grid);
  return section;
}

function formatCycleShortLabel(cycle) {
  const start = new Date(cycle.startAt);
  const end = new Date(cycle.endAt || cycle.events[cycle.events.length - 1].at);
  if (start.getMonth() === end.getMonth()) {
    return `${start.getDate()}-${end.getDate()}`;
  }
  return `${start.getDate()}/${start.getMonth() + 1}-${end.getDate()}/${end.getMonth() + 1}`;
}

function formatCycleFullLabel(cycle) {
  const start = new Date(cycle.startAt);
  const end = new Date(cycle.endAt || cycle.events[cycle.events.length - 1].at);
  const endMonth = end.toLocaleDateString("it-IT", { month: "long" });
  if (start.getMonth() !== end.getMonth()) {
    const startMonth = start.toLocaleDateString("it-IT", { month: "long" });
    return `${start.getDate()} ${startMonth} - ${end.getDate()} ${endMonth}`;
  }
  return `${start.getDate()}-${end.getDate()} ${endMonth}`;
}

function formatMonthTitle(date) {
  return date.toLocaleDateString("it-IT", {
    month: "long",
    year: "numeric"
  }).toUpperCase();
}
