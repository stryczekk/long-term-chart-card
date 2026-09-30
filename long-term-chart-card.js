// Long-term Chart Card for Home Assistant
// https://github.com/stryczekk/long-term-chart-card
//
// Charts from Home Assistant LONG-TERM STATISTICS (kept forever, no extra
// software) or from INFLUXDB through the InfluxDB Proxy integration
// (https://github.com/stryczekk/ha-influx-proxy). The card only ever talks to
// Home Assistant, so it works the same at home, through a tunnel and through
// Nabu Casa.
//
//   type: custom:long-term-chart-card
//   title: Temperatures
//   source: statistics    # or: influx
//   days: 7               # period selected on load
//   entities:
//     - sensor.living_room_temperature
//     - entity: sensor.bedroom_temperature
//       name: Bedroom
//     - entity: sensor.bedroom_humidity
//       axis: right       # second scale; its grid is aligned to the left one
//
// See README.md for all options.


export const CARD_NAME = "long-term-chart-card";
export const VERSION = "1.0.0";

// Nine distinct hues - six were one cycle too few for eight room sensors.
export const COLORS = [
  "#ffc300", "#4fc3f7", "#81c784", "#ff8a65", "#ba68c8",
  "#f06292", "#26a69a", "#7986cb", "#bcaaa4",
];

export const STRINGS = {
  en: {
    loading: "Loading...",
    no_statistics: "No statistics for these entities. Only numeric entities with a state_class have long-term statistics.",
    no_influx_data: "No data in InfluxDB for this period.",
    all_hidden: "All series are hidden - click the legend to show them.",
    toggle_hint: "Click to show or hide",
    stats_failed: "Could not load statistics: {reason}",
    influx_failed: "Could not load data from InfluxDB through Home Assistant: {reason}",
    influx_not_configured: "The InfluxDB Proxy integration is not installed or not configured in Home Assistant.",
    entities_required: "The \"entities\" option is required (a list of entities).",
    entity_invalid: "Every item in \"entities\" needs an \"entity\" id.",
    period_hours: "{n} h",
    period_days: "{n} days",
    period_day: "1 day",
    period_months: "{n} months",
    period_year: "1 year",
    card_name: "Long-term chart",
    card_description: "Chart from long-term statistics or from InfluxDB",
  },
  pl: {
    loading: "Wczytywanie...",
    no_statistics: "Brak statystyk dla podanych encji. Statystyki długoterminowe mają tylko encje liczbowe ze state_class.",
    no_influx_data: "Brak danych w InfluxDB dla tego zakresu.",
    all_hidden: "Wszystkie serie wyłączone - kliknij w legendę, aby włączyć.",
    toggle_hint: "Kliknij, aby włączyć lub wyłączyć",
    stats_failed: "Nie udało się pobrać statystyk: {reason}",
    influx_failed: "Nie udało się pobrać danych z InfluxDB przez Home Assistant: {reason}",
    influx_not_configured: "Integracja InfluxDB Proxy nie jest zainstalowana albo skonfigurowana w Home Assistant.",
    entities_required: "Wymagane pole \"entities\" (lista encji).",
    entity_invalid: "Każda pozycja w \"entities\" musi mieć \"entity\".",
    period_hours: "{n} h",
    period_days: "{n} dni",
    period_day: "1 dzień",
    period_months: "{n} mies.",
    period_year: "rok",
    card_name: "Wykres długoterminowy",
    card_description: "Wykres ze statystyk długoterminowych albo z InfluxDB",
  },
};

export function translate(lang, key, vars = {}) {
  const base = String(lang || "en").toLowerCase().split("-")[0];
  const table = STRINGS[base] || STRINGS.en;
  const text = table[key] !== undefined ? table[key] : STRINGS.en[key] !== undefined ? STRINGS.en[key] : key;
  return text.replace(/\{(\w+)\}/g, (_, name) => (vars[name] !== undefined ? String(vars[name]) : "{" + name + "}"));
}

// Label for a period button when the config gives none.
export function periodLabel(lang, days) {
  if (days < 1) return translate(lang, "period_hours", { n: Math.round(days * 24) });
  if (days === 1) return translate(lang, "period_hours", { n: 24 });
  if (days === 365) return translate(lang, "period_year");
  if (days % 30 === 0 && days >= 60) return translate(lang, "period_months", { n: days / 30 });
  return translate(lang, "period_days", { n: days });
}

