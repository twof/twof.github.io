// COVID event risk model - JavaScript port of risk.py.
// See README.md for citations. Inputs/outputs match the Python module.

export const QUANTA_RATES = {
  // activity: [median q/hr, 90th percentile q/hr]
  breathing:    [0.37,   3.1],
  speaking:     [5.0,   42.0],
  singing_loud: [32.0, 270.0],
  eating:       [3.0,   20.0],
};

export const SOURCE_CONTROL = {
  none:     0.00,
  cloth:    0.50,
  surgical: 0.70,
  kn95:     0.75,
  n95:      0.95,
};

export const MASK_PROTECTION = {
  none:           0.00,
  surgical:       0.38,
  kn95_typical:   0.67,
  n95_casual:     0.67,
  n95_fit_tested: 0.95,
};

export const QUANTA_CALIBRATION_FACTOR_2026 = 0.5;
export const HYBRID_IMMUNITY_NON_IC = 0.50;
export const HYBRID_IMMUNITY_IC = 0.20;

export const P_HOSP_GIVEN_INFECTION = {
  "severe|vax+prep": 0.020,
  "severe|vax_only": 0.055,
  "severe|old_vax":  0.115,
  "severe|none":     0.200,

  "moderate|vax+prep": 0.007,
  "moderate|vax_only": 0.020,
  "moderate|old_vax":  0.045,
  "moderate|none":     0.080,

  "mild|vax+prep": 0.003,
  "mild|vax_only": 0.010,
  "mild|old_vax":  0.020,
  "mild|none":     0.040,
};

export const LONG_COVID_PER_INFECTION = {
  "severe|vax+prep": 0.09,
  "severe|vax_only": 0.09,
  "severe|old_vax":  0.20,
  "severe|none":     0.30,

  "moderate|vax+prep": 0.07,
  "moderate|vax_only": 0.07,
  "moderate|old_vax":  0.12,
  "moderate|none":     0.18,

  "mild|vax+prep": 0.06,
  "mild|vax_only": 0.06,
  "mild|old_vax":  0.08,
  "mild|none":     0.10,
};

export const IC_PREVALENCE_BY_AGE = {
  "18-39": 0.039,
  "40-59": 0.076,
  "60-69": 0.095,
  "70+":   0.078,
};

export const IC_SEVERITY_MIX = {
  severe:   0.22,
  moderate: 0.55,
  mild:     0.23,
};

export const DEFAULT_AGE_DISTRIBUTION = {
  "18-39": 0.70,
  "40-59": 0.20,
  "60-69": 0.07,
  "70+":   0.03,
};

export const DEFAULT_IC_MASK_MIX = {
  n95_fit_tested: 0.90,
  n95_casual:     0.10,
  kn95_typical:   0.00,
  surgical:       0.00,
  none:           0.00,
};

export const DEFAULT_IC_VAX_MIX = {
  "vax+prep": 0.40,
  "vax_only": 0.50,
  "old_vax":  0.10,
  "none":     0.00,
};

export const GENERAL_IC_MASK_MIX = {
  n95_fit_tested: 0.20,
  n95_casual:     0.25,
  kn95_typical:   0.15,
  surgical:       0.15,
  none:           0.25,
};

export const GENERAL_IC_VAX_MIX = {
  "vax+prep": 0.15,
  "vax_only": 0.45,
  "old_vax":  0.25,
  "none":     0.15,
};

export const P_HOSP_GIVEN_INFECTION_NON_IC = {
  vax_current: 0.0005,
  vax_old:     0.0010,
  none:        0.0030,
};

export const P_LONG_COVID_PER_INFECTION_NON_IC = {
  vax_current: 0.04,
  vax_old:     0.06,
  none:        0.10,
};

export const DEFAULT_NON_IC_VAX_MIX = {
  vax_current: 0.25,
  vax_old:     0.70,
  none:        0.05,
};

