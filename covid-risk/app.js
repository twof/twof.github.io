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
  doseDecomposition,
  fmtProb, fmtRange,
} from "./model.js";

const SEATING_PRESETS = {
  rows:      { n: 4, d: 1.0 },
  tables:    { n: 5, d: 0.9 },
  reception: { n: 6, d: 0.7 },
  distanced: { n: 2, d: 1.5 },
};

// --- Input schema ------------------------------------------------------
// Maps DOM id -> { get(state), set(state, v), parse } so we can drive both
// directions (read from URL / defaults; write into state).

const scalarFields = [
  "attendees", "duration_hours", "room_volume_m3",
  "air_changes_per_hour", "breathing_rate_m3_per_hour",
  "months_since_vax", "self_selection", "events_per_year",
  "close_contacts_per_attendee", "close_contact_distance_m",
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

const ageFields = {
  "18-39": "age_18_39",
  "40-59": "age_40_59",
  "60-69": "age_60_69",
  "70+":   "age_70_plus",
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
    age_distribution: { ...DEFAULT_AGE_DISTRIBUTION },
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
  if (v == null) { el.value = ""; return; }
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
  setInputValue("close_contacts_per_attendee", state.event.close_contacts_per_attendee);
  setInputValue("close_contact_distance_m", state.event.close_contact_distance_m);

  for (const a of state.event.activities) {
    setInputValue(activityIds[a.activity], a.minutes);
  }

  setInputValue("community_infectious_low", state.prev.community_infectious_low);
  setInputValue("community_infectious_high", state.prev.community_infectious_high);
  setInputValue("symptomatic_attendance", state.prev.symptomatic_attendance);

  setInputValue("self_selection", state.self_selection);
  setInputValue("events_per_year", state.events_per_year);

  for (const [k, id] of Object.entries(ageFields)) {
    setInputValue(id, state.age_distribution[k]);
  }
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
  state.event.close_contacts_per_attendee = Math.max(0, readNumber("close_contacts_per_attendee"));
  state.event.close_contact_distance_m = Math.max(0.1, readNumber("close_contact_distance_m"));
  state.months_since_vax = readNumber("months_since_vax");
  state.event.ve_infection = veFromMonthsSinceVax(state.months_since_vax);

  for (const a of state.event.activities) {
    a.minutes = readNumber(activityIds[a.activity]);
  }

  // Only adopt prevalence from form when the inputs hold real numbers.
  // Empty inputs preserve the "not yet loaded" state (null), which gates
  // the result tables in render().
  const lowVal = parseFloat($("community_infectious_low").value);
  const highVal = parseFloat($("community_infectious_high").value);
  state.prev.community_infectious_low = Number.isFinite(lowVal) ? lowVal : null;
  state.prev.community_infectious_high = Number.isFinite(highVal) ? highVal : null;
  state.prev.symptomatic_attendance = readNumber("symptomatic_attendance");

  state.self_selection = readNumber("self_selection");
  state.events_per_year = Math.max(1, Math.round(readNumber("events_per_year")));

  for (const [k, id] of Object.entries(ageFields)) {
    state.age_distribution[k] = readNumber(id);
  }
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

// --- Baseline comparison --------------------------------------------------

let baselineState = null;

function computeResults(st) {
  const icMaskMix = normalizeMix({ ...st.ic_mask_mix });
  const icVaxMix = normalizeMix({ ...st.ic_vax_mix });
  const nicMaskMix = normalizeMix({ ...st.non_ic_mask_mix });
  const nicVaxMix = normalizeMix({ ...st.non_ic_vax_mix });
  const ageDist = normalizeMix({ ...st.age_distribution });

  const ev = { ...st.event };
  const prev = st.prev;

  const agg = aggregateEventRisk(ev, prev, {
    age_distribution: ageDist,
    ic_mask_mix: icMaskMix,
    ic_vax_mix: icVaxMix,
    non_ic_mask_mix: nicMaskMix,
    non_ic_vax_mix: nicVaxMix,
    self_selection: st.self_selection,
  });

  const srcEmit = agg.sourceEmissionFactor;
  const curVaxFrac = agg.currentVaxFraction;

  const masks = ["none", "cloth", "surgical", "kn95_typical", "n95_casual", "n95_fit_tested"];
  const maskProbs = {};
  for (const m of masks) {
    maskProbs[m] = {
      nic: perEventInfectionProb(ev, prev, MASK_PROTECTION[m],
        { hybrid_immunity: HYBRID_IMMUNITY_NON_IC,
          sourceEmissionFactor: srcEmit, currentVaxFraction: curVaxFrac }),
      ic: perEventInfectionProb(ev, prev, MASK_PROTECTION[m],
        { hybrid_immunity: HYBRID_IMMUNITY_IC,
          sourceEmissionFactor: srcEmit, currentVaxFraction: curVaxFrac }),
    };
  }

  const addRanges = (a, b) => [a[0] + b[0], a[1] + b[1]];
  return {
    agg,
    maskProbs,
    totalInf: addRanges(agg.expected_infections, agg.expected_non_ic_infections),
    totalHosp: addRanges(agg.expected_hospitalizations, agg.expected_non_ic_hospitalizations),
    totalLc: addRanges(agg.expected_long_covid, agg.expected_non_ic_long_covid),
  };
}

function fmtDelta(curRange, baseRange) {
  const curMid = (curRange[0] + curRange[1]) / 2;
  const baseMid = (baseRange[0] + baseRange[1]) / 2;
  if (baseMid === 0 && curMid === 0) return "\u2014";
  if (baseMid === 0) return '<span class="delta-up">\u2191</span>';
  const pct = ((curMid - baseMid) / baseMid) * 100;
  if (Math.abs(pct) < 0.1) return "\u2014";
  const sign = pct > 0 ? "+" : "";
  const cls = pct > 0 ? "delta-up" : "delta-down";
  return `<span class="${cls}">${sign}${pct.toFixed(1)}%</span>`;
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

  // Always require live SF prevalence data - block result rendering until
  // it loads. The input form (sliders, mixes) is still shown so users can
  // tune parameters while waiting.
  const prevLoaded = Number.isFinite(state.prev.community_infectious_low)
    && Number.isFinite(state.prev.community_infectious_high);

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
  $("close_contacts_per_attendee_out").textContent =
    state.event.close_contacts_per_attendee.toFixed(1).replace(/\.0$/, "");
  $("close_contact_distance_m_out").textContent =
    `${state.event.close_contact_distance_m.toFixed(2)} m`;

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
  const ageDist = normalizeMix({ ...state.age_distribution });
  const attendees = ev.attendees;
  for (const [k, id] of Object.entries(ageFields)) {
    const el = $(`${id}_pct`);
    if (el) {
      const pct = Math.round(ageDist[k] * 100);
      const count = Math.round(ageDist[k] * attendees);
      el.textContent = `${pct}% (${count})`;
    }
  }
  renderMixPcts(icMaskFields, icMaskMix);
  renderMixPcts(icVaxFields, icVaxMix);
  renderMixPcts(nicMaskFields, nicMaskMix);
  renderMixPcts(nicVaxFields, nicVaxMix);

  // Toggle results visibility based on whether live prevalence has loaded.
  const outputs = document.getElementById("outputs");
  if (outputs) outputs.style.opacity = prevLoaded ? "1" : "0.35";
  if (!prevLoaded) {
    writeUrlParams();
    return;
  }

  // Compute current and optional baseline results
  const cur = computeResults(state);
  const base = baselineState ? computeResults(baselineState) : null;
  const hasBase = !!base;

  const clearBtn = $("clear_baseline");
  if (clearBtn) clearBtn.style.display = hasBase ? "" : "none";

  // Emission & exposure diagnostics
  const srcEmit = cur.agg.sourceEmissionFactor;
  const curVaxFrac = cur.agg.currentVaxFraction;
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
  // Near-field share: compute with the blended source-emission factor and a
  // representative receiver (no own mask) so the displayed value reflects
  // the average geometry-driven split, not any one mask choice.
  const decomp = doseDecomposition(ev, 0, { sourceEmissionFactor: srcEmit });
  $("out_near_share").textContent = ev.close_contacts_per_attendee > 0
    ? `${(decomp.nearShare * 100).toFixed(1)}%`
    : "—";

  // P(infection) by mask
  const maskHead = $("tbl_p_inf_by_mask").querySelector("thead tr");
  maskHead.innerHTML = hasBase
    ? '<th>Mask</th><th>Filtration</th><th>Current</th><th>Baseline</th><th>\u0394</th>'
    : '<th>Mask</th><th>Filtration</th><th>P(infection)</th>';
  const maskBody = $("tbl_p_inf_by_mask").querySelector("tbody");
  maskBody.innerHTML = "";
  const masks = ["none", "cloth", "surgical", "kn95_typical", "n95_casual", "n95_fit_tested"];
  for (const m of masks) {
    const { ic, nic } = cur.maskProbs[m];
    const row = document.createElement("tr");
    let html = `
      <td>${m}</td>
      <td>${(MASK_PROTECTION[m] * 100).toFixed(0)}%</td>
      <td>IC: ${fmtRange(ic)}<br>non-IC: ${fmtRange(nic)}</td>`;
    if (hasBase) {
      const bi = base.maskProbs[m].ic;
      const bn = base.maskProbs[m].nic;
      html += `<td>IC: ${fmtRange(bi)}<br>non-IC: ${fmtRange(bn)}</td>`;
      html += `<td>IC: ${fmtDelta(ic, bi)}<br>non-IC: ${fmtDelta(nic, bn)}</td>`;
    }
    row.innerHTML = html;
    maskBody.appendChild(row);
  }

  $("out_ic_total").textContent = fmtNum(cur.agg.expected_ic_attendees);
  $("out_ic_severe").textContent = fmtNum(cur.agg.ic_by_severity.severe);
  $("out_ic_moderate").textContent = fmtNum(cur.agg.ic_by_severity.moderate);
  $("out_ic_mild").textContent = fmtNum(cur.agg.ic_by_severity.mild);
  $("out_non_ic_total").textContent = fmtNum(cur.agg.expected_non_ic_attendees, 1);

  // Per-event totals (all attendees)
  const totalsHead = $("tbl_totals").querySelector("thead tr");
  totalsHead.innerHTML = hasBase
    ? '<th>Outcome</th><th>Current</th><th>Baseline</th><th>\u0394</th>'
    : '<th>Outcome</th><th>Expected count</th>';
  const totalsBody = $("tbl_totals").querySelector("tbody");
  totalsBody.innerHTML = "";
  for (const [label, range, baseRange] of [
    ["Infections",       cur.totalInf,  base?.totalInf],
    ["Hospitalizations", cur.totalHosp, base?.totalHosp],
    ["Long-COVID",       cur.totalLc,   base?.totalLc],
  ]) {
    const row = document.createElement("tr");
    let html = `<td>${label}</td><td>${fmtRange(range)}</td>`;
    if (hasBase) html += `<td>${fmtRange(baseRange)}</td><td>${fmtDelta(range, baseRange)}</td>`;
    row.innerHTML = html;
    totalsBody.appendChild(row);
  }

  // Annual totals
  const n = state.events_per_year;
  const annHead = $("tbl_annual").querySelector("thead tr");
  annHead.innerHTML = hasBase
    ? '<th>Outcome</th><th>Current</th><th>Baseline</th><th>\u0394</th>'
    : '<th>Outcome</th><th>Expected per year</th>';
  const annBody = $("tbl_annual").querySelector("tbody");
  annBody.innerHTML = "";
  const baseN = baselineState?.events_per_year ?? n;
  for (const [label, range, baseRange] of [
    ["Infections",       cur.totalInf,  base?.totalInf],
    ["Hospitalizations", cur.totalHosp, base?.totalHosp],
    ["Long-COVID",       cur.totalLc,   base?.totalLc],
  ]) {
    const scaled = [range[0] * n, range[1] * n];
    const row = document.createElement("tr");
    let html = `<td>${label}</td><td>${fmtRange(scaled)}</td>`;
    if (hasBase) {
      const baseScaled = [baseRange[0] * baseN, baseRange[1] * baseN];
      html += `<td>${fmtRange(baseScaled)}</td><td>${fmtDelta(scaled, baseScaled)}</td>`;
    }
    row.innerHTML = html;
    annBody.appendChild(row);
  }

  // IC / non-IC breakdown
  const aggHead = $("tbl_aggregate").querySelector("thead tr");
  aggHead.innerHTML = hasBase
    ? '<th>Outcome</th><th>Current</th><th>Baseline</th><th>\u0394</th>'
    : '<th>Outcome</th><th>Expected count</th>';
  const aggBody = $("tbl_aggregate").querySelector("tbody");
  aggBody.innerHTML = "";
  for (const [label, range, baseRange] of [
    ["IC infections",                 cur.agg.expected_infections,               base?.agg.expected_infections],
    ["IC hospitalizations",           cur.agg.expected_hospitalizations,         base?.agg.expected_hospitalizations],
    ["IC hospitalizations (mod+sev)", cur.agg.expected_hospitalizations_mod_sev, base?.agg.expected_hospitalizations_mod_sev],
    ["IC long-COVID",                 cur.agg.expected_long_covid,               base?.agg.expected_long_covid],
    ["Non-IC infections",             cur.agg.expected_non_ic_infections,        base?.agg.expected_non_ic_infections],
    ["Non-IC hospitalizations",       cur.agg.expected_non_ic_hospitalizations,  base?.agg.expected_non_ic_hospitalizations],
    ["Non-IC long-COVID",             cur.agg.expected_non_ic_long_covid,        base?.agg.expected_non_ic_long_covid],
  ]) {
    const row = document.createElement("tr");
    let html = `<td>${label}</td><td>${fmtRange(range)}</td>`;
    if (hasBase) html += `<td>${fmtRange(baseRange)}</td><td>${fmtDelta(range, baseRange)}</td>`;
    row.innerHTML = html;
    aggBody.appendChild(row);
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
    ...Object.values(ageFields),
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

const AVERAGING_WEEKS = 4;
const SF_HOSP_API = "https://data.sfgov.org/resource/ppwr-akuv.json"
  + "?$where=respiratory_virus='COVID-19'"
  + `&$order=week_end_date DESC&$limit=${AVERAGING_WEEKS}`;
const INFECTIOUS_DAYS = 7;
// IHR range: fraction of all infections (including asymptomatic) that
// result in hospitalization. Lower IHR → more infections per hosp →
// higher prevalence estimate. Range derived from CDC season IHR (~2.0-3.0%
// symptomatic) adjusted by 50% asymptomatic fraction. See
// evidence/community-infectious.html.
const IHR_HIGH = 0.019;
const IHR_LOW  = 0.013;

async function fetchSfPrevalence() {
  const resp = await fetch(SF_HOSP_API);
  if (!resp.ok) throw new Error(`SF DataSF API returned ${resp.status}`);
  const rows = await resp.json();
  if (!rows.length) throw new Error("SF DataSF API returned no rows");

  const rates = rows
    .slice(0, AVERAGING_WEEKS)
    .map(r => parseFloat(r.admission_rate_per_100k));
  if (rates.some(r => !Number.isFinite(r))) {
    throw new Error("SF DataSF API returned non-numeric admission rate");
  }
  if (rates.length < AVERAGING_WEEKS) {
    throw new Error(`SF DataSF returned only ${rates.length} of ${AVERAGING_WEEKS} weeks`);
  }

  const avgRate = rates.reduce((a, b) => a + b, 0) / rates.length;
  const low  = (avgRate / IHR_HIGH) * (INFECTIOUS_DAYS / 7) / 1e5;
  const high = (avgRate / IHR_LOW)  * (INFECTIOUS_DAYS / 7) / 1e5;

  const dataAsOf = rows[0].week_end_date?.slice(0, 10) || null;
  return { low, high, dataAsOf, avgRate, weeks: rates.length };
}

function applyLivePrevalence(est) {
  state.prev.community_infectious_low = est.low;
  state.prev.community_infectious_high = est.high;
  setInputValue("community_infectious_low", est.low);
  setInputValue("community_infectious_high", est.high);

  const note = $("prevalence_live_note");
  if (note) {
    note.innerHTML = `<strong>SF live data:</strong> `
      + `${est.avgRate.toFixed(2)} admissions/100K/wk averaged over `
      + `${est.weeks} weeks (data through ${est.dataAsOf}). `
      + `Bounds reflect IHR uncertainty (1.3–1.9%).`;
    note.className = "live-note";
    note.style.display = "block";
  }

  const err = $("prevalence_error");
  if (err) err.style.display = "none";

  render();
}

function showPrevalenceError(err) {
  const note = $("prevalence_live_note");
  if (note) note.style.display = "none";
  const errEl = $("prevalence_error");
  if (errEl) {
    errEl.innerHTML = `<strong>Could not load SF prevalence data:</strong> `
      + `${err.message}. Results are not displayed until live data loads. `
      + `<button type="button" id="prevalence_retry">Retry</button>`;
    errEl.style.display = "block";
    $("prevalence_retry")?.addEventListener("click", loadPrevalence);
  }
}

async function loadPrevalence() {
  const note = $("prevalence_live_note");
  if (note) {
    note.textContent = "Loading SF prevalence data…";
    note.className = "live-note loading";
    note.style.display = "block";
  }
  const err = $("prevalence_error");
  if (err) err.style.display = "none";
  try {
    const est = await fetchSfPrevalence();
    applyLivePrevalence(est);
  } catch (e) {
    showPrevalenceError(e);
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

  $("seating_preset").addEventListener("change", (e) => {
    const v = e.target.value;
    if (v === "custom" || !SEATING_PRESETS[v]) return;
    state.event.close_contacts_per_attendee = SEATING_PRESETS[v].n;
    state.event.close_contact_distance_m = SEATING_PRESETS[v].d;
    stateToForm();
    render();
  });

  // Flip seating preset to "custom" if user hand-edits the close-contact sliders.
  for (const id of ["close_contacts_per_attendee", "close_contact_distance_m"]) {
    $(id).addEventListener("input", () => { $("seating_preset").value = "custom"; });
  }

  $("reset_defaults").addEventListener("click", () => {
    // Preserve fetched prevalence across reset so we don't re-fetch.
    const fetchedPrev = state.prev.community_infectious_low != null ? {
      community_infectious_low: state.prev.community_infectious_low,
      community_infectious_high: state.prev.community_infectious_high,
    } : null;
    state = freshState();
    if (fetchedPrev) Object.assign(state.prev, fetchedPrev);
    baselineState = null;
    stateToForm();
    $("ic_preset").value = "regimented";
    $("seating_preset").value = "rows";
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

  $("save_baseline").addEventListener("click", () => {
    formToState();
    baselineState = JSON.parse(JSON.stringify(state));
    render();
  });

  $("clear_baseline").addEventListener("click", () => {
    baselineState = null;
    render();
  });

  render();

  // Live SF prevalence is REQUIRED before any result tables are shown.
  // loadPrevalence() shows a loading indicator, then either populates the
  // state (and re-renders) or shows an error with a retry button.
  loadPrevalence();
}

init();