export const DEFAULT_PERIOD_DAYS = [1, 7, 30, 90, 365];

// Round grid steps only, so labels come out as 22, 24, 26 - not 21.7, 23.4.
// 1 / 2 / 2.5 / 5 for every power of ten from 0.001 to 10^9, so large ranges
// (power in W, energy, CO2 on the right axis) are not clipped.
export const STEP_LADDER = [];
for (let e = -3; e <= 9; e++) {
  for (const m of [1, 2, 2.5, 5]) STEP_LADDER.push(Number((m * Math.pow(10, e)).toPrecision(3)));
}

// Decimals needed to print a grid step exactly: 2.5 -> 1, 0.25 -> 2, 5 -> 0.
export function decimalsFor(step) {
  const text = String(Number(Number(step).toPrecision(12)));
  return text.includes(".") ? text.split(".")[1].length : 0;
}

// A colour from the card config ends up in SVG/HTML attributes, so only
// accept plain CSS colour syntax; anything else falls back to the palette.
const COLOR_RE = /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]{3,30}|(rgb|rgba|hsl|hsla)\([0-9.,%\s/deg]+\)|var\(--[a-zA-Z0-9_-]+\))$/;
export function safeColor(value, fallback) {
  return typeof value === "string" && COLOR_RE.test(value.trim()) ? value.trim() : fallback;
}

// Series lookup that never walks the prototype chain ("__proto__", "constructor").
export function ownPoints(data, id) {
  return data && Object.prototype.hasOwnProperty.call(data, id) && Array.isArray(data[id]) ? data[id] : [];
}

// Step for a value range, aiming for 4-6 grid lines.
export function niceStep(range) {
  if (!(range > 0)) return 1;
  for (const candidate of STEP_LADDER) {
    if (range / candidate <= 6) return candidate;
  }
  return STEP_LADDER[STEP_LADDER.length - 1];
}

// Value range of a group of series; min/max band included when shown.
export function valueRange(group, showRange) {
  let lo = Infinity;
  let hi = -Infinity;
  for (const s of group) {
    for (const p of s.points) {
      const low = showRange && p.min != null ? p.min : p.mean;
      const high = showRange && p.max != null ? p.max : p.mean;
      if (low < lo) lo = low;
      if (high > hi) hi = high;
    }
  }
  if (hi - lo < 1e-9) {
    hi += 0.5;
    lo -= 0.5;
  }
  return { lo, hi };
}

// Both axes. The primary one picks its own round step; the secondary one is
// forced onto the SAME number of intervals, so both label sets sit on the
// same grid lines - two independent grids on one chart read as noise.
export function computeAxes(primaryRange, secondaryRange, opts = {}) {
  const yStep = opts.yStep || 0;
  const floor = opts.primaryFloor || 0;
  const secondaryFloor = opts.secondaryFloor || 0;
  const minIntervals = opts.minIntervals || 0;

  const step = yStep || Math.max(niceStep(primaryRange.hi - primaryRange.lo), floor);
  let vMin = Math.floor(primaryRange.lo / step) * step;
  let vMax = Math.ceil(primaryRange.hi / step) * step;
  if (vMax - vMin < step) vMax = vMin + step;
  let count = Math.round((vMax - vMin) / step);
  if (count < minIntervals) {
    const extra = minIntervals - count;
    vMin -= Math.floor(extra / 2) * step;
    vMax += Math.ceil(extra / 2) * step;
    count = minIntervals;
  }

  let second = null;
  if (secondaryRange) {
    for (const candidate of STEP_LADDER) {
      if (candidate < secondaryFloor) continue;
      const lo = Math.floor(secondaryRange.lo / candidate) * candidate;
      if (lo + count * candidate >= secondaryRange.hi - 1e-9) {
        second = { min: lo, max: lo + count * candidate, step: candidate };
        break;
      }
    }
    if (!second) {
      const big = STEP_LADDER[STEP_LADDER.length - 1];
      const min = Math.floor(secondaryRange.lo / big) * big;
      second = { min, max: min + count * big, step: big };
    }
  }
  return { vMin, vMax, step, count, second };
}

// Home Assistant keeps 5-minute statistics for about 10 days, hourly forever.
export function statisticsPeriod(days) {
  return days <= 2 ? "5minute" : "hour";
}

