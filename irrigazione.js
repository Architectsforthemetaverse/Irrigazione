const VIEWBOX = {
  x: 0,
  y: 0,
  width: 1535,
  height: 1844
};

const STORAGE_KEY = "irrigazione_bocchette_v1";
const HISTORY_KEY = "irrigazione_storico_v1";
const OPERATOR_KEY = "irrigazione_operatore_v1";
const UPDATED_AT_KEY = "irrigazione_updated_at_v1";
const DEFAULT_FREQUENCY_DAYS = 7;
const GENERAL_VALVE_IDS = ["GA", "GN", "BP"];
const SYNC_ENDPOINT = (window.IRRIGAZIONE_SYNC && window.IRRIGAZIONE_SYNC.endpoint || "").trim();

const DEFAULT_VALVES = [
  { id: "1", x: 1465.724, y: 723.055 },
  { id: "2", x: 1465.724, y: 921.875 },
  { id: "3", x: 1116.411, y: 932.908 },
  { id: "4", x: 1176.203, y: 1064.653 },
  { id: "5", x: 889.405, y: 1048.438 },
  { id: "6", x: 766.205, y: 897.236 },
  { id: "7", x: 638.482, y: 1048.843 },
  { id: "8", x: 653.058, y: 669.844 },
  { id: "9", x: 537.546, y: 893.588 },
  { id: "10", x: 552.601, y: 196.738 },
  { id: "11", x: 286.98, y: 197.257 },
  { id: "12", x: 287.475, y: 434.73 },
  { id: "13", x: 287.475, y: 620.948 },
  { id: "14", x: 287.475, y: 964.51 },
  { id: "15", x: 288.488, y: 1419.619 },
  { id: "16", x: 288.488, y: 1724.861 },
  { id: "17", x: 537.384, y: 1724.861 },
  { id: "BP", x: 271.523, y: 789.238 },
  { id: "GA", x: 87.357, y: 93.585 },
  { id: "GN", x: 66.308, y: 1600.179 }
].map((valve) => ({
  ...valve,
  frequenza_giorni: DEFAULT_FREQUENCY_DAYS,
  ultima_irrigazione: null,
  aperta: false,
  manual: false,
  aperta_da: null,
  note: ""
}));

const tapLayer = document.querySelector("#tapLayer");
const sheet = document.querySelector("#valveSheet");
const sheetTitle = document.querySelector("#sheetTitle");
const sheetStatus = document.querySelector("#sheetStatus");
const valveNote = document.querySelector("#valveNote");
const toggleValveButton = document.querySelector("#toggleValve");
const historyButton = document.querySelector("#historyButton");
const summary = document.querySelector("#summary");
const waterStatus = document.querySelector("#waterStatus");
const pressureWarning = document.querySelector("#pressureWarning");
const cycleComplete = document.querySelector("#cycleComplete");
const syncStatus = document.querySelector("#syncStatus");
const historySheet = document.querySelector("#historySheet");
const historyList = document.querySelector("#historyList");
const historyCount = document.querySelector("#historyCount");
const operatorNameInput = document.querySelector("#operatorName");

let valves = loadValves();
let historyEvents = loadHistory();
let selectedValveId = null;
let updatedAt = window.localStorage.getItem(UPDATED_AT_KEY) || null;
let syncTimer = null;

operatorNameInput.value = window.localStorage.getItem(OPERATOR_KEY) || "";
render();
pullSyncState();

historyButton.addEventListener("click", () => {
  renderHistory();
  if (!historySheet.open) historySheet.showModal();
});

toggleValveButton.addEventListener("click", () => {
  const valve = valves.find((item) => item.id === selectedValveId);
  if (!valve) return;
  const operator = getOperatorName();
  if (!operator) return;

  if (valve.aperta) {
    const patch = {
      aperta: false,
      manual: false,
      aperta_da: null
    };

    if (!isGeneralValve(valve)) {
      patch.ultima_irrigazione = todayKey();
    }

    updateSelectedValve(patch, "CHIUSA", operator);
    return;
  }

  updateSelectedValve({
    aperta: true,
    manual: true,
    aperta_da: new Date().toISOString()
  }, "APERTA", operator);
});

