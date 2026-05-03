"""
Event COVID risk calculator for an immunocompromised attendee.

Infection probability: Wells-Riley (well-mixed room, steady state).
Severity: P(hospitalization | infection) conditional on IC severity and
vaccination/PrEP status.

  P(hosp per event) = P(infected per event) * P(hosp | infected)

All numerical inputs are cited in README.md. Numbers with wide literature
ranges are expressed as low/high bounds.
"""

import math
from dataclasses import dataclass, field


# Buonanno & Morawska 2020 (Env. Int. / Sci Total Env) Table 2:
# quanta/hr per infectious person at a fixed viral-load distribution.
# All at "resting" or "light activity" physical level (seated attendees).
QUANTA_RATES = {
    # activity:     (median q/hr, 90th percentile q/hr)
    "breathing":      (0.37,  3.1),   # quiet breathing while listening
    "speaking":       (5.0,  42.0),   # normal-volume speech
    "singing_loud":   (32.0, 270.0),  # singing or loud speech
    "eating":         (3.0,  20.0),   # mostly breathing + brief speech
}


# Source-control values (fraction of emitted aerosol blocked when an
# infectious person wears the mask). Consensus midpoints across:
# - Lai et al. 2024 (eBioMedicine, n=44 infected humans, viral load)
# - Lindsley et al. 2021 (Aerosol Sci Technol, manikin, 15 cloth masks)
# - Asadi et al. 2020 (Sci Reports, healthy-volunteer speech particles)
# - CDC Science Brief 2021; systematic reviews (Chou 2020, Tran 2024)
# Cloth has wide variance (30-70%); surgical more consistent;
# N95 dominant. No-fit-test values used.
SOURCE_CONTROL = {
    "none":     0.00,
    "cloth":    0.50,
    "surgical": 0.70,
    "kn95":     0.75,
    "n95":      0.95,
}


@dataclass
class ActivitySegment:
    activity: str
    minutes: float


