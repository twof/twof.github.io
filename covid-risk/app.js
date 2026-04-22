import {
  DEFAULT_EVENT, DEFAULT_PREVALENCE,
  DEFAULT_IC_MASK_MIX, DEFAULT_IC_VAX_MIX,
  DEFAULT_NON_IC_MASK_MIX, DEFAULT_NON_IC_VAX_MIX,
  DEFAULT_AGE_DISTRIBUTION, DEFAULT_SELF_SELECTION,
  GENERAL_IC_MASK_MIX, GENERAL_IC_VAX_MIX,
  MASK_PROTECTION,
  HYBRID_IMMUNITY_IC, HYBRID_IMMUNITY_NON_IC,
  quantaPerHour, humidityMultiplier, transientDoseFactor,
  effectiveSourceEmissionFactor,
  peerVaxPrevalenceFactor, peerVaxEmissionFactor,
  perEventInfectionProb, aggregateEventRisk,
  fmtProb, fmtRange,
} from "./model.js";

// --- Input schema ------------------------------------------------------
// Maps DOM id -> { get(state), set(state, v), parse } so we can drive both
// directions (read from URL / defaults; write into state).

const scalarFields = [
  "attendees", "duration_hours", "room_volume_m3",
  "air_changes_per_hour", "breathing_rate_m3_per_hour",
  "relative_humidity", "peer_masking_fraction",
  "peer_current_season_vax_fraction", "ve_infection", "ve_shedding",
];

const activityIds = {
  breathing:    "min_breathing",
  speaking:     "min_speaking",
  singing_loud: "min_singing_loud",
  eating:       "min_eating",
};

const peerMaskFields = {
  cloth:    "peer_mix_cloth",
  surgical: "peer_mix_surgical",
  kn95:     "peer_mix_kn95",
  n95:      "peer_mix_n95",
};

const prevFields = [
  "community_infectious_low", "community_infectious_high",
  "event_attendable_fraction",
];

const icMaskFields = {
  n95_fit_tested: "ic_mask_n95_fit_tested",
  n95_casual:     "ic_mask_n95_casual",
  kn95_typical:   "ic_mask_kn95_typical",
  surgical:       "ic_mask_surgical",
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
      peer_mask_mix: { ...DEFAULT_EVENT.peer_mask_mix },
    },
    prev: { ...DEFAULT_PREVALENCE },
    ic_mask_mix: { ...DEFAULT_IC_MASK_MIX },
    ic_vax_mix: { ...DEFAULT_IC_VAX_MIX },
    non_ic_mask_mix: { ...DEFAULT_NON_IC_MASK_MIX },
    non_ic_vax_mix: { ...DEFAULT_NON_IC_VAX_MIX },
    self_selection: DEFAULT_SELF_SELECTION,
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
  setInputValue("relative_humidity", state.event.relative_humidity);
  setInputValue("peer_masking_fraction", state.event.peer_masking_fraction);
  setInputValue("peer_current_season_vax_fraction", state.event.peer_current_season_vax_fraction);
  setInputValue("ve_infection", state.event.ve_infection);
  setInputValue("ve_shedding", state.event.ve_shedding);

  for (const a of state.event.activities) {
    setInputValue(activityIds[a.activity], a.minutes);
  }
  for (const [k, id] of Object.entries(peerMaskFields)) {
    setInputValue(id, state.event.peer_mask_mix[k]);
  }

  setInputValue("community_infectious_low", state.prev.community_infectious_low);
  setInputValue("community_infectious_high", state.prev.community_infectious_high);
  setInputValue("event_attendable_fraction", state.prev.event_attendable_fraction);

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
  state.event.relative_humidity = readNumber("relative_humidity");
  state.event.peer_masking_fraction = readNumber("peer_masking_fraction");
  state.event.peer_current_season_vax_fraction = readNumber("peer_current_season_vax_fraction");
  state.event.ve_infection = readNumber("ve_infection");
  state.event.ve_shedding = readNumber("ve_shedding");

  for (const a of state.event.activities) {
    a.minutes = readNumber(activityIds[a.activity]);
  }
  for (const [k, id] of Object.entries(peerMaskFields)) {
    state.event.peer_mask_mix[k] = readNumber(id);
  }

  state.prev.community_infectious_low = readNumber("community_infectious_low");
  state.prev.community_infectious_high = readNumber("community_infectious_high");
  state.prev.event_attendable_fraction = readNumber("event_attendable_fraction");

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

