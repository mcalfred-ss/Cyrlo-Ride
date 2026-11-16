# Ashanti ADM2 district boundaries

1. Download national Ghana ADM2 (if missing):

```powershell
Invoke-WebRequest -Uri "https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/GHA/ADM2/geoBoundaries-GHA-ADM2.geojson" -OutFile geoBoundaries-GHA-ADM2.geojson -UseBasicParsing
Invoke-WebRequest -Uri "https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/GHA/ADM2/geoBoundaries-GHA-ADM2_simplified.geojson" -OutFile geoBoundaries-GHA-ADM2_simplified.geojson -UseBasicParsing
```

2. Rebuild Ashanti FeatureCollection:

```bash
node build-ashanti-adm2.mjs
```

Outputs `ashanti-districts-adm2.geojson` (43 districts) + reconciliation JSON. Licensed CC BY 4.0 — see `SOURCE.json`.
