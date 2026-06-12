(function () {
  const LATITUDE = 38.95;
  const LONGITUDE = 16.65;
  const WEATHER_URL = "https://api.open-meteo.com/v1/forecast"
    + `?latitude=${LATITUDE}&longitude=${LONGITUDE}`
    + "&current=temperature_2m,relative_humidity_2m,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_gusts_10m,shortwave_radiation"
    + "&hourly=temperature_2m,relative_humidity_2m,precipitation_probability,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_gusts_10m,shortwave_radiation"
    + "&timezone=Europe%2FRome&forecast_days=1";

  const card = document.querySelector("#weatherAdvice");
  const label = document.querySelector("#weatherAdviceLabel");
  const detail = document.querySelector("#weatherAdviceDetail");
  const metrics = document.querySelector("#weatherAdviceMetrics");

  if (!card || !label || !detail || !metrics) return;

  loadWeatherAdvice();
  window.setInterval(loadWeatherAdvice, 15 * 60 * 1000);

  function loadWeatherAdvice() {
    fetch(WEATHER_URL, { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("Meteo non disponibile");
        return response.json();
      })
      .then((data) => {
        const current = data.current || {};
        const advice = evaluateWeather(current);
        renderAdvice(advice, current);
      })
      .catch(() => {
        card.dataset.state = "unknown";
        label.textContent = "METEO PIOGGIA: NON DISPONIBILE";
        detail.textContent = "Controlla manualmente temperatura, vento e orario.";
        metrics.textContent = "Simeri Crichi";
      });
  }

  function evaluateWeather(current) {
    const now = new Date();
    const hour = now.getHours();
    const temp = Number(current.temperature_2m);
    const humidity = Number(current.relative_humidity_2m);
    const wind = Number(current.wind_speed_10m);
    const gusts = Number(current.wind_gusts_10m);
    const radiation = Number(current.shortwave_radiation);
    const precipitation = Number(current.precipitation);
    const code = Number(current.weather_code);
    const reasons = [];

    if (precipitation > 0 || isRainCode(code)) reasons.push("pioggia in corso");
    if (hour >= 11 && hour <= 17 && radiation >= 600) reasons.push("sole alto");
    if (temp >= 32) reasons.push("caldo forte");
    if (wind >= 25 || gusts >= 35) reasons.push("vento forte");
    if ((hour >= 21 || hour < 5) && humidity >= 85) reasons.push("notte umida");

    if (reasons.length) {
      return {
        state: "bad",
        title: "METEO PIOGGIA: SCONSIGLIATO",
        detail: sentence(reasons)
      };
    }

    const warnings = [];
    if (hour >= 17 && hour < 21) warnings.push("sera: verifica asciugatura foglie");
    if (temp >= 28) warnings.push("temperatura alta");
    if (wind >= 16 || gusts >= 25) warnings.push("vento moderato");
    if (humidity >= 78) warnings.push("umidita alta");
    if (radiation >= 350) warnings.push("radiazione media");

    if (warnings.length) {
      return {
        state: "caution",
        title: "METEO PIOGGIA: ATTENZIONE",
        detail: sentence(warnings)
      };
    }

    if (hour >= 5 && hour <= 10) {
      return {
        state: "good",
        title: "METEO PIOGGIA: FAVOREVOLE",
        detail: "Mattina utile: vento e radiazione sotto soglia."
      };
    }

    return {
      state: "caution",
      title: "METEO PIOGGIA: VALUTA",
      detail: "Condizioni non critiche, ma non sei nella finestra migliore."
    };
  }

  function renderAdvice(advice, current) {
    card.dataset.state = advice.state;
    label.textContent = advice.title;
    detail.textContent = advice.detail;

    const temp = formatMetric(current.temperature_2m, "C", 0);
    const humidity = formatMetric(current.relative_humidity_2m, "%", 0);
    const wind = formatMetric(current.wind_speed_10m, "km/h", 0);
    const radiation = formatMetric(current.shortwave_radiation, "W/m2", 0);
    const time = current.time ? formatTime(current.time) : "--:--";

    metrics.textContent = `${temp} - UR ${humidity} - vento ${wind} - rad ${radiation} - ${time}`;
  }

  function formatMetric(value, unit, digits) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return `-- ${unit}`;
    return `${numeric.toFixed(digits)} ${unit}`;
  }

  function formatTime(value) {
    return new Date(value).toLocaleTimeString("it-IT", {
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function sentence(items) {
    return items.map((item) => item.charAt(0).toUpperCase() + item.slice(1)).join(" - ");
  }

  function isRainCode(code) {
    return [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(code);
  }
})();
