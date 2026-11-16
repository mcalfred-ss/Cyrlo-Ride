/**
 * Filter geoBoundaries GHA ADM2 to Ashanti Region districts and reconcile
 * against Open Admin Ashanti catalogue. Does not invent geometries.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../../..');

const catalogPath = resolve(
  root,
  'backend/src/modules/maps/catalogue/data/ashanti-open-admin.json',
);
const fullPath = resolve(__dirname, 'geoBoundaries-GHA-ADM2.geojson');
const simpPath = resolve(__dirname, 'geoBoundaries-GHA-ADM2_simplified.geojson');
const sourceMetaPath = resolve(__dirname, 'SOURCE.json');

function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/district|municipal|municipality|metro|metropolitan/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function countVertices(geometry) {
  if (!geometry) return 0;
  let n = 0;
  const walk = (coords) => {
    if (!Array.isArray(coords)) return;
    if (typeof coords[0] === 'number') {
      n += 1;
      return;
    }
    for (const c of coords) walk(c);
  };
  walk(geometry.coordinates);
  return n;
}

function pointInRing(lng, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi + 0) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInGeometry(lng, lat, geometry) {
  if (!geometry) return false;
  const polys =
    geometry.type === 'Polygon'
      ? [geometry.coordinates]
      : geometry.type === 'MultiPolygon'
        ? geometry.coordinates
        : [];
  for (const poly of polys) {
    const [outer, ...holes] = poly;
    if (!pointInRing(lng, lat, outer)) continue;
    if (holes.some((h) => pointInRing(lng, lat, h))) continue;
    return true;
  }
  return false;
}

function bboxOf(geometry) {
  let minLng = Infinity,
    minLat = Infinity,
    maxLng = -Infinity,
    maxLat = -Infinity;
  const walk = (coords) => {
    if (!Array.isArray(coords)) return;
    if (typeof coords[0] === 'number') {
      const [lng, lat] = coords;
      minLng = Math.min(minLng, lng);
      maxLng = Math.max(maxLng, lng);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
      return;
    }
    for (const c of coords) walk(c);
  };
  walk(geometry.coordinates);
  return { minLng, minLat, maxLng, maxLat };
}

function slugify(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
const districts = catalog.districts;
if (!Array.isArray(districts) || districts.length !== 43) {
  throw new Error(`Expected 43 catalogue districts, got ${districts?.length}`);
}

const full = JSON.parse(readFileSync(fullPath, 'utf8'));
const simp = JSON.parse(readFileSync(simpPath, 'utf8'));
const sourceMeta = JSON.parse(readFileSync(sourceMetaPath, 'utf8'));

const simpByShapeId = new Map(
  simp.features.map((f) => [f.properties.shapeID, f]),
);

// Manual name aliases: catalogue name / alias -> ADM2 shapeName
const NAME_ALIASES = {
  'adansi akrofuom': ['akrofuom'],
  'adansi asokwa': ['asokwa'],
  'ahafo ano south east': ['ahafo ano south east', 'ahafo ano southeast'],
  'ahafo ano south west': ['ahafo ano south west', 'ahafo ano southwest'],
  'asante akim central municipal': [
    'asante akim central municipal',
    'asante akim central',
  ],
  'asokwa municipal': ['asokwa municipal'],
  'atwima kwanwoma': ['atwima kwanwoma'],
  'atwima mponua': ['atwima mponua'],
  'atwima nwabiagya north': ['atwima nwabiagya north'],
  'atwima nwabiagya south': [
    'atwima nwabiagya south',
    'atwima nwabiagya municipal',
    'atwima nwabiagya',
  ],
  'bosomtwe': ['bosomtwe'],
  'ejisu municipal': ['ejisu municipal', 'ejisu'],
  'juaben municipal': ['juaben municipal', 'juaben'],
  'kumasi metropolitan': [
    'kumasi metropolitan',
    'kumasi metro',
    'kumasi',
  ],
  'kwabre east municipal': ['kwabre east municipal', 'kwabre east'],
  'kwadaso municipal': ['kwadaso municipal', 'kwadaso'],
  'obuoasi east municipal': ['obuasi east municipal', 'obuasi east'],
  'obuasi municipal': ['obuasi municipal', 'obuasi'],
  'ofuase municipal': ['ofuase municipal', 'ofuase'],
  'ofuasi municipal': ['ofuase municipal', 'ofuase'],
  'ofiase municipal': ['ofuase municipal'],
  'offinso municipal': ['offinso municipal', 'offinso'],
  'offinso north': ['offinso north'],
  'old tafo municipal': ['old tafo municipal', 'old tafo', 'tafo'],
  'oyo municipal': ['oyo municipal'],
  'suame municipal': ['suame municipal', 'suame'],
  'sekyere africam plains': ['sekyere africam plains', 'sekyere africam'],
  'sekyere africam plains district': ['sekyere africam plains'],
};

const adm2Index = full.features.map((f) => ({
  feature: f,
  shapeName: f.properties.shapeName,
  shapeID: f.properties.shapeID,
  norm: normalizeName(f.properties.shapeName),
  vertices: countVertices(f.geometry),
}));

const unmatchedCatalog = [];
const unmatchedAdm2Used = new Set();
const matched = [];

function findAdm2(district) {
  const candidates = [
    normalizeName(district.name),
    ...(district.aliases || []).map(normalizeName),
    ...(NAME_ALIASES[normalizeName(district.name)] || []).map(normalizeName),
  ];

  // Exact / contains match on normalized names
  for (const cand of candidates) {
    const exact = adm2Index.filter((a) => a.norm === cand);
    if (exact.length === 1) return exact[0];
    const contains = adm2Index.filter(
      (a) => a.norm === cand || a.norm.includes(cand) || cand.includes(a.norm),
    );
    if (contains.length === 1) return contains[0];
  }

  // Point-in-polygon using catalogue centroid
  const pip = adm2Index.filter((a) =>
    pointInGeometry(district.longitude, district.latitude, a.feature.geometry),
  );
  if (pip.length === 1) return pip[0];

  return null;
}

for (const d of districts) {
  const hit = findAdm2(d);
  if (!hit) {
    unmatchedCatalog.push(d.name);
    continue;
  }
  if (unmatchedAdm2Used.has(hit.shapeID)) {
    unmatchedCatalog.push(`${d.name} (duplicate ADM2 ${hit.shapeName})`);
    continue;
  }
  unmatchedAdm2Used.add(hit.shapeID);
  const simplified = simpByShapeId.get(hit.shapeID);
  matched.push({
    district: d,
    adm2: hit,
    simplified,
  });
}

console.log(`Matched ${matched.length}/43`);
if (unmatchedCatalog.length) {
  console.log('Unmatched catalogue:', unmatchedCatalog);
}

// List ADM2 features that contain any Ashanti town? Also list near Ashanti bbox
const ashantiBbox = {
  minLng: -2.6,
  maxLng: -0.7,
  minLat: 5.8,
  maxLat: 7.5,
};

const ashantiCandidates = adm2Index.filter((a) => {
  const b = bboxOf(a.feature.geometry);
  const overlap =
    b.maxLng >= ashantiBbox.minLng &&
    b.minLng <= ashantiBbox.maxLng &&
    b.maxLat >= ashantiBbox.minLat &&
    b.minLat <= ashantiBbox.maxLat;
  return overlap;
});

console.log(
  'ADM2 overlapping Ashanti bbox:',
  ashantiCandidates.length,
  ashantiCandidates.map((a) => a.shapeName).sort().join(' | '),
);

const unusedAshantiish = ashantiCandidates.filter(
  (a) => !unmatchedAdm2Used.has(a.shapeID),
);
console.log(
  'Unused overlapping ADM2:',
  unusedAshantiish.map((a) => a.shapeName).sort(),
);

// Write reconciliation report + filtered FeatureCollections
const features = matched.map(({ district, adm2, simplified }) => {
  const geometry = adm2.feature.geometry;
  const simpGeom = simplified?.geometry ?? null;
  const fullVerts = adm2.vertices;
  const simpVerts = simpGeom ? countVertices(simpGeom) : null;
  // Prefer full geometry when within backend vertex budget; else simplified.
  const useSimplified = fullVerts > 5000 && simpVerts && simpVerts <= 5000;
  const chosen = useSimplified ? simpGeom : geometry;
  const chosenVerts = countVertices(chosen);
  return {
    type: 'Feature',
    properties: {
      catalogueId: district.id,
      catalogueName: district.name,
      catalogueSourceId: district.sourceId,
      category: district.category,
      aliases: district.aliases || [],
      shapeName: adm2.shapeName,
      shapeID: adm2.shapeID,
      zoneSlug: slugify(district.name),
      zoneName: district.name,
      geometryVariant: useSimplified ? 'simplified' : 'full',
      vertexCount: chosenVerts,
      fullVertexCount: fullVerts,
      simplifiedVertexCount: simpVerts,
      latitude: district.latitude,
      longitude: district.longitude,
    },
    geometry: chosen,
  };
});

const collection = {
  type: 'FeatureCollection',
  name: 'Ashanti Region ADM2 districts (geoBoundaries gbOpen GHA ADM2)',
  crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' } },
  attribution: {
    license: sourceMeta.boundaryLicense,
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    source: sourceMeta.boundarySource,
    sourceUrl: sourceMeta.boundarySourceURL,
    dataset: sourceMeta.boundaryID,
    yearRepresented: sourceMeta.boundaryYearRepresented,
    buildDate: sourceMeta.buildDate,
    releaseCommit: '9469f09',
    gjDownloadURL: sourceMeta.gjDownloadURL,
    catalogue: 'Open Admin Data Ashanti (backend catalogue)',
  },
  features,
};

writeFileSync(
  resolve(__dirname, 'ashanti-districts-adm2.geojson'),
  JSON.stringify(collection),
);
writeFileSync(
  resolve(__dirname, 'ashanti-districts-reconciliation.json'),
  JSON.stringify(
    {
      expected: 43,
      matched: matched.length,
      unmatchedCatalog,
      unusedOverlappingAdm2: unusedAshantiish.map((a) => ({
        shapeName: a.shapeName,
        shapeID: a.shapeID,
        vertices: a.vertices,
      })),
      matches: matched.map(({ district, adm2 }) => ({
        catalogueId: district.id,
        catalogueName: district.name,
        shapeName: adm2.shapeName,
        shapeID: adm2.shapeID,
        vertices: adm2.vertices,
      })),
    },
    null,
    2,
  ),
);

console.log('Wrote ashanti-districts-adm2.geojson features=', features.length);
console.log(
  'Vertex overflow (>5000 full):',
  features.filter((f) => f.properties.fullVertexCount > 5000).map((f) => ({
    name: f.properties.catalogueName,
    full: f.properties.fullVertexCount,
    simp: f.properties.simplifiedVertexCount,
    used: f.properties.geometryVariant,
  })),
);