// 404: the proxy integration was never loaded; 503: loaded, not configured.
export function isProxyMissing(err) {
  const status = err && (err.status_code || err.status || (err.body && err.body.status_code));
  return status === 404 || status === 503;
}

export function formatNumber(locale, value, decimals) {
  try {
    return new Intl.NumberFormat(locale, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  } catch (e) {
    return value.toFixed(decimals);
  }
}

export function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );
}

export class LongTermChartCard extends HTMLElement {
  setConfig(config) {
    if (!config || !Array.isArray(config.entities) || !config.entities.length) {
      throw new Error(translate(navigator.language, "entities_required"));
    }
    for (const item of config.entities) {
      const id = typeof item === "string" ? item : item && item.entity;
      if (typeof id !== "string" || !id) throw new Error(translate(navigator.language, "entity_invalid"));
    }
    // Labels are filled in at render time, in the user's language.
    const periods = Array.isArray(config.periods) && config.periods.length
      ? config.periods.map((p) => ({
          days: Number(p.days) > 0 ? Number(p.days) : 7,
          label: p.label || null,
        }))
      : DEFAULT_PERIOD_DAYS.map((days) => ({ days, label: null }));

    this._config = {
      title: config.title || "",
      days: Number(config.days) > 0 ? Number(config.days) : periods[Math.min(1, periods.length - 1)].days,
      yStep: Number(config.y_step) > 0 ? Number(config.y_step) : 0,
      // Floors for the automatic step, per axis. Without them a quiet day
      // (1 degree of change) gets a 0.1-0.2 grid and looks like a storm.
      yMinStep: Number(config.y_min_step) > 0 ? Number(config.y_min_step) : 0,
      yMinStepRight: Number(config.y_min_step_right) > 0 ? Number(config.y_min_step_right) : 0,
      // Minimum number of grid intervals. A floor on the step alone still
      // leaves a quiet day with two lines; this widens the range instead,
      // keeping the data centred.
      yMinIntervals: Number(config.y_min_intervals) > 0 ? Math.round(Number(config.y_min_intervals)) : 0,
      showRange: config.show_range !== false,
      source: config.source === "influx" ? "influx" : "statistics",
      decimals: Number.isInteger(config.decimals) && config.decimals >= 0 ? config.decimals : 1,
      periods: periods,
      entities: config.entities.map((item, index) =>
        typeof item === "string"
          ? { entity: item, name: null, color: COLORS[index % COLORS.length], axis: "left" }
          : {
              entity: item.entity,
              name: item.name || null,
              color: safeColor(item.color, COLORS[index % COLORS.length]),
              axis: item.axis === "right" ? "right" : "left",
            }
      ),
    };
    this._days = this._config.days;
    this._data = null;
    this._series = null; // nothing from a previous config may be hovered or redrawn
    this._visible = null;
    this._scale = null;
    // Series switched off by clicking the legend. Kept per card instance,
    // so it survives a period change and the periodic refresh.
    this._hidden = new Set();

    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = [
      "<style>",
      "  ha-card { padding: 12px 14px 8px; }",
      "  #head { display: flex; align-items: center; flex-wrap: wrap;",
      "          gap: 8px; margin-bottom: 8px; }",
      "  #title { color: var(--primary-text-color, #c3cfdf);",
      "           font-family: var(--paper-font-body1_-_font-family, sans-serif);",
      "           font-size: 15px; font-weight: 500; margin: 0; flex: 1 1 auto; }",
      "  #periods { display: flex; gap: 4px; flex: none; }",
      "  #periods button {",
      "    border: 1px solid var(--divider-color, #2a3547); border-radius: 6px;",
      "    background: transparent; color: var(--secondary-text-color, #7c8ca3);",
      "    font: inherit; font-size: 12px; padding: 3px 9px; cursor: pointer;",
      "    line-height: 1.4; white-space: nowrap; }",
      "  #periods button:hover { border-color: var(--primary-color, #ffc300); }",
      "  #periods button.active {",
      "    color: var(--text-primary-color, #131a24);",
      "    background: var(--primary-color, #ffc300);",
      "    border-color: var(--primary-color, #ffc300); }",
      "  #plot { position: relative; }",
      "  #chart { width: 100%; display: block; touch-action: pan-y; }",
      // Tooltip and hover dots are HTML, not SVG: the chart is drawn with
      // preserveAspectRatio=none, so an SVG circle would be squashed into
      // an ellipse whenever the card is wider or narrower than 600:220.
      "  #tip { position: absolute; top: 6px; left: 0; z-index: 2;",
      "         pointer-events: none; opacity: 0; transition: opacity 0.12s;",
      "         background: var(--card-background-color, #1b2433);",
      "         border: 1px solid var(--divider-color, #2a3547);",
      "         border-radius: 8px; padding: 6px 9px; white-space: nowrap;",
      "         box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);",
      "         font-family: var(--paper-font-body1_-_font-family, sans-serif);",
      "         font-size: 12px; line-height: 1.5;",
      "         color: var(--primary-text-color, #c3cfdf); }",
      "  #tip.on { opacity: 1; }",
      "  #tip .when { color: var(--secondary-text-color, #7c8ca3); margin-bottom: 2px; }",
      "  #tip .row { display: flex; align-items: center; gap: 6px; }",
      "  #tip .row b { font-weight: 500; font-variant-numeric: tabular-nums;",
      "                margin-left: auto; padding-left: 12px; }",
      "  .hover-dot { position: absolute; width: 8px; height: 8px;",
      "               margin: -4px 0 0 -4px; border-radius: 50%;",
      "               box-shadow: 0 0 0 2px var(--card-background-color, #1b2433);",
      "               pointer-events: none; display: none; z-index: 1; }",
      "  #legend { display: flex; flex-wrap: wrap; gap: 10px 16px; margin-top: 6px;",
      "            font-family: var(--paper-font-body1_-_font-family, sans-serif);",
      "            font-size: 12px; color: var(--secondary-text-color, #7c8ca3); }",
      "  .item { display: flex; align-items: center; gap: 6px;",
      "          cursor: pointer; user-select: none; }",
      "  .item:hover { color: var(--primary-text-color, #c3cfdf); }",
      "  .item.off { opacity: 0.4; }",
      "  .item.off .dot { background: transparent !important;",
      "                   box-shadow: inset 0 0 0 2px currentColor; }",
      "  .item.off .value { text-decoration: line-through; }",
      "  .dot { width: 9px; height: 9px; border-radius: 50%; flex: none; }",
      "  .value { color: var(--primary-text-color, #c3cfdf);",
      "           font-variant-numeric: tabular-nums; }",
      "  #info { padding: 10px 0; font-size: 13px;",
      "          color: var(--secondary-text-color, #7c8ca3);",
      "          font-family: var(--paper-font-body1_-_font-family, sans-serif); }",
      "</style>",
      "<ha-card>",
      '  <div id="head">',
      '    <div id="title"></div>',
      '    <div id="periods"></div>',
      "  </div>",
      '  <div id="plot">',
      '    <svg id="chart" preserveAspectRatio="none"></svg>',
      '    <div id="dots"></div>',
      '    <div id="tip"></div>',
      "  </div>",
      '  <div id="legend"></div>',
      '  <div id="info"></div>',
      "</ha-card>",
    ].join("\n");

    const titleEl = this.shadowRoot.getElementById("title");
    titleEl.textContent = this._config.title;
    if (!this._config.title) titleEl.style.display = "none";
    this._renderPeriods();
    this._attachCursor();
    this._attachLegendToggle();
    // setConfig runs again on a live card (every change in the card editor):
    // fetch for the new config instead of staying blank until the timer.
    if (this._hass) this._fetch();
  }

