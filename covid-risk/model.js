// COVID event risk model - JavaScript port of risk.py.
// See README.md for citations. Inputs/outputs match the Python module.

export const QUANTA_RATES = {
  // activity: [median q/hr, 90th percentile q/hr]
  // Ratios derived from Buonanno 2020, Aganovic 2023, Moseley 2024,
  // Mikszewski 2022, Matvejeff 2025. See evidence/activity-mix.html.
  breathing:    [0.4,    3.3],
  speaking:     [8.0,   66.0],   // ~20x breathing
  singing_loud: [64.0, 530.0],   // ~8x speaking, ~160x breathing
  eating:       [2.0,   16.5],   // ~5x breathing
};

export const MASK_PROTECTION = {
  none:           0.00,
  cloth:          0.30,
  surgical:       0.40,
  kn95_typical:   0.50,
  n95_casual:     0.86,
  n95_fit_tested: 0.95,
};

export const MASK_TO_SOURCE_CONTROL = {
  n95_fit_tested: 0.95,
  n95_casual:     0.95,
  kn95_typical:   0.71,
  surgical:       0.74,
  cloth:          0.50,
  none:           0.00,
};

export const HYBRID_IMMUNITY_NON_IC = 0.50;
export const HYBRID_IMMUNITY_IC = 0.20;

// Derived from CDC COVID-NET 2023-2024 age-specific hospitalization rates
// combined with INFORM study IC-specific aIRRs (Quint et al. 2023, n=12M).
// See evidence/hosp-given-infection.html for derivation.
export const P_HOSP_GIVEN_INFECTION = {
  "severe|vax+prep": 0.010,
  "severe|vax_only": 0.030,
  "severe|old_vax":  0.050,
  "severe|none":     0.080,

  "moderate|vax+prep": 0.004,
  "moderate|vax_only": 0.012,
  "moderate|old_vax":  0.020,
  "moderate|none":     0.035,

  "mild|vax+prep": 0.0015,
  "mild|vax_only": 0.005,
  "mild|old_vax":  0.008,
  "mild|none":     0.015,
};

// Derived from Omicron-era community cohort data (Florea et al. 2024,
// ~8% vaccinated / ~27% unvaccinated at 90 days) calibrated to stricter
// NASEM definition (~4-10%). IC multiplier ~1.5x from National COVID
// Cohort (SOT aOR 1.48). See evidence/long-covid.html.
export const LONG_COVID_PER_INFECTION = {
  "severe|vax+prep": 0.08,
  "severe|vax_only": 0.10,
  "severe|old_vax":  0.15,
  "severe|none":     0.25,

  "moderate|vax+prep": 0.06,
  "moderate|vax_only": 0.08,
  "moderate|old_vax":  0.12,
  "moderate|none":     0.20,

  "mild|vax+prep": 0.05,
  "mild|vax_only": 0.06,
  "mild|old_vax":  0.09,
  "mild|none":     0.15,
};

export const IC_PREVALENCE_BY_AGE = {
  "18-39": 0.039,
  "40-59": 0.076,
  "60-69": 0.095,
  "70+":   0.078,
};

// Derived from US condition-prevalence data (transplant, cancer, HIV,
// autoimmune, ESKD, PID counts) mapped to INFORM aIRR severity tiers.
// Cross-checked: blended aIRR = 2.6x, consistent with INFORM observed
// 2.04x (2.04 is all-ages; event pop skews younger = slightly higher).
// See evidence/ic-prevalence.html.
export const IC_SEVERITY_MIX = {
  severe:   0.05,
  moderate: 0.20,
  mild:     0.75,
};

export const DEFAULT_AGE_DISTRIBUTION = {
  "18-39": 0.70,
  "40-59": 0.20,
  "60-69": 0.07,
  "70+":   0.03,
};

export const DEFAULT_IC_MASK_MIX = {
  n95_fit_tested: 0.10,
  n95_casual:     0.25,
  kn95_typical:   0.60,
  surgical:       0.05,
  cloth:          0.00,
  none:           0.00,
};

export const DEFAULT_IC_VAX_MIX = {
  "vax+prep": 0.08,
  "vax_only": 0.30,
  "old_vax":  0.62,
  "none":     0.00,
};

export const GENERAL_IC_MASK_MIX = {
  n95_fit_tested: 0.02,
  n95_casual:     0.03,
  kn95_typical:   0.05,
  surgical:       0.05,
  cloth:          0.05,
  none:           0.80,
};

export const GENERAL_IC_VAX_MIX = {
  "vax+prep": 0.00,
  "vax_only": 0.15,
  "old_vax":  0.55,
  "none":     0.30,
};

