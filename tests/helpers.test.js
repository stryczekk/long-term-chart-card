// Unit tests for the pure helpers of the card - no browser needed.
//   node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";

// Minimal browser stand-ins so the card file can be imported as-is.
globalThis.HTMLElement = class {};
globalThis.window = globalThis;
globalThis.customElements = { _d: new Map(), get(n) { return this._d.get(n); }, define(n, c) { this._d.set(n, c); } };
if (typeof globalThis.navigator === "undefined") globalThis.navigator = { language: "en" };

const card = await import("../long-term-chart-card.js");

test("card registers itself once under its name", () => {
  assert.equal(customElements.get("long-term-chart-card"), card.LongTermChartCard);
  assert.equal(window.customCards.filter((c) => c.type === "long-term-chart-card").length, 1);
});

test("niceStep picks round steps for 4-6 grid lines", () => {
  assert.equal(card.niceStep(0), 1);
  assert.equal(card.niceStep(1), 0.2);
  assert.equal(card.niceStep(3), 0.5);
  assert.equal(card.niceStep(10), 2);
  assert.equal(card.niceStep(25), 5);
  // large ranges get large steps - the ladder used to stop at 500
  assert.equal(card.niceStep(100000), 20000);
  assert.ok(100000 / card.niceStep(100000) <= 6);
});

test("computeAxes: a wide secondary range fits (was clipped at count x 500)", () => {
  const a = card.computeAxes({ lo: 20, hi: 22 }, { lo: 0, hi: 8000 });
  assert.ok(a.second.max >= 8000, JSON.stringify(a.second));
  assert.ok(a.second.min <= 0);
});

test("decimalsFor prints steps exactly", () => {
  assert.equal(card.decimalsFor(5), 0);
  assert.equal(card.decimalsFor(2.5), 1);
  assert.equal(card.decimalsFor(0.25), 2);
  assert.equal(card.decimalsFor(0.1), 1);
  assert.equal(card.decimalsFor(0.001), 3);
});

test("safeColor accepts CSS colours, rejects markup", () => {
  for (const ok of ["#fc0", "#ffcc00", "#ffcc0080", "red", "rgb(1, 2, 3)", "rgba(1,2,3,0.5)", "hsl(120deg 50% 50%)", "var(--accent-color)"]) {
    assert.equal(card.safeColor(ok, "F"), ok, ok);
  }
  for (const bad of ['red" onmouseover="alert(1)', 'red"><img src=x onerror=alert(1)>', 'red"/><foreignObject>',
                     "red;background:url(javascript:x)", "url(x)", "expression(alert(1))", "", null, 42, {}]) {
    assert.equal(card.safeColor(bad, "F"), "F", String(bad));
  }
});

test("ownPoints ignores prototype keys", () => {
  assert.deepEqual(card.ownPoints({}, "__proto__"), []);
  assert.deepEqual(card.ownPoints({}, "constructor"), []);
  assert.deepEqual(card.ownPoints({ "sensor.a": [1] }, "sensor.a"), [1]);
  assert.deepEqual(card.ownPoints(null, "sensor.a"), []);
});

test("setConfig rejects entity objects without an id", () => {
  const el = new card.LongTermChartCard();
  assert.throws(() => el.setConfig({ entities: [{ name: "x" }] }));
});

test("valueRange uses the min/max band only when shown", () => {
  const g = [{ points: [{ mean: 20, min: 18, max: 23 }, { mean: 21, min: 19, max: 22 }] }];
  assert.deepEqual(card.valueRange(g, true), { lo: 18, hi: 23 });
  assert.deepEqual(card.valueRange(g, false), { lo: 20, hi: 21 });
});

test("valueRange widens a flat line", () => {
  assert.deepEqual(card.valueRange([{ points: [{ mean: 5 }, { mean: 5 }] }], true), { lo: 4.5, hi: 5.5 });
});

test("computeAxes: round grid around the data", () => {
  const a = card.computeAxes({ lo: 20.3, hi: 24.6 }, null);
  assert.equal(a.step, 1);
  assert.equal(a.vMin, 20);
  assert.equal(a.vMax, 25);
  assert.equal(a.count, 5);
  assert.equal(a.second, null);
});

test("computeAxes: step floor keeps a quiet day calm", () => {
  const a = card.computeAxes({ lo: 21.1, hi: 21.8 }, null, { primaryFloor: 0.5 });
  assert.equal(a.step, 0.5);
});

test("computeAxes: minimum intervals widen the range around the data", () => {
  const a = card.computeAxes({ lo: 21.1, hi: 21.8 }, null, { primaryFloor: 1, minIntervals: 4 });
  assert.equal(a.count, 4);
  assert.ok(a.vMin <= 21.1 && a.vMax >= 21.8);
  assert.equal(a.vMax - a.vMin, 4);
});