valveNote.addEventListener("input", () => {
  if (!selectedValveId) return;

  valves = valves.map((valve) => {
    if (valve.id !== selectedValveId) return valve;
    return { ...valve, note: valveNote.value };
  });
  saveState();
});

operatorNameInput.addEventListener("input", () => {
  window.localStorage.setItem(OPERATOR_KEY, operatorNameInput.value.trim());
});

function loadValves() {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (!stored) return DEFAULT_VALVES;

  try {
    const parsed = JSON.parse(stored);
    return DEFAULT_VALVES.map((base) => ({
      ...base,
      ...(parsed.find((item) => item.id === base.id) || {})
    }));
  } catch {
    return DEFAULT_VALVES;
  }
}

function loadHistory() {
  const stored = window.localStorage.getItem(HISTORY_KEY);
  if (!stored) return [];

  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveState(options = {}) {
  if (!options.keepUpdatedAt) {
    updatedAt = new Date().toISOString();
    window.localStorage.setItem(UPDATED_AT_KEY, updatedAt);
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(valves));
  window.localStorage.setItem(HISTORY_KEY, JSON.stringify(historyEvents));

  if (options.push !== false) {
    schedulePushSyncState();
  }
}

function render() {
  tapLayer.replaceChildren(...valves.map(createValveButton));
  renderSummary();
  renderWaterStatus();
  if (selectedValveId) renderSheet(selectedValveId);
  if (historySheet.open) renderHistory();
}

function createValveButton(valve) {
  const button = document.createElement("button");
  const status = getValveStatus(valve);

  button.type = "button";
  button.className = `valve-hit state-${status.key}`;
  button.style.left = `${((valve.x - VIEWBOX.x) / VIEWBOX.width) * 100}%`;
  button.style.top = `${((valve.y - VIEWBOX.y) / VIEWBOX.height) * 100}%`;
  button.dataset.id = valve.id;
  button.setAttribute("aria-label", `${valveLabel(valve)} ${valve.id}: ${status.label}`);
  button.textContent = valve.id;
  button.addEventListener("click", () => openSheet(valve.id));

  return button;
}

function openSheet(id) {
  selectedValveId = id;
  renderSheet(id);
  if (!sheet.open) sheet.showModal();
}

function renderSheet(id) {
  const valve = valves.find((item) => item.id === id);
  if (!valve) return;

  const status = getValveStatus(valve);
  sheetTitle.textContent = `${valveLabel(valve)} ${valve.id}`;
  sheetStatus.textContent = status.detail;
  valveNote.value = valve.note || "";
  toggleValveButton.textContent = valve.aperta ? "CHIUDI" : "APRI";
  toggleValveButton.classList.toggle("is-closing", valve.aperta);
}

function updateSelectedValve(patch, action, operator) {
  if (!selectedValveId) return;
  const valveBefore = valves.find((valve) => valve.id === selectedValveId);

  valves = valves.map((valve) => {
    if (valve.id !== selectedValveId) return valve;
    return { ...valve, ...patch, note: valveNote.value };
  });

  if (action && valveBefore) {
    addHistoryEvent(valveBefore, action, operator);
  }

  saveState();
  render();
}

function renderSummary() {
  const counts = valves.filter((valve) => !isGeneralValve(valve)).reduce((acc, valve) => {
    const status = getValveStatus(valve).key;
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});

  summary.textContent = `${counts.due || 0} da aprire, ${counts.open || 0} aperte, ${counts.fresh || 0} irrigate`;
}

function renderWaterStatus() {
  const hasWater = areGeneralValvesOpen();
  const anyFieldValveOpen = valves.some((valve) => !isGeneralValve(valve) && valve.aperta);

  waterStatus.classList.toggle("water-status-on", hasWater);
  waterStatus.classList.toggle("water-status-off", !hasWater);
  pressureWarning.hidden = !(hasWater && !anyFieldValveOpen);
  cycleComplete.hidden = !areAllFieldValvesFresh();
}

function getValveStatus(valve) {
  if (valve.aperta) {
    return { key: "open", label: "aperta", detail: openedDetail(valve) };
  }

  if (isGeneralValve(valve)) {
    return { key: "due", label: "chiusa", detail: "Chiusa" };
  }

  if (!valve.ultima_irrigazione) {
    return { key: "due", label: "da aprire", detail: "Da aprire" };
  }

  const elapsedDays = daysSince(valve.ultima_irrigazione);
  if (elapsedDays < 2) {
    return { key: "fresh", label: "irrigata", detail: `Irrigata ${formatElapsed(elapsedDays)}` };
  }

  if (elapsedDays < valve.frequenza_giorni) {
    return { key: "ok", label: "ok", detail: `Ok, irrigata ${formatElapsed(elapsedDays)}` };
  }

  return { key: "due", label: "da aprire", detail: `Da aprire, ultima irrigazione ${formatElapsed(elapsedDays)}` };
}

function openedDetail(valve) {
  if (!valve.aperta_da) return "Aperta";
  const openedAt = new Date(valve.aperta_da);
  return `Aperta dalle ${openedAt.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`;
}

function isGeneralValve(valve) {
  return GENERAL_VALVE_IDS.includes(valve.id);
}

function areGeneralValvesOpen() {
  return GENERAL_VALVE_IDS.every((id) => valves.find((valve) => valve.id === id)?.aperta);
}

function areAllFieldValvesFresh() {
  const fieldValves = valves.filter((valve) => !isGeneralValve(valve));
  return fieldValves.length > 0 && fieldValves.every((valve) => getValveStatus(valve).key === "fresh");
}

function valveLabel(valve) {
  return isGeneralValve(valve) ? "Saracinesca" : "Bocchetta";
}

function isGeneralValveId(id) {
  return GENERAL_VALVE_IDS.includes(id);
}

function getOperatorName() {
  const stored = window.localStorage.getItem(OPERATOR_KEY) || "";
  const operator = stored || window.prompt("Chi sta aprendo/chiudendo?", "");
  const cleaned = (operator || "").trim();

  if (cleaned) {
    window.localStorage.setItem(OPERATOR_KEY, cleaned);
    operatorNameInput.value = cleaned;
    return cleaned;
  }

  return "";
}

function addHistoryEvent(valve, action, operator) {
  historyEvents.unshift({
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    valve_id: valve.id,
    valve_label: valveLabel(valve),
    action: action,
    operator: operator,
    at: new Date().toISOString()
  });
  historyEvents = historyEvents.slice(0, 500);
}

function renderHistory() {
  const firstOpening = findFirstOpening();
  historyCount.textContent = firstOpening
    ? `Schema 5 giorni dal ${formatShortDate(new Date(firstOpening.at))}`
    : "Nessuna apertura registrata";

  if (!firstOpening) {
    historyList.innerHTML = '<div class="history-empty">Nessuna apertura registrata</div>';
    return;
  }

  historyList.replaceChildren(...createFiveDayHistory(firstOpening));
}

function findFirstOpening() {
  return historyEvents
    .filter((event) => event.action === "APERTA" && !isGeneralValveId(event.valve_id))
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())[0] || null;
}