  // Delegation, because the legend is rebuilt on every cursor move.
  _attachLegendToggle() {
    this.shadowRoot.getElementById("legend").addEventListener("click", (event) => {
      const item = event.target.closest(".item");
      if (!item || !item.dataset.entity) return;
      const id = item.dataset.entity;
      if (this._hidden.has(id)) this._hidden.delete(id);
      else this._hidden.add(id);
      this._draw(); // redraw rescales to whatever is left visible
    });
  }

  _renderPeriods() {
    const box = this.shadowRoot.getElementById("periods");
    box.innerHTML = "";
    for (const period of this._config.periods) {
      const button = document.createElement("button");
      button.textContent = period.label || periodLabel(this._lang(), period.days);
      if (period.days === this._days) button.className = "active";
      button.addEventListener("click", () => {
        if (this._days === period.days) return;
        this._days = period.days;
        this._renderPeriods();
        this.shadowRoot.getElementById("info").textContent = this._t("loading");
        this._fetch();
      });
      box.appendChild(button);
    }
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    // setConfig not called yet (unusual order) - it will fetch itself.
    if (!this._config) return;
    // NOTE: hass changes on EVERY event in the system. Fetching on each
    // update would be wasteful - refresh on a timer instead.
    if (first) {
      this._renderPeriods(); // labels in the user's language, now that it is known
      this._fetch();
    }
    this._ensureTimer();
  }

