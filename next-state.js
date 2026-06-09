(function () {
  if (typeof isMarkedNext === "function") return;

  var flag = "[[DA_APRIRE]]";
  var nextButton = document.querySelector("#nextValve");

  function marked(valve) {
    return Boolean(valve && valve.note && valve.note.includes(flag));
  }

  function clean(note) {
    return (note || "").replace(flag, "").trim();
  }

  function compose(note, shouldMark) {
    var cleaned = clean(note);
    return shouldMark ? flag + (cleaned ? " " + cleaned : "") : cleaned;
  }

  var originalGetValveStatus = getValveStatus;
  getValveStatus = function (valve) {
    if (!valve.aperta && !isGeneralValve(valve) && marked(valve)) {
      return { key: "next", label: "segnalata da aprire", detail: "Segnalata da aprire" };
    }

    return originalGetValveStatus(valve);
  };

  var originalRenderSheet = renderSheet;
  renderSheet = function (id) {
    originalRenderSheet(id);

    var valve = valves.find(function (item) {
      return item.id === id;
    });
    if (!valve || !nextButton) return;

    valveNote.value = clean(valve.note);
    nextButton.hidden = isGeneralValve(valve);
    nextButton.textContent = marked(valve) ? "ANNULLA SEGNALAZIONE" : "SEGNALA DA APRIRE";
    nextButton.classList.toggle("is-marked", marked(valve));
    sheetStatus.textContent = getValveStatus(valve).detail;
  };

  if (nextButton) {
    nextButton.addEventListener("click", function () {
      if (!selectedValveId) return;

      valves = valves.map(function (valve) {
        if (valve.id !== selectedValveId || isGeneralValve(valve)) return valve;

        return {
          ...valve,
          note: compose(valveNote.value, !marked(valve))
        };
      });

      saveState();
      render();
    });
  }

  valveNote.addEventListener("input", function () {
    if (!selectedValveId) return;

    valves = valves.map(function (valve) {
      if (valve.id !== selectedValveId) return valve;
      return { ...valve, note: compose(valveNote.value, marked(valve)) };
    });
    saveState();
  });

  render();
})();