test("computeAxes: forced y_step wins", () => {
  assert.equal(card.computeAxes({ lo: 0, hi: 100 }, null, { yStep: 5 }).step, 5);
});

test("computeAxes: secondary axis shares the number of intervals", () => {
  const a = card.computeAxes({ lo: 20, hi: 25 }, { lo: 40, hi: 70 });
  assert.equal(a.second.max - a.second.min, a.count * a.second.step);
  assert.ok(a.second.min <= 40 && a.second.max >= 70);
});

test("computeAxes: secondary floor respected", () => {
  const a = card.computeAxes({ lo: 20, hi: 25 }, { lo: 50, hi: 51 }, { secondaryFloor: 2 });
  assert.ok(a.second.step >= 2);
});

test("statisticsPeriod: 5-minute data only for short ranges", () => {
  assert.equal(card.statisticsPeriod(1), "5minute");
  assert.equal(card.statisticsPeriod(2), "5minute");
  assert.equal(card.statisticsPeriod(7), "hour");
});

test("isProxyMissing: 404 (never loaded) and 503 (not configured)", () => {
  assert.ok(card.isProxyMissing({ status_code: 404 }));
  assert.ok(card.isProxyMissing({ status_code: 503 }));
  assert.ok(!card.isProxyMissing({ status_code: 502 }));
  assert.ok(!card.isProxyMissing(new Error("x")));
});

test("translate: language, fallback to English, placeholders", () => {
  assert.equal(card.translate("pl", "loading"), "Wczytywanie...");
  assert.equal(card.translate("pl-PL", "loading"), "Wczytywanie...");
  assert.equal(card.translate("de", "loading"), "Loading...");
  assert.equal(card.translate("en", "stats_failed", { reason: "boom" }), "Could not load statistics: boom");
});

test("every language has every key", () => {
  const keys = Object.keys(card.STRINGS.en).sort();
  for (const [lang, table] of Object.entries(card.STRINGS)) {
    assert.deepEqual(Object.keys(table).sort(), keys, lang);
  }
});

test("periodLabel", () => {
  assert.equal(card.periodLabel("en", 1), "24 h");
  assert.equal(card.periodLabel("en", 7), "7 days");
  assert.equal(card.periodLabel("pl", 7), "7 dni");
  assert.equal(card.periodLabel("en", 90), "3 months");
  assert.equal(card.periodLabel("pl", 365), "rok");
  assert.equal(card.periodLabel("en", 0.5), "12 h");
});

test("formatNumber follows the locale", () => {
  assert.equal(card.formatNumber("en", 21.25, 1), "21.3");
  assert.equal(card.formatNumber("pl", 21.25, 1), "21,3");
  assert.equal(card.formatNumber("en", 5, 0), "5");
});

test("escapeHtml", () => {
  assert.equal(card.escapeHtml('<b a="1">&\''), "&lt;b a=&quot;1&quot;&gt;&amp;&#39;");
});

test("getStubConfig picks entities with statistics", () => {
  const hass = { states: {
    "sensor.t": { entity_id: "sensor.t", attributes: { state_class: "measurement", unit_of_measurement: "°C" } },
    "sensor.n": { entity_id: "sensor.n", attributes: {} },
  } };
  assert.deepEqual(card.LongTermChartCard.getStubConfig(hass).entities, ["sensor.t"]);
});

test("numberOption: default for unusable values, clamped otherwise", () => {
  assert.equal(card.numberOption(undefined, 220, 80, 1000), 220);
  assert.equal(card.numberOption(null, 220, 80, 1000), 220);
  assert.equal(card.numberOption("", 220, 80, 1000), 220);
  assert.equal(card.numberOption("tall", 220, 80, 1000), 220);
  assert.equal(card.numberOption(NaN, 220, 80, 1000), 220);
  assert.equal(card.numberOption(300, 220, 80, 1000), 300);
  assert.equal(card.numberOption("300", 220, 80, 1000), 300);
  assert.equal(card.numberOption(10, 220, 80, 1000), 80);
  assert.equal(card.numberOption(5000, 220, 80, 1000), 1000);
  assert.equal(card.numberOption(0, 0.12, 0, 1), 0); // zero is a value, not "missing"
});

test("gridRows: default height keeps the 1.0 size, taller charts take more rows", () => {
  assert.equal(card.gridRows(220), 4);
  assert.equal(card.gridRows(80), 3);
  assert.ok(card.gridRows(500) > card.gridRows(220));
});