@dataclass
class Event:
    attendees: int = 100
    duration_hours: float = 2.0
    room_volume_m3: float = 3300.0
    air_changes_per_hour: float = 3.0
    activities: list = field(default_factory=lambda: [
        ActivitySegment("breathing", 81.0),
        ActivitySegment("speaking",  25.0),
        ActivitySegment("singing_loud", 4.0),
        ActivitySegment("eating",    10.0),
    ])
    breathing_rate_m3_per_hour: float = 0.5
    # Fraction of non-attendee peers who are wearing any mask.
    peer_masking_fraction: float = 0.0
    # Distribution of mask types among those who do mask.
    # Must sum to 1.0. Default: even mix across the four types.
    peer_mask_mix: dict = field(default_factory=lambda: {
        "cloth":    0.25,
        "surgical": 0.25,
        "kn95":     0.25,
        "n95":      0.25,
    })
    # Fraction of peers who are up to date on 2025-2026 COVID vaccine.
    # Assumes 3-dose baseline for all (already reflected in community
    # prevalence). This adds a differential reduction for the boosted
    # subset only.
    peer_current_season_vax_fraction: float = 0.0
    # VE against infection from current-season vaccine, averaged over
    # the post-dose window. Link-Gelles MMWR 2025 / NEJM Veterans 2025:
    # ~30-45% in first 3 months, waning to ~15-20% at 3-6 months.
    # Use 0.25 as central estimate.
    ve_infection: float = 0.25
    # Reduction in quanta emission per breakthrough infection.
    # Meta-analyses of breakthrough shedding (Tan 2023, Eyre 2022 et al.):
    # vaccinated breakthroughs show similar peak viral load but ~1-2 day
    # faster clearance; averaged over infectious period ~25-35% lower.
    ve_shedding: float = 0.30
    # Relative humidity of the event room, as a fraction (e.g., 0.40
    # = 40% RH). Affects aerosol infectivity: low-humidity air extends
    # infectious aerosol lifetime, high-humidity accelerates decay.
    # Based on Marr 2019 and Yang 2011/2012: infectivity roughly
    # halves as RH goes from 20% to 60%, then declines further above
    # 70%.
    relative_humidity: float = 0.40

    def humidity_multiplier(self) -> float:
        """Multiplier on effective quanta due to relative humidity.
        1.0 at RH=0.40 (baseline); higher at low RH, lower at high RH.
        Piecewise linear approximation of empirical curves."""
        rh = self.relative_humidity
        if rh < 0.20:
            return 1.7
        if rh < 0.40:
            return 1.7 - (rh - 0.20) / 0.20 * 0.7   # 1.7 -> 1.0
        if rh < 0.60:
            return 1.0 - (rh - 0.40) / 0.20 * 0.3   # 1.0 -> 0.7
        if rh < 0.80:
            return 0.7 - (rh - 0.60) / 0.20 * 0.2   # 0.7 -> 0.5
        return 0.5

    def transient_dose_factor(self, percentile: str = "mean") -> float:
        """Return the ratio of proper transient Wells-Riley dose to
        the steady-state time-weighted approximation.

        Proper transient: for each emitted quantum at time s, it decays
        via ACH until susceptible stops inhaling at time T. Exact
        contribution to dose is (1 - exp(-ACH*(T-s))) / ACH.

        Steady-state time-weighted: treats every quantum as if the
        room were at steady state throughout the event.

        Ratio <= 1; closer to 1 when T*ACH is large. Uses uniform-
        quanta approximation (assumes emissions are evenly distributed
        in time) to avoid dependence on unknown activity ordering.
        Formula: 1 - (1 - exp(-ACH*T)) / (ACH*T)
        """
        T = self.duration_hours
        ACH = self.air_changes_per_hour
        if T <= 0 or ACH <= 0:
            return 1.0
        return 1.0 - (1.0 - math.exp(-ACH * T)) / (ACH * T)

    def quanta_per_hour(self, percentile: str = "mean") -> float:
        """Time-weighted q/hr across activity segments.

        percentile: 'median', 'p90', or 'mean'.
        'mean' is the log-normal expectation over the viral-load
        distribution; this is the right quantity for expected infection
        risk. Median and p90 are scenario points for sanity-checking.
        """
        if percentile == "mean":
            med = self.quanta_per_hour("median")
            p90 = self.quanta_per_hour("p90")
            if med <= 0 or p90 <= med:
                return med
            # log-normal: p90 = median * exp(1.2816 * sigma)
            sigma = math.log(p90 / med) / 1.2816
            return med * math.exp(sigma ** 2 / 2)
        idx = 0 if percentile == "median" else 1
        total_minutes = sum(s.minutes for s in self.activities)
        weighted = sum(s.minutes * QUANTA_RATES[s.activity][idx]
                       for s in self.activities)
        return weighted / total_minutes

    def effective_source_emission_factor(self) -> float:
        """Fraction of baseline (unmasked) quanta emission per infectious
        peer, averaged over the masking assumptions.
        """
        avg_sc = sum(self.peer_mask_mix[m] * SOURCE_CONTROL[m]
                     for m in self.peer_mask_mix)
        f = self.peer_masking_fraction
        return (1 - f) * 1.0 + f * (1 - avg_sc)

    def peer_vax_prevalence_factor(self) -> float:
        """Multiplier on community prevalence reflecting current-season
        vaccination coverage among peers. <1 means fewer infectious
        peers than the community average."""
        p = self.peer_current_season_vax_fraction
        return p * (1 - self.ve_infection) + (1 - p) * 1.0

    def peer_vax_emission_factor(self) -> float:
        """Multiplier on per-infectious-peer quanta emission reflecting
        lower shedding in breakthrough-vaccinated infectious peers."""
        p = self.peer_current_season_vax_fraction
        # Fraction of infectious peers who are current-season vaxxed:
        inf_among_vax = p * (1 - self.ve_infection)
        inf_among_unvax = (1 - p) * 1.0
        frac_inf_are_vaxxed = inf_among_vax / (inf_among_vax + inf_among_unvax)
        return (frac_inf_are_vaxxed * (1 - self.ve_shedding)
                + (1 - frac_inf_are_vaxxed) * 1.0)


@dataclass
class Prevalence:
    # SF wastewater is LOW / flat (Oceanside ~1.6, R~1.01 as of 2026-04-10).
    # Wastewater-to-prevalence conversion (Biobot, WastewaterSCAN) for
    # the LOW category gives community infectious prevalence ~0.04-0.12%.
    # The earlier 0.1-0.3% range was too high for current SF reality
    # (back-validated against documented case + death data).
    community_infectious_low: float = 0.0004
    community_infectious_high: float = 0.0012
    # Fraction of infectious person-days attendable at the event.
    # Strict "no-one-with-symptoms" interpretation: only truly
    # asymptomatic (35% of infections, full 6-day infectious window) +
    # presymptomatic (65% of infections * ~2 days pre-symptom).
    #   attendable_person_days = 0.35*6 + 0.65*2 = 3.40
    #   total_person_days      = 0.35*6 + 0.65*8 = 7.30
    #   fraction               = 0.466
    # Buitrago-Garcia 2022 living SR for the 35% asymptomatic figure.
    event_attendable_fraction: float = 0.47


# Quanta-rate calibration factor accounting for the Buonanno 2020
# distribution being calibrated to early-pandemic / wild-type viral
# load distributions. Current variants infecting a mostly-immune
# population shed ~0.5-1 log10 less viral load on average (Puhach 2022,
# Lyngse 2023). Scale quanta down by ~2x to reflect this.
QUANTA_CALIBRATION_FACTOR_2026 = 0.5


# Hybrid immunity reduction factor on per-event infection probability,
# applied to non-IC adults. Bobrovitz et al. (Lancet Inf Dis 2022)
# meta-regression: hybrid immunity ~50% effective against reinfection
# averaged over 6-12 months post-exposure. Modal US adult in 2026 has
# 2-3 prior infections plus vaccination. Effective per-exposure
# protection: ~50%.
HYBRID_IMMUNITY_NON_IC = 0.50

