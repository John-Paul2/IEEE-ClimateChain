# VeriCEMS Dataset Card (`DATA_CARD.md`)

> **Generated automatically by:** [`ml/data/make_data_card.py`](file:///c:/Users/LENOVO/Documents/Hackathons/IEEE%20Climate%20Change/ml/data/make_data_card.py) from [`results/data_inspection.json`](file:///c:/Users/LENOVO/Documents/Hackathons/IEEE%20Climate%20Change/results/data_inspection.json), [`data/processed/preprocessing_manifest.json`](file:///c:/Users/LENOVO/Documents/Hackathons/IEEE%20Climate%20Change/data/processed/preprocessing_manifest.json), and [`results/splits.json`](file:///c:/Users/LENOVO/Documents/Hackathons/IEEE%20Climate%20Change/results/splits.json).
> **Core Framing Statement:** This dataset is a **US power-sector proxy for industrial installations** covered by EU CBAM.

---

## 1. Source, Licence, and Proxy Framing

- **Primary Source:** United States Environmental Protection Agency (US EPA), Clean Air Markets Program Data (CAMPD) / Emissions Collection and Monitoring Plan System (ECMPS), reported under **40 CFR Part 75**.
- **Portal & Bulk Endpoint:** `https://campd.epa.gov/data/bulk-data-files` (`https://api.epa.gov/easey/bulk-files/emissions/hourly/state/emissions-hourly-2025-<state>.csv`).
- **Licence & Public-Domain Status:** U.S. Government work (17 U.S.C. § 105), in the public domain worldwide and free to use, redistribute, and analyze without restriction.
- **Industrial Proxy Statement:** This dataset represents a **US power-sector proxy for industrial installations** (such as steel, cement, aluminium, and fertiliser plants subject to EU CBAM). We use US EPA Part 75 power-plant Continuous Emission Monitoring System (CEMS) records because they provide a large, public, real-world hourly record of combustion load swings, startups, shutdowns, and analyzer noise. However, power-plant boilers and turbines do not directly include non-combustion process emissions (e.g., limestone calcination in clinker production or blast-furnace reduction).

## 2. Facilities, Calendar Year, and Dataset Scale

- **Calendar Year Used:** `2025` (full calendar year `2025-01-01` through `2025-12-31`, hours `0..23`).
- **States Downloaded:** `IA, UT, WY` (`campd_hourly_2025_IA.csv, campd_hourly_2025_UT.csv, campd_hourly_2025_WY.csv`).
- **Selection Rule (`config/facilities.yaml`):** Top 15 Coal-dominant and top 15 Natural-Gas-dominant Part 75 facilities across IA, UT, and WY ranked by 2025 operating unit-hours (Operating Time > 0, minimum 1,000 operating unit-hours).
- **Raw Facilities Downloaded:** `30` facilities (`75` units, `646,104` total hourly rows).
- **Raw Operating Rows (`Operating Time > 0`):** `374,950` rows (overall operating-hour fraction = `0.5803`, mean operating time across operating hours = `0.9763`).
- **Preprocessed Dataset (`data/processed/`):** `371,963` operating rows across `29` facilities and `71` unit time series Parquet files (after removing `271,154` offline hours and `2,987` operating hours where `CO2 Mass (short tons)` or `Heat Input (mmBtu)` was missing in raw Part 75 reporting, such as NOx-only peaking turbines like Facility `8029` Sycamore Combustion Turbine).

### 2.1 Facilities Table (`30` Raw / `29` Preprocessed with Complete CO₂ + Heat Input)

| Facility ID | Facility Name | State | Units | Primary Fuels | Total Rows | Operating Rows | Operating Hour Fraction |
|---:|---|---|---:|---|---:|---:|---:|
| `1073` | Prairie Creek | `IA` | 2 | Coal, Natural Gas | 17,520 | 9,002 | `0.5138` |
| `1082` | Walter Scott Jr. Energy Center | `IA` | 2 | Coal | 17,520 | 10,933 | `0.6240` |
| `1122` | Ames | `IA` | 2 | Natural Gas | 17,520 | 8,310 | `0.4743` |
| `1167` | Muscatine | `IA` | 2 | Coal | 17,520 | 8,750 | `0.4994` |
| `3648` | Gadsby | `UT` | 6 | Pipeline Natural Gas | 52,560 | 10,144 | `0.1930` |
| `4158` | Dave Johnston | `WY` | 4 | Coal | 35,040 | 30,578 | `0.8727` |
| `4162` | Naughton | `WY` | 3 | Coal, Pipeline Natural Gas | 26,280 | 20,687 | `0.7872` |
| `6101` | Wyodak | `WY` | 1 | Coal | 8,760 | 7,861 | `0.8974` |
| `6165` | Hunter | `UT` | 3 | Coal | 26,280 | 25,562 | `0.9727` |
| `6204` | Laramie River | `WY` | 3 | Coal | 26,280 | 23,648 | `0.8998` |
| `6481` | Intermountain | `UT` | 4 | Coal, Pipeline Natural Gas | 24,144 | 12,633 | `0.5232` |
| `6664` | Louisa | `IA` | 1 | Coal | 8,760 | 7,756 | `0.8854` |
| `7145` | Pleasant Hill Energy Center | `IA` | 3 | Pipeline Natural Gas | 26,280 | 2,662 | `0.1013` |
| `7504` | Neil Simpson II | `WY` | 2 | Coal, Pipeline Natural Gas | 17,520 | 11,820 | `0.6747` |
| `7985` | Greater Des Moines Energy Center | `IA` | 2 | Pipeline Natural Gas | 17,520 | 8,078 | `0.4611` |
| `8029` | Sycamore Combustion Turbine | `IA` | 2 | Pipeline Natural Gas | 17,520 | 1,437 | `0.0820` |
| `8031` | Emery Station | `IA` | 2 | Pipeline Natural Gas | 17,520 | 10,769 | `0.6147` |
| `8066` | Jim Bridger | `WY` | 4 | Coal, Pipeline Natural Gas | 35,040 | 26,792 | `0.7646` |
| `8069` | Huntington | `UT` | 2 | Coal | 17,520 | 17,145 | `0.9786` |
| `55477` | Neil Simpson II (CT2) | `WY` | 1 | Pipeline Natural Gas | 8,760 | 1,534 | `0.1751` |
| `55479` | Wygen I | `WY` | 1 | Coal | 8,760 | 6,910 | `0.7888` |
| `55622` | West Valley Power Plant | `UT` | 5 | Pipeline Natural Gas | 43,800 | 14,386 | `0.3284` |
| `56013` | Exira Station | `IA` | 3 | Pipeline Natural Gas | 26,280 | 8,705 | `0.3312` |
| `56102` | Currant Creek Power Project | `UT` | 2 | Pipeline Natural Gas | 17,520 | 15,404 | `0.8792` |
| `56177` | Nebo Power Station | `UT` | 1 | Pipeline Natural Gas | 8,760 | 7,292 | `0.8324` |
| `56237` | Lake Side Power Plant | `UT` | 4 | Pipeline Natural Gas | 35,040 | 29,162 | `0.8322` |
| `56253` | Millcreek Power | `UT` | 2 | Pipeline Natural Gas | 17,520 | 4,644 | `0.2651` |
| `56319` | Wygen II | `WY` | 1 | Coal | 8,760 | 8,107 | `0.9255` |
| `57703` | Cheyenne Prairie Generating Station | `WY` | 3 | Pipeline Natural Gas | 26,280 | 13,044 | `0.4963` |
| `58236` | Marshalltown Generating Station | `IA` | 2 | Pipeline Natural Gas | 17,520 | 11,195 | `0.6390` |

## 3. Unit Types, Fuel Types, and Operating-Hour Fractions

### 3.1 Primary Fuel Types

| Primary Fuel Type | Facilities | Units | Total Rows | Operating Rows | Operating Hour Fraction |
|---|---:|---:|---:|---:|---:|
| `Pipeline Natural Gas` | 18 | 44 | 374,544 | 161,911 | `0.4323` |
| `Coal` | 15 | 28 | 245,280 | 203,474 | `0.8296` |
| `Natural Gas` | 2 | 3 | 26,280 | 9,565 | `0.3640` |

### 3.2 Unit Types

| Unit Type | Facilities | Units | Total Rows | Operating Rows | Operating Hour Fraction |
|---|---:|---:|---:|---:|---:|
| `Combustion turbine` | 9 | 21 | 183,960 | 38,440 | `0.2090` |
| `Dry bottom wall-fired boiler` | 13 | 21 | 183,960 | 131,459 | `0.7146` |
| `Combined cycle` | 7 | 15 | 131,400 | 94,771 | `0.7212` |
| `Tangentially-fired` | 8 | 15 | 131,400 | 106,441 | `0.8101` |
| `Cyclone boiler` | 1 | 1 | 8,760 | 1,173 | `0.1339` |
| `Combined cycle (Started Oct 10, 2025)` | 1 | 1 | 4,416 | 1,978 | `0.4479` |
| `Combined cycle (Started Nov 23, 2025)` | 1 | 1 | 2,208 | 688 | `0.3116` |

## 4. Columns Found in Real EPA CAMPD Hourly Files (`33` Columns)

| # | Exact CAMPD Column Name | Pandas Dtype | Type | Documented Unit | Missing Rate (All Rows) | Missing Rate (Operating Hours) | Value Range / Summary |
|---:|---|---|---|---|---:|---:|---|
| 1 | `State` | `str` | `string` | — | `0.0000` | `0.0000` | distinct=3, range=[IA .. WY] |
| 2 | `Facility Name` | `str` | `string` | — | `0.0000` | `0.0000` | distinct=30, range=[Ames .. Wyodak] |
| 3 | `Facility ID` | `int64` | `integer` | — | `0.0000` | `0.0000` | min=1073.0, p05=1082.0, median=7985.0, mean=22634.090524, p95=57703.0, max=58236.0 |
| 4 | `Unit ID` | `str` | `string` | — | `0.0000` | `0.0000` | distinct=44, range=[001 .. U5] |
| 5 | `unit_id` | `int64` | `integer` | — | `0.0000` | `0.0000` | min=746.0, p05=767.0, median=4849.0, mean=34026.583374, p95=90916.0, max=91620.0 |
| 6 | `Associated Stacks` | `float64` | `string` | — | `1.0000` | `1.0000` | distinct=0, range=[None .. None] |
| 7 | `Date` | `str` | `date` | `YYYY-MM-DD` | `0.0000` | `0.0000` | distinct=365, range=[2025-01-01 .. 2025-12-31] |
| 8 | `Hour` | `int64` | `integer` | `hour_of_day_0_to_23` | `0.0000` | `0.0000` | min=0.0, p05=1.0, median=11.5, mean=11.5, p95=22.0, max=23.0 |
| 9 | `Operating Time` | `float64` | `float` | `fraction_0_to_1` | `0.0051` | `0.0000` | min=0.0, p05=0.0, median=1.0, mean=0.56944, p95=1.0, max=1.0 |
| 10 | `Gross Load (MW)` | `float64` | `float` | `MW` | `0.4336` | `0.0240` | min=0.0, p05=20.0, median=178.0, mean=215.459352, p95=599.0, max=940.0 |
| 11 | `Steam Load (1000 lb/hr)` | `float64` | `float` | `1000 lb/hr` | `0.9861` | `0.9760` | min=0.0, p05=75.0, median=231.0, mean=231.431015, p95=373.95, max=855.0 |
| 12 | `SO2 Mass (lbs)` | `float64` | `float` | `lb` | `0.4197` | `0.0000` | min=0.0, p05=0.143, median=28.9, mean=181.768479, p95=748.5, max=5523.2 |
| 13 | `SO2 Mass Measure Indicator` | `str` | `string` | — | `0.4197` | `0.0000` | distinct=6, range=[LME .. Substitute] |
| 14 | `SO2 Rate (lbs/mmBtu)` | `float64` | `float` | `lb/mmBtu` | `0.4197` | `0.0001` | min=0.0, p05=0.001, median=0.025, mean=0.090522, p95=0.653, max=9.699 |
| 15 | `SO2 Rate Measure Indicator` | `str` | `string` | — | `0.4197` | `0.0001` | distinct=2, range=[CALC .. Calculated] |
| 16 | `CO2 Mass (short tons)` | `float64` | `float` | `short_tons` | `0.4243` | `0.0080` | min=0.0, p05=14.3, median=108.9, mean=192.676165, p95=652.7, max=1096.4 |
| 17 | `CO2 Mass Measure Indicator` | `str` | `string` | — | `0.4243` | `0.0080` | distinct=6, range=[LME .. Substitute] |
| 18 | `CO2 Rate (short tons/mmBtu)` | `float64` | `float` | `short_tons/mmBtu` | `0.4243` | `0.0080` | min=0.0, p05=0.059, median=0.103, mean=0.083773, p95=0.105, max=0.118 |
| 19 | `CO2 Rate Measure Indicator` | `str` | `string` | — | `0.4243` | `0.0080` | distinct=2, range=[CALC .. Calculated] |
| 20 | `NOx Mass (lbs)` | `float64` | `float` | `lb` | `0.4197` | `0.0000` | min=0.0, p05=2.729, median=120.072, mean=278.591332, p95=1039.91865, max=8006.0 |
| 21 | `NOx Mass Measure Indicator` | `str` | `string` | — | `0.4197` | `0.0000` | distinct=8, range=[CALC .. Substitute] |
| 22 | `NOx Rate (lbs/mmBtu)` | `float64` | `float` | `lb/mmBtu` | `0.4197` | `0.0001` | min=0.0, p05=0.006, median=0.109, mean=0.123296, p95=0.334, max=1.97 |
| 23 | `NOx Rate Measure Indicator` | `str` | `string` | — | `0.4197` | `0.0001` | distinct=5, range=[Calculated .. Substitute] |
| 24 | `Heat Input (mmBtu)` | `float64` | `float` | `mmBtu` | `0.4197` | `0.0000` | min=0.0, p05=228.2, median=1480.1, mean=2056.310222, p95=6224.41, max=10686.1 |
| 25 | `Heat Input Measure Indicator` | `str` | `string` | — | `0.4197` | `0.0000` | distinct=6, range=[LME .. Substitute] |
| 26 | `Primary Fuel Type` | `str` | `string` | — | `0.0000` | `0.0000` | distinct=3, range=[Coal .. Pipeline Natural Gas] |
| 27 | `Secondary Fuel Type` | `str` | `string` | — | `0.7593` | `0.8107` | distinct=6, range=[Diesel Oil .. Refuse] |
| 28 | `Unit Type` | `str` | `string` | — | `0.0000` | `0.0000` | distinct=7, range=[Combined cycle .. Tangentially-fired] |
| 29 | `SO2 Controls` | `str` | `string` | — | `0.6746` | `0.5228` | distinct=4, range=[Dry Lime FGD .. Wet Limestone] |
| 30 | `NOx Controls` | `str` | `string` | — | `0.0678` | `0.0580` | distinct=17, range=[Dry Low NOx Burners .. Water Injection|Selective Catalytic Reduction] |
| 31 | `PM Controls` | `str` | `string` | — | `0.5797` | `0.4318` | distinct=3, range=[Baghouse .. Wet Scrubber|Baghouse] |
| 32 | `Hg Controls` | `object` | `string` | — | `0.7424` | `0.6379` | distinct=6, range=[Additives to Enhance PAC and Existing Equipment Performance .. Untreated PAC Sorbent Injection|Additives to Enhance PAC and Existing Equipment Performance] |
| 33 | `Program Code` | `str` | `string` | — | `0.0000` | `0.0000` | distinct=7, range=[ARP .. CSNOX, CSOSG2, CSSO2G1] |

## 5. Columns Missing from Hourly CAMPD Bulk Files (O₂, Flue Temperature, Flow Rate)

We programmatically inspected all column headers of the downloaded EPA CAMPD hourly CSVs for stack oxygen concentration (`O2`), flue-gas temperature, and stack volumetric flow rate:

- **Stack O₂ Concentration column present:** `False` (matches: `[]`)
- **Flue-Gas Temperature column present:** `False` (matches: `[]`)
- **Stack Volumetric Flow Rate column present:** `False` (matches: `[]`)
- **Missing Physical Channels:** `stack_o2_concentration, flue_gas_temperature, stack_volumetric_flow_rate`

> **Finding:** None of stack O2 concentration, flue-gas temperature, or stack volumetric flow rate exist in the 33 columns of the primary EPA CAMPD hourly Part 75 bulk CSV files. Any detector or telemetry channel using O2, flue temperature, stack flow, or an independent custody-transfer fuel meter must be simulated and explicitly labelled 'synthetic' (e.g., synthetic_stack_o2_pct, synthetic_flue_temp_c, synthetic_stack_flow_kscfm, synthetic_fuel_flow_mmbtu_indep / fuel_ledger_synthetic).

## 6. Derived-Field Detection and the CO₂-vs-Heat-Input Circularity Caveat

### 6.1 How Derived Fields Were Detected

To test whether `CO2 Mass (short tons)` in EPA CAMPD is independently measured or mathematically derived from `Heat Input (mmBtu)`, we ran three quantitative checks across all operating hours (`Operating Time > 0` and `Heat Input (mmBtu) > 0`) per fuel type:
1. **Pearson Correlation ($r$ and $R^2$):** Computed linear correlation between hourly `CO2 Mass (short tons)` and `Heat Input (mmBtu)` within each fuel type.
2. **Stoichiometric Ratio Distribution ($\text{CO}_2 / \text{Heat Input}$):** Computed the mean, standard deviation, coefficient of variation ($\text{CV}$), percentiles, and the fraction of operating hours where a unit's hourly ratio `round(CO2 Mass / Heat Input, 4)` equals that unit's modal constant within $\pm 0.0002\text{ short tons/mmBtu}$.
3. **Part 75 Measure Indicator Audit:** Cross-tabulated `CO2 Mass Measure Indicator` against `Heat Input Measure Indicator` and compared empirical ratios against the unverified reference factors recorded in [`config/emission_factors.yaml`](file:///c:/Users/LENOVO/Documents/Hackathons/IEEE%20Climate%20Change/config/emission_factors.yaml).

### 6.2 Empirical Ratio and Correlation Results by Fuel Type

| Primary Fuel Type | Operating Hours ($n$) | Pearson $r$ | $R^2$ | Mean Ratio (`short_tons/mmBtu`) | Std Ratio | CV (%) | Median Ratio | 5th–95th Percentile | Within-Unit Constant Ratio Fraction | Circular? |
|---|---:|---:|---:|---:|---:|---:|---:|---|---:|---|
| `Coal` | 203,474 | `0.999861` | `0.999723` | `0.104028` | `0.003653` | `3.51%` | `0.104873` | `[0.102589, 0.104920]` | `0.9847` | `True` |
| `Natural Gas` | 9,565 | `0.999996` | `0.999992` | `0.059282` | `0.000196` | `0.33%` | `0.059280` | `[0.059172, 0.059390]` | `0.9638` | `True` |
| `Pipeline Natural Gas` | 158,924 | `0.999997` | `0.999993` | `0.059412` | `0.001508` | `2.54%` | `0.059428` | `[0.059298, 0.059549]` | `0.9718` | `True` |

### 6.3 The Circularity Caveat

**Overall Circularity Finding (`is_circular = True`):**

YES — CO2 Mass (short tons) and Heat Input (mmBtu) in EPA CAMPD exhibit a strongly circular relationship across both Coal (Pearson r >= 0.9998) and Natural Gas / Pipeline Natural Gas (Pearson r >= 0.99998), with over 90% of operating hours following a constant per-unit stoichiometric factor (CO2 Mass / Heat Input) to within +/-0.0002 short tons/mmBtu. Under 40 CFR Part 75 Appendix G (fuel-based CO2 calculation for gas units via Fc = 1,040 scf CO2/mmBtu) and Appendix F (stack flow + diluent Fc equations where both CO2 mass and heat input are derived from the same stack flow and diluent analyzers), CO2 Mass and Heat Input are mathematically co-derived even when the CAMPD Measure Indicator is labelled 'Measured' (which indicates non-substituted primary monitoring rather than independent CO2 vs. heat-input instruments). Therefore, comparing reported CO2 Mass against reported Heat Input detects naive single-channel tampering, but cannot by itself stop a coordinated insider who scales both channels together unless paired with Gross Load (MW) co-movement and an independent fuel custody-transfer meter (synthetic_fuel_flow_mmbtu_indep / fuel_ledger_synthetic).

- **Note on Published Emission Factors (`config/emission_factors.yaml`):** All published reference factors cited in [`config/emission_factors.yaml`](file:///c:/Users/LENOVO/Documents/Hackathons/IEEE%20Climate%20Change/config/emission_factors.yaml) carry their EPA URLs and are marked `status: "unverified"` until confirmed by human review. VeriCEMS detectors never hardcode emission factors; empirical ratios are estimated solely from training-split facilities.

## 7. Preprocessing Rules and Facility-Grouped Splits (`GroupShuffleSplit`)

### 7.1 Preprocessing Rules (`ml/data/preprocess.py`)
- **Operating Hours Retained:** Only rows with `Operating Time > 0` are retained (`374,950` of `646,104` raw rows).
- **Short-Gap Interpolation:** Isolated gaps up to `3` consecutive operating hours within a unit time series are linearly interpolated (`limit=3`, forward direction).
- **Core Channel Integrity:** Operating rows where `heat_input_mmbtu` or `co2_mass_short_tons` remains missing or non-positive after short-gap interpolation are dropped (`2,987` rows dropped).
- **Auxiliary Channels:** Remaining `NaN` values in `gross_load_mw`, `steam_load_1000_lb_hr`, `so2_mass_lbs`, and `nox_mass_lbs` are zero-filled after recording boolean missingness flags (`gross_load_missing_flag`, `steam_load_missing_flag`).
- **One Time Series Per Unit:** Saved `71` individual unit Parquet files under `data/processed/units/` plus `campd_hourly_processed.parquet` (`371,963` total processed rows).

### 7.2 Facility-Grouped Splits (`results/splits.json`)

- **Splitter:** `sklearn.model_selection.GroupShuffleSplit` across `29` facilities (`5` repeated random splits, fixed `base_seed = 42`).
- **Zero Facility Leakage:** Every split partitions facility IDs into strictly disjoint `train`, `val`, and `test` sets.

| Split Index | Seed | Train Facilities (`n`) | Val Facilities (`n`) | Test Facilities (`n`) | Test Facility IDs |
|---:|---:|---:|---:|---:|---|
| `0` | `42` | 17 | 6 | 6 | `6165`, `6204`, `7145`, `8066`, `56102`, `57703` |
| `1` | `43` | 17 | 6 | 6 | `1073`, `4158`, `6101`, `7504`, `55622`, `56253` |
| `2` | `44` | 17 | 6 | 6 | `1073`, `3648`, `6165`, `6481`, `55479`, `56237` |
| `3` | `45` | 17 | 6 | 6 | `1082`, `1167`, `3648`, `4158`, `8066`, `56253` |
| `4` | `46` | 17 | 6 | 6 | `1167`, `7985`, `55479`, `56013`, `56237`, `57703` |

## 8. Telemetry Channels Table (`schemas/channels.json` — Real vs. Synthetic)

| Channel Name | Unit | Source (`real` / `synthetic`) | Status | Exact CAMPD Column | Derived in Part 75? | Description |
|---|---|---|---|---|---|---|
| `gross_load_mw` | `MW` | **`real`** | `DEFINED` | `Gross Load (MW)` | `false` | Electrical gross load generated by the unit during the operating hour, reported under 40 CFR Part 75. |
| `steam_load_1000_lb_hr` | `1000 lb/hr` | **`real`** | `DEFINED` | `Steam Load (1000 lb/hr)` | `false` | Steam output mass flow rate for steam-generating units (structurally null on electric-only utility units in CAMPD). |
| `heat_input_mmbtu` | `mmBtu` | **`real`** | `DEFINED` | `Heat Input (mmBtu)` | `true` | Total thermal energy input from fuel combustion during the reporting hour (co-derived with CO2 Mass via Part 75 Appendix D/F/G). |
| `co2_mass_short_tons` | `short_tons` | **`real`** | `DEFINED` | `CO2 Mass (short tons)` | `true` | Reported carbon dioxide mass emitted during the operating hour (circularly related to Heat Input (mmBtu) under 40 CFR Part 75 Appendix F/G). |
| `co2_rate_short_tons_mmbtu` | `short_tons/mmBtu` | **`real`** | `DEFINED` | `CO2 Rate (short tons/mmBtu)` | `true` | Reported carbon dioxide emission rate per unit heat input (CO2 Mass / Heat Input) during the operating hour. |
| `so2_mass_lbs` | `lb` | **`real`** | `DEFINED` | `SO2 Mass (lbs)` | `false` | Reported sulfur dioxide mass emitted during the operating hour. |
| `nox_mass_lbs` | `lb` | **`real`** | `DEFINED` | `NOx Mass (lbs)` | `false` | Reported nitrogen oxides mass emitted during the operating hour. |
| `op_time_fraction` | `fraction_0_to_1` | **`real`** | `DEFINED` | `Operating Time` | `false` | Fraction of the clock hour (0.00 to 1.00) during which the unit operated. |
| `synthetic_stack_o2_pct` | `pct_vol_dry` | **`synthetic`** | `DEFINED` | — *(synthetic)* | `false` | Synthetic stack flue-gas oxygen concentration (% dry volume) simulated from combustion stoichiometry and excess-air models; absent from hourly CAMPD CSVs. |
| `synthetic_flue_temp_c` | `degC` | **`synthetic`** | `DEFINED` | — *(synthetic)* | `false` | Synthetic stack flue-gas temperature (degrees Celsius) simulated as a function of thermal load and ambient baseline; absent from hourly CAMPD CSVs. |
| `synthetic_stack_flow_kscfm` | `kscfm` | **`synthetic`** | `DEFINED` | — *(synthetic)* | `false` | Synthetic stack volumetric flow rate (thousand standard cubic feet per minute) simulated from heat input and excess O2; absent from hourly CAMPD CSVs. |
| `synthetic_fuel_flow_mmbtu_indep` | `mmBtu` | **`synthetic`** | `DEFINED` | — *(synthetic)* | `false` | Synthetic independent custody-transfer fuel meter / fuel ledger cross-check signal (mmBtu, also referenced as fuel_ledger_synthetic) with calibrated meter noise, used to break Part 75 CO2-vs-heat-input circularity. |
