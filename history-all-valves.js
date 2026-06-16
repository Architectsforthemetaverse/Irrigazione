const FIELD_VALVE_IDS = DEFAULT_VALVES
  .filter((valve) => !isGeneralValve(valve))
  .map((valve) => valve.id);
const MAX_CYCLE_SPAN_DAYS = 5;
const NEW_CYCLE_GAP_HOURS = 36;

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
    ...createCycleDayCards(currentCycle, { fiveDays: true })
  );
}

function renderPreviousCycles(previousCycles) {
  historyCount.textContent = "Cicli precedenti";

  if (previousCycles.length === 0) {
    const backButton = createHistoryNavButton("TORNA AL CICLO ATTUALE", renderHistory);
    const empty = document.createElement("div");
    empty.className = "history-empty";
    empty.textContent = "Nessun ciclo precedente archiviato";
    historyList.replaceChildren(backButton, empty);
    return;
  }

  const groups = groupCyclesByMonth(previousCycles);
  historyList.replaceChildren(
    createHistoryNavButton("TORNA AL CICLO ATTUALE", renderHistory),
    ...groups.map(createCycleMonthGroup)
  );
}

function renderArchivedCycle(cycle, previousCycles) {
  historyCount.textContent = `Ciclo ${formatCycleFullLabel(cycle)}`;
  historyList.replaceChildren(
    createHistoryNavButton("TORNA AI PRECEDENTI", () => renderPreviousCycles(previousCycles)),
    ...createCycleDayCards(cycle, { fiveDays: false })
  );
}

function getHistoryCycles() {
  const sortedEvents = [...historyEvents]
    .filter((event) => event && event.at && event.action)
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  const cycles = [];
  let currentCycle = null;
  let closedFieldValves = new Set();

  sortedEvents.forEach((event) => {
    if (currentCycle && shouldStartNewCycle(currentCycle, event)) {
      finishCurrentCycle({ complete: true });
    }

    if (!currentCycle) {
      if (event.action !== "APERTA") return;
      currentCycle = {
        startAt: event.at,
        endAt: null,
        complete: false,
        events: [],
        lastAt: event.at
      };
      closedFieldValves = new Set();
    }

    currentCycle.events.push(event);
    currentCycle.lastAt = event.at;

    if (event.action === "CHIUSA" && !isGeneralValveId(event.valve_id)) {
      closedFieldValves.add(event.valve_id);
    }

    if (!currentCycle.complete && closedFieldValves.size >= FIELD_VALVE_IDS.length) {
      finishCurrentCycle({ complete: true, endAt: event.at });
    }
  });

  if (currentCycle) {
    const completeByState = stateCompletionFallsInCycle(currentCycle);
    const completeByPast = isPastCycle(currentCycle) && hasFieldClosure(currentCycle);
    finishCurrentCycle({ complete: completeByState || completeByPast });
  }

  return cycles;

  function finishCurrentCycle(options = {}) {
    if (!currentCycle) return;
    currentCycle.complete = Boolean(options.complete);
    currentCycle.endAt = options.endAt || getCycleLastAt(currentCycle);
    cycles.push(currentCycle);
    currentCycle = null;
    closedFieldValves = new Set();
  }
}

function shouldStartNewCycle(cycle, event) {
  if (event.action !== "APERTA") return false;
  const previous = new Date(getCycleLastAt(cycle));
  const next = new Date(event.at);
  const gapHours = (next - previous) / 3600000;
  const spanDays = cycleSpanDays(cycle.startAt, event.at);
  return gapHours > NEW_CYCLE_GAP_HOURS || spanDays > MAX_CYCLE_SPAN_DAYS;
}

function stateCompletionFallsInCycle(cycle) {
  const stateCompletionDateKey = getStateCompletionDateKey();
  if (!stateCompletionDateKey) return false;

  const start = startOfDay(new Date(cycle.startAt));
  const end = startOfDay(new Date(getCycleLastAt(cycle)));
  const completion = startOfDay(new Date(`${stateCompletionDateKey}T00:00:00`));

  return completion.getTime() >= start.getTime() && completion.getTime() >= end.getTime();
}

function getStateCompletionDateKey() {
  const fieldDates = valves
    .filter((valve) => !isGeneralValve(valve))
    .map((valve) => normalizeDateKey(valve.ultima_irrigazione))
    .filter(Boolean)
    .sort();

  if (fieldDates.length !== FIELD_VALVE_IDS.length) return null;

  const first = new Date(`${fieldDates[0]}T00:00:00`);
  const lastKey = fieldDates[fieldDates.length - 1];
  const last = new Date(`${lastKey}T00:00:00`);
  const spanDays = Math.floor((last - first) / 86400000) + 1;

  return spanDays <= MAX_CYCLE_SPAN_DAYS ? lastKey : null;
}

function isPastCycle(cycle) {
  return dateKeyFromIso(getCycleLastAt(cycle)) < todayKey();
}

function hasFieldClosure(cycle) {
  return cycle.events.some((event) => event.action === "CHIUSA" && !isGeneralValveId(event.valve_id));
}

function getCycleLastAt(cycle) {
  return cycle.lastAt || cycle.events[cycle.events.length - 1]?.at || cycle.startAt;
}

function cycleSpanDays(startAt, endAt) {
  const start = startOfDay(new Date(startAt));
  const end = startOfDay(new Date(endAt));
  return Math.floor((end - start) / 86400000) + 1;
}

function createCycleDayCards(cycle, options = {}) {
  const start = startOfDay(new Date(cycle.startAt));
  const end = options.fiveDays
    ? addDays(start, 4)
    : startOfDay(new Date(cycle.endAt || cycle.events[cycle.events.length - 1].at));
  const dayCount = Math.max(1, Math.floor((end - start) / 86400000) + 1);

  return Array.from({ length: dayCount }, (_, dayIndex) => (
    createHistoryDayCard(addDays(start, dayIndex), cycle.events)
  ));
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
  return `${start.getDate()}-${end.getDate()}`;
}

function formatCycleFullLabel(cycle) {
  const start = new Date(cycle.startAt);
  const end = new Date(cycle.endAt || cycle.events[cycle.events.length - 1].at);
  const month = end.toLocaleDateString("it-IT", { month: "long" });
  return `${start.getDate()}-${end.getDate()} ${month}`;
}

function formatMonthTitle(date) {
  return date.toLocaleDateString("it-IT", {
    month: "long",
    year: "numeric"
  }).toUpperCase();
}