# Hybrid immunity for IC adults: PLOS ONE 2024 - IC patients have
# 39% lower seroconversion 14-90 days post-infection (aOR 0.61). They
# also get reinfected more often (which restores seroprevalence beyond
# 90 days), but the per-infection antibody response is weaker. Net
# protective effect is ~20% rather than 50%.
HYBRID_IMMUNITY_IC = 0.20


# Receiver-side fitted filtration efficiency (fraction blocked). Sources:
# - Sickbert-Bennett et al., JAMA Intern Med 2020: N95 98.5% FFE;
#   surgical w/ ear loops 38.1%; surgical w/ ties ~71.5%.
# - Pan et al., PLOS ONE 2021: KN95s filter 57-77% when worn.
# - Oberg & Brosseau, AJIC 2008: non-fit-tested N95 ~67% (33% penetration);
#   fit-tested ~96%.
MASK_PROTECTION = {
    "none":           0.00,
    "surgical":       0.38,
    "kn95_typical":   0.67,
    "n95_casual":     0.67,
    "n95_fit_tested": 0.95,
}


# P(hospitalization | infection) by IC severity x protection. Midpoints of
# ranges synthesized from:
# - IDSA 2025 Guidelines (RR ~2.75 severe outcomes in IC vs non-IC).
# - Lancet Reg Health Europe, INFORM study 2023: IC = 4% population,
#   22% of COVID hospitalizations/deaths.
# - MMWR IVY Network 2024-2025 VE: ~36% against hospitalization in IC >=65.
# - Wang 2023 BC population study: IC RR ~6-10x for hospitalization.
# Baseline adult (Omicron, unvaccinated) hospitalization-per-infection
# is ~1-3%; applying the IC multipliers and vaccine effectiveness gives
# these midpoints. Uncertainty here is at least +/- 2x per cell.
P_HOSP_GIVEN_INFECTION = {
    ("severe",   "vax+prep"): 0.020,
    ("severe",   "vax_only"): 0.055,
    ("severe",   "old_vax"):  0.115,
    ("severe",   "none"):     0.200,

    ("moderate", "vax+prep"): 0.007,
    ("moderate", "vax_only"): 0.020,
    ("moderate", "old_vax"):  0.045,
    ("moderate", "none"):     0.080,

    ("mild",     "vax+prep"): 0.003,
    ("mild",     "vax_only"): 0.010,
    ("mild",     "old_vax"):  0.020,
    ("mild",     "none"):     0.040,
}


# P(long COVID | infection) by IC severity x protection.
# Baseline vaccinated general-population Omicron rate: ~6-10% at 3 mo
# (CDC EID 2024 Japan; NEJM 2024 PASC). 3-dose vaccination in IC reduces
# long COVID by 72% vs unvaccinated IC (Tran et al. 2025 meta-analysis,
# Clinical Microbiology and Infection). Unvaccinated IC multipliers:
# ~2-4x general pop for severe, ~1.5-2x for moderate, ~1x for mild.
LONG_COVID_PER_INFECTION = {
    ("severe",   "vax+prep"): 0.09,
    ("severe",   "vax_only"): 0.09,
    ("severe",   "old_vax"):  0.20,
    ("severe",   "none"):     0.30,

    ("moderate", "vax+prep"): 0.07,
    ("moderate", "vax_only"): 0.07,
    ("moderate", "old_vax"):  0.12,
    ("moderate", "none"):     0.18,

    ("mild",     "vax+prep"): 0.06,
    ("mild",     "vax_only"): 0.06,
    ("mild",     "old_vax"):  0.08,
    ("mild",     "none"):     0.10,
}


# Prevalence of any immunosuppression by age band.
# Source: Martinson et al., "Prevalence of Immunosuppression Among US
# Adults," JAMA 2024 (NHIS 2021 data).
IC_PREVALENCE_BY_AGE = {
    "18-39": 0.039,
    "40-59": 0.076,
    "60-69": 0.095,
    "70+":   0.078,
}


# Severity split within total IC population (literature synthesis).
# Severe = transplant, CAR-T, active heme malignancy, anti-CD20 therapy
# Moderate = biologics, methotrexate, mid-dose steroids, HIV w/ low-normal CD4
# Mild = low-dose prednisone, controlled HIV >500 CD4, asplenia
IC_SEVERITY_MIX = {
    "severe":   0.22,
    "moderate": 0.55,
    "mild":     0.23,
}


# Default attendee age distribution: "primarily 20-40, long tail, some 60s".
DEFAULT_AGE_DISTRIBUTION = {
    "18-39": 0.70,
    "40-59": 0.20,
    "60-69": 0.07,
    "70+":   0.03,
}