// Derived from CDC COVID-NET 2023-2024 18-49 hospitalization rate
// (38.9/100K), age-adjusted infection rate (~12%), and VE against
// hospitalization (45% current, ~15% old). See evidence/hosp-given-infection.html.
export const P_HOSP_GIVEN_INFECTION_NON_IC = {
  vax_current: 0.0010,
  vax_old:     0.0015,
  none:        0.0030,
};

// Omicron-era community cohort: ~8% vaccinated at 90 days (broad symptom
// definition), calibrated to ~4% for NASEM-type definition with current
// vax + hybrid immunity. See evidence/long-covid.html.
export const P_LONG_COVID_PER_INFECTION_NON_IC = {
  vax_current: 0.04,
  vax_old:     0.06,
  none:        0.10,
};

// Age multipliers for non-IC hospitalization and long-COVID rates.
// Base rates (P_HOSP_GIVEN_INFECTION_NON_IC, P_LONG_COVID_PER_INFECTION_NON_IC)
// are calibrated for 18-39. These multipliers scale them for older age bands.
// Log-linear interpolation of seroprevalence-based IHR by age (PMC11736415):
//   18-49: 0.84%, 50-69: 2.4%, 70+: 10.0%.
// Cross-checked against COVID-NET 2023-2024 population rates.
// See evidence/hosp-given-infection.html.
export const NON_IC_HOSP_AGE_MULTIPLIER = {
  "18-39": 1.0,
  "40-59": 1.90,
  "60-69": 4.03,
  "70+":  10.0,
};

// Long-COVID age gradient is much flatter than hospitalization.
// Peaks in 50-64, then decreases in 65+ (immune overactivation is
// a driver, and older adults may have less of it).
// Derived from MEPS Spring 2023: 18-34 9.8%, 35-49 13.5%,
// 50-64 17.9%, 65+ 14.7%. See evidence/long-covid.html.
export const NON_IC_LC_AGE_MULTIPLIER = {
  "18-39": 1.0,
  "40-59": 1.6,
  "60-69": 1.8,
  "70+":   1.5,
};

export const DEFAULT_NON_IC_VAX_MIX = {
  vax_current: 0.25,
  vax_old:     0.75,
  none:        0.00,
};

export const DEFAULT_NON_IC_MASK_MIX = {
  n95_fit_tested: 0.00,
  n95_casual:     0.10,
  kn95_typical:   0.65,
  surgical:       0.25,
  cloth:          0.00,
  none:           0.00,
};

export const DEFAULT_SELF_SELECTION = 0.70;

export const DEFAULT_ACTIVITIES = [
  { activity: "breathing",    minutes: 0.63 },
  { activity: "speaking",     minutes: 0.20 },
  { activity: "singing_loud", minutes: 0.04 },
  { activity: "eating",       minutes: 0.12 },
];

// VE against infection waning curve, piecewise linear interpolation.
// Sources: Ioannou et al. 2025 (Nature Comms), CDC MMWR 2025, JAMA Int Med 2025.
const VE_WANING_CURVE = [
  [0, 0.48], [1, 0.45], [2, 0.33], [3, 0.26],
  [4, 0.22], [5, 0.17], [6, 0.15], [8, 0.15], [12, 0.00],
];

export function veFromMonthsSinceVax(months) {
  if (months <= 0) return VE_WANING_CURVE[0][1];
  for (let i = 1; i < VE_WANING_CURVE.length; i++) {
    const [m1, v1] = VE_WANING_CURVE[i];
    if (months <= m1) {
      const [m0, v0] = VE_WANING_CURVE[i - 1];
      return v0 + (v1 - v0) * (months - m0) / (m1 - m0);
    }
  }
  return 0;
}

export const DEFAULT_MONTHS_SINCE_VAX = 9;

export const DEFAULT_EVENT = {
  attendees: 100,
  duration_hours: 2.0,
  room_volume_m3: 3300.0,
  air_changes_per_hour: 3.0,
  breathing_rate_m3_per_hour: 0.5,
  activities: DEFAULT_ACTIVITIES.map(a => ({ ...a })),
  ve_infection: veFromMonthsSinceVax(9),
};

// --- Asymptomatic / presymptomatic parameters --------------------------
// These determine what fraction of currently-infectious people would
// attend an event (i.e., don't know they're sick or have no symptoms).

// Fraction of new infections that are fully asymptomatic throughout.
// Choi et al. 2025 (Sci Rep): Omicron vaccinated = 49.7%, unvaccinated =
// 44.7%. With near-universal hybrid immunity in 2026, 50% is conservative.
export const ASYMPTOMATIC_INCIDENCE_FRACTION = 0.50;

// Infectious duration (days) for asymptomatic cases (vaccinated, Omicron).
// Choi et al. 2025, Table 2: recovery period = 3 days (vaccinated Omicron).
export const ASYMPTOMATIC_INFECTIOUS_DAYS = 3;

