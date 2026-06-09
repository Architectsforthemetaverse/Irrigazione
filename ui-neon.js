function renderSummary() {
  const counts = valves.filter((valve) => !isGeneralValve(valve)).reduce((acc, valve) => {
    const status = getValveStatus(valve).key;
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});

  summary.innerHTML = `
    <span class="summary-count summary-due">${counts.due || 0}</span> da aprire,
    <span class="summary-count summary-open">${counts.open || 0}</span> aperte,
    <span class="summary-count summary-fresh">${counts.fresh || 0}</span> irrigate
  `;
}

render();
