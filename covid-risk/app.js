import {
  DEFAULT_EVENT, DEFAULT_PREVALENCE,
  DEFAULT_IC_MASK_MIX, DEFAULT_IC_VAX_MIX,
  DEFAULT_NON_IC_MASK_MIX, DEFAULT_NON_IC_VAX_MIX,
  DEFAULT_AGE_DISTRIBUTION, DEFAULT_SELF_SELECTION,
  DEFAULT_MONTHS_SINCE_VAX, DEFAULT_SYMPTOMATIC_ATTENDANCE,
  GENERAL_IC_MASK_MIX, GENERAL_IC_VAX_MIX,
  MASK_PROTECTION,
  veFromMonthsSinceVax, attendableFraction,
  HYBRID_IMMUNITY_IC, HYBRID_IMMUNITY_NON_IC,
  quantaPerHour, transientDoseFactor,
  blendedSourceEmissionFactor, blendedCurrentVaxFraction,
  peerVaxPrevalenceFactor,
  expectedIcAttendees,
  perEventInfectionProb, aggregateEventRisk,
  fmtProb, fmtRange,
} from "./model.js";

// --- Input schema ------------------------------------------------------
// Maps DOM id -> { get(state), set(state, v), parse } so we can drive both
// directions (read from URL / defaults; write into state).

const scalarFields = [
  "attendees", "duration_hours", "room_volume_m3",
  "air_changes_per_hour", "breathing_rate_m3_per_hour",
  "months_since_vax",
];

const activityIds = {
  breathing:    "min_breathing",
  speaking:     "min_speaking",
  singing_loud: "min_singing_loud",
  eating:       "min_eating",
};

const prevFields = [
  "symptomatic_attendance",
];

const icMaskFields = {
  n95_fit_tested: "ic_mask_n95_fit_tested",
  n95_casual:     "ic_mask_n95_casual",
  kn95_typical:   "ic_mask_kn95_typical",
  surgical:       "ic_mask_surgical",
  cloth:          "ic_mask_cloth",
  none:           "ic_mask_none",
};

const icVaxFields = {
  "vax+prep": "ic_vax_prep",
  "vax_only": "ic_vax_only",
  "old_vax":  "ic_vax_old",
  "none":     "ic_vax_none",
};

const nicMaskFields = {
  n95_fit_tested: "nic_mask_n95_fit_tested",
  n95_casual:     "nic_mask_n95_casual",
  kn95_typical:   "nic_mask_kn95_typical",
  surgical:       "nic_mask_surgical",
  cloth:          "nic_mask_cloth",
  none:           "nic_mask_none",
};

const nicVaxFields = {
  vax_current: "nic_vax_current",
  vax_old:     "nic_vax_old",
  none:        "nic_vax_none",
};

// --- State -------------------------------------------------------------

function freshState() {
  return {
    event: {
      ...DEFAULT_EVENT,
      activities: DEFAULT_EVENT.activities.map(a => ({ ...a })),
    },
    prev: { ...DEFAULT_PREVALENCE },
    ic_mask_mix: { ...DEFAULT_IC_MASK_MIX },
    ic_vax_mix: { ...DEFAULT_IC_VAX_MIX },
    non_ic_mask_mix: { ...DEFAULT_NON_IC_MASK_MIX },
    non_ic_vax_mix: { ...DEFAULT_NON_IC_VAX_MIX },
    self_selection: DEFAULT_SELF_SELECTION,
    months_since_vax: DEFAULT_MONTHS_SINCE_VAX,
    events_per_year: 12,
  };
}

let state = freshState();

// --- DOM helpers -------------------------------------------------------

const $ = (id) => document.getElementById(id);

function setInputValue(id, v) {
  const el = $(id);
  if (!el) return;
  el.value = typeof v === "number" ? formatInputNumber(v) : v;
}

function formatInputNumber(v) {
  if (Number.isInteger(v)) return String(v);
  // Keep enough precision for small fractions (prevalence).
  if (Math.abs(v) < 0.01) return v.toPrecision(3);
  return Number(v.toFixed(3)).toString();
}

function readNumber(id) {
  const v = parseFloat($(id).value);
  return Number.isFinite(v) ? v : 0;
}

// --- Populate form from state -----------------------------------------