// Total infectious duration (days) for symptomatic cases.
// Singanayagam et al. 2022 (Lancet Resp Med): median 5 days (IQR 3–7).
export const SYMPTOMATIC_INFECTIOUS_DAYS = 5;

// Days of infectious shedding before symptom onset.
// Omicron serial interval (~3 days) is shorter than incubation (~3.4 days),
// implying ~1–2 days of presymptomatic infectious shedding.
export const PRESYMPTOMATIC_DAYS = 1.5;

// At any point in time, the "stock" of currently-infectious people is
// weighted by how long each type remains infectious. Asymptomatic cases
// clear faster (3 days) so they make up a smaller share of the pool than
// their 50% incidence fraction suggests.
export function attendableFraction(symptomaticAttendanceRate) {
  const aStock = ASYMPTOMATIC_INCIDENCE_FRACTION * ASYMPTOMATIC_INFECTIOUS_DAYS;
  const pStock = (1 - ASYMPTOMATIC_INCIDENCE_FRACTION) * PRESYMPTOMATIC_DAYS;
  const sStock = (1 - ASYMPTOMATIC_INCIDENCE_FRACTION)
    * (SYMPTOMATIC_INFECTIOUS_DAYS - PRESYMPTOMATIC_DAYS);
  const total = aStock + pStock + sStock;
  return (aStock + pStock + sStock * symptomaticAttendanceRate) / total;
}

export const DEFAULT_SYMPTOMATIC_ATTENDANCE = 0.0;

export const DEFAULT_PREVALENCE = {
  community_infectious_low:  0.0004,
  community_infectious_high: 0.0012,
  symptomatic_attendance: DEFAULT_SYMPTOMATIC_ATTENDANCE,
};

// --- Model primitives ---------------------------------------------------

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

export function blendedSourceEmissionFactor(ic_mask_mix, non_ic_mask_mix, ic_count, non_ic_count) {
  function avgEmission(mask_mix) {
    return Object.entries(mask_mix).reduce(
      (s, [type, weight]) => s + weight * (1 - MASK_TO_SOURCE_CONTROL[type]), 0);
  }
  const total = ic_count + non_ic_count;
  if (total <= 0) return 1.0;
  return (ic_count * avgEmission(ic_mask_mix) + non_ic_count * avgEmission(non_ic_mask_mix)) / total;
}

export function blendedCurrentVaxFraction(ic_vax_mix, non_ic_vax_mix, ic_count, non_ic_count) {
  const ic_current = (ic_vax_mix["vax+prep"] || 0) + (ic_vax_mix["vax_only"] || 0);
  const nic_current = non_ic_vax_mix["vax_current"] || 0;
  const total = ic_count + non_ic_count;
  if (total <= 0) return 0;
  return (ic_count * ic_current + non_ic_count * nic_current) / total;
}

export function peerVaxPrevalenceFactor(p, ve_infection) {
  return p * (1 - ve_infection) + (1 - p) * 1.0;
}

// --- Wells-Riley per-event infection probability ------------------------

