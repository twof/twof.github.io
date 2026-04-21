# COVID event risk calculator

A Wells-Riley infection model combined with literature-derived
P(hospitalization | infection) for immunocompromised attendees.

## Usage

```sh
python3 risk.py
```

Edit `Event`, `Prevalence`, or `MASK_PROTECTION` in `risk.py` to change inputs.

## Sources

### Wells-Riley / quanta emission

- **Buonanno et al., "Estimation of airborne viral emission: Quanta
  emission rate of SARS-CoV-2 for infection risk assessment,"
  *Environment International* 2020.**
  Breathing at rest: 10.5 q/hr. Speaking at rest: 320 q/hr. Light
  activity with vocalization: >100 q/hr.
  https://pubmed.ncbi.nlm.nih.gov/32416374/

- **ICRP / EPA Exposure Factors Handbook.** Sedentary adult breathing
  rate ~0.5 m^3/hr.

### Ventilation

- **ANSI/ASHRAE Standard 62.1** (ventilation for acceptable indoor air
  quality). Education-facility design guidance suggests 6-8 ACH; older
  or under-maintained gyms are often lower. We use 3 as a conservative
  mid-range default.

### Mask filtration

- **Sickbert-Bennett et al., "Filtration Efficiency of Hospital Face
  Mask Alternatives Available for Use During the COVID-19 Pandemic,"
  *JAMA Internal Medicine* 2020.** Fitted filtration efficiency:
  N95 98.5%; surgical with ties ~71.5%; surgical with ear loops ~38.1%.
  https://pubmed.ncbi.nlm.nih.gov/32780113/

- **Pan et al., "The protective performance of reusable cloth face
  masks, disposable procedure masks, KN95 masks and N95 respirators:
  Filtration and total inward leakage," *PLOS ONE* 2021.**
  KN95s filtered 57-77% when worn by users.
  https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0258191

- **Oberg & Brosseau, "Surgical mask filter and fit performance,"
  *American Journal of Infection Control* 2008.** Non-fit-tested N95
  average aerosol penetration ~33% (i.e. FFE ~67%); fit-tested ~96%.
  https://pubmed.ncbi.nlm.nih.gov/16490606/

### Asymptomatic / presymptomatic prevalence

- **Buitrago-Garcia et al., "Occurrence and transmission potential of
  asymptomatic and presymptomatic SARS-CoV-2 infections: Update of a
  living systematic review and meta-analysis," *PLOS Medicine* 2022.**
  ~35% of infections truly asymptomatic. Presymptomatic window 1-3
  days. Combined fraction of infectious person-days belonging to
  non-symptomatic people ~40-50%.
  https://pubmed.ncbi.nlm.nih.gov/35617363/

### Community prevalence proxy (SF wastewater)

- **WastewaterSCAN (Stanford).** Oceanside SF SARS-CoV-2 reading ~1.6
  (gene copies per 100k PMMoV), SF County R ~1.01 as of 2026-04-10.
  Both SF plants are in the LOW category; plateau since early 2025.
  https://data.wastewaterscan.org/tracker/

- **SF DataSF, dataset `g2di-xufg` (COVID-19 Deaths Over Time) and
  `nfpa-mg4g` (COVID-19 Testing Over Time).** 2026 YTD (through
  April 15): 198 positive tests / 25,371 tests = 0.8% positivity.
  Full-year 2023 comparison: 20,594 / 258,750 = 8.0%. Positivity is
  symptomatic-biased and sets an upper bound on effective event
  prevalence after self-selection.
  https://data.sfgov.org/resource/nfpa-mg4g
  https://data.sfgov.org/resource/g2di-xufg

### P(hospitalization | infection) by IC status and protection

Values in `risk.py` are synthesized midpoints. Each cell carries roughly
+/- 2x uncertainty; use with care.

- **IDSA 2025 Guidelines on Vaccines in Immunocompromised Patients.**
  Severe-outcome RR ~2.75 for IC vs non-IC after vaccination.
  https://www.idsociety.org/Seasonal-RTI-Vaccinations-in-Immunocompromised-Patients/

- **Drozd et al. (INFORM study), *Lancet Regional Health Europe* 2023
  and follow-up 2025.** IC individuals ~4% of population but
  ~22% of COVID hospitalizations and deaths.
  https://www.thelancet.com/journals/lanepe/article/PIIS2666-7762(23)00166-7/fulltext

- **Link-Gelles et al. (IVY Network), *MMWR* 2025.** 2024-2025 COVID
  vaccine effectiveness against hospitalization in IC adults >=65:
  36% (95% CI 6-57%). Non-IC adults >=65: 45-46%.
  https://pmc.ncbi.nlm.nih.gov/articles/PMC12424867/

- **Wang et al., *BMC Infect Dis* 2023 (BC population study).**
  IC individuals had 6-10x the hospitalization rate vs non-IC during
  Omicron.
  https://pmc.ncbi.nlm.nih.gov/articles/PMC9987330/

- Baseline adult (Omicron, unvaccinated) hospitalization-per-infection
  is approximately 1-3%; the midpoints in `P_HOSP_GIVEN_INFECTION`
  come from applying IC multipliers and vaccine/PrEP effectiveness
  on top of that baseline.

## Method limitations

- **Well-mixed assumption.** Wells-Riley treats aerosol as uniform in
  the room. Real rooms have hot/cold spots; sitting close to an
  infectious person increases short-range dose beyond the average.
- **Point estimate for quanta emission.** Viral load varies several
  orders of magnitude between infected individuals; Buonanno's 10.5
  q/hr figure assumes a specific (high) viral-load baseline.
- **Event-attendable fraction** is an approximation that assumes
  people with moderate-to-severe symptoms stay home. It will
  over-estimate risk filtering in populations that push through
  symptoms.
- **Hospitalization model is coarse.** IC is not a single risk state;
  a solid-organ transplant recipient on tacrolimus differs sharply
  from someone on low-dose methotrexate. Use ranges accordingly.
- **Does not model short-range / close-contact transmission** during
  food-service periods when attendees cluster and unmask. For this
  event's food service segment, add an additional short-duration
  high-quanta run as a sensitivity check.

## Example output (defaults)

```
Per-event infection probability (N95 fit-tested):     4.5 - 13.5 per million
Per-event infection probability (N95 casual / KN95): 29.7 - 89.1 per million
Per-event infection probability (unmasked):           90.0 per million - 2.7 per 10,000

Hospitalization risk, N95 fit-tested, moderately IC + current vax:
  90 - 270 per billion
```

These numbers are small but dominated by `quanta_per_hour`,
`air_changes_per_hour`, and `community_infectious_*` assumptions;
sweep those to see sensitivity.
