(function () {
  const MAX_PER_TURNO = 3;
  const GROUP_WINDOW_MS = 30 * 60 * 1000;
  const RAIN_THRESHOLD_MM = 5;
  const RAIN_URL = "https://api.open-meteo.com/v1/forecast"
    + "?latitude=38.95&longitude=16.65"
    + "&daily=precipitation_sum&past_days=2&forecast_days=4"
    + "&timezone=Europe%2FRome";

  const planList = document.querySelector("#planList");
  const planRain = document.querySelector("#planRain");
  const planCard = document.querySelector("#planCard");
  if (!planList) return;

  function fieldOpenEvents() {
    return historyEvents
      .filter((event) => event && event.action === "APERTA" && event.at && !isGeneralValveId(event.valve_id))
      .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  }

  function irrigationDaysByValve(events) {
    const map = {};
    events.forEach((event) => {
      const day = dateKeyFromIso(event.at);
      if (!map[event.valve_id]) map[event.valve_id] = [];
      map[event.valve_id].push(day);
    });
    Object.keys(map).forEach((id) => {
      map[id] = [...new Set(map[id])].sort();
    });
    return map;
  }

  function dayDiff(fromKey, toKey) {
    const from = new Date(`${fromKey}T00:00:00`).getTime();
    const to = new Date(`${toKey}T00:00:00`).getTime();
    return Math.round((to - from) / 86400000);
  }

  function intervalsOf(dayKeys) {
    const result = [];
    for (let i = 0; i < dayKeys.length - 1; i += 1) {
      const diff = dayDiff(dayKeys[i], dayKeys[i + 1]);
      if (diff > 0) result.push(diff);
    }
    return result;
  }

  function median(nums) {
    if (!nums.length) return null;
    const sorted = [...nums].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  function historicalTurni(events) {
    const turni = [];
    let current = [];
    let lastTime = null;

    events.forEach((event) => {
      const time = new Date(event.at).getTime();
      if (lastTime !== null && time - lastTime > GROUP_WINDOW_MS) {
        turni.push(current);
        current = [];
      }
      current.push(event.valve_id);
      lastTime = time;
    });
    if (current.length) turni.push(current);
    return turni;
  }

  function partnerCounts(turni) {
    const partners = {};
    turni.forEach((group) => {
      group.forEach((id) => {
        group.forEach((other) => {
          if (id === other) return;
          if (!partners[id]) partners[id] = {};
          partners[id][other] = (partners[id][other] || 0) + 1;
        });
      });
    });
    return partners;
  }

  function learnedInterval(valve, daysMap, partners, globalMedian) {
    const own = intervalsOf(daysMap[valve.id] || []);
    if (own.length) return median(own);

    const pool = [];
    Object.keys(partners[valve.id] || {}).forEach((partnerId) => {
      pool.push(...intervalsOf(daysMap[partnerId] || []));
    });
    if (pool.length) return median(pool);

    if (globalMedian) return globalMedian;
    return Number(valve.frequenza_giorni) || 7;
  }

  function buildPlan() {
    const events = fieldOpenEvents();
    const daysMap = irrigationDaysByValve(events);
    const partners = partnerCounts(historicalTurni(events));
    const allIntervals = Object.values(daysMap).flatMap(intervalsOf);
    const globalMedian = median(allIntervals);

    const entries = valves
      .filter((valve) => !isGeneralValve(valve) && !valve.aperta)
      .map((valve) => {
        const interval = Math.round(learnedInterval(valve, daysMap, partners, globalMedian));
        const historyDays = daysMap[valve.id] || [];
        const lastKey = dateKeyFromIso(valve.ultima_irrigazione) || historyDays[historyDays.length - 1] || "";

        if (!lastKey) {
          return { id: valve.id, interval, dueIn: 0, delay: 0, noHistory: true };
        }

        const dueIn = interval - daysSince(lastKey);
        return { id: valve.id, interval, dueIn, delay: Math.max(0, -dueIn), lastKey };
      });

    const byDay = {};
    entries.forEach((entry) => {
      const key = Math.max(0, entry.dueIn);
      if (!byDay[key]) byDay[key] = [];
      byDay[key].push(entry);
    });

    const rows = [];
    Object.keys(byDay).map(Number).sort((a, b) => a - b).forEach((day) => {
      const pending = byDay[day].sort((a, b) => sortIds(a.id, b.id));

      while (pending.length) {
        const seed = pending.shift();
        const turno = [seed];
        const seedPartners = partners[seed.id] || {};

        pending.sort((a, b) => (seedPartners[b.id] || 0) - (seedPartners[a.id] || 0) || sortIds(a.id, b.id));
        while (turno.length < MAX_PER_TURNO && pending.length && (seedPartners[pending[0].id] || 0) > 0) {
          turno.push(pending.shift());
        }
        while (turno.length < MAX_PER_TURNO && pending.length) {
          turno.push(pending.shift());
        }

        rows.push({ day, valves: turno });
      }
    });

    return rows;
  }

  function sortIds(a, b) {
    const numA = Number(a);
    const numB = Number(b);
    if (Number.isNaN(numA) || Number.isNaN(numB)) return String(a).localeCompare(String(b));
    return numA - numB;
  }

  function dayLabel(day) {
    if (day === 0) return "OGGI";
    if (day === 1) return "DOMANI";
    const date = addDays(new Date(), day);
    return date.toLocaleDateString("it-IT", { weekday: "short", day: "2-digit", month: "2-digit" }).toUpperCase();
  }

  function rowDetail(row) {
    const maxDelay = Math.max(...row.valves.map((entry) => entry.delay || 0));
    if (row.valves.some((entry) => entry.noHistory)) return "Senza storico: da programmare";
    if (maxDelay > 0) return `In ritardo di ${maxDelay} ${maxDelay === 1 ? "giorno" : "giorni"}`;
    const cycles = [...new Set(row.valves.map((entry) => entry.interval))].sort((a, b) => a - b);
    const label = cycles.length === 1 ? `${cycles[0]}` : `${cycles[0]}-${cycles[cycles.length - 1]}`;
    return `Ciclo ~${label} gg`;
  }

  function renderPlan() {
    const rows = buildPlan();

    if (!rows.length) {
      planList.innerHTML = '<p class="plan-empty">Tutte le bocchette sono aperte o senza dati.</p>';
      return;
    }

    planList.replaceChildren(...rows.map((row) => {
      const item = document.createElement("div");
      item.className = "plan-row";
      if (row.day === 0) item.classList.add("is-today");

      const when = document.createElement("span");
      when.className = "plan-when";
      when.textContent = dayLabel(row.day);

      const chips = document.createElement("span");
      chips.className = "plan-chips";
      row.valves.forEach((entry) => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "plan-chip";
        chip.textContent = entry.id;
        chip.addEventListener("click", () => openSheet(entry.id));
        chips.appendChild(chip);
      });

      const detail = document.createElement("span");
      detail.className = "plan-detail";
      detail.textContent = rowDetail(row);

      item.append(when, chips, detail);
      return item;
    }));
  }

  function loadRainAdvice() {
    if (!planRain) return;

    fetch(RAIN_URL, { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("meteo non disponibile");
        return response.json();
      })
      .then((data) => {
        const sums = (data.daily && data.daily.precipitation_sum) || [];
        const fallen = (sums[0] || 0) + (sums[1] || 0);
        const coming = (sums[3] || 0) + (sums[4] || 0) + (sums[5] || 0);
        const parts = [];

        if (fallen >= RAIN_THRESHOLD_MM) parts.push(`caduti ${fallen.toFixed(0)} mm negli ultimi 2 giorni`);
        if (coming >= RAIN_THRESHOLD_MM) parts.push(`previsti ${coming.toFixed(0)} mm nei prossimi 3 giorni`);

        if (parts.length) {
          planRain.hidden = false;
          planRain.textContent = `Pioggia: ${parts.join(", ")}. Valuta se rimandare.`;
        } else {
          planRain.hidden = true;
        }
      })
      .catch(() => {
        planRain.hidden = true;
      });
  }

  const originalRender = render;
  render = function () {
    originalRender();
    renderPlan();
  };

  if (planCard) {
    const togglePlan = () => {
      const expanded = !planCard.classList.contains("is-expanded");
      planCard.classList.toggle("is-expanded", expanded);
      planCard.setAttribute("aria-expanded", String(expanded));
    };

    planCard.addEventListener("click", (event) => {
      if (event.target.closest(".plan-chip")) return;
      togglePlan();
    });
    planCard.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      togglePlan();
    });
  }

  renderPlan();
  loadRainAdvice();
  window.setInterval(loadRainAdvice, 30 * 60 * 1000);
})();