# Default mask-wearing distribution among IC attendees.
# IC people attending indoor events with food and singing are strongly
# self-selected for thoughtful risk management - specialists routinely
# recommend fit-tested N95s for these patients, and patients who reject
# that advice tend to also reject attending this type of event at all.
# So "IC attendee at this event" is assumed to track specialist guidance
# closely.
DEFAULT_IC_MASK_MIX = {
    "n95_fit_tested": 0.90,
    "n95_casual":     0.10,
    "kn95_typical":   0.00,
    "surgical":       0.00,
    "none":           0.00,
}


# Default vaccination distribution among IC attendees. Same logic: those
# who attend this type of event are disproportionately those with full
# specialist-guided protection.
DEFAULT_IC_VAX_MIX = {
    "vax+prep": 0.40,
    "vax_only": 0.50,
    "old_vax":  0.10,
    "none":     0.00,
}

# Less-regimented alternative mixes for sensitivity analysis.
GENERAL_IC_MASK_MIX = {
    "n95_fit_tested": 0.20,
    "n95_casual":     0.25,
    "kn95_typical":   0.15,
    "surgical":       0.15,
    "none":           0.25,
}
GENERAL_IC_VAX_MIX = {
    "vax+prep": 0.15,
    "vax_only": 0.45,
    "old_vax":  0.25,
    "none":     0.15,
}


# P(hospitalization | infection) for non-IC adults by vaccination
# status. Calibrated to current 2024-2026 era data:
# - MMWR VISION/IVY Network 2025: ~38 per 100K adults annual hosp rate;
#   with ~3-5% annual community infection, gives ~0.08-0.13%
#   hospitalization-per-infection for vaccinated adults.
# - Nature Comm 2024 (England): IHR dropped to 0.06% by Apr 2022,
#   0.32% Dec 2022; lower since with hybrid immunity.
# - Austria 2020-2023 nationwide: average IFR 0.16% across full
#   pandemic, much lower in current era.
# - 2024-2025 vaccine effectiveness against hospitalization: ~40-46%
#   (Link-Gelles MMWR 2025).
P_HOSP_GIVEN_INFECTION_NON_IC = {
    "vax_current": 0.0005,  # current-season vaccine + hybrid immunity
    "vax_old":     0.0010,  # older vaccine, still has hybrid immunity
    "none":        0.0030,  # truly unvaccinated (rare)
}


# P(long COVID | infection) for non-IC adults by vaccination status.
# CDC EID 2024 (Japan, vaccinated Omicron): 6% at 90 days. NEJM 2024
# (Veterans Omicron): 10% at 3 months. Vaccination reduces by ~23%
# (OR 0.77, Nat Comm 2025 meta-analysis). With hybrid immunity in
# the modern population, central estimates land 4-8%.
P_LONG_COVID_PER_INFECTION_NON_IC = {
    "vax_current": 0.04,
    "vax_old":     0.06,
    "none":        0.10,
}


# Default vaccination distribution among non-IC adult attendees.
# Mirrors peer_current_season_vax_fraction but split into current/old/none.
DEFAULT_NON_IC_VAX_MIX = {
    "vax_current": 0.25,
    "vax_old":     0.70,   # the 3-dose baseline everyone has
    "none":        0.05,
}


# Default mask-wearing distribution among non-IC adult attendees.
# For an event with 0% peer masking (current model default), this is
# trivially all "none"; parameterize so it can be changed if peers
# mask at higher rates.
DEFAULT_NON_IC_MASK_MIX = {
    "n95_fit_tested": 0.00,
    "n95_casual":     0.00,
    "kn95_typical":   0.00,
    "surgical":       0.00,
    "none":           1.00,
}


# Self-selection factor: probability that an IC individual in the
# general population will attend this event, relative to a non-IC
# individual. Pre-pandemic data on this is sparse:
#   - No study directly measures IC event attendance rates.
#   - SF-36 social-functioning subscales show ~5-25 point reduction
#     below general-population norms for various IC subtypes
#     (Cavallini 2015, Gathmann CVID studies).
#   - Solid organ transplant recipients >1yr out score close to norms
#     on most SF-36 domains (6 of 8).
#   - HSCT patients <1yr: formal medical restriction (~0.1-0.3x).
#   - CVID: SF-36 social functioning ~15-25 below general norm.
#   - COVID-era Islam 2021: IC 85.3% avoided crowded places vs 75.4%
#     non-IC (~10 pp additional during pandemic).
# The population-weighted pre-pandemic baseline for a typical IC
# adult is plausibly 0.80-0.90x general population; COVID-era adds
# another ~0.85x multiplier. Current-era total: ~0.5-0.85x with
# wide uncertainty. 0.70 is the defensible midpoint.
DEFAULT_SELF_SELECTION = 0.70