export const DEFAULT_NON_IC_MASK_MIX = {
  n95_fit_tested: 0.00,
  n95_casual:     0.00,
  kn95_typical:   0.00,
  surgical:       0.00,
  none:           1.00,
};

export const DEFAULT_SELF_SELECTION = 0.70;

export const DEFAULT_PEER_MASK_MIX = {
  cloth:    0.25,
  surgical: 0.25,
  kn95:     0.25,
  n95:      0.25,
};

export const DEFAULT_ACTIVITIES = [
  { activity: "breathing",    minutes: 81.0 },
  { activity: "speaking",     minutes: 25.0 },
  { activity: "singing_loud", minutes: 4.0  },
  { activity: "eating",       minutes: 10.0 },
];

export const DEFAULT_EVENT = {
  attendees: 100,
  duration_hours: 2.0,
  room_volume_m3: 3300.0,
  air_changes_per_hour: 3.0,
  breathing_rate_m3_per_hour: 0.5,
  activities: DEFAULT_ACTIVITIES.map(a => ({ ...a })),
  peer_masking_fraction: 0.0,
  peer_mask_mix: { ...DEFAULT_PEER_MASK_MIX },
  peer_current_season_vax_fraction: 0.25,
  ve_infection: 0.25,
  ve_shedding: 0.30,
  relative_humidity: 0.40,
};

export const DEFAULT_PREVALENCE = {
  community_infectious_low:  0.0004,
  community_infectious_high: 0.0012,
  event_attendable_fraction: 0.47,
};

// --- Model primitives ---------------------------------------------------

export function humidityMultiplier(rh) {
  if (rh < 0.20) return 1.7;
  if (rh < 0.40) return 1.7 - (rh - 0.20) / 0.20 * 0.7;
  if (rh < 0.60) return 1.0 - (rh - 0.40) / 0.20 * 0.3;
  if (rh < 0.80) return 0.7 - (rh - 0.60) / 0.20 * 0.2;
  return 0.5;
}

export function transientDoseFactor(duration_hours, ach) {
  if (duration_hours <= 0 || ach <= 0) return 1.0;
  const x = ach * duration_hours;
  return 1.0 - (1.0 - Math.exp(-x)) / x;
}

export function quantaPerHour(activities, percentile) {
  if (percentile === "mean") {
    const med = quantaPerHour(activities, "median");
    const p90 = quantaPerHour(activities, "p90");
    if (med <= 0 || p90 <= med) return med;
    const sigma = Math.log(p90 / med) / 1.2816;
    return med * Math.exp((sigma * sigma) / 2);
  }
  const idx = percentile === "median" ? 0 : 1;
  const totalMin = activities.reduce((s, a) => s + a.minutes, 0);
  if (totalMin <= 0) return 0;
  const weighted = activities.reduce(
    (s, a) => s + a.minutes * QUANTA_RATES[a.activity][idx], 0);
  return weighted / totalMin;
}

export function effectiveSourceEmissionFactor(peer_mask_mix, peer_masking_fraction) {
  const avgSc = Object.keys(peer_mask_mix).reduce(
    (s, m) => s + peer_mask_mix[m] * SOURCE_CONTROL[m], 0);
  const f = peer_masking_fraction;
  return (1 - f) * 1.0 + f * (1 - avgSc);
}

export function peerVaxPrevalenceFactor(p, ve_infection) {
  return p * (1 - ve_infection) + (1 - p) * 1.0;
}

export function peerVaxEmissionFactor(p, ve_infection, ve_shedding) {
  const infAmongVax = p * (1 - ve_infection);
  const infAmongUnvax = (1 - p) * 1.0;
  const frac = infAmongVax / (infAmongVax + infAmongUnvax);
  return frac * (1 - ve_shedding) + (1 - frac) * 1.0;
}

// --- Wells-Riley per-event infection probability ------------------------

