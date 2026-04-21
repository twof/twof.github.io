# COVID event risk calculator

A Wells-Riley infection model combined with literature-derived
P(hospitalization | infection) for immunocompromised attendees.

## Usage

```sh
python3 risk.py
```

Edit `Event`, `Prevalence`, or `MASK_PROTECTION` in `risk.py` to change inputs.

## Sources

### Humidity and transient dose corrections

- **Marr et al., "Mechanistic insights into the effect of humidity
  on airborne influenza virus survival, transmission and incidence,"
  *Journal of the Royal Society Interface* 2019.** Aerosol
  infectivity has a U-shaped relationship with relative humidity:
  highest at very low RH (<30%), lowest around 50-70%. Droplet
  behavior and viral membrane stability both contribute.
  https://pubmed.ncbi.nlm.nih.gov/30958128/

- **Yang & Marr 2011/2012.** Quantitative RH effects on aerosol
  viral survival. Model uses piecewise linear approximation:
  1.7x at RH<20%, 1.0x at RH=40%, 0.7x at RH=60%, 0.5x at RH>=80%.

- **Transient Wells-Riley correction.** Steady-state time-weighted
  dose overestimates total inhaled quanta because late-emitted
  particles don't have full exposure time to be inhaled. For
  uniform-quanta emission, the correction factor is
  `1 - (1 - exp(-ACH*T)) / (ACH*T)`. At ACH=3, T=2h: factor = 0.83.
  Assumes uniform temporal distribution of quanta (ordering-agnostic)
  to avoid spurious sensitivity to assumed activity sequence.

### Row seating and close-contact transmission

Wells-Riley assumes well-mixed air. This is approximately valid
when attendees are spread out (rows of seats vs. buffet clustering).
For the default 2-hour meeting with rows + in-seat eating (no buffet
congregation), the well-mixed assumption is reasonable. If food
service involved clustering at a table, short-range transmission
(within 1-2m of an infectious person) could add 2-5x local dose
beyond the room average; this is NOT modeled. Row seating with
in-seat eating ~ eliminates that correction.

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

  We time-weight these over the event's activity segments. Buonanno
  states "All quanta emission rate (ERq) distributions are lognormal."
  The expected per-event infection risk is computed using the
  **lognormal mean** of this distribution, derived from the published
  median and 90th percentile:

    sigma = ln(p90 / median) / 1.2816
    mean  = median * exp(sigma^2 / 2)

  For our default activity mix (81 min listening + 25 min talking
  + 4 min singing + 10 min eating): median = 2.6 q/hr, p90 = 21.5
  q/hr, giving **mean = ~10.1 q/hr**. Using the median alone would
  underestimate risk by ~4x (right-skew of the lognormal).

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
  non-symptomatic people ~47% under the strict assumption that
  symptomatic attendees stay home: 0.35*6 + 0.65*2 = 3.40 out of 7.30
  total infectious person-days.
  https://pubmed.ncbi.nlm.nih.gov/35617363/

### Peer vaccination (current-season booster)

Model: everyone has a 3-dose baseline (already reflected in current
community prevalence); a fraction of peers additionally have the
current-season (2025-2026) vaccine. The boosted subset has lower
probability of being infectious *and* lower shedding conditional on
breakthrough.

- **Link-Gelles et al., "Interim Estimates of 2024-2025 COVID-19
  Vaccine Effectiveness," MMWR / VISION & IVY Networks 2025.**
  VE against hospitalization ~45-46% in non-IC adults >=65; VE
  against infection not primary endpoint but observed ~30-45% in
  first 3 months post-dose, waning rapidly.
  https://pubmed.ncbi.nlm.nih.gov/40014628/

- **NEJM Veterans study 2025 (Association of 2024-2025 COVID-19
  Vaccine with Outcomes).** Confirms severe-outcome VE numbers.
  https://www.nejm.org/doi/full/10.1056/NEJMoa2510226

  Model averages VE against infection across the typical 6-month
  post-dose period at **0.25**.

- **Tan 2023 / Eyre 2022 and follow-ups on breakthrough shedding.**
  Vaccinated breakthrough infections have similar peak viral load
  but ~1-2 days faster clearance. Averaged over infectious period,
  ~25-35% lower quanta emission. Model uses **0.30**.

  Note: peer vaccination has a relatively small impact on event
  transmission compared to peer masking, because (a) VE against
  infection wanes fast, (b) reduced shedding is modest, and (c) a
  symptom-adjusted attendable-fraction partially offsets the gains
  (vaccinated breakthroughs skew more asymptomatic).

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

### P(long COVID | infection) by IC status and protection

`LONG_COVID_PER_INFECTION` values synthesized from:

- **CDC EID 2024 (Japan, Omicron BA.5).** Vaccinated general population
  long COVID ~6% at 90 days.
  https://wwwnc.cdc.gov/eid/article/30/7/23-1723_article