def per_event_infection_prob(event, prev, mask_filtration,
                             quanta_percentile="mean",
                             hybrid_immunity=0.0):
    """Return (low, high) P(infection) bracketed by prevalence range.

    hybrid_immunity: fraction reduction in effective infection
    probability from the susceptible attendee's pre-existing immunity
    (from prior infections + vaccination). 0.0 = naive; 0.5 = typical
    non-IC; 0.2 = IC with weakened immune response per infection.
    """
    # Wells-Riley steady-state:
    #   C = Q / (ACH * V)
    #   n_per_source = C * breathing * duration
    #   P(inf) = 1 - exp(-N_inf * n_per_source * (1 - mask))
    q_per_hr = event.quanta_per_hour(quanta_percentile)
    q_per_hr *= event.effective_source_emission_factor()
    q_per_hr *= event.peer_vax_emission_factor()
    q_per_hr *= event.humidity_multiplier()
    # 2026 quanta calibration: current variants in mostly-immune pop
    # produce lower viral loads than Buonanno's 2020 calibration.
    q_per_hr *= QUANTA_CALIBRATION_FACTOR_2026
    C = q_per_hr / (event.air_changes_per_hour * event.room_volume_m3)
    n_per_source = C * event.breathing_rate_m3_per_hour * event.duration_hours
    # Non-steady-state transient correction.
    n_per_source *= event.transient_dose_factor(quanta_percentile)
    # Mask filtration combined with hybrid immunity (multiplicative).
    effective_dose = n_per_source * (1 - mask_filtration) * (1 - hybrid_immunity)

    probs = []
    for p_comm in (prev.community_infectious_low, prev.community_infectious_high):
        p_event_attendee = (p_comm
                            * prev.event_attendable_fraction
                            * event.peer_vax_prevalence_factor())
        expected_infectious = (event.attendees - 1) * p_event_attendee
        probs.append(1 - math.exp(-expected_infectious * effective_dose))
    return min(probs), max(probs)


def per_event_hosp_prob(ic, protection, p_inf_low, p_inf_high):
    p_h = P_HOSP_GIVEN_INFECTION[(ic, protection)]
    return p_inf_low * p_h, p_inf_high * p_h


def expected_ic_attendees(attendees, age_distribution=DEFAULT_AGE_DISTRIBUTION,
                          self_selection=DEFAULT_SELF_SELECTION):
    """Expected number of IC attendees at the event, stratified by severity.

    self_selection: multiplier on baseline prevalence reflecting IC
    attendees' tendency to avoid/attend this kind of event. 1.0 = same as
    general population; 0.5 = IC people attend at half the rate.

    Returns (total_ic, by_severity_dict).
    """
    if abs(sum(age_distribution.values()) - 1.0) > 1e-6:
        raise ValueError("age_distribution must sum to 1.0")
    total = 0.0
    for age_band, share in age_distribution.items():
        total += attendees * share * IC_PREVALENCE_BY_AGE[age_band]
    total *= self_selection
    by_severity = {
        sev: total * share
        for sev, share in IC_SEVERITY_MIX.items()
    }
    return total, by_severity


def weighted_ic_infection_risk(event, prev, ic_mask_mix=DEFAULT_IC_MASK_MIX,
                               hybrid_immunity=HYBRID_IMMUNITY_IC):
    """Per-event P(infection) for a representative IC attendee, weighted
    across the mask distribution. Returns (low, high)."""
    if abs(sum(ic_mask_mix.values()) - 1.0) > 1e-6:
        raise ValueError("ic_mask_mix must sum to 1.0")
    lo = hi = 0.0
    for mask_name, weight in ic_mask_mix.items():
        if weight == 0:
            continue
        filt = MASK_PROTECTION[mask_name]
        m_lo, m_hi = per_event_infection_prob(event, prev, filt, "mean",
                                              hybrid_immunity=hybrid_immunity)
        lo += weight * m_lo
        hi += weight * m_hi
    return lo, hi


def weighted_outcome_rate(outcome_table, severity, vax_mix):
    """Weighted average of P(outcome|infection) across a vax distribution,
    for a given IC severity. outcome_table is e.g. P_HOSP_GIVEN_INFECTION.
    """
    if abs(sum(vax_mix.values()) - 1.0) > 1e-6:
        raise ValueError("vax_mix must sum to 1.0")
    return sum(vax_mix[v] * outcome_table[(severity, v)] for v in vax_mix)