  // The timer runs only while the card is in the document. Dashboards move
  // cards around (edit mode, sections, conditional cards), so a card can be
  // detached and attached again - it has to come back to life then.
  _ensureTimer() {
    if (!this._timer && this.isConnected && this._hass && this._config) {
      this._timer = setInterval(() => this._fetch(), 5 * 60 * 1000);
    }
  }

  connectedCallback() {
    // data may be stale after being away; skip if fetched moments ago
    if (this._hass && this._config && Date.now() - (this._lastFetch || 0) > 60 * 1000) this._fetch();
    this._ensureTimer();
  }

  disconnectedCallback() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  async _fetch() {
    if (!this._hass || !this._config) return;
    this._lastFetch = Date.now();
    // Only the newest request may draw: switching 7d -> 24h -> 7d leaves two
    // 7-day requests in flight, and comparing `days` would let the older win.
    const request = (this._request = (this._request || 0) + 1);
    if (this._config.source === "influx") return this._fetchInflux(request);
    return this._fetchHaStatistics(request);
  }

  async _fetchInflux(request) {
    // We do NOT query InfluxDB straight from the browser. That would only
    // work on the home network - through a tunnel pointing at HA the
    // browser cannot reach a separate database host. So we ask HA, and HA
    // queries the database on its side (custom_components/influx_proxy).
    // As a bonus the database password stays on the server.
    const ids = this._config.entities.map((e) => e.entity).join(",");
    const path =
      "influx_proxy/series?entities=" + encodeURIComponent(ids) +
      "&days=" + this._days;
    try {
      const data = (await this._hass.callApi("get", path)) || {};
      if (request !== this._request) return; // a newer request was made meanwhile
      this._data = data;
      this._draw();
    } catch (err) {
      if (request !== this._request) return;
      const reason = (err && err.body && err.body.message) || (err && err.message) || err;
      this.shadowRoot.getElementById("info").textContent = isProxyMissing(err)
        ? this._t("influx_not_configured")
        : this._t("influx_failed", { reason });
    }
  }

  async _fetchHaStatistics(request) {
    const end = new Date();
    const start = new Date(end.getTime() - this._days * 864e5);
    const period = statisticsPeriod(this._days);
    try {
      const result = await this._hass.callWS({
        type: "recorder/statistics_during_period",
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        statistic_ids: this._config.entities.map((e) => e.entity),
        period: period,
        types: ["mean", "min", "max"],
      });
      if (request !== this._request) return;
      this._data = result || {};
      this._draw();
    } catch (err) {
      if (request !== this._request) return;
      this.shadowRoot.getElementById("info").textContent =
        this._t("stats_failed", { reason: (err && err.message) || err });
    }
  }

  _unit(entityId) {
    const state = this._hass && this._hass.states[entityId];
    return (state && state.attributes && state.attributes.unit_of_measurement) || "";
  }

  _label(item) {
    if (item.name) return item.name;
    const state = this._hass && this._hass.states[item.entity];
    return (state && state.attributes && state.attributes.friendly_name) || item.entity;
  }