function createFiveDayHistory(firstOpening) {
  const start = startOfDay(new Date(firstOpening.at));
  return Array.from({ length: 5 }, (_, dayIndex) => createHistoryDayCard(addDays(start, dayIndex)));
}

function createHistoryDayCard(day) {
  const card = document.createElement("section");
  const title = document.createElement("h3");
  const rows = document.createElement("div");
  const activeValves = DEFAULT_VALVES.filter((valve) => {
    if (isGeneralValve(valve)) return false;
    return getEventsForValveDay(valve.id, day).length > 0;
  });

  card.className = "history-day";
  title.textContent = formatShortDate(day);
  rows.className = "history-table";

  if (activeValves.length === 0) {
    const empty = document.createElement("div");
    empty.className = "history-day-empty";
    empty.textContent = "Nessun movimento";
    rows.appendChild(empty);
  } else {
    activeValves.forEach((valve) => rows.appendChild(createHistoryRow(valve, day)));
  }

  card.append(title, rows);
  return card;
}

function createHistoryRow(valve, day) {
  const row = document.createElement("div");
  const id = document.createElement("strong");
  const opened = document.createElement("span");
  const closed = document.createElement("span");
  const dayEvents = getEventsForValveDay(valve.id, day);
  const openEvent = dayEvents.find((event) => event.action === "APERTA");
  const closeEvent = [...dayEvents].reverse().find((event) => event.action === "CHIUSA");

  row.className = "history-row";
  id.textContent = valve.id;
  opened.textContent = formatHistorySlot("APERTO", openEvent);
  closed.textContent = formatHistorySlot("CHIUSO", closeEvent);

  row.append(id, opened, closed);
  return row;
}

