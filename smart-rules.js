(function () {
  const NEXT_FLAG = "[[DA_APRIRE]]";
  const FRESH_DAYS = 7;

  function markedNext(valve) {
    return Boolean(valve && valve.note && valve.note.includes(NEXT_FLAG));
  }

  function isFreshValve(valve) {
    return Boolean(valve.ultima_irrigazione) && daysSince(valve.ultima_irrigazione) < FRESH_DAYS;
  }

  function smartRecommendedValveId() {
    const fieldValves = valves.filter((valve) => !isGeneralValve(valve));
    const candidates = fieldValves.filter((valve) => {
      return !valve.aperta && !markedNext(valve) && !isFreshValve(valve);
    });

    if (candidates.length === 0) return null;

    const candidateIds = new Set(candidates.map((valve) => valve.id));
    const closedEvents = historyEvents
      .filter((event) => event.action === "CHIUSA" && !isGeneralValveId(event.valve_id))
      .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

    const recentClosed = [...closedEvents].reverse().find((event) => {
      return daysSince(dateKeyFromIso(event.at)) < FRESH_DAYS;
    });

    if (recentClosed) {
      const nextFromSequence = bestNextAfter(recentClosed.valve_id, closedEvents, candidateIds);
      if (nextFromSequence) return nextFromSequence;
    }

    return bestCycleStarter(closedEvents, candidateIds) || candidates[0].id;
  }

  function bestNextAfter(previousId, closedEvents, candidateIds) {
    const scores = {};

    for (let index = 0; index < closedEvents.length - 1; index += 1) {
      const current = closedEvents[index];
      const next = closedEvents[index + 1];
      const hours = (new Date(next.at).getTime() - new Date(current.at).getTime()) / 3600000;

      if (current.valve_id !== previousId || current.valve_id === next.valve_id || hours > 36) continue;
      if (!candidateIds.has(next.valve_id)) continue;

      scores[next.valve_id] = (scores[next.valve_id] || 0) + 1;
    }

    return bestScoredId(scores);
  }

  function bestCycleStarter(closedEvents, candidateIds) {
    const firstByDay = {};

    closedEvents.forEach((event) => {
      const day = dateKeyFromIso(event.at);
      if (!firstByDay[day]) firstByDay[day] = event;
    });

    const scores = {};
    Object.values(firstByDay).forEach((event) => {
      if (!candidateIds.has(event.valve_id)) return;
      scores[event.valve_id] = (scores[event.valve_id] || 0) + 1;
    });

    return bestScoredId(scores);
  }

  function bestScoredId(scores) {
    return Object.entries(scores)
      .sort((a, b) => b[1] - a[1] || Number(a[0]) - Number(b[0]))[0]?.[0] || null;
  }

  getValveStatus = function (valve) {
    if (valve.aperta) {
      return { key: "open", label: "aperta", detail: openedDetail(valve) };
    }

    if (isGeneralValve(valve)) {
      return { key: "due", label: "chiusa", detail: "Chiusa" };
    }

    if (markedNext(valve)) {
      return { key: "next", label: "segnalata da aprire", detail: "Segnalata manualmente da aprire" };
    }

    if (valve.id === smartRecommendedValveId()) {
      return { key: "due", label: "consigliata", detail: "Consigliata dallo storico" };
    }

    if (isFreshValve(valve)) {
      return { key: "fresh", label: "irrigata", detail: `Irrigata ${formatElapsed(daysSince(valve.ultima_irrigazione))}` };
    }

    if (valve.ultima_irrigazione) {
      return { key: "ok", label: "ok", detail: `Irrigata ${formatElapsed(daysSince(valve.ultima_irrigazione))}` };
    }

    return { key: "ok", label: "senza storico", detail: "Senza storico recente" };
  };

  areAllFieldValvesFresh = function () {
    const fieldValves = valves.filter((valve) => !isGeneralValve(valve));
    return fieldValves.length > 0 && fieldValves.every(isFreshValve);
  };

  render();
})();