- **NEJM 2024 - PASC across Delta and Omicron eras.** ~10% at 3 months
  post-Omicron; pre-Omicron OR 1.74 higher.
  https://www.nejm.org/doi/full/10.1056/NEJMoa2403211

- **Tran et al., "Effectiveness of COVID-19 vaccines against
  post-COVID-19 condition," *Clinical Microbiology and Infection* 2025.**
  3-dose vaccination reduces long COVID by 72% (95% CI 42-87%) in IC.
  https://www.sciencedirect.com/science/article/pii/S1198743X25003672

- **Nature Communications 2025 meta-analysis of vaccination vs long COVID.**
  Any vaccination: OR 0.77. https://www.nature.com/articles/s41467-025-65302-0

  Baseline general pop vaccinated Omicron ~6-10%. IC unvaccinated
  multipliers: 2-4x for severe, 1.5-2x for moderate, ~1x for mild.
  Vaccinated IC rates applied the 72% reduction.

### IC prevalence in the general population

- **Martinson et al., "Prevalence of Immunosuppression Among US Adults,"
  *JAMA* 2024** (NHIS 2021 data). Age-stratified adult IC prevalence:

  | Age   | Any IC |
  |-------|--------|
  | 18-39 | 3.9%   |
  | 40-59 | 7.6%   |
  | 60-69 | 9.5%   |
  | 70+   | 7.8%   |

  Overall US adult IC: 6.6%.
  https://jamanetwork.com/journals/jama/fullarticle/2815274

  Severity split (IC_SEVERITY_MIX): ~22% severe, ~55% moderate, ~23%
  mild - literature synthesis, not directly measured in any single
  study. Severe = transplant, CAR-T, active heme malignancy, anti-CD20.
  Moderate = biologics, methotrexate, mid-dose steroids, HIV low-normal
  CD4. Mild = low-dose prednisone, controlled HIV, asplenia.

  Default IC mask/vax mixes (DEFAULT_IC_MASK_MIX, DEFAULT_IC_VAX_MIX)
  assume specialist-guided regimen compliance: IC attendees at this
  kind of event are heavily self-selected for thoughtful risk
  management, so ~90% fit-tested N95 and ~90% current-season vaccinated
  (40% with PrEP, 50% vax-only). Less-regimented alternative mixes
  (GENERAL_IC_MASK_MIX, GENERAL_IC_VAX_MIX) are provided for
  sensitivity analysis. The regimented assumption yields ~6x lower
  per-IC infection risk than the general-population IC distribution.

### IC self-selection into event attendance

Pre-pandemic quantitative data on IC event attendance is sparse. No
study directly measures "IC attendance at 100-person indoor events."
The closest proxies and their limitations:

- **Islam et al. 2021 (COVID Impact Survey, n=10,760):** 85.3% of IC
  adults avoided crowded places vs 75.4% non-IC during early pandemic.
  Implies ~0.6x attendance ratio during pandemic (crude).
  https://pmc.ncbi.nlm.nih.gov/articles/PMC8035912/

- **Heesen et al. 2022 (CoCo longitudinal study, n=274):** No pre-
  pandemic baseline measured; baseline IMET score of 32 compared to
  IBD reference (not general population).
  https://pmc.ncbi.nlm.nih.gov/articles/PMC9795223/

- **Cavallini et al. 2015 (SOT social function review):** 6 of 8 SF-36
  subscales within general-population norms post-transplant; social
  functioning specifically shows persistent ~5-15 pt reduction vs
  matched healthy controls.
  https://journals.sagepub.com/doi/10.1177/0107408315592335

- **Gathmann et al., Baumgartner et al. (CVID QoL, pre-pandemic):**
  SF-36 social functioning ~15-25 points below general-population norm.
  https://pubmed.ncbi.nlm.nih.gov/28536745/

- **Tjaden et al. 2022 (n=11, lung transplant):** Qualitative study.
  Only 2/11 reported pandemic restrictions had "minimal impact"
  because they were already restricted; the majority experienced
  significant pandemic disruption.
  https://pmc.ncbi.nlm.nih.gov/articles/PMC9115456/

- **HSCT/chemo guidelines (multiple):** Medically prescribed crowd
  avoidance during defined treatment windows (HSCT first year, chemo
  nadir days 7-14). Not behavioral measurement.

Weighted by IC severity/subtype composition:
- Severely IC in active treatment: 0.1-0.5x
- Severely IC stable (>1 year post-transplant, etc.): 0.5-0.85x
- Moderately IC (biologics, controlled HIV): 0.85-0.95x
- Mildly IC: 0.95-1.0x

Population-weighted pre-pandemic baseline: ~0.80-0.90x.
COVID-era additional: ~0.85x multiplier.
Total current-era: **0.5-0.85x**, defensible midpoint 0.70.

DEFAULT_SELF_SELECTION is set to 0.70; sensitivity analysis across
0.50-0.85 is recommended given the thin evidence base.

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