function stateToForm() {
  setInputValue("attendees", state.event.attendees);
  setInputValue("duration_hours", state.event.duration_hours);
  setInputValue("room_volume_m3", state.event.room_volume_m3);
  setInputValue("air_changes_per_hour", state.event.air_changes_per_hour);
  setInputValue("breathing_rate_m3_per_hour", state.event.breathing_rate_m3_per_hour);
  setInputValue("months_since_vax", state.months_since_vax);

  for (const a of state.event.activities) {
    setInputValue(activityIds[a.activity], a.minutes);
  }

  setInputValue("community_infectious_low", state.prev.community_infectious_low);
  setInputValue("community_infectious_high", state.prev.community_infectious_high);
  setInputValue("symptomatic_attendance", state.prev.symptomatic_attendance);

  setInputValue("self_selection", state.self_selection);
  setInputValue("events_per_year", state.events_per_year);

  for (const [k, id] of Object.entries(icMaskFields)) {
    setInputValue(id, state.ic_mask_mix[k]);
  }
  for (const [k, id] of Object.entries(icVaxFields)) {
    setInputValue(id, state.ic_vax_mix[k]);
  }
  for (const [k, id] of Object.entries(nicMaskFields)) {
    setInputValue(id, state.non_ic_mask_mix[k]);
  }
  for (const [k, id] of Object.entries(nicVaxFields)) {
    setInputValue(id, state.non_ic_vax_mix[k]);
  }
}

function formToState() {
  state.event.attendees = Math.max(2, Math.round(readNumber("attendees")));
  state.event.duration_hours = readNumber("duration_hours");
  state.event.room_volume_m3 = readNumber("room_volume_m3");
  state.event.air_changes_per_hour = readNumber("air_changes_per_hour");
  state.event.breathing_rate_m3_per_hour = readNumber("breathing_rate_m3_per_hour");
  state.months_since_vax = readNumber("months_since_vax");
  state.event.ve_infection = veFromMonthsSinceVax(state.months_since_vax);

  for (const a of state.event.activities) {
    a.minutes = readNumber(activityIds[a.activity]);
  }

  state.prev.community_infectious_low = readNumber("community_infectious_low");
  state.prev.community_infectious_high = readNumber("community_infectious_high");
  state.prev.symptomatic_attendance = readNumber("symptomatic_attendance");

  state.self_selection = readNumber("self_selection");
  state.events_per_year = Math.max(1, Math.round(readNumber("events_per_year")));

  for (const [k, id] of Object.entries(icMaskFields)) {
    state.ic_mask_mix[k] = readNumber(id);
  }
  for (const [k, id] of Object.entries(icVaxFields)) {
    state.ic_vax_mix[k] = readNumber(id);
  }
  for (const [k, id] of Object.entries(nicMaskFields)) {
    state.non_ic_mask_mix[k] = readNumber(id);
  }
  for (const [k, id] of Object.entries(nicVaxFields)) {
    state.non_ic_vax_mix[k] = readNumber(id);
  }
}

// --- Mix normalization/validation -------------------------------------

function sumOf(obj) {
  return Object.values(obj).reduce((a, b) => a + b, 0);
}

function renderMixPcts(fieldMap, normalizedMix) {
  for (const [k, id] of Object.entries(fieldMap)) {
    const el = $(`${id}_pct`);
    if (el) el.textContent = `${Math.round(normalizedMix[k] * 100)}%`;
  }
}

// Normalize a mix in place so it sums to 1.0. If sum is zero, reset to
// uniform over the keys so we never divide by zero.
function normalizeMix(mix) {
  const s = sumOf(mix);
  if (s <= 0) {
    const keys = Object.keys(mix);
    for (const k of keys) mix[k] = 1 / keys.length;
    return { ...mix };
  }
  const out = {};
  for (const [k, v] of Object.entries(mix)) out[k] = v / s;
  return out;
}

// --- Render outputs ----------------------------------------------------