def aggregate_event_risk(event, prev,
                         age_distribution=DEFAULT_AGE_DISTRIBUTION,
                         ic_mask_mix=DEFAULT_IC_MASK_MIX,
                         ic_vax_mix=DEFAULT_IC_VAX_MIX,
                         self_selection=DEFAULT_SELF_SELECTION):
    """Compute expected counts of infections, hospitalizations, and long
    COVID across all IC attendees at the event.

    Returns dict with:
      - expected_ic_attendees
      - ic_by_severity
      - per_ic_infection_risk: (lo, hi)
      - expected_infections: (lo, hi)
      - expected_hospitalizations: (lo, hi) - sums across mod+sev+mild
      - expected_hospitalizations_mod_sev: (lo, hi)
      - expected_long_covid: (lo, hi)
      - p_any_ic_infected: (lo, hi)          # 1 - (1-p)^N_ic
      - p_any_ic_hospitalized: (lo, hi)
      - p_any_ic_long_covid: (lo, hi)
    """
    total_ic, by_severity = expected_ic_attendees(
        event.attendees, age_distribution, self_selection)

    p_inf_lo, p_inf_hi = weighted_ic_infection_risk(event, prev, ic_mask_mix)

    exp_inf = (total_ic * p_inf_lo, total_ic * p_inf_hi)

    exp_hosp_lo = exp_hosp_hi = 0.0
    exp_hosp_ms_lo = exp_hosp_ms_hi = 0.0
    exp_lc_lo = exp_lc_hi = 0.0
    for sev, n_sev in by_severity.items():
        w_hosp = weighted_outcome_rate(P_HOSP_GIVEN_INFECTION, sev, ic_vax_mix)
        w_lc = weighted_outcome_rate(LONG_COVID_PER_INFECTION, sev, ic_vax_mix)
        exp_hosp_lo += n_sev * p_inf_lo * w_hosp
        exp_hosp_hi += n_sev * p_inf_hi * w_hosp
        exp_lc_lo += n_sev * p_inf_lo * w_lc
        exp_lc_hi += n_sev * p_inf_hi * w_lc
        if sev in ("severe", "moderate"):
            exp_hosp_ms_lo += n_sev * p_inf_lo * w_hosp
            exp_hosp_ms_hi += n_sev * p_inf_hi * w_hosp

    # Probability of at least one IC attendee experiencing the outcome.
    # P(>=1 event) = 1 - prod_i (1 - p_i) ~= 1 - exp(-sum p_i) when p small.
    def p_any(expected_count_lo, expected_count_hi):
        return (1 - math.exp(-expected_count_lo),
                1 - math.exp(-expected_count_hi))

    # Non-IC attendees: everyone minus expected IC attendees.
    total_non_ic = event.attendees - total_ic
    p_inf_non_ic_lo, p_inf_non_ic_hi = weighted_ic_infection_risk(
        event, prev, DEFAULT_NON_IC_MASK_MIX,
        hybrid_immunity=HYBRID_IMMUNITY_NON_IC)
    w_hosp_non_ic = sum(DEFAULT_NON_IC_VAX_MIX[v] * P_HOSP_GIVEN_INFECTION_NON_IC[v]
                        for v in DEFAULT_NON_IC_VAX_MIX)
    w_lc_non_ic = sum(DEFAULT_NON_IC_VAX_MIX[v] * P_LONG_COVID_PER_INFECTION_NON_IC[v]
                      for v in DEFAULT_NON_IC_VAX_MIX)
    exp_inf_non_ic = (total_non_ic * p_inf_non_ic_lo,
                      total_non_ic * p_inf_non_ic_hi)
    exp_hosp_non_ic = (exp_inf_non_ic[0] * w_hosp_non_ic,
                       exp_inf_non_ic[1] * w_hosp_non_ic)
    exp_lc_non_ic = (exp_inf_non_ic[0] * w_lc_non_ic,
                     exp_inf_non_ic[1] * w_lc_non_ic)

    return {
        "expected_ic_attendees": total_ic,
        "ic_by_severity": by_severity,
        "per_ic_infection_risk": (p_inf_lo, p_inf_hi),
        "expected_infections": exp_inf,
        "expected_hospitalizations": (exp_hosp_lo, exp_hosp_hi),
        "expected_hospitalizations_mod_sev": (exp_hosp_ms_lo, exp_hosp_ms_hi),
        "expected_long_covid": (exp_lc_lo, exp_lc_hi),
        "p_any_ic_infected": p_any(*exp_inf),
        "p_any_ic_hospitalized": p_any(exp_hosp_lo, exp_hosp_hi),
        "p_any_ic_long_covid": p_any(exp_lc_lo, exp_lc_hi),
        "expected_non_ic_attendees": total_non_ic,
        "per_non_ic_infection_risk": (p_inf_non_ic_lo, p_inf_non_ic_hi),
        "expected_non_ic_infections": exp_inf_non_ic,
        "expected_non_ic_hospitalizations": exp_hosp_non_ic,
        "expected_non_ic_long_covid": exp_lc_non_ic,
        "p_any_non_ic_infected": p_any(*exp_inf_non_ic),
        "p_any_non_ic_hospitalized": p_any(*exp_hosp_non_ic),
        "p_any_non_ic_long_covid": p_any(*exp_lc_non_ic),
    }


def fmt(p):
    if p <= 0:
        return "0"
    if p < 1e-6:
        return f"{p*1e9:.2f} per billion"
    if p < 1e-4:
        return f"{p*1e6:.2f} per million"
    if p < 1e-2:
        return f"{p*1e4:.2f} per 10,000"
    return f"{p*100:.2f}%"