Defaults: 81 min listening + 25 min discussion + 4 min singing
+ 10 min eating; 25% of peers current-season vaxxed;
no-symptoms attendable fraction 0.47; 0% peer masking.
Expected quanta per infectious attendee: **10.1 q/hr (lognormal mean).**

### Peer vaccination sensitivity (N95 fit-tested, 0% peer masking)

| Peers current-season vaxxed | Transmission multiplier | E[P(inf)] |
|---|---|---|
| 0%   | 1.000 | 2.38 - 7.13 ppM |
| 25%  | 0.881 | 2.09 - 6.28 ppM |
| 50%  | 0.762 | 1.81 - 5.44 ppM |
| 100% | 0.525 | 1.25 - 3.74 ppM |

### Peer masking sensitivity (N95 fit-tested, 25% peer vax)

| Peers masked | Emission factor | E[P(inf)] |
|---|---|---|
| 0%   | 1.000 | 2.09 - 6.28 ppM |
| 50%  | 0.637 | 1.34 - 4.01 ppM |
| 100% | 0.275 | 576 ppB - 1.73 ppM |

(ppB = per billion; ppM = per million)

Going 50% -> 100% peer masking = ~2.3x risk reduction.
Going 0% -> 25% current-season vax = ~1.13x reduction (small).

### Aggregate risk across all IC attendees

Using NHIS 2021 age-stratified IC prevalence, default attendee age
distribution (70% 20-39, 20% 40-59, 7% 60-69, 3% 70+), and realistic
mask/vax distribution among IC attendees:

**Expected IC attendees per 100-person event:**

| Scenario | Total IC | Severe | Moderate | Mild |
|---|---|---|---|---|
| No self-selection | 5.15 | 1.13 | 2.83 | 1.18 |
| 0.5x self-selection | 2.57 | 0.57 | 1.42 | 0.59 |

Per-IC-person weighted infection risk (regimented default:
90% fit-N95 / 10% casual-N95): **2.7 - 8.2 per million**.
(Down from 3.3-9.8 after transient-dose correction factor 0.83.)

### Non-IC attendee risks (~96 attendees, unmasked, mixed vax)

| Risk | Per-event | Annual (monthly cadence) |
|---|---|---|
| Per-person infection | 35-105 per million | - |
| Any non-IC infected | 34 per 10,000 - 1.0% | 4% - 12% / year |
| Any non-IC hospitalized | 31-93 per million | 3.7-11.2 per 10,000 / year |
| Any non-IC with long COVID | 2.9-8.7 per 10,000 | 35 per 10,000 - 1.0% / year |

Non-IC infection risk is ~20x higher than IC because they're unmasked;
hospitalization/long-COVID per person is much lower because they're
vaccinated and not IC. Across all ~96 non-IC attendees, however,
aggregate outcomes are meaningful: at monthly cadence, there's
roughly a 1-in-900 to 1-in-3000 chance per year that any non-IC
attendee gets hospitalized from attendance.

**Per-event aggregate risk across self-selection sensitivity
(regimented IC, 3.6 expected IC attendees at default 0.70x):**

| Self-selection | Expected IC attendees | P(>=1 IC hospitalized) | P(>=1 IC long-COVID) |
|---|---|---|---|
| 0.50 (strong avoidance) | 2.57 | 183 - 549 ppB | 654 ppB - 2.0 per million |
| **0.70 (default)** | **3.60** | **256 - 768 ppB** | **915 ppB - 2.8 per million** |
| 0.85 (mild avoidance) | 4.38 | 311 - 933 ppB | 1.1 - 3.3 per million |

**Annual totals at monthly cadence (0.70 default):**

| Outcome | Expected cases per year |
|---|---|
| IC infections | 1.4 - 4.2 per 10,000 (~1 in 2,400 - 7,100) |
| IC hospitalizations (all IC) | 3.1 - 9.2 per million (~1 in 110K - 325K) |
| IC long-COVID cases | 11.0 - 33.0 per million (~1 in 30K - 91K) |

Sensitivity comparison with general (less-regimented) IC distribution
at 0.70 self-selection: per-IC infection risk jumps ~6x (20-61 per
million vs 3.3-9.8); aggregate hospitalizations ~10x higher. The
regimented assumption is material to the numbers.

### Other key findings

- **4 minutes of singing contributes ~49% of median total quanta
  emission** despite being only 3% of event time. Removing or masking
  the singing segment roughly halves the risk.
- **Aggregate risk across all IC attendees is materially higher than
  the single-IC-attendee numbers** because there are ~3-5 IC attendees
  at a 100-person 20-40-skewed event and most aren't in fit-tested N95s.
- **The organizer-side cost/benefit calculation changes when computed
  over the full IC population**: interventions that would protect the
  ~3 IC attendees collectively deliver several times the harm-averted
  vs. protecting just the single-attendee-in-N95 model.
