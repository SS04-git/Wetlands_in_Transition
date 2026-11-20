# Automated classification versus manual tracing

Generated outputs of `tools/ml/classify.py`, run with the project venv (`.venv\Scripts\python.exe`).
Full numbers: `tools/ml/out/metrics.json`. Visual checks: `tools/ml/out/qa/<date>.png`, which shows four panels: the image, the hand tracing, the model and the disagreement (red).
The original KML files, screenshots and the research data in `assets/` and `data/` were only read.

## 1. Feasibility, from the actual data

| Factor | What the project has | Consequence |
|---|---|---|
| Imagery | 17 Google Earth Pro screenshots, 0.28 to 0.31 m per pixel, about 235 × 185 m each, RGB only, no near-infrared | Colour and texture features only, so no spectral indices such as NDWI or NDVI |
| Registration | Approximate, based on the LookAt footprint fitted to the traces. Fits are weak for 2013 to 2016 (score 1.1 to 3.0), against 10 to 37 for later dates | Boundary cells are unreliable labels. The model is trained only on interior cells, and metrics are also reported more than 2 m inside the traced boundaries |
| Labels | Hand-traced polygons: water (17 dates), bed ground (13), mangrove canopy (13), muddy shallows (5), and tree cover and track (2 dates only). Land edge is a line on all 17 dates. Boats, cage farms and buildings are points | A per-pixel classifier fits the polygon classes. The points have no traced extent, so they cannot be scored as areas |
| Dependencies | scikit-learn 1.9.1, OpenCV 5.1, GeoPandas, Shapely, Rasterio, PyProj. No PyTorch | A random forest on hand-made features. Deep segmentation would need a new install, and 17 small images are too few for one |
| Tide | Not recorded for any image, and no image capture time is available | Part of every water / bed disagreement may be tidal. The model cannot separate this |

**Decision: one model.** The model is a per-pixel random forest, validated leave-one-date-out across all 17 dates.

## 2. Method

- **Grid:** each screenshot is warped onto a 0.5 m grid in the traced coordinate frame.
- **Labels:** the traces are rasterised onto that grid with the priority used elsewhere in the project: mangrove > bed > muddy > water, with tree cover and track on top.
- **Land category:** "land beyond the traced land edge" is the side of the land edge away from the water, wherever nothing else was traced. It is derived from the traced line, not a KML class. It teaches the model what dry land looks like on all 17 dates, and it lets the land edge be compared as a line.
- **Features (24 per cell):**
  - Lab, HSV and hue vector
  - Lab standardised within each image, to reduce differences in exposure and colour balance between dates
  - local mean and standard deviation of L, a and b at 1.5 m and 4 m
  - gradient and Laplacian texture
  - an excess-green index and a blue minus red index
- **Classifier:** scikit-learn `RandomForestClassifier`, 120 trees, balanced class weights. It uses up to 2,500 training cells per class per date, taken at least 1.5 m inside the traced boundaries. A 3 × 3 majority filter is applied to every prediction.
- **Validation:** for each date, a model is trained on the other 16 dates only and then predicts that date. Every score below is therefore on a date the model never saw.
- **Baseline:** nearest class centroid on the standardised L, a, b colour only. This tests whether texture and context add anything.

## 3. Results (all 17 held-out dates pooled)

| Class | IoU | Precision | Recall | F1 | Dates traced |
|---|---:|---:|---:|---:|---:|
| Water | 0.72 | 0.84 | 0.84 | 0.84 | 17 |
| Bed ground | 0.59 | 0.71 | 0.77 | 0.74 | 13 |
| Mangrove canopy | 0.34 | 0.55 | 0.46 | 0.50 | 13 |
| Muddy shallows | 0.01 | 0.08 | 0.02 | 0.03 | 5 |
| Tree cover | 0.00 | 0.00 | 0.00 | 0.00 | 2 |
| Track | 0.00 | 0.00 | 0.00 | 0.00 | 2 |
| Land beyond the edge (derived) | 0.59 | 0.63 | 0.90 | 0.74 | 17 |

