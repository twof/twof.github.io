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

    def quanta_per_hour(self, percentile: str = "median") -> float:
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
    # Community infectious prevalence plausibly 0.1-0.3% in this regime.
    community_infectious_low: float = 0.001
    community_infectious_high: float = 0.003
    # Fraction of infectious person-days attendable at the event.
    # Strict "no-one-with-symptoms" interpretation: only truly
    # asymptomatic (35% of infections, full 6-day infectious window) +
    # presymptomatic (65% of infections * ~2 days pre-symptom).
    #   attendable_person_days = 0.35*6 + 0.65*2 = 3.40
    #   total_person_days      = 0.35*6 + 0.65*8 = 7.30
    #   fraction               = 0.466
    # Buitrago-Garcia 2022 living SR for the 35% asymptomatic figure.
    event_attendable_fraction: float = 0.47


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


def per_event_infection_prob(event, prev, mask_filtration,
                             quanta_percentile="median"):
    """Return (low, high) P(infection) bracketed by prevalence range."""
    # Wells-Riley steady-state:
    #   C = Q / (ACH * V)
    #   n_per_source = C * breathing * duration
    #   P(inf) = 1 - exp(-N_inf * n_per_source * (1 - mask))
    q_per_hr = event.quanta_per_hour(quanta_percentile)
    q_per_hr *= event.effective_source_emission_factor()
    q_per_hr *= event.peer_vax_emission_factor()
    C = q_per_hr / (event.air_changes_per_hour * event.room_volume_m3)
    n_per_source = C * event.breathing_rate_m3_per_hour * event.duration_hours
    effective_dose = n_per_source * (1 - mask_filtration)

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
    print(f"Time-weighted quanta per infectious attendee:")
    print(f"  median:          {q_med:.2f} q/hr")
    print(f"  90th percentile: {q_p90:.2f} q/hr")
    print()
    print(f"Effective attendee prevalence:   {p_low*100:.3f}% - {p_high*100:.3f}%")
    print(f"Expected infectious attendees:   "
          f"{(event.attendees-1) * p_low:.3f} - "
          f"{(event.attendees-1) * p_high:.3f}")
    print()

    for percentile in ("median", "p90"):
        print(f"=== Per-event infection probability, quanta={percentile} ===")
        for mask_name in ("none", "surgical", "kn95_typical",
                          "n95_casual", "n95_fit_tested"):
            mask = MASK_PROTECTION[mask_name]
            lo, hi = per_event_infection_prob(event, prev, mask, percentile)
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
        lo_med, hi_med = per_event_infection_prob(event, prev, mask, "median")
        print(f"  {int(cs_vax*100):>3d}% current-season vaxxed   "
              f"prevalence x{prev_factor:.3f} * "
              f"emission x{emit_factor:.3f} = x{combined:.3f}")
        print(f"    P(infection) median emitter: "
              f"{fmt(lo_med)} - {fmt(hi_med)}")
    event.peer_current_season_vax_fraction = 0.25  # user scenario
    print()

    print("=== Peer masking sensitivity ===")
    print("(attendee in fit-tested N95; 25% current-season vax; "
          "25% each cloth/surgical/KN95/N95 among masked peers)")
    print()
    for f in (0.0, 0.5, 1.0):
        event.peer_masking_fraction = f
        emission = event.effective_source_emission_factor()
        lo_med, hi_med = per_event_infection_prob(event, prev, mask, "median")
        lo_p90, hi_p90 = per_event_infection_prob(event, prev, mask, "p90")
        print(f"  {int(f*100):>3d}% peers masked   "
              f"mask-emission factor = {emission:.3f}")
        print(f"    P(infection) median emitter: "
              f"{fmt(lo_med)} - {fmt(hi_med)}")
        print(f"    P(infection) p90 emitter:    "
              f"{fmt(lo_p90)} - {fmt(hi_p90)}")
    event.peer_masking_fraction = 0.0
    print()

    lo_med, hi_med = per_event_infection_prob(event, prev, mask, "median")
    lo_p90, hi_p90 = per_event_infection_prob(event, prev, mask, "p90")
    print("=== Hospitalization risk, N95 fit-tested, 0% peer masking ===")
    print(f"{'IC':<10}{'Protection':<12}{'P(hosp|inf)':<14}"
          f"{'P(hosp per event), median - p90'}")
    print("-" * 82)
    for (ic, prot), p_h in P_HOSP_GIVEN_INFECTION.items():
        med_lo, med_hi = per_event_hosp_prob(ic, prot, lo_med, hi_med)
        p90_lo, p90_hi = per_event_hosp_prob(ic, prot, lo_p90, hi_p90)
        print(f"{ic:<10}{prot:<12}{p_h*100:>5.1f}%        "
              f"{fmt(med_lo)} - {fmt(p90_hi)}")


if __name__ == "__main__":
    main()
