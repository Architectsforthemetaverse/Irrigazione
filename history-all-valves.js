function findFirstOpening() {
  return historyEvents
    .filter((event) => event.action === "APERTA")
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())[0] || null;
}

function createHistoryDayCard(day) {
  const card = document.createElement("section");
  const title = document.createElement("h3");
  const rows = document.createElement("div");
  const activeValves = DEFAULT_VALVES.filter((valve) => getEventsForValveDay(valve.id, day).length > 0);

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