export function perEventInfectionProb(event, prev, mask_filtration, {
  percentile = "mean",
  hybrid_immunity = 0.0,
  sourceEmissionFactor = 1.0,
  currentVaxFraction = 0.0,
} = {}) {
  // During eating, all masks are off (both source control and receptor protection).
  // Split dose calculation so masking only applies to non-eating time.
  const totalMin = event.activities.reduce((s, a) => s + a.minutes, 0);
  const eatingActs = event.activities.filter(a => a.activity === 'eating');
  const nonEatingActs = event.activities.filter(a => a.activity !== 'eating');
  const eatingFrac = totalMin > 0
    ? eatingActs.reduce((s, a) => s + a.minutes, 0) / totalMin : 0;

  const qEat = eatingFrac > 0 ? quantaPerHour(eatingActs, percentile) : 0;
  const qRest = eatingFrac < 1 ? quantaPerHour(nonEatingActs, percentile) : 0;

  const ach = Math.max(event.air_changes_per_hour, 0.01);
  const base = event.duration_hours * event.breathing_rate_m3_per_hour
    * transientDoseFactor(event.duration_hours, ach)
    / (ach * event.room_volume_m3);

  const effectiveDose = base * (1 - hybrid_immunity) * (
    eatingFrac * qEat                                                   // no masks
    + (1 - eatingFrac) * qRest * sourceEmissionFactor * (1 - mask_filtration) // masks on
  );

  const probs = [];
  for (const pComm of [prev.community_infectious_low, prev.community_infectious_high]) {
    const pEventAttendee = pComm
      * attendableFraction(prev.symptomatic_attendance)
      * peerVaxPrevalenceFactor(currentVaxFraction, event.ve_infection);
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

export function weightedMaskInfectionRisk(event, prev, mask_mix, {
  hybrid_immunity = HYBRID_IMMUNITY_IC,
  sourceEmissionFactor = 1.0,
  currentVaxFraction = 0.0,
} = {}) {
  assertSumsToOne(mask_mix, "mask_mix");
  let lo = 0, hi = 0;
  for (const [name, weight] of Object.entries(mask_mix)) {
    if (weight === 0) continue;
    const filt = MASK_PROTECTION[name];
    const [mLo, mHi] = perEventInfectionProb(event, prev, filt, {
      percentile: "mean", hybrid_immunity, sourceEmissionFactor, currentVaxFraction,
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
  const totalNonIc = event.attendees - totalIc;

  const srcEmit = blendedSourceEmissionFactor(ic_mask_mix, non_ic_mask_mix, totalIc, totalNonIc);
  const curVaxFrac = blendedCurrentVaxFraction(ic_vax_mix, non_ic_vax_mix, totalIc, totalNonIc);

  const [pInfLo, pInfHi] = weightedMaskInfectionRisk(event, prev, ic_mask_mix, {
    sourceEmissionFactor: srcEmit, currentVaxFraction: curVaxFrac,
  });

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

  const [pInfNonIcLo, pInfNonIcHi] = weightedMaskInfectionRisk(
    event, prev, non_ic_mask_mix, {
      hybrid_immunity: HYBRID_IMMUNITY_NON_IC,
      sourceEmissionFactor: srcEmit, currentVaxFraction: curVaxFrac,
    });

  // Age-weighted non-IC outcome rates. Base rates are for 18-39;
  // age multipliers scale them for older attendees.
  const baseHospNonIc = Object.entries(non_ic_vax_mix).reduce(
    (s, [v, w]) => s + w * P_HOSP_GIVEN_INFECTION_NON_IC[v], 0);
  const baseLcNonIc = Object.entries(non_ic_vax_mix).reduce(
    (s, [v, w]) => s + w * P_LONG_COVID_PER_INFECTION_NON_IC[v], 0);

  let ageHospW = 0, ageLcW = 0, nonIcFracSum = 0;
  for (const [band, share] of Object.entries(age_distribution)) {
    const nonIcFrac = share * (1 - (IC_PREVALENCE_BY_AGE[band] || 0) * self_selection);
    ageHospW += nonIcFrac * NON_IC_HOSP_AGE_MULTIPLIER[band];
    ageLcW += nonIcFrac * NON_IC_LC_AGE_MULTIPLIER[band];
    nonIcFracSum += nonIcFrac;
  }
  const wHospNonIc = baseHospNonIc * (nonIcFracSum > 0 ? ageHospW / nonIcFracSum : 1);
  const wLcNonIc = baseLcNonIc * (nonIcFracSum > 0 ? ageLcW / nonIcFracSum : 1);

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
    p_any_ic_hospitalized_mod_sev: pAny(expHospMsLo, expHospMsHi),
    p_any_ic_long_covid: pAny(expLcLo, expLcHi),
    expected_non_ic_attendees: totalNonIc,
    per_non_ic_infection_risk: [pInfNonIcLo, pInfNonIcHi],
    expected_non_ic_infections: expInfNonIc,
    expected_non_ic_hospitalizations: expHospNonIc,
    expected_non_ic_long_covid: expLcNonIc,
    p_any_non_ic_infected: pAny(expInfNonIc[0], expInfNonIc[1]),
    p_any_non_ic_hospitalized: pAny(expHospNonIc[0], expHospNonIc[1]),
    p_any_non_ic_long_covid: pAny(expLcNonIc[0], expLcNonIc[1]),
    sourceEmissionFactor: srcEmit,
    currentVaxFraction: curVaxFrac,
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

// Format p using a specific scale so both ends of a range share the same unit.
function fmtProbAs(p, scale, suffix) {
  if (p <= 0) return "0";
  return `${(p * scale).toFixed(2)} ${suffix}`;
}

export function fmtRange([lo, hi]) {
  if (lo <= 0 && hi <= 0) return "0 – 0";
  // Use hi (the larger value) to pick a consistent unit for both ends.
  const ref = Math.max(lo, hi);
  if (ref < 1e-6) return `${fmtProbAs(lo, 1e9, "per billion")} – ${fmtProbAs(hi, 1e9, "per billion")}`;
  if (ref < 1e-4) return `${fmtProbAs(lo, 1e6, "per million")} – ${fmtProbAs(hi, 1e6, "per million")}`;
  if (ref < 1e-2) return `${fmtProbAs(lo, 1e4, "per 10,000")} – ${fmtProbAs(hi, 1e4, "per 10,000")}`;
  return `${(lo * 100).toFixed(2)}% – ${(hi * 100).toFixed(2)}%`;
}
