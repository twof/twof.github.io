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

- **Buonanno et al., "Quantitative assessment of the risk of airborne
  transmission of SARS-CoV-2 infection: Prospective and retrospective
  applications," *Environment International* 2020**, Table 2. Activity-
  specific quanta rates, accounting for the log-normal distribution of
  viral loads across infectious people:

  | Activity (resting/light) | Median q/hr | 90th percentile q/hr |
  |---|---|---|
  | Quiet oral breathing     | 0.37  |   3.1 |
  | Normal speaking          | 5.0   |  42.0 |
  | Singing / loud speaking  | 32.0  | 270.0 |

  Eating is modeled as a mix of breathing and brief speech
  (~3 q/hr median, ~20 q/hr p90).
  https://pmc.ncbi.nlm.nih.gov/articles/PMC7474922/

  We time-weight these over the event's activity segments rather than
  using a single hand-picked `quanta_per_hour`. The distinction between
  median and 90th percentile is the biggest remaining uncertainty:
  most infectious attendees shed near the median; occasional
  "high-emitter" hosts can reach the p90. Report both bounds.

- **ICRP / EPA Exposure Factors Handbook.** Sedentary adult breathing
  rate ~0.5 m^3/hr.

### Ventilation

- **ANSI/ASHRAE Standard 62.1** (ventilation for acceptable indoor air
  quality). Education-facility design guidance suggests 6-8 ACH; older
  or under-maintained gyms are often lower. We use 3 as a conservative
  mid-range default.

### Mask filtration (receiver-side / wearer protection)

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

### Mask source control (emitter-side)

`SOURCE_CONTROL` values are consensus midpoints across multiple
peer-reviewed studies. Individual studies disagree, especially for
cloth masks (see note below).

- **Lai et al., "Relative efficacy of masks and respirators as source
  control for viral aerosol shedding from people infected with
  SARS-CoV-2: a controlled human exhaled breath aerosol experimental
  study," *eBioMedicine* 2024.** n=44 infected volunteers, paired
  masked/unmasked breath samples. Reduction in SARS-CoV-2 viral load:
  N95 98%, cloth 87%, surgical 74%, KN95 71%.
  https://pubmed.ncbi.nlm.nih.gov/38821778/

- **Lindsley et al., "A comparison of performance metrics for cloth
  face masks as source control devices for simulated cough and
  exhalation aerosols," *Aerosol Science and Technology* 2021.**
  Manikin study, 15 cloth masks + 2 surgical + 2 N95. Cloth source
  control: 17-71% for coughing, 35-66% for exhalation. N95 range
  83-99%.
  https://pmc.ncbi.nlm.nih.gov/articles/PMC7899465/

- **Asadi et al., "Efficacy of masks and face coverings in controlling
  outward aerosol particle emission from expiratory activities,"
  *Scientific Reports* 2020.** Surgical and unvented KN95: ~90% and
  74% reduction in outward particle emission during speaking and
  coughing respectively. Note: homemade cotton cloth masks were found
  to *increase* raw particle counts due to cotton fiber shedding, but
  this confounds measurement - the shed fibers don't contain virus.
  https://www.nature.com/articles/s41598-020-72798-7

- **CDC Science Brief: Community Use of Masks to Control the Spread of
  SARS-CoV-2.** Multi-layer cloth masks block 50-70% of fine droplets;
  up to 80% in some human experiments.
  https://www.cdc.gov/coronavirus/2019-ncov/science/science-briefs/masking-science-sars-cov2.html

**Note on cloth masks:** Lai 2024 found cloth > surgical (87% vs 74%),
but this is an outlier vs. the broader literature, which puts cloth in
a wide 30-70% range and surgical at 70-90%. The discrepancy likely
reflects (a) Lai's direct viral-load measurement vs. particle counting
used in older studies, and (b) cloth-mask quality has improved
substantially since 2020. We use the consensus midpoint (50%) for
cloth with a known wide variance; this is conservative relative to
Lai 2024.

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

Activity breakdown: 81 min listening + 25 min discussion + 4 min singing
+ 10 min eating. Time-weighted quanta per infectious attendee:
**2.6 q/hr median, 21.5 q/hr 90th percentile.**

### Peer masking sensitivity (attendee in fit-tested N95)

25% each cloth/surgical/KN95/N95 mix among masked peers:

| Peers masked | Quanta factor | P(inf) median emitter | P(inf) p90 emitter |
|---|---|---|---|
| 0%   | 1.000 | 587 ppB - 1.76 ppM | 4.8 - 14.5 ppM |
| 50%  | 0.637 | 374 ppB - 1.12 ppM | 3.1 - 9.3 ppM |
| 100% | 0.275 | 161 - 484 ppB      | 1.3 - 4.0 ppM |

(ppB = per billion; ppM = per million)

Going 50% -> 100% peer masking = ~2.3x risk reduction
(emission factor drops from 0.637 to 0.275).

### Other key findings

- **4 minutes of singing contributes ~49% of median total quanta
  emission** despite being only 3% of event time. Removing or masking
  the singing segment roughly halves the risk.
- The biggest remaining uncertainty is whether any infectious attendee
  is a "high emitter" (p90) vs "typical emitter" (median) - a ~10x
  spread.