export function perEventInfectionProb(event, prev, mask_filtration, {
  percentile = "mean",
  hybrid_immunity = 0.0,
} = {}) {
  let q = quantaPerHour(event.activities, percentile);
  q *= effectiveSourceEmissionFactor(event.peer_mask_mix, event.peer_masking_fraction);
  q *= peerVaxEmissionFactor(
    event.peer_current_season_vax_fraction,
    event.ve_infection, event.ve_shedding);
  q *= humidityMultiplier(event.relative_humidity);
  q *= QUANTA_CALIBRATION_FACTOR_2026;

  const C = q / (event.air_changes_per_hour * event.room_volume_m3);
  let nPerSource = C * event.breathing_rate_m3_per_hour * event.duration_hours;
  nPerSource *= transientDoseFactor(event.duration_hours, event.air_changes_per_hour);
  const effectiveDose = nPerSource * (1 - mask_filtration) * (1 - hybrid_immunity);

  const probs = [];
  for (const pComm of [prev.community_infectious_low, prev.community_infectious_high]) {
    const pEventAttendee = pComm
      * prev.event_attendable_fraction
      * peerVaxPrevalenceFactor(event.peer_current_season_vax_fraction, event.ve_infection);
    const expectedInfectious = (event.attendees - 1) * pEventAttendee;
    probs.push(1 - Math.exp(-expectedInfectious * effectiveDose));
  }
  return [Math.min(...probs), Math.max(...probs)];
}

// --- IC aggregation -----------------------------------------------------

function assertSumsToOne(obj, name) {
  const s = Object.values(obj).reduce((a, b) => a + b, 0);
  if (Math.abs(s - 1.0) > 1e-6) {
    throw new Error(`${name} must sum to 1.0, got ${s}`);
  }
}

export function expectedIcAttendees(attendees, age_distribution, self_selection) {
  assertSumsToOne(age_distribution, "age_distribution");
  let total = 0;
  for (const [band, share] of Object.entries(age_distribution)) {
    total += attendees * share * IC_PREVALENCE_BY_AGE[band];
  }
  total *= self_selection;
  const bySeverity = {};
  for (const [sev, share] of Object.entries(IC_SEVERITY_MIX)) {
    bySeverity[sev] = total * share;
  }
  return { total, bySeverity };
}

export function weightedIcInfectionRisk(event, prev, mask_mix, {
  hybrid_immunity = HYBRID_IMMUNITY_IC,
} = {}) {
  assertSumsToOne(mask_mix, "mask_mix");
  let lo = 0, hi = 0;
  for (const [name, weight] of Object.entries(mask_mix)) {
    if (weight === 0) continue;
    const filt = MASK_PROTECTION[name];
    const [mLo, mHi] = perEventInfectionProb(event, prev, filt, {
      percentile: "mean", hybrid_immunity,
    });
    lo += weight * mLo;
    hi += weight * mHi;
  }
  return [lo, hi];
}

function weightedOutcomeRate(table, severity, vax_mix) {
  assertSumsToOne(vax_mix, "vax_mix");
  return Object.entries(vax_mix).reduce(
    (s, [v, w]) => s + w * table[`${severity}|${v}`], 0);
}

function pAny(countLo, countHi) {
  return [1 - Math.exp(-countLo), 1 - Math.exp(-countHi)];
}