function fmtNum(v, digits = 2) {
  return v.toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

function render() {
  formToState();

  // Normalize mixes for calculation but preserve raw inputs in the form.
  const icMaskMix = normalizeMix({ ...state.ic_mask_mix });
  const icVaxMix = normalizeMix({ ...state.ic_vax_mix });
  const nicMaskMix = normalizeMix({ ...state.non_ic_mask_mix });
  const nicVaxMix = normalizeMix({ ...state.non_ic_vax_mix });

  const ev = { ...state.event };
  const prev = state.prev;

  // Slider readouts
  const months = state.months_since_vax;
  const veInf = ev.ve_infection;
  $("months_since_vax_out").textContent = months >= 12
    ? `not this season (VE 0%)`
    : `${months} mo (VE ${Math.round(veInf * 100)}%)`;
  const sympAtt = prev.symptomatic_attendance;
  const attFrac = attendableFraction(sympAtt);
  $("symptomatic_attendance_out").textContent =
    `${Math.round(sympAtt * 100)}% (${Math.round(attFrac * 100)}% of infectious attend)`;
  $("self_selection_out").textContent = state.self_selection.toFixed(2);

  // Mix slider percentages (show normalized share)
  const actTotal = ev.activities.reduce((s, a) => s + a.minutes, 0);
  const durationMin = ev.duration_hours * 60;
  for (const a of ev.activities) {
    const el = $(`${activityIds[a.activity]}_pct`);
    if (el && actTotal > 0) {
      const pct = Math.round(a.minutes / actTotal * 100);
      const mins = Math.round(a.minutes / actTotal * durationMin);
      el.textContent = `${pct}% (${mins} min)`;
    } else if (el) {
      el.textContent = "0%";
    }
  }
  renderMixPcts(icMaskFields, icMaskMix);
  renderMixPcts(icVaxFields, icVaxMix);
  renderMixPcts(nicMaskFields, nicMaskMix);
  renderMixPcts(nicVaxFields, nicVaxMix);

  // Aggregate (compute first — we need blended values for diagnostics)
  const agg = aggregateEventRisk(ev, prev, {
    age_distribution: DEFAULT_AGE_DISTRIBUTION,
    ic_mask_mix: icMaskMix,
    ic_vax_mix: icVaxMix,
    non_ic_mask_mix: nicMaskMix,
    non_ic_vax_mix: nicVaxMix,
    self_selection: state.self_selection,
  });

  // Emission & exposure diagnostics (using blended values from aggregate)
  const srcEmit = agg.sourceEmissionFactor;
  const curVaxFrac = agg.currentVaxFraction;
  const pvPrev = peerVaxPrevalenceFactor(curVaxFrac, ev.ve_infection);

  const qMed = quantaPerHour(ev.activities, "median");
  const qMean = quantaPerHour(ev.activities, "mean");
  const qP90 = quantaPerHour(ev.activities, "p90");
  const tFactor = transientDoseFactor(ev.duration_hours, ev.air_changes_per_hour);

  const effAttFrac = attendableFraction(prev.symptomatic_attendance);
  const effPrevLo = prev.community_infectious_low * effAttFrac * pvPrev;
  const effPrevHi = prev.community_infectious_high * effAttFrac * pvPrev;

  $("out_q_median").textContent = fmtNum(qMed);
  $("out_q_mean").textContent = fmtNum(qMean);
  $("out_q_p90").textContent = fmtNum(qP90);
  $("out_transient").textContent = `×${fmtNum(tFactor, 3)}`;
  $("out_eff_prevalence").textContent =
    `${(effPrevLo * 100).toFixed(3)}% – ${(effPrevHi * 100).toFixed(3)}%`;
  $("out_exp_inf_attendees").textContent =
    `${fmtNum((ev.attendees - 1) * effPrevLo, 3)} – ${fmtNum((ev.attendees - 1) * effPrevHi, 3)}`;
  $("out_blended_vax_frac").textContent = `${(curVaxFrac * 100).toFixed(1)}%`;
  $("out_peer_vax_prev").textContent = `×${fmtNum(pvPrev, 3)}`;
  $("out_peer_mask_emit").textContent = `×${fmtNum(srcEmit, 3)}`;

  // P(infection) by mask
  const tbody = $("tbl_p_inf_by_mask").querySelector("tbody");
  tbody.innerHTML = "";
  const masks = ["none", "cloth", "surgical", "kn95_typical", "n95_casual", "n95_fit_tested"];
  for (const m of masks) {
    const nic = perEventInfectionProb(ev, prev, MASK_PROTECTION[m],
      { hybrid_immunity: HYBRID_IMMUNITY_NON_IC,
        sourceEmissionFactor: srcEmit, currentVaxFraction: curVaxFrac });
    const ic = perEventInfectionProb(ev, prev, MASK_PROTECTION[m],
      { hybrid_immunity: HYBRID_IMMUNITY_IC,
        sourceEmissionFactor: srcEmit, currentVaxFraction: curVaxFrac });
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${m}</td>
      <td>${(MASK_PROTECTION[m] * 100).toFixed(0)}%</td>
      <td>IC: ${fmtRange(ic)}<br>non-IC: ${fmtRange(nic)}</td>`;
    tbody.appendChild(row);
  }

  $("out_ic_total").textContent = fmtNum(agg.expected_ic_attendees);
  $("out_ic_severe").textContent = fmtNum(agg.ic_by_severity.severe);
  $("out_ic_moderate").textContent = fmtNum(agg.ic_by_severity.moderate);
  $("out_ic_mild").textContent = fmtNum(agg.ic_by_severity.mild);
  $("out_non_ic_total").textContent = fmtNum(agg.expected_non_ic_attendees, 1);

  // Combined totals (IC + non-IC)
  const addRanges = (a, b) => [a[0] + b[0], a[1] + b[1]];

  const totalInf = addRanges(agg.expected_infections, agg.expected_non_ic_infections);
  const totalHosp = addRanges(agg.expected_hospitalizations, agg.expected_non_ic_hospitalizations);
  const totalLc = addRanges(agg.expected_long_covid, agg.expected_non_ic_long_covid);

  const totalsBody = $("tbl_totals").querySelector("tbody");
  totalsBody.innerHTML = "";
  const totalRows = [
    ["Infections",       totalInf],
    ["Hospitalizations", totalHosp],
    ["Long-COVID",       totalLc],
  ];
  for (const [label, exp] of totalRows) {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${label}</td>
      <td>${fmtRange(exp)}</td>`;
    totalsBody.appendChild(row);
  }

  // IC / non-IC breakdown
  const aggBody = $("tbl_aggregate").querySelector("tbody");
  aggBody.innerHTML = "";
  const aggRows = [
    ["IC infections",                agg.expected_infections],
    ["IC hospitalizations",          agg.expected_hospitalizations],
    ["IC hospitalizations (mod+sev)",agg.expected_hospitalizations_mod_sev],
    ["IC long-COVID",                agg.expected_long_covid],
    ["Non-IC infections",            agg.expected_non_ic_infections],
    ["Non-IC hospitalizations",      agg.expected_non_ic_hospitalizations],
    ["Non-IC long-COVID",            agg.expected_non_ic_long_covid],
  ];
  for (const [label, exp] of aggRows) {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${label}</td>
      <td>${fmtRange(exp)}</td>`;
    aggBody.appendChild(row);
  }

  // Annual
  const annBody = $("tbl_annual").querySelector("tbody");
  annBody.innerHTML = "";
  const n = state.events_per_year;
  const annualRows = [
    ["Infections",       totalInf],
    ["Hospitalizations", totalHosp],
    ["Long-COVID",       totalLc],
  ];
  for (const [label, exp] of annualRows) {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${label}</td>
      <td>${fmtRange([exp[0] * n, exp[1] * n])}</td>`;
    annBody.appendChild(row);
  }

  writeUrlParams();
}

// --- IC preset --------------------------------------------------------

function applyIcPreset(name) {
  if (name === "regimented") {
    Object.assign(state.ic_mask_mix, DEFAULT_IC_MASK_MIX);
    Object.assign(state.ic_vax_mix, DEFAULT_IC_VAX_MIX);
  } else if (name === "general") {
    Object.assign(state.ic_mask_mix, GENERAL_IC_MASK_MIX);
    Object.assign(state.ic_vax_mix, GENERAL_IC_VAX_MIX);
  }
  stateToForm();
  render();
}

// --- URL shareable state ----------------------------------------------

function collectAllInputIds() {
  return [
    ...scalarFields,
    ...Object.values(activityIds),
    ...prevFields,
    "self_selection",
    "events_per_year",
    ...Object.values(icMaskFields),
    ...Object.values(icVaxFields),
    ...Object.values(nicMaskFields),
    ...Object.values(nicVaxFields),
  ];
}

let urlTimer = null;
function writeUrlParams() {
  clearTimeout(urlTimer);
  urlTimer = setTimeout(() => {
    const params = new URLSearchParams();
    for (const id of collectAllInputIds()) {
      const el = $(id);
      if (el) params.set(id, el.value);
    }
    history.replaceState(null, "", "?" + params.toString());
  }, 150);
}

function readUrlParams() {
  if (!location.search) return;
  const params = new URLSearchParams(location.search);
  for (const id of collectAllInputIds()) {
    if (params.has(id)) {
      const el = $(id);
      if (el) el.value = params.get(id);
    }
  }
}

// --- Live prevalence from SF hospitalization data ---------------------

const SF_HOSP_API = "https://data.sfgov.org/resource/ppwr-akuv.json"
  + "?$where=respiratory_virus='COVID-19'"
  + "&$order=week_end_date DESC&$limit=8";
const SF_POP = 836321;
const INFECTIOUS_DAYS = 7;
// IHR range: fraction of all infections (including asymptomatic) that
// result in hospitalization. Lower IHR → more infections per hosp → higher
// prevalence estimate. We use this range to produce low/high bounds.
const IHR_HIGH = 0.025;  // fewer inferred infections → low prevalence
const IHR_LOW  = 0.015;  // more inferred infections → high prevalence
const AVERAGING_WEEKS = 4;

async function fetchSfPrevalence() {
  try {
    const resp = await fetch(SF_HOSP_API);
    if (!resp.ok) return null;
    const rows = await resp.json();
    if (!rows.length) return null;

    // Use the most recent AVERAGING_WEEKS weeks with data
    const rates = rows
      .slice(0, AVERAGING_WEEKS)
      .map(r => parseFloat(r.admission_rate_per_100k));
    if (rates.some(r => !Number.isFinite(r))) return null;

    const avgRate = rates.reduce((a, b) => a + b, 0) / rates.length;
    // avgRate = weekly hospitalizations per 100K
    // weekly infections per 100K = avgRate / IHR
    // point prevalence = weekly infections * (infectious_days/7) / 100K
    const low  = (avgRate / IHR_HIGH) * (INFECTIOUS_DAYS / 7) / 1e5;
    const high = (avgRate / IHR_LOW)  * (INFECTIOUS_DAYS / 7) / 1e5;

    const dataAsOf = rows[0].week_end_date?.slice(0, 10) || null;
    return { low, high, dataAsOf, avgRate, weeks: rates.length };
  } catch {
    return null;
  }
}

function applyLivePrevalence(est) {
  state.prev.community_infectious_low = est.low;
  state.prev.community_infectious_high = est.high;
  setInputValue("community_infectious_low", est.low);
  setInputValue("community_infectious_high", est.high);

  const note = $("prevalence_live_note");
  if (note) {
    note.textContent = `Auto-populated from SF hospital admissions `
      + `(${AVERAGING_WEEKS}-week avg: ${est.avgRate.toFixed(2)}/100K/wk, `
      + `data through ${est.dataAsOf})`;
    note.style.display = "block";
  }

  render();
}

// --- Wire up ----------------------------------------------------------

function onAnyInput() {
  render();
}

function init() {
  stateToForm();
  readUrlParams();

  for (const id of collectAllInputIds()) {
    const el = $(id);
    if (!el) continue;
    el.addEventListener("input", onAnyInput);
  }

  $("ic_preset").addEventListener("change", (e) => {
    if (e.target.value !== "custom") applyIcPreset(e.target.value);
  });

  // Flip IC preset to "custom" whenever the user hand-edits an IC field.
  for (const id of [...Object.values(icMaskFields), ...Object.values(icVaxFields)]) {
    const el = $(id);
    if (!el) continue;
    el.addEventListener("input", () => {
      $("ic_preset").value = "custom";
    });
  }

  $("reset_defaults").addEventListener("click", () => {
    state = freshState();
    stateToForm();
    $("ic_preset").value = "regimented";
    history.replaceState(null, "", location.pathname);
    render();
  });

  $("copy_link").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      const btn = $("copy_link");
      const orig = btn.textContent;
      btn.textContent = "Copied!";
      setTimeout(() => { btn.textContent = orig; }, 1500);
    } catch (err) {
      alert("Copy failed. URL: " + location.href);
    }
  });

  render();

  // Fetch live SF prevalence data (async, updates after initial render)
  fetchSfPrevalence().then(est => {
    if (est) applyLivePrevalence(est);
  });
}

init();