function getEventsForValveDay(valveId, day) {
  const key = dateKeyFromDate(day);
  return historyEvents
    .filter((event) => event.valve_id === valveId && dateKeyFromIso(event.at) === key)
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

function formatHistorySlot(label, event) {
  if (!event) return `${label} DA --- ALLE ORE ---`;

  return `${label} DA ${event.operator || "---"} ALLE ORE ${formatTime(new Date(event.at))}`;
}

function pullSyncState() {
  if (!SYNC_ENDPOINT) {
    setSyncStatus("Sync locale");
    return;
  }

  setSyncStatus("Leggo Sheet...");
  jsonp(SYNC_ENDPOINT).then((data) => {
    if (!data || !Array.isArray(data.valves)) {
      setSyncStatus("Sheet vuoto");
      return;
    }

    if (data.valves.length === 0) {
      pushSyncState();
      return;
    }

    valves = DEFAULT_VALVES.map((base) => ({
      ...base,
      ...(data.valves.find((item) => item.id === base.id) || {})
    }));
    updatedAt = data.updated_at || new Date().toISOString();
    window.localStorage.setItem(UPDATED_AT_KEY, updatedAt);
    historyEvents = Array.isArray(data.history) ? data.history : historyEvents;
    saveState({ push: false, keepUpdatedAt: true });
    render();
    setSyncStatus("Aggiornato da Sheet");
  }).catch(() => {
    setSyncStatus("Sync non riuscita");
  });
}

function schedulePushSyncState() {
  if (!SYNC_ENDPOINT) {
    setSyncStatus("Sync locale");
    return;
  }

  window.clearTimeout(syncTimer);
  syncTimer = window.setTimeout(pushSyncState, 700);
}

function pushSyncState() {
  if (!SYNC_ENDPOINT) return;

  setSyncStatus("Invio a Sheet...");
  window.fetch(SYNC_ENDPOINT, {
    method: "POST",
    mode: "no-cors",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify({
      updated_at: updatedAt || new Date().toISOString(),
      valves: valves,
      history: historyEvents
    })
  }).then(() => {
    setSyncStatus("Sync inviata");
  }).catch(() => {
    setSyncStatus("Invio non riuscito");
  });
}

function isRemoteNewer(remoteUpdatedAt) {
  if (!remoteUpdatedAt) return false;
  if (!updatedAt) return true;
  return new Date(remoteUpdatedAt).getTime() > new Date(updatedAt).getTime();
}

function jsonp(url) {
  return new Promise((resolve, reject) => {
    const callbackName = `irrigazioneSync${Date.now()}${Math.random().toString(16).slice(2)}`;
    const separator = url.includes("?") ? "&" : "?";
    const script = document.createElement("script");

    window[callbackName] = (data) => {
      delete window[callbackName];
      script.remove();
      resolve(data);
    };

    script.onerror = () => {
      delete window[callbackName];
      script.remove();
      reject(new Error("Errore sync"));
    };

    script.src = `${url}${separator}callback=${callbackName}`;
    document.body.appendChild(script);
  });
}

function setSyncStatus(text) {
  syncStatus.textContent = text;
}

function todayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function daysSince(dateKey) {
  const today = new Date(`${todayKey()}T00:00:00`);
  const date = new Date(`${dateKey}T00:00:00`);
  return Math.max(0, Math.floor((today - date) / 86400000));
}

function formatElapsed(days) {
  if (days === 0) return "oggi";
  if (days === 1) return "ieri";
  return `${days} giorni fa`;
}

function formatDateTime(date) {
  return date.toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatShortDate(date) {
  return date.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
}

function formatTime(date) {
  return date.toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function dateKeyFromDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateKeyFromIso(value) {
  return dateKeyFromDate(new Date(value));
}