**Agreement:**
- **Overall:** 76% of traced cells.
- **Away from boundaries:** 79% of cells more than 2 m inside a traced boundary.
- **Baseline:** the colour-only baseline reaches 36%.

**Land edge:** the model's land / estuary boundary lies a median 2.8 m from the traced edge. On average across dates, 69% of the traced edge lies within 5 m of it, and 36% within 2 m.

**Range across dates:** per-date agreement runs from 35% (11 Apr 2011) to 94% (26 Nov 2019).
- The weakest dates are the two with large traced muddy shallows: 2011 and 30 Mar 2022, the latter at 43%.
- 11 Mar 2015 (55%) is the lowest-contrast image and among the weakest registrations.

**Confusion (share of traced cells):**

| Traced as | Model's main classes |
|---|---|
| Muddy shallows | 55% bed ground, 43% water |
| Mangrove canopy | 46% mangrove, 28% water, 18% land |
| Tree cover | 100% land |
| Track | 88% land, 12% water |

## 4. What this says about the manual workflow

- **Water and exposed bed are reproducible.** An automated classifier, which never saw the date, reaches F1 0.84 and 0.74 on them. Automation could support a first draft of these two classes, with the tracer correcting edges.
- **Muddy shallows is not reproducible.** The project defines it as ground "that cannot be clearly identified as exposed bed". The model divides it between water and bed, so the class depends on human judgement, not on image appearance alone. This supports the class as an interpretive category, not a weakness of the tracing.
- **Mangrove canopy is found but under-traced in extent:** recall is 0.46. Darker crowns are mistaken for deep water, and edge crowns for land.
- **Tree cover and track cannot be judged.** They were traced on only two dates. On the other fifteen, the same ground falls in the land category, so the model learns them as land.
- **Agreement is limited by the reference too.** The images are approximately registered and their tide state is unknown, so disagreement mixes model error, registration error and tidal difference. Scores more than 2 m inside traced boundaries, about 3 points higher, show the boundary effect.

## 5. Tide and rainfall

**Tide: not modelled.**
- No open tide record exists for Kundapur or Gangolli. PSMSL holds only monthly means for Karwar and Mangalore, and the INCOIS gauges need a request.
- Google Earth gives each image's date but not its time of day, and the tide changes by hours.
- Global tide models (EOT20, GOT4.10, FES, TPXO) are usable with the installed pyTMD, but do not resolve the Panchagangavali channel.
- A tide height per image would therefore be fabricated precision.
- What would make it possible:
  - confirming each scene's UTC capture time from the Maxar or Airbus catalogues;
  - then labelling a model prediction for that time as an offshore estimate, with its uncertainty.

**Rainfall: exploratory correlation only, not a model.** These are Spearman correlations, n = 17, between the traced areas and the NASA POWER totals before each date.

| Traced area | Rainfall | ρ | p |
|---|---|---:|---:|
| Water | 30 days before | 0.13 | 0.61 |
| Water | 7 days before | −0.31 | 0.23 |
| Bed ground | 30 days before | −0.26 | 0.32 |
| Muddy shallows | 7 days before | 0.48 | 0.052 |
| Muddy shallows | monsoon total | 0.41 | 0.10 |

None reaches p < 0.05, and nine tests were run without correction. All 17 dates are in the dry season. These figures do not show that rainfall drives the mapped differences.

For any further rainfall work, IMD 0.25° gridded or CHIRPS 0.05° daily data suit this site better than NASA POWER's roughly 0.5° cell.

## 6. Labels used on the website

- **Measured / observed:** the hand tracings and the images.
- **Modelled:** the model's classification of each held-out date and every accuracy figure. All are computed by this script.
- **Hypothetical:** none presented.