  _draw() {
    const svg = this.shadowRoot.getElementById("chart");
    const info = this.shadowRoot.getElementById("info");
    const series = [];
    for (const item of this._config.entities) {
      const points = ownPoints(this._data, item.entity).filter(
        (p) => p.mean !== null && p.mean !== undefined
      );
      if (points.length) series.push(Object.assign({}, item, { points: points }));
    }
    if (!series.length) {
      svg.innerHTML = "";
      this._scale = null; // no stale hover over an empty chart
      this._series = null; // ...and no legend of the previous period on pointerleave
      this._visible = null;
      this.shadowRoot.getElementById("legend").innerHTML = "";
      info.textContent = this._t(this._config.source === "influx" ? "no_influx_data" : "no_statistics");
      return;
    }

    // Legend always lists everything; only visible series are drawn and
    // only they decide the scale - that is the point of switching them off.
    this._series = series;
    const visible = series.filter((s) => !this._hidden.has(s.entity));
    if (!visible.length) {
      svg.innerHTML = "";
      info.textContent = this._t("all_hidden");
      this._scale = null;
      this._renderLegend(null);
      return;
    }
    info.textContent = "";

    const WIDTH = 600;
    const HEIGHT = 220;
    const TOP = 8;
    const BOTTOM = 22;
    const leftSeries = visible.filter((s) => s.axis !== "right");
    const rightSeries = visible.filter((s) => s.axis === "right");
    const LEFT = leftSeries.length ? 44 : 8;
    const RIGHT = rightSeries.length ? 44 : 8;

    let tMin = Infinity;
    let tMax = -Infinity;
    for (const s of visible) {
      for (const p of s.points) {
        if (p.start < tMin) tMin = p.start;
        if (p.start > tMax) tMax = p.start;
      }
    }

    // Whichever side still has visible series becomes primary.
    const primaryGroup = leftSeries.length ? leftSeries : rightSeries;
    const secondaryGroup = leftSeries.length ? rightSeries : [];
    const { vMin, vMax, step, count, second } = computeAxes(
      valueRange(primaryGroup, this._config.showRange),
      secondaryGroup.length ? valueRange(secondaryGroup, this._config.showRange) : null,
      {
        yStep: this._config.yStep,
        primaryFloor: leftSeries.length ? this._config.yMinStep : this._config.yMinStepRight,
        secondaryFloor: this._config.yMinStepRight,
        minIntervals: this._config.yMinIntervals,
      }
    );

    // A single sample (or all at one moment): widen the time axis by an hour
    // each way, otherwise every x collapses onto the left edge.
    if (tMax === tMin) {
      tMin -= 3600e3;
      tMax += 3600e3;
    }
    const every = count > 12 ? Math.ceil(count / 12) : 1;
    const x = (t) => LEFT + ((t - tMin) / (tMax - tMin || 1)) * (WIDTH - LEFT - RIGHT);
    const yFor = (lo, hi) => (v) =>
      TOP + (1 - (v - lo) / (hi - lo)) * (HEIGHT - TOP - BOTTOM);
    const yPrimary = yFor(vMin, vMax);
    const ySecond = second ? yFor(second.min, second.max) : null;
    const yOf = (s) =>
      leftSeries.length && s.axis === "right" ? ySecond : yPrimary;
    const primarySide = leftSeries.length ? "left" : "right";

    // Tick labels take the series colour when their axis carries exactly
    // one series - that is what tells which scale belongs to which line.
    const labelColor = (group) =>
      group.length === 1 ? group[0].color : "var(--secondary-text-color,#7c8ca3)";
    const unitOf = (group) => {
      const units = Array.from(new Set(group.map((s) => this._unit(s.entity))));
      return units.length === 1 ? units[0] : "";
    };

    const axisLabels = (side, lo, st, group, y) => {
      const xx = side === "left" ? LEFT - 6 : WIDTH - RIGHT + 6;
      const anchor = side === "left" ? "end" : "start";
      const decimals = decimalsFor(st);
      const unit = unitOf(group);
      let txt = "";
      for (let i = 0; i <= count; i += every) {
        const value = lo + i * st;
        const top = i + every > count;
        txt +=
          '<text x="' + xx + '" y="' + (y(value) + 4) + '" text-anchor="' + anchor +
          '" font-size="11" fill="' + labelColor(group) + '">' +
          formatNumber(this._lang(), value, decimals) + (top && unit ? " " + escapeHtml(unit) : "") + "</text>";
      }
      return txt;
    };

    let out = "";
    for (let i = 0; i <= count; i += every) {
      const yy = yPrimary(vMin + i * step);
      out +=
        '<line x1="' + LEFT + '" y1="' + yy + '" x2="' + (WIDTH - RIGHT) +
        '" y2="' + yy + '" stroke="var(--divider-color,#2a3547)" stroke-width="1"/>';
    }
    out += axisLabels(primarySide, vMin, step, primaryGroup, yPrimary);
    if (second) out += axisLabels("right", second.min, second.step, secondaryGroup, ySecond);

    // Hours alone are ambiguous once the axis spans more than a day.
    const spanHours = (tMax - tMin) / 3600e3;
    const timeFormat = new Intl.DateTimeFormat(
      this._lang(),
      spanHours <= 24
        ? { hour: "2-digit", minute: "2-digit" }
        : spanHours <= 72
          ? { weekday: "short", hour: "2-digit", minute: "2-digit" }
          : { day: "numeric", month: "numeric" }
    );
    const formatTime = (t) => timeFormat.format(new Date(t));
    for (let i = 0; i <= 3; i++) {
      const t = tMin + ((tMax - tMin) * i) / 3;
      const anchor = i === 0 ? "start" : i === 3 ? "end" : "middle";
      out +=
        '<text x="' + x(t) + '" y="' + (HEIGHT - 6) + '" text-anchor="' + anchor +
        '" font-size="11" fill="var(--secondary-text-color,#7c8ca3)">' +
        formatTime(t) + "</text>";
    }

    for (const s of visible) {
      const y = yOf(s);
      if (this._config.showRange && s.points.some((p) => p.min != null)) {
        const upper = s.points.map(
          (p) => x(p.start) + "," + y(p.max != null ? p.max : p.mean)
        );
        const lower = s.points
          .slice()
          .reverse()
          .map((p) => x(p.start) + "," + y(p.min != null ? p.min : p.mean));
        out +=
          '<polygon points="' + upper.concat(lower).join(" ") + '" fill="' +
          s.color + '" opacity="0.12"/>';
      }
      // one sample: a short dash, a one-point polyline draws nothing
      const line = s.points.length === 1
        ? (x(s.points[0].start) - 5) + "," + y(s.points[0].mean) + " " +
          (x(s.points[0].start) + 5) + "," + y(s.points[0].mean)
        : s.points.map((p) => x(p.start) + "," + y(p.mean)).join(" ");
      out +=
        '<polyline points="' + line + '" fill="none" stroke="' + s.color +
        '" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>';
    }
    out +=
      '<line id="cursor" x1="0" y1="' + TOP + '" x2="0" y2="' + (HEIGHT - BOTTOM) +
      '" stroke="var(--primary-text-color,#c3cfdf)" stroke-width="1"' +
      ' opacity="0" pointer-events="none"/>';

    svg.setAttribute("viewBox", "0 0 " + WIDTH + " " + HEIGHT);
    svg.style.height = "220px";
    svg.innerHTML = out;
    this._scale = {
      x: x, tMin: tMin, tMax: tMax, width: WIDTH, height: HEIGHT,
      left: LEFT, right: RIGHT, yOf: yOf,
    };
    this._visible = visible;
    this.shadowRoot.getElementById("dots").innerHTML = visible
      .map((s) => '<span class="hover-dot" style="background:' + s.color + '"></span>')
      .join("");
    this._renderLegend(null);
  }