function renderMixSum(elId, mix) {
  const s = sumOf(mix);
  const el = $(elId);
  if (!el) return;
  const diff = s - 1;
  if (Math.abs(diff) < 1e-6) {
    el.textContent = "Sums to 1.00";
    el.className = "hint mix-sum ok";
  } else {
    el.textContent = `Sums to ${s.toFixed(2)} — will be normalized`;
    el.className = "hint mix-sum warn";
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

  // Normalize mixes for calculation but preserve raw inputs in the form
  // (so users can type partial values freely).
  const peerMaskMix = normalizeMix({ ...state.event.peer_mask_mix });
  const icMaskMix = normalizeMix({ ...state.ic_mask_mix });
  const icVaxMix = normalizeMix({ ...state.ic_vax_mix });
  const nicMaskMix = normalizeMix({ ...state.non_ic_mask_mix });
  const nicVaxMix = normalizeMix({ ...state.non_ic_vax_mix });

  const ev = { ...state.event, peer_mask_mix: peerMaskMix };
  const prev = state.prev;

  // Slider readouts
  $("relative_humidity_out").textContent = `${Math.round(ev.relative_humidity * 100)}%`;
  $("peer_masking_fraction_out").textContent = `${Math.round(ev.peer_masking_fraction * 100)}%`;
  $("peer_current_season_vax_fraction_out").textContent =
    `${Math.round(ev.peer_current_season_vax_fraction * 100)}%`;
  $("ve_infection_out").textContent = `${Math.round(ev.ve_infection * 100)}%`;
  $("ve_shedding_out").textContent = `${Math.round(ev.ve_shedding * 100)}%`;
  $("event_attendable_fraction_out").textContent =
    `${Math.round(prev.event_attendable_fraction * 100)}%`;
  $("self_selection_out").textContent = state.self_selection.toFixed(2);

  // Mix sum indicators
  renderMixSum("peer_mask_mix_sum", state.event.peer_mask_mix);
  renderMixSum("ic_mask_mix_sum", state.ic_mask_mix);
  renderMixSum("ic_vax_mix_sum", state.ic_vax_mix);
  renderMixSum("nic_mask_mix_sum", state.non_ic_mask_mix);
  renderMixSum("nic_vax_mix_sum", state.non_ic_vax_mix);

  // Emission & exposure table
  const totalMin = ev.activities.reduce((s, a) => s + a.minutes, 0);
  const qMed = quantaPerHour(ev.activities, "median");
  const qMean = quantaPerHour(ev.activities, "mean");
  const qP90 = quantaPerHour(ev.activities, "p90");
  const hMult = humidityMultiplier(ev.relative_humidity);
  const tFactor = transientDoseFactor(ev.duration_hours, ev.air_changes_per_hour);
  const pvPrev = peerVaxPrevalenceFactor(ev.peer_current_season_vax_fraction, ev.ve_infection);
  const pvEmit = peerVaxEmissionFactor(
    ev.peer_current_season_vax_fraction, ev.ve_infection, ev.ve_shedding);
  const pmEmit = effectiveSourceEmissionFactor(peerMaskMix, ev.peer_masking_fraction);

  const effPrevLo = prev.community_infectious_low * prev.event_attendable_fraction * pvPrev;
  const effPrevHi = prev.community_infectious_high * prev.event_attendable_fraction * pvPrev;

  $("out_activity_total").textContent = `${fmtNum(totalMin, 0)} min`;
  $("out_q_median").textContent = fmtNum(qMed);
  $("out_q_mean").textContent = fmtNum(qMean);
  $("out_q_p90").textContent = fmtNum(qP90);
  $("out_humidity").textContent = `×${fmtNum(hMult)}`;
  $("out_transient").textContent = `×${fmtNum(tFactor, 3)}`;
  $("out_eff_prevalence").textContent =
    `${(effPrevLo * 100).toFixed(3)}% – ${(effPrevHi * 100).toFixed(3)}%`;
  $("out_exp_inf_attendees").textContent =
    `${fmtNum((ev.attendees - 1) * effPrevLo, 3)} – ${fmtNum((ev.attendees - 1) * effPrevHi, 3)}`;
  $("out_peer_vax_prev").textContent = `×${fmtNum(pvPrev, 3)}`;
  $("out_peer_vax_emit").textContent = `×${fmtNum(pvEmit, 3)}`;
  $("out_peer_mask_emit").textContent = `×${fmtNum(pmEmit, 3)}`;

  // P(infection) by mask
  const tbody = $("tbl_p_inf_by_mask").querySelector("tbody");
  tbody.innerHTML = "";
  const masks = ["none", "surgical", "kn95_typical", "n95_casual", "n95_fit_tested"];
  for (const m of masks) {
    const nic = perEventInfectionProb(ev, prev, MASK_PROTECTION[m],
      { hybrid_immunity: HYBRID_IMMUNITY_NON_IC });
    const ic = perEventInfectionProb(ev, prev, MASK_PROTECTION[m],
      { hybrid_immunity: HYBRID_IMMUNITY_IC });
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${m}</td>
      <td>${(MASK_PROTECTION[m] * 100).toFixed(0)}%</td>
      <td>IC: ${fmtRange(ic)}<br>non-IC: ${fmtRange(nic)}</td>`;
    tbody.appendChild(row);
  }

  // Aggregate
  const agg = aggregateEventRisk(ev, prev, {
    age_distribution: DEFAULT_AGE_DISTRIBUTION,
    ic_mask_mix: icMaskMix,
    ic_vax_mix: icVaxMix,
    non_ic_mask_mix: nicMaskMix,
    non_ic_vax_mix: nicVaxMix,
    self_selection: state.self_selection,
  });

  $("out_ic_total").textContent = fmtNum(agg.expected_ic_attendees);
  $("out_ic_severe").textContent = fmtNum(agg.ic_by_severity.severe);
  $("out_ic_moderate").textContent = fmtNum(agg.ic_by_severity.moderate);
  $("out_ic_mild").textContent = fmtNum(agg.ic_by_severity.mild);
  $("out_non_ic_total").textContent = fmtNum(agg.expected_non_ic_attendees, 1);

  const aggBody = $("tbl_aggregate").querySelector("tbody");
  aggBody.innerHTML = "";
  const aggRows = [
    ["IC infections",                agg.expected_infections,            agg.p_any_ic_infected,       true],
    ["IC hospitalizations",          agg.expected_hospitalizations,      agg.p_any_ic_hospitalized,   true],
    ["IC hospitalizations (mod+sev)",agg.expected_hospitalizations_mod_sev, null,                     false],
    ["IC long-COVID",                agg.expected_long_covid,            agg.p_any_ic_long_covid,     false],
    ["Non-IC infections",            agg.expected_non_ic_infections,     agg.p_any_non_ic_infected,   false],
    ["Non-IC hospitalizations",      agg.expected_non_ic_hospitalizations, agg.p_any_non_ic_hospitalized, true],
    ["Non-IC long-COVID",            agg.expected_non_ic_long_covid,     agg.p_any_non_ic_long_covid, false],
  ];
  for (const [label, exp, pAny, emphasize] of aggRows) {
    const row = document.createElement("tr");
    if (emphasize) row.className = "emphasize";
    row.innerHTML = `
      <td>${label}</td>
      <td>${fmtRange(exp)}</td>
      <td>${pAny ? fmtRange(pAny) : "—"}</td>`;
    aggBody.appendChild(row);
  }

  // Annual
  const annBody = $("tbl_annual").querySelector("tbody");
  annBody.innerHTML = "";
  const n = state.events_per_year;
  const annualRows = [
    ["IC infections",                agg.expected_infections],
    ["IC hospitalizations (all IC)", agg.expected_hospitalizations],
    ["IC hospitalizations (mod+sev)",agg.expected_hospitalizations_mod_sev],
    ["IC long-COVID",                agg.expected_long_covid],
    ["Non-IC infections",            agg.expected_non_ic_infections],
    ["Non-IC hospitalizations",      agg.expected_non_ic_hospitalizations],
    ["Non-IC long-COVID",            agg.expected_non_ic_long_covid],
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
    ...Object.values(peerMaskFields),
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
}

init();