export function aggregateEventRisk(event, prev, {
  age_distribution = DEFAULT_AGE_DISTRIBUTION,
  ic_mask_mix = DEFAULT_IC_MASK_MIX,
  ic_vax_mix = DEFAULT_IC_VAX_MIX,
  non_ic_mask_mix = DEFAULT_NON_IC_MASK_MIX,
  non_ic_vax_mix = DEFAULT_NON_IC_VAX_MIX,
  self_selection = DEFAULT_SELF_SELECTION,
} = {}) {
  const { total: totalIc, bySeverity } = expectedIcAttendees(
    event.attendees, age_distribution, self_selection);

  const [pInfLo, pInfHi] = weightedIcInfectionRisk(event, prev, ic_mask_mix);

  const expInf = [totalIc * pInfLo, totalIc * pInfHi];

  let expHospLo = 0, expHospHi = 0;
  let expHospMsLo = 0, expHospMsHi = 0;
  let expLcLo = 0, expLcHi = 0;
  for (const [sev, nSev] of Object.entries(bySeverity)) {
    const wHosp = weightedOutcomeRate(P_HOSP_GIVEN_INFECTION, sev, ic_vax_mix);
    const wLc = weightedOutcomeRate(LONG_COVID_PER_INFECTION, sev, ic_vax_mix);
    expHospLo += nSev * pInfLo * wHosp;
    expHospHi += nSev * pInfHi * wHosp;
    expLcLo += nSev * pInfLo * wLc;
    expLcHi += nSev * pInfHi * wLc;
    if (sev === "severe" || sev === "moderate") {
      expHospMsLo += nSev * pInfLo * wHosp;
      expHospMsHi += nSev * pInfHi * wHosp;
    }
  }

  const totalNonIc = event.attendees - totalIc;
  const [pInfNonIcLo, pInfNonIcHi] = weightedIcInfectionRisk(
    event, prev, non_ic_mask_mix, { hybrid_immunity: HYBRID_IMMUNITY_NON_IC });
  const wHospNonIc = Object.entries(non_ic_vax_mix).reduce(
    (s, [v, w]) => s + w * P_HOSP_GIVEN_INFECTION_NON_IC[v], 0);
  const wLcNonIc = Object.entries(non_ic_vax_mix).reduce(
    (s, [v, w]) => s + w * P_LONG_COVID_PER_INFECTION_NON_IC[v], 0);
  const expInfNonIc = [totalNonIc * pInfNonIcLo, totalNonIc * pInfNonIcHi];
  const expHospNonIc = [expInfNonIc[0] * wHospNonIc, expInfNonIc[1] * wHospNonIc];
  const expLcNonIc = [expInfNonIc[0] * wLcNonIc, expInfNonIc[1] * wLcNonIc];

  return {
    expected_ic_attendees: totalIc,
    ic_by_severity: bySeverity,
    per_ic_infection_risk: [pInfLo, pInfHi],
    expected_infections: expInf,
    expected_hospitalizations: [expHospLo, expHospHi],
    expected_hospitalizations_mod_sev: [expHospMsLo, expHospMsHi],
    expected_long_covid: [expLcLo, expLcHi],
    p_any_ic_infected: pAny(expInf[0], expInf[1]),
    p_any_ic_hospitalized: pAny(expHospLo, expHospHi),
    p_any_ic_long_covid: pAny(expLcLo, expLcHi),
    expected_non_ic_attendees: totalNonIc,
    per_non_ic_infection_risk: [pInfNonIcLo, pInfNonIcHi],
    expected_non_ic_infections: expInfNonIc,
    expected_non_ic_hospitalizations: expHospNonIc,
    expected_non_ic_long_covid: expLcNonIc,
    p_any_non_ic_infected: pAny(expInfNonIc[0], expInfNonIc[1]),
    p_any_non_ic_hospitalized: pAny(expHospNonIc[0], expHospNonIc[1]),
    p_any_non_ic_long_covid: pAny(expLcNonIc[0], expLcNonIc[1]),
  };
}

// --- Formatting ---------------------------------------------------------

export function fmtProb(p) {
  if (p <= 0) return "0";
  if (p < 1e-6) return `${(p * 1e9).toFixed(2)} per billion`;
  if (p < 1e-4) return `${(p * 1e6).toFixed(2)} per million`;
  if (p < 1e-2) return `${(p * 1e4).toFixed(2)} per 10,000`;
  return `${(p * 100).toFixed(2)}%`;
}

export function fmtRange([lo, hi]) {
  return `${fmtProb(lo)} – ${fmtProb(hi)}`;
}
