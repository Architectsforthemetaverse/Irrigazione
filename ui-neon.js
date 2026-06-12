function renderSummary() {
  const fieldValves = valves.filter((valve) => !isGeneralValve(valve));
  const counts = valves.filter((valve) => !isGeneralValve(valve)).reduce((acc, valve) => {
    const status = getValveStatus(valve).key;
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});
  const irrigatedCount = counts.fresh || 0;
  const nextCount = counts.next || 0;
  const dueCount = counts.due || 0;
  const okCount = counts.ok || 0;
  const progress = fieldValves.length ? Math.round((irrigatedCount / fieldValves.length) * 100) : 0;
  const nextText = nextCount
    ? `, <span class="summary-count summary-next">${nextCount}</span> segnalata`
    : "";

  summary.innerHTML = `
    <span class="summary-count summary-due">${dueCount}</span> consigliata,
    <span class="summary-count summary-open">${counts.open || 0}</span> aperte,
    <span class="summary-count summary-fresh">${irrigatedCount}</span> irrigate${nextText},
    ${okCount} ok
  `;
  document.documentElement.style.setProperty("--cycle-progress", `${progress}%`);
}

render();