def main():
    # User-specified scenario: 25% of peers have 2025-2026 vaccine;
    # everyone has 3-dose baseline (already in community prevalence);
    # no-one attends with any symptoms (event_attendable_fraction=0.47).
    event = Event(peer_current_season_vax_fraction=0.25)
    prev = Prevalence()

    q_med = event.quanta_per_hour("median")
    q_p90 = event.quanta_per_hour("p90")
    q_mean = event.quanta_per_hour("mean")
    humidity_mult = event.humidity_multiplier()
    transient_factor = event.transient_dose_factor("mean")
    p_low = prev.community_infectious_low * prev.event_attendable_fraction
    p_high = prev.community_infectious_high * prev.event_attendable_fraction

    print("=== Activity breakdown ===")
    total_min = sum(s.minutes for s in event.activities)
    for seg in event.activities:
        med, p90 = QUANTA_RATES[seg.activity]
        print(f"  {seg.minutes:>5.1f} min {seg.activity:<14} "
              f"median={med:>5.2f} q/hr  p90={p90:>6.1f} q/hr")
    print(f"  {'':>5} --- total: {total_min:.0f} min")
    print()
    print("Time-weighted quanta per infectious attendee (lognormal):")
    print(f"  median:          {q_med:.2f} q/hr")
    print(f"  mean (expected): {q_mean:.2f} q/hr  <-- used for risk")
    print(f"  90th percentile: {q_p90:.2f} q/hr")
    print(f"Humidity multiplier @ RH={event.relative_humidity:.0%}: "
          f"{humidity_mult:.2f}")
    print(f"Non-steady-state transient dose factor: {transient_factor:.3f} "
          f"(vs 1.0 steady-state)")
    print()
    print(f"Effective attendee prevalence:   "
          f"{p_low*100:.3f}% - {p_high*100:.3f}%")
    print(f"Expected infectious attendees:   "
          f"{(event.attendees-1) * p_low:.3f} - "
          f"{(event.attendees-1) * p_high:.3f}")
    print()

    print("=== Expected per-event infection probability by mask ===")
    print("(uses lognormal mean of emitter distribution; range from "
          "prevalence bounds)")
    for mask_name in ("none", "surgical", "kn95_typical",
                      "n95_casual", "n95_fit_tested"):
        mask = MASK_PROTECTION[mask_name]
        lo, hi = per_event_infection_prob(event, prev, mask, "mean")
        print(f"  {mask_name:<16} filt={mask:.2f}   "
              f"{fmt(lo)} - {fmt(hi)}")
    print()

    mask = MASK_PROTECTION["n95_fit_tested"]
    print("=== Peer vaccination sensitivity ===")
    print("(attendee in fit-tested N95; 0% peer masking; "
          "VE_inf=0.25, VE_shed=0.30)")
    print()
    for cs_vax in (0.0, 0.25, 0.50, 1.0):
        event.peer_current_season_vax_fraction = cs_vax
        prev_factor = event.peer_vax_prevalence_factor()
        emit_factor = event.peer_vax_emission_factor()
        combined = prev_factor * emit_factor
        lo, hi = per_event_infection_prob(event, prev, mask, "mean")
        print(f"  {int(cs_vax*100):>3d}% current-season vaxxed   "
              f"prevalence x{prev_factor:.3f} * "
              f"emission x{emit_factor:.3f} = x{combined:.3f}")
        print(f"    E[P(infection)]: {fmt(lo)} - {fmt(hi)}")
    event.peer_current_season_vax_fraction = 0.25
    print()

    print("=== Peer masking sensitivity ===")
    print("(attendee in fit-tested N95; 25% current-season vax; "
          "25% each cloth/surgical/KN95/N95 among masked peers)")
    print()
    for f in (0.0, 0.5, 1.0):
        event.peer_masking_fraction = f
        emission = event.effective_source_emission_factor()
        lo, hi = per_event_infection_prob(event, prev, mask, "mean")
        print(f"  {int(f*100):>3d}% peers masked   "
              f"mask-emission factor = {emission:.3f}")
        print(f"    E[P(infection)]: {fmt(lo)} - {fmt(hi)}")
    event.peer_masking_fraction = 0.0
    print()

    lo, hi = per_event_infection_prob(event, prev, mask, "mean")
    print("=== Hospitalization risk grid (single IC attendee) ===")
    print("(N95 fit-tested attendee, 0% peer masking, 25% peer vax, "
          "no-symptoms policy)")
    print(f"{'IC':<10}{'Protection':<12}{'P(hosp|inf)':<14}"
          f"{'E[P(hosp per event)]'}")
    print("-" * 70)
    for (ic, prot), p_h in P_HOSP_GIVEN_INFECTION.items():
        hosp_lo, hosp_hi = per_event_hosp_prob(ic, prot, lo, hi)
        print(f"{ic:<10}{prot:<12}{p_h*100:>5.1f}%        "
              f"{fmt(hosp_lo)} - {fmt(hosp_hi)}")
    print()

    print("=== Aggregate risk across all IC attendees ===")
    print("(using IC prevalence by age)")
    print()
    print(f"Attendee age distribution: {DEFAULT_AGE_DISTRIBUTION}")
    print(f"IC severity mix:           {IC_SEVERITY_MIX}")
    print()

    # Self-selection sensitivity: 0.50 = strong avoidance (skewed
    # severely-IC composition, active treatment), 0.70 = literature
    # midpoint, 0.85 = near-normal (stable moderate/mild IC dominant).
    scenarios = [
        ("regimented IC, self_selection=0.50 (strong avoidance)",
         DEFAULT_IC_MASK_MIX, DEFAULT_IC_VAX_MIX, 0.50),
        ("regimented IC, self_selection=0.70 (midpoint, DEFAULT)",
         DEFAULT_IC_MASK_MIX, DEFAULT_IC_VAX_MIX, 0.70),
        ("regimented IC, self_selection=0.85 (mild avoidance)",
         DEFAULT_IC_MASK_MIX, DEFAULT_IC_VAX_MIX, 0.85),
        ("general IC distribution, self_selection=0.70",
         GENERAL_IC_MASK_MIX, GENERAL_IC_VAX_MIX, 0.70),
    ]

    for label, mask_mix, vax_mix, selection in scenarios:
        print(f"--- {label} ---")
        print(f"IC mask mix: {mask_mix}")
        print(f"IC vax mix:  {vax_mix}")
        agg = aggregate_event_risk(event, prev, ic_mask_mix=mask_mix,
                                   ic_vax_mix=vax_mix,
                                   self_selection=selection)
        print(f"Expected IC attendees:            "
              f"{agg['expected_ic_attendees']:.2f} total")
        for sev, n in agg["ic_by_severity"].items():
            print(f"    {sev:<10}: {n:.2f}")
        p_lo, p_hi = agg["per_ic_infection_risk"]
        print(f"Per-IC infection risk (weighted): "
              f"{fmt(p_lo)} - {fmt(p_hi)}")
        print()
        for label, key_expected, key_any in (
            ("IC attendee infected",
             "expected_infections", "p_any_ic_infected"),
            ("IC attendee hospitalized (all IC)",
             "expected_hospitalizations", "p_any_ic_hospitalized"),
            ("IC attendee hospitalized (mod+sev)",
             "expected_hospitalizations_mod_sev", None),
            ("IC attendee with long COVID",
             "expected_long_covid", "p_any_ic_long_covid"),
        ):
            exp_lo, exp_hi = agg[key_expected]
            print(f"  {label}")
            print(f"    expected count:  {fmt(exp_lo)} - {fmt(exp_hi)}")
            if key_any:
                any_lo, any_hi = agg[key_any]
                print(f"    P(>=1 event):    {fmt(any_lo)} - {fmt(any_hi)}")
        print()

        # Non-IC attendee outcomes.
        print(f"  Non-IC attendees: {agg['expected_non_ic_attendees']:.1f}")
        nic_p_lo, nic_p_hi = agg["per_non_ic_infection_risk"]
        print(f"  Per-non-IC infection risk: "
              f"{fmt(nic_p_lo)} - {fmt(nic_p_hi)}")
        for label, key_expected, key_any in (
            ("Non-IC attendee infected",
             "expected_non_ic_infections", "p_any_non_ic_infected"),
            ("Non-IC attendee hospitalized",
             "expected_non_ic_hospitalizations", "p_any_non_ic_hospitalized"),
            ("Non-IC attendee with long COVID",
             "expected_non_ic_long_covid", "p_any_non_ic_long_covid"),
        ):
            exp_lo, exp_hi = agg[key_expected]
            any_lo, any_hi = agg[key_any]
            print(f"  {label}")
            print(f"    expected count:  {fmt(exp_lo)} - {fmt(exp_hi)}")
            print(f"    P(>=1 event):    {fmt(any_lo)} - {fmt(any_hi)}")
        print()

        # Monthly cadence: 12 events/year.
        print(f"  Annual totals at monthly cadence (12 events/year):")
        n_events = 12
        for label, key_expected in (
            ("IC infections",                "expected_infections"),
            ("IC hospitalizations (all IC)", "expected_hospitalizations"),
            ("IC hospitalizations (mod+sev)","expected_hospitalizations_mod_sev"),
            ("IC long-COVID cases",          "expected_long_covid"),
            ("Non-IC infections",            "expected_non_ic_infections"),
            ("Non-IC hospitalizations",      "expected_non_ic_hospitalizations"),
            ("Non-IC long-COVID cases",      "expected_non_ic_long_covid"),
        ):
            exp_lo, exp_hi = agg[key_expected]
            print(f"    {label:<34} "
                  f"{fmt(exp_lo*n_events)} - {fmt(exp_hi*n_events)}")
        print()


if __name__ == "__main__":
    main()