  _renderLegend(atTime) {
    const el = this.shadowRoot.getElementById("legend");
    if (!this._series) return;
    el.innerHTML = this._series
      .map((s) => {
        let point = s.points[s.points.length - 1];
        if (atTime != null) {
          let best = Infinity;
          for (const p of s.points) {
            const distance = Math.abs(p.start - atTime);
            if (distance < best) {
              best = distance;
              point = p;
            }
          }
        }
        const unit = this._unit(s.entity);
        const label = escapeHtml(this._label(s));
        const off = this._hidden.has(s.entity) ? " off" : "";
        return (
          '<span class="item' + off + '" data-entity="' + escapeHtml(s.entity) +
          '" title="' + escapeHtml(this._t("toggle_hint")) + '"><span class="dot" style="color:' +
          s.color + ";background:" + s.color + '"></span><span>' + label +
          '</span><span class="value">' + formatNumber(this._lang(), point.mean, this._config.decimals) +
          (unit ? " " + escapeHtml(unit) : "") + "</span></span>"
        );
      })
      .join("");
  }

  _attachCursor() {
    const svg = this.shadowRoot.getElementById("chart");
    const tip = this.shadowRoot.getElementById("tip");
    const when = (t) =>
      new Intl.DateTimeFormat(this._lang(), {
        weekday: "short", day: "numeric", month: "2-digit", hour: "2-digit", minute: "2-digit",
      }).format(new Date(t));
    const nearest = (points, t) => {
      let best = points[0];
      let gap = Infinity;
      for (const p of points) {
        const distance = Math.abs(p.start - t);
        if (distance < gap) {
          gap = distance;
          best = p;
        }
      }
      return best;
    };
    let hideTimer = null;

    const hide = () => {
      const cursor = svg.querySelector("#cursor");
      if (cursor) cursor.setAttribute("opacity", "0");
      tip.classList.remove("on");
      for (const dot of this.shadowRoot.querySelectorAll(".hover-dot")) dot.style.display = "none";
      this._renderLegend(null);
    };

    const onMove = (event) => {
      if (!this._scale || !this._visible || !this._visible.length) return;
      if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }
      const sc = this._scale;
      const rect = svg.getBoundingClientRect();
      const px = ((event.clientX - rect.left) / rect.width) * sc.width;
      const ratio = Math.max(0, Math.min(1, (px - sc.left) / (sc.width - sc.left - sc.right)));
      const t = sc.tMin + ratio * (sc.tMax - sc.tMin);

      // Snap to a real sample of the first visible series, so the line and
      // the tooltip point at a measured value, not in between two.
      const snapped = nearest(this._visible[0].points, t).start;
      const sx = sc.x(snapped);
      const cssX = (sx / sc.width) * rect.width;

      const cursor = svg.querySelector("#cursor");
      if (cursor) {
        cursor.setAttribute("x1", sx);
        cursor.setAttribute("x2", sx);
        cursor.setAttribute("opacity", "0.5");
      }

      const dots = this.shadowRoot.querySelectorAll(".hover-dot");
      let rows = "";
      this._visible.forEach((s, i) => {
        const p = nearest(s.points, snapped);
        const dot = dots[i];
        if (dot) {
          dot.style.display = "block";
          dot.style.left = (sc.x(p.start) / sc.width) * rect.width + "px";
          dot.style.top = (sc.yOf(s)(p.mean) / sc.height) * rect.height + "px";
        }
        const unit = this._unit(s.entity);
        const label = escapeHtml(this._label(s));
        rows +=
          '<div class="row"><span class="dot" style="background:' + s.color +
          '"></span>' + label + "<b>" + formatNumber(this._lang(), p.mean, this._config.decimals) +
          (unit ? " " + escapeHtml(unit) : "") +
          "</b></div>";
      });
      tip.innerHTML = '<div class="when">' + when(snapped) + "</div>" + rows;

      // Right of the line, or left of it when there is no room.
      const width = tip.offsetWidth;
      let left = cssX + 12;
      if (left + width > rect.width) left = cssX - 12 - width;
      tip.style.left = Math.max(0, left) + "px";
      tip.classList.add("on");
      this._renderLegend(snapped);
    };

    svg.addEventListener("pointermove", onMove);
    // A tap should show the values too, not only a drag.
    svg.addEventListener("pointerdown", onMove);
    svg.addEventListener("pointerleave", (event) => {
      // On a phone the finger leaves the moment it lifts; give the reader
      // a few seconds instead of snatching the tooltip away.
      if (event.pointerType === "touch") {
        if (hideTimer) clearTimeout(hideTimer);
        hideTimer = setTimeout(hide, 4000);
        return;
      }
      hide();
    });
  }

  _lang() {
    const h = this._hass;
    return (h && ((h.locale && h.locale.language) || h.language)) || navigator.language || "en";
  }

  _t(key, vars) {
    return translate(this._lang(), key, vars);
  }

  getCardSize() {
    return 4;
  }

  // Sections view (HA 2024.11+): full width by default.
  getGridOptions() {
    return { columns: 12, min_columns: 6, rows: 4, min_rows: 3 };
  }

  // Card picker preview: up to two numeric entities that have statistics.
  static getStubConfig(hass) {
    const picks = Object.values((hass && hass.states) || {})
      .filter((s) => s.attributes && s.attributes.state_class && s.attributes.unit_of_measurement)
      .slice(0, 2)
      .map((s) => s.entity_id);
    return { type: "custom:" + CARD_NAME, entities: picks.length ? picks : ["sensor.example_temperature"] };
  }
}

if (!customElements.get(CARD_NAME)) {
  customElements.define(CARD_NAME, LongTermChartCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: CARD_NAME,
    name: translate(navigator.language, "card_name"),
    description: translate(navigator.language, "card_description"),
    preview: true,
    documentationURL: "https://github.com/stryczekk/long-term-chart-card",
  });
  console.info("%c LONG-TERM-CHART-CARD %c " + VERSION + " ", "background:#ffc300;color:#131a24", "");
}
