/**
 * Ashanti Region geographic catalogue (Open Admin Data subset).
 *
 * Source: Open Admin Data — ghana-administrative-divisions (CC-BY-4.0)
 * License: CC-BY-4.0 — attribution required.
 * URL: https://github.com/open-admin-data/ghana-administrative-divisions
 *
 * Geometry: POINT centroids only. Not admin polygons. Not Ride service zones.
 * Scope: Ashanti only — Accra / Greater Accra excluded.
 * Imported: 2026-11-16
 *
 * Do not invent coordinates. Do not treat proximity as exact town identity
 * without the location-resolution confidence rules.
 */

export interface AshantiCatalogueAttribution {
  source: string;
  sourceUrl: string;
  license: string;
  subset: string;
  importedAt: string;
  note: string;
}

export interface AshantiTownPoint {
  id: string;
  name: string;
  region: string;
  district: string;
  districtId: string;
  aliases: string[];
  latitude: number;
  longitude: number;
  sourceId: string;
}

export interface AshantiDistrictPoint {
  id: string;
  name: string;
  region: string;
  regionId: string;
  category: string | null;
  aliases: string[];
  latitude: number;
  longitude: number;
  sourceId: string | null;
}

export interface AshantiRegionPoint {
  id: string;
  name: string;
  aliases: string[];
  latitude: number;
  longitude: number;
  sourceId: string;
}

export interface AshantiCatalogueLandmark {
  id: string;
  name: string;
  category: string;
  region: string;
  district: string | null;
  town: string | null;
  aliases: string[];
  latitude: number;
  longitude: number;
}

export interface AshantiAlias {
  alias: string;
  target_id: string;
}

export const ASHANTI_CATALOGUE_ATTRIBUTION: AshantiCatalogueAttribution = {
  "source": "Open Admin Data — ghana-administrative-divisions (CC-BY-4.0)",
  "sourceUrl": "https://github.com/open-admin-data/ghana-administrative-divisions",
  "license": "CC-BY-4.0",
  "subset": "Ashanti Region only — Accra/Greater Accra excluded",
  "importedAt": "2026-11-16",
  "note": "Point centroids only. Not administrative polygons. Not Ride service zones."
} as const;

export const ASHANTI_REGION: AshantiRegionPoint = {
  "id": "gh-reg-ashanti",
  "name": "Ashanti",
  "aliases": [
    "Ashanti Region",
    "Asante"
  ],
  "latitude": 6.74,
  "longitude": -1.628,
  "sourceId": "GH02"
};

export const ASHANTI_DISTRICTS: readonly AshantiDistrictPoint[] = [
  {
    "id": "gh-dist-adansi-akrofuom",
    "name": "Adansi Akrofuom",
    "region": "Ashanti",
    "regionId": "gh-reg-ashanti",
    "category": "District",
    "aliases": [
      "Adansi Akrofuom District"
    ],
    "latitude": 6.029,
    "longitude": -1.673,
    "sourceId": "GH0201"
  },
  {
    "id": "gh-dist-adansi-asokwa",
    "name": "Adansi Asokwa",
    "region": "Ashanti",
    "regionId": "gh-reg-ashanti",
    "category": "District",
    "aliases": [
      "Adansi Asokwa District"
    ],
    "latitude": 6.168,
    "longitude": -1.437,
    "sourceId": "GH0202"
  },
  {
    "id": "gh-dist-adansi-north",
    "name": "Adansi North",
    "region": "Ashanti",
    "regionId": "gh-reg-ashanti",
    "category": "District",
    "aliases": [
      "Adansi North District"
    ],
    "latitude": 6.3,
    "longitude": -1.589,
    "sourceId": "GH0203"
  },
  {
    "id": "gh-dist-adansi-south",
    "name": "Adansi South",
    "region": "Ashanti",
    "regionId": "gh-reg-ashanti",
    "category": "District",
    "aliases": [
      "Adansi South District"
    ],
    "latitude": 6.003,
    "longitude": -1.393,
    "sourceId": "GH0204"
  },
  {
    "id": "gh-dist-afigya-kwabre-north",
    "name": "Afigya Kwabre North",
    "region": "Ashanti",
    "regionId": "gh-reg-ashanti",
    "category": "District",
    "aliases": [
      "Afigya Kwabre North District"
    ],
    "latitude": 7.039,
    "longitude": -1.627,
    "sourceId": "GH0205"
  },
  {
    "id": "gh-dist-afigya-kwabre-south",
    "name": "Afigya Kwabre South",
    "region": "Ashanti",
    "regionId": "gh-reg-ashanti",
    "category": "District",
    "aliases": [
      "Afigya Kwabre South District"
    ],
    "latitude": 6.839,
    "longitude": -1.609,
    "sourceId": "GH0206"
  },
  {
    "id": "gh-dist-ahafo-ano-north",
    "name": "Ahafo Ano North",
    "region": "Ashanti",
    "regionId": "gh-reg-ashanti",
    "category": "District",
    "aliases": [
      "Ahafo Ano North District"
    ],
    "latitude": 6.91,
    "longitude": -2.229,
    "sourceId": "GH0207"
  },
  {
    "id": "gh-dist-ahafo-ano-south-east",
    "name": "Ahafo Ano South East",
    "region": "Ashanti",
    "regionId": "gh-reg-ashanti",
    "category": "District",
    "aliases": [
      "Ahafo Ano South East District"
    ],
    "latitude": 6.904,
    "longitude": -1.888,
    "sourceId": "GH0208"
  },
  {
    "id": "gh-dist-ahafo-ano-south-west",
    "name": "Ahafo Ano South West",
    "region": "Ashanti",
    "regionId": "gh-reg-ashanti",
    "category": "District",
    "aliases": [
      "Ahafo Ano South West District"
    ],
    "latitude": 6.896,
    "longitude": -2.058,
    "sourceId": "GH0209"
  },
  {
    "id": "gh-dist-amansie-central",
    "name": "Amansie Central",
    "region": "Ashanti",
    "regionId": "gh-reg-ashanti",
    "category": "District",
    "aliases": [
      "Amansie Central District"
    ],
    "latitude": 6.207,
    "longitude": -1.829,
    "sourceId": "GH0210"
  },
  {
    "id": "gh-dist-amansie-south",
    "name": "Amansie South",
    "region": "Ashanti",
    "regionId": "gh-reg-ashanti",
    "category": "District",
    "aliases": [
      "Amansie South District"
    ],
    "latitude": 6.307,
    "longitude": -2.011,
    "sourceId": "GH0211"
  },
  {
    "id": "gh-dist-amansie-west",
    "name": "Amansie West",
    "region": "Ashanti",
    "regionId": "gh-reg-ashanti",
    "category": "District",
    "aliases": [
      "Amansie West District"
    ],
    "latitude": 6.437,
    "longitude": -1.856,
    "sourceId": "GH0212"
  },
  {
    "id": "gh-dist-asante-akim-central-municipal",
    "name": "Asante Akim Central Municipal",
    "region": "Ashanti",
    "regionId": "gh-reg-ashanti",
    "category": "Municipal",
    "aliases": [
      "Asante Akim Central",
      "Asante Akim Central Municipality"
    ],
    "latitude": 6.565,
    "longitude": -1.254,
    "sourceId": "GH0213"
  },
  {
    "id": "gh-dist-asante-akim-north",
    "name": "Asante Akim North",
    "region": "Ashanti",
    "regionId": "gh-reg-ashanti",
    "category": "District",
    "aliases": [
      "Asante Akim North District"
    ],
    "latitude": 6.842,
    "longitude": -0.933,
    "sourceId": "GH0214"
  },
  {
    "id": "gh-dist-asante-akim-south",
    "name": "Asante Akim South",
    "region": "Ashanti",
    "regionId": "gh-reg-ashanti",
    "category": "District",
    "aliases": [
      "Asante Akim South District"
    ],
    "latitude": 6.462,
    "longitude": -1.115,
    "sourceId": "GH0215"
  },
  {
    "id": "gh-dist-asokore-mampong-municipal",
    "name": "Asokore Mampong Municipal",
    "region": "Ashanti",
    "regionId": "gh-reg-ashanti",
    "category": "Municipal",
    "aliases": [
      "Asokore Mampong",
      "Asokore Mampong Municipality"
    ],
    "latitude": 6.712,
    "longitude": -1.568,
    "sourceId": "GH0216"
  },
  {
    "id": "gh-dist-asokwa-municipal",
    "name": "Asokwa Municipal",
    "region": "Ashanti",
    "regionId": "gh-reg-ashanti",
    "category": "Municipal",
    "aliases": [
      "Asokwa",
      "Asokwa Municipality"
    ],
    "latitude": 6.645,
    "longitude": -1.582,
    "sourceId": "GH0217"
  },
  {
    "id": "gh-dist-atwima-kwanwoma",
    "name": "Atwima Kwanwoma",
    "region": "Ashanti",
    "regionId": "gh-reg-ashanti",
    "category": "District",
    "aliases": [
      "Atwima Kwanwoma District"
    ],
    "latitude": 6.59,
    "longitude": -1.712,
    "sourceId": "GH0218"
  },
  {
    "id": "gh-dist-atwima-mponua",
    "name": "Atwima Mponua",
    "region": "Ashanti",
    "regionId": "gh-reg-ashanti",
    "category": "District",
    "aliases": [
      "Atwima Mponua District"
    ],
    "latitude": 6.555,
    "longitude": -2.177,
    "sourceId": "GH0219"
  },
  {
    "id": "gh-dist-atwima-nwabiagya-north",
    "name": "Atwima Nwabiagya North",
    "region": "Ashanti",
    "regionId": "gh-reg-ashanti",
    "category": "District",
    "aliases": [
      "Atwima Nwabiagya North District"
    ],
    "latitude": 6.879,
    "longitude": -1.745,
    "sourceId": "GH0220"
  },
  {
    "id": "gh-dist-atwima-nwabiagya-south",
    "name": "Atwima Nwabiagya South",
    "region": "Ashanti",
    "regionId": "gh-reg-ashanti",
    "category": "District",
    "aliases": [
      "Atwima Nwabiagya South District"
    ],
    "latitude": 6.689,
    "longitude": -1.777,
    "sourceId": "GH0221"
  },
  {
    "id": "gh-dist-bekwai-municipal",
    "name": "Bekwai Municipal",
    "region": "Ashanti",
    "regionId": "gh-reg-ashanti",
    "category": "Municipal",
    "aliases": [
      "Bekwai",
      "Bekwai Municipality"
    ],
    "latitude": 6.438,
    "longitude": -1.594,
    "sourceId": "GH0222"
  },
  {
    "id": "gh-dist-bosome-freho",
    "name": "Bosome Freho",
    "region": "Ashanti",
    "regionId": "gh-reg-ashanti",
    "category": "District",
    "aliases": [
      "Bosome Freho District"
    ],
    "latitude": 6.368,
    "longitude": -1.366,
    "sourceId": "GH0223"
  },
  {
    "id": "gh-dist-bosomtwe",
    "name": "Bosomtwe",
    "region": "Ashanti",
    "regionId": "gh-reg-ashanti",
    "category": "District",
    "aliases": [
      "Bosomtwe District"
    ],
    "latitude": 6.558,
    "longitude": -1.457,
    "sourceId": "GH0224"
  },
  {
    "id": "gh-dist-ejisu-municipal",
    "name": "Ejisu Municipal",
    "region": "Ashanti",
    "regionId": "gh-reg-ashanti",
    "category": "Municipal",
    "aliases": [
      "Ejisu",
      "Ejisu Municipality"
    ],
    "latitude": 6.614,
    "longitude": -1.311,
    "sourceId": "GH0225"
  },
  {
    "id": "gh-dist-ejura-sekyedumase",
    "name": "Ejura-Sekyedumase",
    "region": "Ashanti",
    "regionId": "gh-reg-ashanti",
    "category": "District",
    "aliases": [
      "Ejura-Sekyedumase District"
    ],
    "latitude": 7.385,
    "longitude": -1.383,
    "sourceId": "GH0226"
  },
  {
    "id": "gh-dist-juaben-municipal",
    "name": "Juaben Municipal",
    "region": "Ashanti",
    "regionId": "gh-reg-ashanti",
    "category": "Municipal",
    "aliases": [
      "Juaben",
      "Juaben Municipality"
    ],
    "latitude": 6.756,
    "longitude": -1.378,
    "sourceId": "GH0227"
  },
  {
    "id": "gh-dist-kumasi-metro",
    "name": "Kumasi Metropolitan",
    "region": "Ashanti",
    "regionId": "gh-reg-ashanti",
    "category": "Metropolitan",
    "aliases": [
      "Kumasi Metro",
      "Kumasi",
      "Kumasi Metropolis",
      "KMA"
    ],
    "latitude": 6.689,
    "longitude": -1.625,
    "sourceId": "GH0228"
  },
  {
    "id": "gh-dist-kwabre-east",
    "name": "Kwabre East",
    "region": "Ashanti",
    "regionId": "gh-reg-ashanti",
    "category": "District",
    "aliases": [
      "Kwabre East District"
    ],
    "latitude": 6.788,
    "longitude": -1.539,
    "sourceId": "GH0229"
  },
  {
    "id": "gh-dist-kwadaso-municipal",
    "name": "Kwadaso Municipal",
    "region": "Ashanti",
    "regionId": "gh-reg-ashanti",
    "category": "Municipal",
    "aliases": [
      "Kwadaso",
      "Kwadaso Municipality"
    ],
    "latitude": 6.668,
    "longitude": -1.67,
    "sourceId": "GH0230"
  },
  {
    "id": "gh-dist-mampong-municipal",
    "name": "Mampong Municipal",
    "region": "Ashanti",
    "regionId": "gh-reg-ashanti",
    "category": "Municipal",
    "aliases": [
      "Mampong",
      "Mampong Municipality"
    ],
    "latitude": 7.114,
    "longitude": -1.424,
    "sourceId": "GH0231"
  },
  {
    "id": "gh-dist-obuasi-east",
    "name": "Obuasi East",
    "region": "Ashanti",
    "regionId": "gh-reg-ashanti",
    "category": "District",
    "aliases": [
      "Obuasi East District"
    ],
    "latitude": 6.18,
    "longitude": -1.605,
    "sourceId": "GH0232"
  },
  {
    "id": "gh-dist-obuasi-municipal",
    "name": "Obuasi Municipal",
    "region": "Ashanti",
    "regionId": "gh-reg-ashanti",
    "category": "Municipal",
    "aliases": [
      "Obuasi",
      "Obuasi Municipality"
    ],
    "latitude": 6.189,
    "longitude": -1.692,
    "sourceId": "GH0233"
  },
  {
    "id": "gh-dist-offinso-municipal",
    "name": "Offinso Municipal",
    "region": "Ashanti",
    "regionId": "gh-reg-ashanti",
    "category": "Municipal",
    "aliases": [
      "Offinso",
      "Offinso Municipality"
    ],
    "latitude": 7.058,
    "longitude": -1.735,
    "sourceId": "GH0234"
  },
  {
    "id": "gh-dist-offinso-north",
    "name": "Offinso North",
    "region": "Ashanti",
    "regionId": "gh-reg-ashanti",
    "category": "District",
    "aliases": [
      "Offinso North District"
    ],
    "latitude": 7.28,
    "longitude": -1.799,
    "sourceId": "GH0235"
  },
  {
    "id": "gh-dist-oforikrom-municipal",
    "name": "Oforikrom Municipal",
    "region": "Ashanti",
    "regionId": "gh-reg-ashanti",
    "category": "Municipal",
    "aliases": [
      "Oforikrom",
      "Oforikrom Municipality"
    ],
    "latitude": 6.676,
    "longitude": -1.551,
    "sourceId": "GH0236"
  },
  {
    "id": "gh-dist-old-tafo-municipal",
    "name": "Old Tafo Municipal",
    "region": "Ashanti",
    "regionId": "gh-reg-ashanti",
    "category": "Municipal",
    "aliases": [
      "Old Tafo",
      "Old Tafo Municipality"
    ],
    "latitude": 6.736,
    "longitude": -1.599,
    "sourceId": "GH0237"
  },
  {
    "id": "gh-dist-sekyere-afram-plains-north",
    "name": "Sekyere Afram Plains North",
    "region": "Ashanti",
    "regionId": "gh-reg-ashanti",
    "category": "District",
    "aliases": [
      "Sekyere Afram Plains North District"
    ],
    "latitude": 7.211,
    "longitude": -0.595,
    "sourceId": "GH0238"
  },
  {
    "id": "gh-dist-sekyere-central",
    "name": "Sekyere Central",
    "region": "Ashanti",
    "regionId": "gh-reg-ashanti",
    "category": "District",
    "aliases": [
      "Sekyere Central District"
    ],
    "latitude": 7.216,
    "longitude": -1.101,
    "sourceId": "GH0239"
  },
  {
    "id": "gh-dist-sekyere-east",
    "name": "Sekyere East",
    "region": "Ashanti",
    "regionId": "gh-reg-ashanti",
    "category": "District",
    "aliases": [
      "Sekyere East District"
    ],
    "latitude": 6.779,
    "longitude": -1.299,
    "sourceId": "GH0240"
  },
  {
    "id": "gh-dist-sekyere-kumawu",
    "name": "Sekyere Kumawu",
    "region": "Ashanti",
    "regionId": "gh-reg-ashanti",
    "category": "District",
    "aliases": [
      "Sekyere Kumawu District"
    ],
    "latitude": 6.911,
    "longitude": -1.239,
    "sourceId": "GH0241"
  },
  {
    "id": "gh-dist-sekyere-south",
    "name": "Sekyere South",
    "region": "Ashanti",
    "regionId": "gh-reg-ashanti",
    "category": "District",
    "aliases": [
      "Sekyere South District"
    ],
    "latitude": 6.996,
    "longitude": -1.503,
    "sourceId": "GH0242"
  },
  {
    "id": "gh-dist-suame-municipal",
    "name": "Suame Municipal",
    "region": "Ashanti",
    "regionId": "gh-reg-ashanti",
    "category": "Municipal",
    "aliases": [
      "Suame",
      "Suame Municipality"
    ],
    "latitude": 6.736,
    "longitude": -1.648,
    "sourceId": "GH0243"
  }
];

export const ASHANTI_TOWNS: readonly AshantiTownPoint[] = [
  {
    "id": "gh-town-aboabo-no-2-adansi-north",
    "name": "Aboabo No 2",
    "region": "Ashanti",
    "district": "Adansi North",
    "districtId": "gh-dist-adansi-north",
    "aliases": [],
    "latitude": 6.224,
    "longitude": -1.35,
    "sourceId": "GH0203_aboabo-no-2"
  },
  {
    "id": "gh-town-akrokerri-adansi-north",
    "name": "Akrokerri",
    "region": "Ashanti",
    "district": "Adansi North",
    "districtId": "gh-dist-adansi-north",
    "aliases": [],
    "latitude": 6.295,
    "longitude": -1.632,
    "sourceId": "GH0203_akrokerri"
  },
  {
    "id": "gh-town-asokwa-adansi-north",
    "name": "Asokwa",
    "region": "Ashanti",
    "district": "Adansi North",
    "districtId": "gh-dist-adansi-north",
    "aliases": [],
    "latitude": 6.281,
    "longitude": -1.508,
    "sourceId": "GH0203_asokwa"
  },
  {
    "id": "gh-town-bodwesango-adansi-north",
    "name": "Bodwesango",
    "region": "Ashanti",
    "district": "Adansi North",
    "districtId": "gh-dist-adansi-north",
    "aliases": [],
    "latitude": 6.222,
    "longitude": -1.31,
    "sourceId": "GH0203_bodwesango"
  },
  {
    "id": "gh-town-dompoase-adansi-north",
    "name": "Dompoase",
    "region": "Ashanti",
    "district": "Adansi North",
    "districtId": "gh-dist-adansi-north",
    "aliases": [],
    "latitude": 6.323,
    "longitude": -1.545,
    "sourceId": "GH0203_dompoase"
  },
  {
    "id": "gh-town-fomena-adansi-north",
    "name": "Fomena",
    "region": "Ashanti",
    "district": "Adansi North",
    "districtId": "gh-dist-adansi-north",
    "aliases": [],
    "latitude": 6.28,
    "longitude": -1.51,
    "sourceId": "GH0203_fomena"
  },
  {
    "id": "gh-town-fumso-adansi-north",
    "name": "Fumso",
    "region": "Ashanti",
    "district": "Adansi North",
    "districtId": "gh-dist-adansi-north",
    "aliases": [],
    "latitude": 6.11,
    "longitude": -1.449,
    "sourceId": "GH0203_fumso"
  },
  {
    "id": "gh-town-fumso-ketewa-adansi-north",
    "name": "Fumso Ketewa",
    "region": "Ashanti",
    "district": "Adansi North",
    "districtId": "gh-dist-adansi-north",
    "aliases": [],
    "latitude": 6.297,
    "longitude": -1.631,
    "sourceId": "GH0203_fumso-ketewa"
  },
  {
    "id": "gh-town-new-akrofrom-adansi-north",
    "name": "New Akrofrom",
    "region": "Ashanti",
    "district": "Adansi North",
    "districtId": "gh-dist-adansi-north",
    "aliases": [],
    "latitude": 6.153,
    "longitude": -1.476,
    "sourceId": "GH0203_new-akrofrom"
  },
  {
    "id": "gh-town-new-ayaasi-adansi-north",
    "name": "New Ayaasi",
    "region": "Ashanti",
    "district": "Adansi North",
    "districtId": "gh-dist-adansi-north",
    "aliases": [],
    "latitude": 6.296,
    "longitude": -1.523,
    "sourceId": "GH0203_new-ayaasi"
  },
  {
    "id": "gh-town-wioso-adansi-north",
    "name": "Wioso",
    "region": "Ashanti",
    "district": "Adansi North",
    "districtId": "gh-dist-adansi-north",
    "aliases": [],
    "latitude": 6.282,
    "longitude": -1.661,
    "sourceId": "GH0203_wioso"
  },
  {
    "id": "gh-town-akrofrom-adansi-south",
    "name": "Akrofrom",
    "region": "Ashanti",
    "district": "Adansi South",
    "districtId": "gh-dist-adansi-south",
    "aliases": [],
    "latitude": 6.124,
    "longitude": -1.654,
    "sourceId": "GH0204_akrofrom"
  },
  {
    "id": "gh-town-akutreso-adansi-south",
    "name": "Akutreso",
    "region": "Ashanti",
    "district": "Adansi South",
    "districtId": "gh-dist-adansi-south",
    "aliases": [],
    "latitude": 6.096,
    "longitude": -1.293,
    "sourceId": "GH0204_akutreso"
  },
  {
    "id": "gh-town-ampunyasi-adansi-south",
    "name": "Ampunyasi",
    "region": "Ashanti",
    "district": "Adansi South",
    "districtId": "gh-dist-adansi-south",
    "aliases": [],
    "latitude": 6.055,
    "longitude": -1.737,
    "sourceId": "GH0204_ampunyasi"
  },
  {
    "id": "gh-town-ataasi-nkwanta-adansi-south",
    "name": "Ataasi Nkwanta",
    "region": "Ashanti",
    "district": "Adansi South",
    "districtId": "gh-dist-adansi-south",
    "aliases": [],
    "latitude": 5.967,
    "longitude": -1.365,
    "sourceId": "GH0204_ataasi-nkwanta"
  },
  {
    "id": "gh-town-atwereboana-adansi-south",
    "name": "Atwereboana",
    "region": "Ashanti",
    "district": "Adansi South",
    "districtId": "gh-dist-adansi-south",
    "aliases": [],
    "latitude": 5.962,
    "longitude": -1.342,
    "sourceId": "GH0204_atwereboana"
  },
  {
    "id": "gh-town-edwafo-adansi-south",
    "name": "Edwafo",
    "region": "Ashanti",
    "district": "Adansi South",
    "districtId": "gh-dist-adansi-south",
    "aliases": [],
    "latitude": 6.197,
    "longitude": -1.574,
    "sourceId": "GH0204_edwafo"
  },
  {
    "id": "gh-town-hwidiem-adansi-south",
    "name": "Hwidiem",
    "region": "Ashanti",
    "district": "Adansi South",
    "districtId": "gh-dist-adansi-south",
    "aliases": [],
    "latitude": 5.894,
    "longitude": -1.468,
    "sourceId": "GH0204_hwidiem"
  },
  {
    "id": "gh-town-mansonso-adansi-south",
    "name": "Mansonso",
    "region": "Ashanti",
    "district": "Adansi South",
    "districtId": "gh-dist-adansi-south",
    "aliases": [],
    "latitude": 6.045,
    "longitude": -1.59,
    "sourceId": "GH0204_mansonso"
  },
  {
    "id": "gh-town-new-edubiase-adansi-south",
    "name": "New Edubiase",
    "region": "Ashanti",
    "district": "Adansi South",
    "districtId": "gh-dist-adansi-south",
    "aliases": [],
    "latitude": 6.055,
    "longitude": -1.393,
    "sourceId": "GH0204_new-edubiase"
  },
  {
    "id": "gh-town-obonsu-adansi-south",
    "name": "Obonsu",
    "region": "Ashanti",
    "district": "Adansi South",
    "districtId": "gh-dist-adansi-south",
    "aliases": [],
    "latitude": 5.953,
    "longitude": -1.352,
    "sourceId": "GH0204_obonsu"
  },
  {
    "id": "gh-town-sikaman-adansi-south",
    "name": "Sikaman",
    "region": "Ashanti",
    "district": "Adansi South",
    "districtId": "gh-dist-adansi-south",
    "aliases": [],
    "latitude": 6.115,
    "longitude": -1.58,
    "sourceId": "GH0204_sikaman"
  },
  {
    "id": "gh-town-subin-camp-adansi-south",
    "name": "Subin Camp",
    "region": "Ashanti",
    "district": "Adansi South",
    "districtId": "gh-dist-adansi-south",
    "aliases": [],
    "latitude": 5.967,
    "longitude": -1.45,
    "sourceId": "GH0204_subin-camp"
  },
  {
    "id": "gh-town-wamasi-adansi-south",
    "name": "Wamasi",
    "region": "Ashanti",
    "district": "Adansi South",
    "districtId": "gh-dist-adansi-south",
    "aliases": [],
    "latitude": 6.087,
    "longitude": -1.696,
    "sourceId": "GH0204_wamasi"
  },
  {
    "id": "gh-town-boamang-afigya-kwabre-north",
    "name": "Boamang",
    "region": "Ashanti",
    "district": "Afigya Kwabre North",
    "districtId": "gh-dist-afigya-kwabre-north",
    "aliases": [],
    "latitude": 6.941,
    "longitude": -1.617,
    "sourceId": "GH0205_boamang"
  },
  {
    "id": "gh-town-kyekyewere-afigya-kwabre-north",
    "name": "Kyekyewere",
    "region": "Ashanti",
    "district": "Afigya Kwabre North",
    "districtId": "gh-dist-afigya-kwabre-north",
    "aliases": [],
    "latitude": 7.145,
    "longitude": -1.639,
    "sourceId": "GH0205_kyekyewere"
  },
  {
    "id": "gh-town-tetrem-afigya-kwabre-north",
    "name": "Tetrem",
    "region": "Ashanti",
    "district": "Afigya Kwabre North",
    "districtId": "gh-dist-afigya-kwabre-north",
    "aliases": [],
    "latitude": 7.037,
    "longitude": -1.637,
    "sourceId": "GH0205_tetrem"
  },
  {
    "id": "gh-town-aboabogya-afigya-kwabre-south",
    "name": "Aboabogya",
    "region": "Ashanti",
    "district": "Afigya Kwabre South",
    "districtId": "gh-dist-afigya-kwabre-south",
    "aliases": [],
    "latitude": 6.842,
    "longitude": -1.611,
    "sourceId": "GH0206_aboabogya"
  },
  {
    "id": "gh-town-aboaso-afigya-kwabre-south",
    "name": "Aboaso",
    "region": "Ashanti",
    "district": "Afigya Kwabre South",
    "districtId": "gh-dist-afigya-kwabre-south",
    "aliases": [],
    "latitude": 6.842,
    "longitude": -1.611,
    "sourceId": "GH0206_aboaso"
  },
  {
    "id": "gh-town-afrancho-afigya-kwabre-south",
    "name": "Afrancho",
    "region": "Ashanti",
    "district": "Afigya Kwabre South",
    "districtId": "gh-dist-afigya-kwabre-south",
    "aliases": [],
    "latitude": 6.815,
    "longitude": -1.596,
    "sourceId": "GH0206_afrancho"
  },
  {
    "id": "gh-town-ahenkro-afigya-kwabre-south",
    "name": "Ahenkro",
    "region": "Ashanti",
    "district": "Afigya Kwabre South",
    "districtId": "gh-dist-afigya-kwabre-south",
    "aliases": [],
    "latitude": 6.872,
    "longitude": -1.64,
    "sourceId": "GH0206_ahenkro"
  },
  {
    "id": "gh-town-ankaase-afigya-kwabre-south",
    "name": "Ankaase",
    "region": "Ashanti",
    "district": "Afigya Kwabre South",
    "districtId": "gh-dist-afigya-kwabre-south",
    "aliases": [],
    "latitude": 6.848,
    "longitude": -1.549,
    "sourceId": "GH0206_ankaase"
  },
  {
    "id": "gh-town-fawade-afigya-kwabre-south",
    "name": "Fawade",
    "region": "Ashanti",
    "district": "Afigya Kwabre South",
    "districtId": "gh-dist-afigya-kwabre-south",
    "aliases": [],
    "latitude": 6.81,
    "longitude": -1.639,
    "sourceId": "GH0206_fawade"
  },
  {
    "id": "gh-town-kwamang-afigya-kwabre-south",
    "name": "Kwamang",
    "region": "Ashanti",
    "district": "Afigya Kwabre South",
    "districtId": "gh-dist-afigya-kwabre-south",
    "aliases": [],
    "latitude": 6.897,
    "longitude": -1.625,
    "sourceId": "GH0206_kwamang"
  },
  {
    "id": "gh-town-mamponteng-afigya-kwabre-south",
    "name": "Mamponteng",
    "region": "Ashanti",
    "district": "Afigya Kwabre South",
    "districtId": "gh-dist-afigya-kwabre-south",
    "aliases": [],
    "latitude": 6.8,
    "longitude": -1.645,
    "sourceId": "GH0206_mamponteng"
  },
  {
    "id": "gh-town-mpobi-afigya-kwabre-south",
    "name": "Mpobi",
    "region": "Ashanti",
    "district": "Afigya Kwabre South",
    "districtId": "gh-dist-afigya-kwabre-south",
    "aliases": [],
    "latitude": 6.848,
    "longitude": -1.562,
    "sourceId": "GH0206_mpobi"
  },
  {
    "id": "gh-town-nkukua-buoho-afigya-kwabre-south",
    "name": "Nkukua Buoho",
    "region": "Ashanti",
    "district": "Afigya Kwabre South",
    "districtId": "gh-dist-afigya-kwabre-south",
    "aliases": [],
    "latitude": 6.815,
    "longitude": -1.649,
    "sourceId": "GH0206_nkukua-buoho"
  },
  {
    "id": "gh-town-acherensua-ahafo-ano-north",
    "name": "Acherensua",
    "region": "Ashanti",
    "district": "Ahafo Ano North",
    "districtId": "gh-dist-ahafo-ano-north",
    "aliases": [],
    "latitude": 6.982,
    "longitude": -2.322,
    "sourceId": "GH0207_acherensua"
  },
  {
    "id": "gh-town-akwasiase-ahafo-ano-north",
    "name": "Akwasiase",
    "region": "Ashanti",
    "district": "Ahafo Ano North",
    "districtId": "gh-dist-ahafo-ano-north",
    "aliases": [],
    "latitude": 6.995,
    "longitude": -2.199,
    "sourceId": "GH0207_akwasiase"
  },
  {
    "id": "gh-town-anyinasuso-ahafo-ano-north",
    "name": "Anyinasuso",
    "region": "Ashanti",
    "district": "Ahafo Ano North",
    "districtId": "gh-dist-ahafo-ano-north",
    "aliases": [],
    "latitude": 6.959,
    "longitude": -2.1,
    "sourceId": "GH0207_anyinasuso"
  },
  {
    "id": "gh-town-betiako-ahafo-ano-north",
    "name": "Betiako",
    "region": "Ashanti",
    "district": "Ahafo Ano North",
    "districtId": "gh-dist-ahafo-ano-north",
    "aliases": [],
    "latitude": 6.866,
    "longitude": -2.207,
    "sourceId": "GH0207_betiako"
  },
  {
    "id": "gh-town-hwidiem-ahafo-ano-north",
    "name": "Hwidiem",
    "region": "Ashanti",
    "district": "Ahafo Ano North",
    "districtId": "gh-dist-ahafo-ano-north",
    "aliases": [],
    "latitude": 6.933,
    "longitude": -2.358,
    "sourceId": "GH0207_hwidiem"
  },
  {
    "id": "gh-town-manfo-ahafo-ano-north",
    "name": "Manfo",
    "region": "Ashanti",
    "district": "Ahafo Ano North",
    "districtId": "gh-dist-ahafo-ano-north",
    "aliases": [],
    "latitude": 6.945,
    "longitude": -2.23,
    "sourceId": "GH0207_manfo"
  },
  {
    "id": "gh-town-matang-ahafo-ano-north",
    "name": "Matang",
    "region": "Ashanti",
    "district": "Ahafo Ano North",
    "districtId": "gh-dist-ahafo-ano-north",
    "aliases": [],
    "latitude": 6.996,
    "longitude": -2.217,
    "sourceId": "GH0207_matang"
  },
  {
    "id": "gh-town-subriso-ahafo-ano-north",
    "name": "Subriso",
    "region": "Ashanti",
    "district": "Ahafo Ano North",
    "districtId": "gh-dist-ahafo-ano-north",
    "aliases": [],
    "latitude": 6.816,
    "longitude": -2.267,
    "sourceId": "GH0207_subriso"
  },
  {
    "id": "gh-town-tepa-ahafo-ano-north",
    "name": "Tepa",
    "region": "Ashanti",
    "district": "Ahafo Ano North",
    "districtId": "gh-dist-ahafo-ano-north",
    "aliases": [],
    "latitude": 7,
    "longitude": -2.171,
    "sourceId": "GH0207_tepa"
  },
  {
    "id": "gh-town-adinyana-ahafo-ano-south-east",
    "name": "Adinyana",
    "region": "Ashanti",
    "district": "Ahafo Ano South East",
    "districtId": "gh-dist-ahafo-ano-south-east",
    "aliases": [],
    "latitude": 6.884,
    "longitude": -1.873,
    "sourceId": "GH0208_adinyana"
  },
  {
    "id": "gh-town-adwinyama-ahafo-ano-south-east",
    "name": "Adwinyama",
    "region": "Ashanti",
    "district": "Ahafo Ano South East",
    "districtId": "gh-dist-ahafo-ano-south-east",
    "aliases": [],
    "latitude": 6.88,
    "longitude": -1.874,
    "sourceId": "GH0208_adwinyama"
  },
  {
    "id": "gh-town-essienkyem-ahafo-ano-south-east",
    "name": "Essienkyem",
    "region": "Ashanti",
    "district": "Ahafo Ano South East",
    "districtId": "gh-dist-ahafo-ano-south-east",
    "aliases": [],
    "latitude": 6.976,
    "longitude": -1.848,
    "sourceId": "GH0208_essienkyem"
  },
  {
    "id": "gh-town-mankranso-ahafo-ano-south-east",
    "name": "Mankranso",
    "region": "Ashanti",
    "district": "Ahafo Ano South East",
    "districtId": "gh-dist-ahafo-ano-south-east",
    "aliases": [],
    "latitude": 6.821,
    "longitude": -1.863,
    "sourceId": "GH0208_mankranso"
  },
  {
    "id": "gh-town-pokukrom-ahafo-ano-south-east",
    "name": "Pokukrom",
    "region": "Ashanti",
    "district": "Ahafo Ano South East",
    "districtId": "gh-dist-ahafo-ano-south-east",
    "aliases": [],
    "latitude": 7.004,
    "longitude": -1.952,
    "sourceId": "GH0208_pokukrom"
  },
  {
    "id": "gh-town-abuakwa-ahafo-ano-south-west",
    "name": "Abuakwa",
    "region": "Ashanti",
    "district": "Ahafo Ano South West",
    "districtId": "gh-dist-ahafo-ano-south-west",
    "aliases": [],
    "latitude": 7,
    "longitude": -2,
    "sourceId": "GH0209_abuakwa"
  },
  {
    "id": "gh-town-achiase-ahafo-ano-south-west",
    "name": "Achiase",
    "region": "Ashanti",
    "district": "Ahafo Ano South West",
    "districtId": "gh-dist-ahafo-ano-south-west",
    "aliases": [],
    "latitude": 7,
    "longitude": -2,
    "sourceId": "GH0209_achiase"
  },
  {
    "id": "gh-town-adankwame-ahafo-ano-south-west",
    "name": "Adankwame",
    "region": "Ashanti",
    "district": "Ahafo Ano South West",
    "districtId": "gh-dist-ahafo-ano-south-west",
    "aliases": [],
    "latitude": 7,
    "longitude": -2,
    "sourceId": "GH0209_adankwame"
  },
  {
    "id": "gh-town-akropong-ahafo-ano-south-west",
    "name": "Akropong",
    "region": "Ashanti",
    "district": "Ahafo Ano South West",
    "districtId": "gh-dist-ahafo-ano-south-west",
    "aliases": [],
    "latitude": 7,
    "longitude": -2,
    "sourceId": "GH0209_akropong"
  },
  {
    "id": "gh-town-asuofia-ahafo-ano-south-west",
    "name": "Asuofia",
    "region": "Ashanti",
    "district": "Ahafo Ano South West",
    "districtId": "gh-dist-ahafo-ano-south-west",
    "aliases": [],
    "latitude": 7,
    "longitude": -2,
    "sourceId": "GH0209_asuofia"
  },
  {
    "id": "gh-town-atwima-ahafo-ano-south-west",
    "name": "Atwima",
    "region": "Ashanti",
    "district": "Ahafo Ano South West",
    "districtId": "gh-dist-ahafo-ano-south-west",
    "aliases": [],
    "latitude": 7,
    "longitude": -2,
    "sourceId": "GH0209_atwima"
  },
  {
    "id": "gh-town-barekese-ahafo-ano-south-west",
    "name": "Barekese",
    "region": "Ashanti",
    "district": "Ahafo Ano South West",
    "districtId": "gh-dist-ahafo-ano-south-west",
    "aliases": [],
    "latitude": 7,
    "longitude": -2,
    "sourceId": "GH0209_barekese"
  },
  {
    "id": "gh-town-domeabra-ahafo-ano-south-west",
    "name": "Domeabra",
    "region": "Ashanti",
    "district": "Ahafo Ano South West",
    "districtId": "gh-dist-ahafo-ano-south-west",
    "aliases": [],
    "latitude": 6.872,
    "longitude": -2.057,
    "sourceId": "GH0209_domeabra"
  },
  {
    "id": "gh-town-maakro-ahafo-ano-south-west",
    "name": "Maakro",
    "region": "Ashanti",
    "district": "Ahafo Ano South West",
    "districtId": "gh-dist-ahafo-ano-south-west",
    "aliases": [],
    "latitude": 7,
    "longitude": -2,
    "sourceId": "GH0209_maakro"
  },
  {
    "id": "gh-town-mpasaso-ahafo-ano-south-west",
    "name": "Mpasaso",
    "region": "Ashanti",
    "district": "Ahafo Ano South West",
    "districtId": "gh-dist-ahafo-ano-south-west",
    "aliases": [],
    "latitude": 6.803,
    "longitude": -2.139,
    "sourceId": "GH0209_mpasaso"
  },
  {
    "id": "gh-town-nkawie-ahafo-ano-south-west",
    "name": "Nkawie",
    "region": "Ashanti",
    "district": "Ahafo Ano South West",
    "districtId": "gh-dist-ahafo-ano-south-west",
    "aliases": [],
    "latitude": 7,
    "longitude": -2,
    "sourceId": "GH0209_nkawie"
  },
  {
    "id": "gh-town-ntensere-ahafo-ano-south-west",
    "name": "Ntensere",
    "region": "Ashanti",
    "district": "Ahafo Ano South West",
    "districtId": "gh-dist-ahafo-ano-south-west",
    "aliases": [],
    "latitude": 7,
    "longitude": -2,
    "sourceId": "GH0209_ntensere"
  },
  {
    "id": "gh-town-sepase-ahafo-ano-south-west",
    "name": "Sepase",
    "region": "Ashanti",
    "district": "Ahafo Ano South West",
    "districtId": "gh-dist-ahafo-ano-south-west",
    "aliases": [],
    "latitude": 7,
    "longitude": -2,
    "sourceId": "GH0209_sepase"
  },
  {
    "id": "gh-town-toase-ahafo-ano-south-west",
    "name": "Toase",
    "region": "Ashanti",
    "district": "Ahafo Ano South West",
    "districtId": "gh-dist-ahafo-ano-south-west",
    "aliases": [],
    "latitude": 7,
    "longitude": -2,
    "sourceId": "GH0209_toase"
  },
  {
    "id": "gh-town-wioso-ahafo-ano-south-west",
    "name": "Wioso",
    "region": "Ashanti",
    "district": "Ahafo Ano South West",
    "districtId": "gh-dist-ahafo-ano-south-west",
    "aliases": [],
    "latitude": 6.956,
    "longitude": -2.007,
    "sourceId": "GH0209_wioso"
  },
  {
    "id": "gh-town-akrofrom-amansie-central",
    "name": "Akrofrom",
    "region": "Ashanti",
    "district": "Amansie Central",
    "districtId": "gh-dist-amansie-central",
    "aliases": [],
    "latitude": 6.397,
    "longitude": -1.608,
    "sourceId": "GH0210_akrofrom"
  },
  {
    "id": "gh-town-hia-amansie-central",
    "name": "Hia",
    "region": "Ashanti",
    "district": "Amansie Central",
    "districtId": "gh-dist-amansie-central",
    "aliases": [],
    "latitude": 6.208,
    "longitude": -1.776,
    "sourceId": "GH0210_hia"
  },
  {
    "id": "gh-town-jacobu-amansie-central",
    "name": "Jacobu",
    "region": "Ashanti",
    "district": "Amansie Central",
    "districtId": "gh-dist-amansie-central",
    "aliases": [],
    "latitude": 6.352,
    "longitude": -1.678,
    "sourceId": "GH0210_jacobu"
  },
  {
    "id": "gh-town-mile-14-amansie-central",
    "name": "Mile 14",
    "region": "Ashanti",
    "district": "Amansie Central",
    "districtId": "gh-dist-amansie-central",
    "aliases": [],
    "latitude": 6.221,
    "longitude": -1.821,
    "sourceId": "GH0210_mile-14"
  },
  {
    "id": "gh-town-numereso-amansie-central",
    "name": "Numereso",
    "region": "Ashanti",
    "district": "Amansie Central",
    "districtId": "gh-dist-amansie-central",
    "aliases": [],
    "latitude": 6.076,
    "longitude": -1.855,
    "sourceId": "GH0210_numereso"
  },
  {
    "id": "gh-town-abuoso-amansie-west",
    "name": "Abuoso",
    "region": "Ashanti",
    "district": "Amansie West",
    "districtId": "gh-dist-amansie-west",
    "aliases": [],
    "latitude": 6.313,
    "longitude": -2.109,
    "sourceId": "GH0212_abuoso"
  },
  {
    "id": "gh-town-adimposo-amansie-west",
    "name": "Adimposo",
    "region": "Ashanti",
    "district": "Amansie West",
    "districtId": "gh-dist-amansie-west",
    "aliases": [],
    "latitude": 6.337,
    "longitude": -1.926,
    "sourceId": "GH0212_adimposo"
  },
  {
    "id": "gh-town-agroyesum-amansie-west",
    "name": "Agroyesum",
    "region": "Ashanti",
    "district": "Amansie West",
    "districtId": "gh-dist-amansie-west",
    "aliases": [],
    "latitude": 6.413,
    "longitude": -1.882,
    "sourceId": "GH0212_agroyesum"
  },
  {
    "id": "gh-town-assuowin-amansie-west",
    "name": "Assuowin",
    "region": "Ashanti",
    "district": "Amansie West",
    "districtId": "gh-dist-amansie-west",
    "aliases": [],
    "latitude": 6.537,
    "longitude": -1.865,
    "sourceId": "GH0212_assuowin"
  },
  {
    "id": "gh-town-datano-amansie-west",
    "name": "Datano",
    "region": "Ashanti",
    "district": "Amansie West",
    "districtId": "gh-dist-amansie-west",
    "aliases": [],
    "latitude": 6.294,
    "longitude": -1.971,
    "sourceId": "GH0212_datano"
  },
  {
    "id": "gh-town-esaase-amansie-west",
    "name": "Esaase",
    "region": "Ashanti",
    "district": "Amansie West",
    "districtId": "gh-dist-amansie-west",
    "aliases": [],
    "latitude": 6.559,
    "longitude": -1.89,
    "sourceId": "GH0212_esaase"
  },
  {
    "id": "gh-town-keniago-amansie-west",
    "name": "Keniago",
    "region": "Ashanti",
    "district": "Amansie West",
    "districtId": "gh-dist-amansie-west",
    "aliases": [],
    "latitude": 6.373,
    "longitude": -2.018,
    "sourceId": "GH0212_keniago"
  },
  {
    "id": "gh-town-manso-abore-amansie-west",
    "name": "Manso Abore",
    "region": "Ashanti",
    "district": "Amansie West",
    "districtId": "gh-dist-amansie-west",
    "aliases": [],
    "latitude": 6.446,
    "longitude": -1.978,
    "sourceId": "GH0212_manso-abore"
  },
  {
    "id": "gh-town-manso-moseaso-amansie-west",
    "name": "Manso Moseaso",
    "region": "Ashanti",
    "district": "Amansie West",
    "districtId": "gh-dist-amansie-west",
    "aliases": [],
    "latitude": 6.511,
    "longitude": -1.852,
    "sourceId": "GH0212_manso-moseaso"
  },
  {
    "id": "gh-town-manso-nkran-amansie-west",
    "name": "Manso Nkran",
    "region": "Ashanti",
    "district": "Amansie West",
    "districtId": "gh-dist-amansie-west",
    "aliases": [],
    "latitude": 6.346,
    "longitude": -1.99,
    "sourceId": "GH0212_manso-nkran"
  },
  {
    "id": "gh-town-manso-nkwanta-amansie-west",
    "name": "Manso Nkwanta",
    "region": "Ashanti",
    "district": "Amansie West",
    "districtId": "gh-dist-amansie-west",
    "aliases": [],
    "latitude": 6.477,
    "longitude": -1.879,
    "sourceId": "GH0212_manso-nkwanta"
  },
  {
    "id": "gh-town-manso-adubia-amansie-west",
    "name": "Manso-Adubia",
    "region": "Ashanti",
    "district": "Amansie West",
    "districtId": "gh-dist-amansie-west",
    "aliases": [],
    "latitude": 6.403,
    "longitude": -1.93,
    "sourceId": "GH0212_manso-adubia"
  },
  {
    "id": "gh-town-mpatoum-amansie-west",
    "name": "Mpatoum",
    "region": "Ashanti",
    "district": "Amansie West",
    "districtId": "gh-dist-amansie-west",
    "aliases": [],
    "latitude": 6.541,
    "longitude": -1.932,
    "sourceId": "GH0212_mpatoum"
  },
  {
    "id": "gh-town-mpatuom-amansie-west",
    "name": "Mpatuom",
    "region": "Ashanti",
    "district": "Amansie West",
    "districtId": "gh-dist-amansie-west",
    "aliases": [],
    "latitude": 6.541,
    "longitude": -1.932,
    "sourceId": "GH0212_mpatuom"
  },
  {
    "id": "gh-town-nipankyeremia-amansie-west",
    "name": "Nipankyeremia",
    "region": "Ashanti",
    "district": "Amansie West",
    "districtId": "gh-dist-amansie-west",
    "aliases": [],
    "latitude": 6.37,
    "longitude": -2.158,
    "sourceId": "GH0212_nipankyeremia"
  },
  {
    "id": "gh-town-odaho-amansie-west",
    "name": "Odaho",
    "region": "Ashanti",
    "district": "Amansie West",
    "districtId": "gh-dist-amansie-west",
    "aliases": [],
    "latitude": 6.274,
    "longitude": -1.968,
    "sourceId": "GH0212_odaho"
  },
  {
    "id": "gh-town-pakyi-no-2-amansie-west",
    "name": "Pakyi  No 2",
    "region": "Ashanti",
    "district": "Amansie West",
    "districtId": "gh-dist-amansie-west",
    "aliases": [],
    "latitude": 6.48,
    "longitude": -1.495,
    "sourceId": "GH0212_pakyi-no-2"
  },
  {
    "id": "gh-town-tontokrom-amansie-west",
    "name": "Tontokrom",
    "region": "Ashanti",
    "district": "Amansie West",
    "districtId": "gh-dist-amansie-west",
    "aliases": [],
    "latitude": 6.249,
    "longitude": -1.995,
    "sourceId": "GH0212_tontokrom"
  },
  {
    "id": "gh-town-watreso-amansie-west",
    "name": "Watreso",
    "region": "Ashanti",
    "district": "Amansie West",
    "districtId": "gh-dist-amansie-west",
    "aliases": [],
    "latitude": 6.254,
    "longitude": -1.918,
    "sourceId": "GH0212_watreso"
  },
  {
    "id": "gh-town-nobewam-asante-akim-central-muni",
    "name": "Nobewam",
    "region": "Ashanti",
    "district": "Asante Akim Central Municipal",
    "districtId": "gh-dist-asante-akim-central-municipal",
    "aliases": [],
    "latitude": 6.623,
    "longitude": -1.24,
    "sourceId": "GH0213_nobewam"
  },
  {
    "id": "gh-town-peminase-asante-akim-central-muni",
    "name": "Peminase",
    "region": "Ashanti",
    "district": "Asante Akim Central Municipal",
    "districtId": "gh-dist-asante-akim-central-municipal",
    "aliases": [],
    "latitude": 6.527,
    "longitude": -1.311,
    "sourceId": "GH0213_peminase"
  },
  {
    "id": "gh-town-abosomtweagya-asante-akim-north",
    "name": "Abosomtweagya",
    "region": "Ashanti",
    "district": "Asante Akim North",
    "districtId": "gh-dist-asante-akim-north",
    "aliases": [],
    "latitude": 6.621,
    "longitude": -1.204,
    "sourceId": "GH0214_abosomtweagya"
  },
  {
    "id": "gh-town-agogo-asante-akim-north",
    "name": "Agogo",
    "region": "Ashanti",
    "district": "Asante Akim North",
    "districtId": "gh-dist-asante-akim-north",
    "aliases": [],
    "latitude": 6.796,
    "longitude": -1.085,
    "sourceId": "GH0214_agogo"
  },
  {
    "id": "gh-town-ahenebronuum-asante-akim-north",
    "name": "Ahenebronuum",
    "region": "Ashanti",
    "district": "Asante Akim North",
    "districtId": "gh-dist-asante-akim-north",
    "aliases": [],
    "latitude": 6.628,
    "longitude": -1.213,
    "sourceId": "GH0214_ahenebronuum"
  },
  {
    "id": "gh-town-akratiebesa-asante-akim-north",
    "name": "Akratiebesa",
    "region": "Ashanti",
    "district": "Asante Akim North",
    "districtId": "gh-dist-asante-akim-north",
    "aliases": [],
    "latitude": 6.619,
    "longitude": -1.192,
    "sourceId": "GH0214_akratiebesa"
  },
  {
    "id": "gh-town-ananekrom-asante-akim-north",
    "name": "Ananekrom",
    "region": "Ashanti",
    "district": "Asante Akim North",
    "districtId": "gh-dist-asante-akim-north",
    "aliases": [],
    "latitude": 6.915,
    "longitude": -1.015,
    "sourceId": "GH0214_ananekrom"
  },
  {
    "id": "gh-town-bebome-asante-akim-north",
    "name": "Bebome",
    "region": "Ashanti",
    "district": "Asante Akim North",
    "districtId": "gh-dist-asante-akim-north",
    "aliases": [],
    "latitude": 6.867,
    "longitude": -1.096,
    "sourceId": "GH0214_bebome"
  },
  {
    "id": "gh-town-dwease-asante-akim-north",
    "name": "Dwease",
    "region": "Ashanti",
    "district": "Asante Akim North",
    "districtId": "gh-dist-asante-akim-north",
    "aliases": [],
    "latitude": 6.537,
    "longitude": -1.244,
    "sourceId": "GH0214_dwease"
  },
  {
    "id": "gh-town-juansa-asante-akim-north",
    "name": "Juansa",
    "region": "Ashanti",
    "district": "Asante Akim North",
    "districtId": "gh-dist-asante-akim-north",
    "aliases": [],
    "latitude": 6.723,
    "longitude": -1.127,
    "sourceId": "GH0214_juansa"
  },
  {
    "id": "gh-town-konongo-asante-akim-north",
    "name": "Konongo",
    "region": "Ashanti",
    "district": "Asante Akim North",
    "districtId": "gh-dist-asante-akim-north",
    "aliases": [],
    "latitude": 6.624,
    "longitude": -1.218,
    "sourceId": "GH0214_konongo"
  },
  {
    "id": "gh-town-nyinamponase-asante-akim-north",
    "name": "Nyinamponase",
    "region": "Ashanti",
    "district": "Asante Akim North",
    "districtId": "gh-dist-asante-akim-north",
    "aliases": [],
    "latitude": 6.77,
    "longitude": -1.163,
    "sourceId": "GH0214_nyinamponase"
  },
  {
    "id": "gh-town-praaso-asante-akim-north",
    "name": "Praaso",
    "region": "Ashanti",
    "district": "Asante Akim North",
    "districtId": "gh-dist-asante-akim-north",
    "aliases": [],
    "latitude": 6.516,
    "longitude": -1.267,
    "sourceId": "GH0214_praaso"
  },
  {
    "id": "gh-town-banka-asante-akim-south",
    "name": "Banka",
    "region": "Ashanti",
    "district": "Asante Akim South",
    "districtId": "gh-dist-asante-akim-south",
    "aliases": [],
    "latitude": 6.298,
    "longitude": -1.216,
    "sourceId": "GH0215_banka"
  },
  {
    "id": "gh-town-banso-asante-akim-south",
    "name": "Banso",
    "region": "Ashanti",
    "district": "Asante Akim South",
    "districtId": "gh-dist-asante-akim-south",
    "aliases": [],
    "latitude": 6.476,
    "longitude": -1.197,
    "sourceId": "GH0215_banso"
  },
  {
    "id": "gh-town-bompata-asante-akim-south",
    "name": "Bompata",
    "region": "Ashanti",
    "district": "Asante Akim South",
    "districtId": "gh-dist-asante-akim-south",
    "aliases": [],
    "latitude": 6.667,
    "longitude": -1.084,
    "sourceId": "GH0215_bompata"
  },
  {
    "id": "gh-town-dwendwenase-asante-akim-south",
    "name": "Dwendwenase",
    "region": "Ashanti",
    "district": "Asante Akim South",
    "districtId": "gh-dist-asante-akim-south",
    "aliases": [],
    "latitude": 6.412,
    "longitude": -1.199,
    "sourceId": "GH0215_dwendwenase"
  },
  {
    "id": "gh-town-juaso-asante-akim-south",
    "name": "Juaso",
    "region": "Ashanti",
    "district": "Asante Akim South",
    "districtId": "gh-dist-asante-akim-south",
    "aliases": [],
    "latitude": 6.592,
    "longitude": -1.121,
    "sourceId": "GH0215_juaso"
  },
  {
    "id": "gh-town-kumeso-asante-akim-south",
    "name": "Kumeso",
    "region": "Ashanti",
    "district": "Asante Akim South",
    "districtId": "gh-dist-asante-akim-south",
    "aliases": [],
    "latitude": 6.462,
    "longitude": -1.069,
    "sourceId": "GH0215_kumeso"
  },
  {
    "id": "gh-town-morso-asante-akim-south",
    "name": "Morso",
    "region": "Ashanti",
    "district": "Asante Akim South",
    "districtId": "gh-dist-asante-akim-south",
    "aliases": [],
    "latitude": 6.655,
    "longitude": -1.107,
    "sourceId": "GH0215_morso"
  },
  {
    "id": "gh-town-muronam-asante-akim-south",
    "name": "Muronam",
    "region": "Ashanti",
    "district": "Asante Akim South",
    "districtId": "gh-dist-asante-akim-south",
    "aliases": [],
    "latitude": 6.247,
    "longitude": -1.206,
    "sourceId": "GH0215_muronam"
  },
  {
    "id": "gh-town-nnadieso-asante-akim-south",
    "name": "Nnadieso",
    "region": "Ashanti",
    "district": "Asante Akim South",
    "districtId": "gh-dist-asante-akim-south",
    "aliases": [],
    "latitude": 6.6,
    "longitude": -1.092,
    "sourceId": "GH0215_nnadieso"
  },
  {
    "id": "gh-town-obogu-asante-akim-south",
    "name": "Obogu",
    "region": "Ashanti",
    "district": "Asante Akim South",
    "districtId": "gh-dist-asante-akim-south",
    "aliases": [],
    "latitude": 6.515,
    "longitude": -1.116,
    "sourceId": "GH0215_obogu"
  },
  {
    "id": "gh-town-ofoase-asante-akim-south",
    "name": "Ofoase",
    "region": "Ashanti",
    "district": "Asante Akim South",
    "districtId": "gh-dist-asante-akim-south",
    "aliases": [],
    "latitude": 6.378,
    "longitude": -1.267,
    "sourceId": "GH0215_ofoase"
  },
  {
    "id": "gh-town-kokobra-asokore-mampong-municipa",
    "name": "Kokobra",
    "region": "Ashanti",
    "district": "Asokore Mampong Municipal",
    "districtId": "gh-dist-asokore-mampong-municipal",
    "aliases": [],
    "latitude": 6.715,
    "longitude": -1.522,
    "sourceId": "GH0216_kokobra"
  },
  {
    "id": "gh-town-okyerekrom-asokore-mampong-municipa",
    "name": "Okyerekrom",
    "region": "Ashanti",
    "district": "Asokore Mampong Municipal",
    "districtId": "gh-dist-asokore-mampong-municipal",
    "aliases": [],
    "latitude": 6.721,
    "longitude": -1.526,
    "sourceId": "GH0216_okyerekrom"
  },
  {
    "id": "gh-town-aburaso-atwima-kwanwoma",
    "name": "Aburaso",
    "region": "Ashanti",
    "district": "Atwima Kwanwoma",
    "districtId": "gh-dist-atwima-kwanwoma",
    "aliases": [],
    "latitude": 6.661,
    "longitude": -1.677,
    "sourceId": "GH0218_aburaso"
  },
  {
    "id": "gh-town-ahenema-kokoben-atwima-kwanwoma",
    "name": "Ahenema kokoben",
    "region": "Ashanti",
    "district": "Atwima Kwanwoma",
    "districtId": "gh-dist-atwima-kwanwoma",
    "aliases": [],
    "latitude": 6.626,
    "longitude": -1.65,
    "sourceId": "GH0218_ahenema-kokoben"
  },
  {
    "id": "gh-town-bebu-atwima-kwanwoma",
    "name": "Bebu",
    "region": "Ashanti",
    "district": "Atwima Kwanwoma",
    "districtId": "gh-dist-atwima-kwanwoma",
    "aliases": [],
    "latitude": 6.612,
    "longitude": -1.685,
    "sourceId": "GH0218_bebu"
  },
  {
    "id": "gh-town-brofoyeduru-atwima-kwanwoma",
    "name": "Brofoyeduru",
    "region": "Ashanti",
    "district": "Atwima Kwanwoma",
    "districtId": "gh-dist-atwima-kwanwoma",
    "aliases": [],
    "latitude": 6.615,
    "longitude": -1.659,
    "sourceId": "GH0218_brofoyeduru"
  },
  {
    "id": "gh-town-foase-atwima-kwanwoma",
    "name": "Foase",
    "region": "Ashanti",
    "district": "Atwima Kwanwoma",
    "districtId": "gh-dist-atwima-kwanwoma",
    "aliases": [],
    "latitude": 6.638,
    "longitude": -1.751,
    "sourceId": "GH0218_foase"
  },
  {
    "id": "gh-town-kwanwoma-atwima-kwanwoma",
    "name": "Kwanwoma",
    "region": "Ashanti",
    "district": "Atwima Kwanwoma",
    "districtId": "gh-dist-atwima-kwanwoma",
    "aliases": [],
    "latitude": 6.629,
    "longitude": -1.635,
    "sourceId": "GH0218_kwanwoma"
  },
  {
    "id": "gh-town-trabuom-atwima-kwanwoma",
    "name": "Trabuom",
    "region": "Ashanti",
    "district": "Atwima Kwanwoma",
    "districtId": "gh-dist-atwima-kwanwoma",
    "aliases": [],
    "latitude": 6.611,
    "longitude": -1.763,
    "sourceId": "GH0218_trabuom"
  },
  {
    "id": "gh-town-trede-atwima-kwanwoma",
    "name": "Trede",
    "region": "Ashanti",
    "district": "Atwima Kwanwoma",
    "districtId": "gh-dist-atwima-kwanwoma",
    "aliases": [],
    "latitude": 6.578,
    "longitude": -1.669,
    "sourceId": "GH0218_trede"
  },
  {
    "id": "gh-town-barniekrom-atwima-mponua",
    "name": "Barniekrom",
    "region": "Ashanti",
    "district": "Atwima Mponua",
    "districtId": "gh-dist-atwima-mponua",
    "aliases": [],
    "latitude": 6.542,
    "longitude": -2.175,
    "sourceId": "GH0219_barniekrom"
  },
  {
    "id": "gh-town-bayerebon-atwima-mponua",
    "name": "Bayerebon",
    "region": "Ashanti",
    "district": "Atwima Mponua",
    "districtId": "gh-dist-atwima-mponua",
    "aliases": [],
    "latitude": 6.392,
    "longitude": -2.181,
    "sourceId": "GH0219_bayerebon"
  },
  {
    "id": "gh-town-bibiani-atwima-mponua",
    "name": "Bibiani",
    "region": "Ashanti",
    "district": "Atwima Mponua",
    "districtId": "gh-dist-atwima-mponua",
    "aliases": [],
    "latitude": 6.453,
    "longitude": -2.318,
    "sourceId": "GH0219_bibiani"
  },
  {
    "id": "gh-town-enyinamoso-atwima-mponua",
    "name": "Enyinamoso",
    "region": "Ashanti",
    "district": "Atwima Mponua",
    "districtId": "gh-dist-atwima-mponua",
    "aliases": [],
    "latitude": 6.647,
    "longitude": -1.903,
    "sourceId": "GH0219_enyinamoso"
  },
  {
    "id": "gh-town-gyeresu-atwima-mponua",
    "name": "Gyeresu",
    "region": "Ashanti",
    "district": "Atwima Mponua",
    "districtId": "gh-dist-atwima-mponua",
    "aliases": [],
    "latitude": 6.47,
    "longitude": -2.417,
    "sourceId": "GH0219_gyeresu"
  },
  {
    "id": "gh-town-mpasatia-atwima-mponua",
    "name": "Mpasatia",
    "region": "Ashanti",
    "district": "Atwima Mponua",
    "districtId": "gh-dist-atwima-mponua",
    "aliases": [],
    "latitude": 6.668,
    "longitude": -1.84,
    "sourceId": "GH0219_mpasatia"
  },
  {
    "id": "gh-town-ntobroso-atwima-mponua",
    "name": "Ntobroso",
    "region": "Ashanti",
    "district": "Atwima Mponua",
    "districtId": "gh-dist-atwima-mponua",
    "aliases": [],
    "latitude": 6.536,
    "longitude": -2.042,
    "sourceId": "GH0219_ntobroso"
  },
  {
    "id": "gh-town-nyinahin-atwima-mponua",
    "name": "Nyinahin",
    "region": "Ashanti",
    "district": "Atwima Mponua",
    "districtId": "gh-dist-atwima-mponua",
    "aliases": [],
    "latitude": 6.601,
    "longitude": -2.11,
    "sourceId": "GH0219_nyinahin"
  },
  {
    "id": "gh-town-saakrom-atwima-mponua",
    "name": "Saakrom",
    "region": "Ashanti",
    "district": "Atwima Mponua",
    "districtId": "gh-dist-atwima-mponua",
    "aliases": [],
    "latitude": 6.759,
    "longitude": -2.03,
    "sourceId": "GH0219_saakrom"
  },
  {
    "id": "gh-town-sreso-tinpom-atwima-mponua",
    "name": "Sreso Tinpom",
    "region": "Ashanti",
    "district": "Atwima Mponua",
    "districtId": "gh-dist-atwima-mponua",
    "aliases": [],
    "latitude": 6.622,
    "longitude": -2.303,
    "sourceId": "GH0219_sreso-tinpom"
  },
  {
    "id": "gh-town-tano-odumasi-atwima-mponua",
    "name": "Tano-Odumasi",
    "region": "Ashanti",
    "district": "Atwima Mponua",
    "districtId": "gh-dist-atwima-mponua",
    "aliases": [],
    "latitude": 6.497,
    "longitude": -2.397,
    "sourceId": "GH0219_tano-odumasi"
  },
  {
    "id": "gh-town-dwenwoho-atwima-nwabiagya-north",
    "name": "Dwenwoho",
    "region": "Ashanti",
    "district": "Atwima Nwabiagya North",
    "districtId": "gh-dist-atwima-nwabiagya-north",
    "aliases": [],
    "latitude": 6.859,
    "longitude": -1.756,
    "sourceId": "GH0220_dwenwoho"
  },
  {
    "id": "gh-town-essibey-nkwata-atwima-nwabiagya-north",
    "name": "Essibey Nkwata",
    "region": "Ashanti",
    "district": "Atwima Nwabiagya North",
    "districtId": "gh-dist-atwima-nwabiagya-north",
    "aliases": [],
    "latitude": 6.846,
    "longitude": -1.76,
    "sourceId": "GH0220_essibey-nkwata"
  },
  {
    "id": "gh-town-amoaful-bekwai-municipal",
    "name": "Amoaful",
    "region": "Ashanti",
    "district": "Bekwai Municipal",
    "districtId": "gh-dist-bekwai-municipal",
    "aliases": [],
    "latitude": 6.451,
    "longitude": -1.565,
    "sourceId": "GH0222_amoaful"
  },
  {
    "id": "gh-town-anwiankwanta-bekwai-municipal",
    "name": "Anwiankwanta",
    "region": "Ashanti",
    "district": "Bekwai Municipal",
    "districtId": "gh-dist-bekwai-municipal",
    "aliases": [],
    "latitude": 6.463,
    "longitude": -1.586,
    "sourceId": "GH0222_anwiankwanta"
  },
  {
    "id": "gh-town-apau-bekwai-municipal",
    "name": "Apau",
    "region": "Ashanti",
    "district": "Bekwai Municipal",
    "districtId": "gh-dist-bekwai-municipal",
    "aliases": [],
    "latitude": 6.473,
    "longitude": -1.437,
    "sourceId": "GH0222_apau"
  },
  {
    "id": "gh-town-bekwai-bekwai-municipal",
    "name": "Bekwai",
    "region": "Ashanti",
    "district": "Bekwai Municipal",
    "districtId": "gh-dist-bekwai-municipal",
    "aliases": [],
    "latitude": 6.455,
    "longitude": -1.571,
    "sourceId": "GH0222_bekwai"
  },
  {
    "id": "gh-town-dominase-bekwai-municipal",
    "name": "Dominase",
    "region": "Ashanti",
    "district": "Bekwai Municipal",
    "districtId": "gh-dist-bekwai-municipal",
    "aliases": [],
    "latitude": 6.31,
    "longitude": -1.391,
    "sourceId": "GH0222_dominase"
  },
  {
    "id": "gh-town-huntade-bekwai-municipal",
    "name": "Huntade",
    "region": "Ashanti",
    "district": "Bekwai Municipal",
    "districtId": "gh-dist-bekwai-municipal",
    "aliases": [],
    "latitude": 6.48,
    "longitude": -1.495,
    "sourceId": "GH0222_huntade"
  },
  {
    "id": "gh-town-kokofu-bekwai-municipal",
    "name": "Kokofu",
    "region": "Ashanti",
    "district": "Bekwai Municipal",
    "districtId": "gh-dist-bekwai-municipal",
    "aliases": [],
    "latitude": 6.51,
    "longitude": -1.536,
    "sourceId": "GH0222_kokofu"
  },
  {
    "id": "gh-town-kortwia-bekwai-municipal",
    "name": "Kortwia",
    "region": "Ashanti",
    "district": "Bekwai Municipal",
    "districtId": "gh-dist-bekwai-municipal",
    "aliases": [],
    "latitude": 6.44,
    "longitude": -1.538,
    "sourceId": "GH0222_kortwia"
  },
  {
    "id": "gh-town-nsuaem-2-bekwai-municipal",
    "name": "Nsuaem #2",
    "region": "Ashanti",
    "district": "Bekwai Municipal",
    "districtId": "gh-dist-bekwai-municipal",
    "aliases": [],
    "latitude": 6.365,
    "longitude": -1.366,
    "sourceId": "GH0222_nsuaem-2"
  },
  {
    "id": "gh-town-tebeso-2-bekwai-municipal",
    "name": "Tebeso #2",
    "region": "Ashanti",
    "district": "Bekwai Municipal",
    "districtId": "gh-dist-bekwai-municipal",
    "aliases": [],
    "latitude": 6.318,
    "longitude": -1.308,
    "sourceId": "GH0222_tebeso-2"
  },
  {
    "id": "gh-town-yapesa-bekwai-municipal",
    "name": "Yapesa",
    "region": "Ashanti",
    "district": "Bekwai Municipal",
    "districtId": "gh-dist-bekwai-municipal",
    "aliases": [],
    "latitude": 6.451,
    "longitude": -1.368,
    "sourceId": "GH0222_yapesa"
  },
  {
    "id": "gh-town-achiase-bosome-freho",
    "name": "Achiase",
    "region": "Ashanti",
    "district": "Bosome Freho",
    "districtId": "gh-dist-bosome-freho",
    "aliases": [],
    "latitude": 6.455,
    "longitude": -1.31,
    "sourceId": "GH0223_achiase"
  },
  {
    "id": "gh-town-asiwa-bosome-freho",
    "name": "Asiwa",
    "region": "Ashanti",
    "district": "Bosome Freho",
    "districtId": "gh-dist-bosome-freho",
    "aliases": [],
    "latitude": 6.423,
    "longitude": -1.334,
    "sourceId": "GH0223_asiwa"
  },
  {
    "id": "gh-town-brofoyedru-bosome-freho",
    "name": "Brofoyedru",
    "region": "Ashanti",
    "district": "Bosome Freho",
    "districtId": "gh-dist-bosome-freho",
    "aliases": [],
    "latitude": 6.473,
    "longitude": -1.374,
    "sourceId": "GH0223_brofoyedru"
  },
  {
    "id": "gh-town-detieso-bosome-freho",
    "name": "Detieso",
    "region": "Ashanti",
    "district": "Bosome Freho",
    "districtId": "gh-dist-bosome-freho",
    "aliases": [],
    "latitude": 6.477,
    "longitude": -1.442,
    "sourceId": "GH0223_detieso"
  },
  {
    "id": "gh-town-duasi-bosome-freho",
    "name": "Duasi",
    "region": "Ashanti",
    "district": "Bosome Freho",
    "districtId": "gh-dist-bosome-freho",
    "aliases": [],
    "latitude": 6.469,
    "longitude": -1.395,
    "sourceId": "GH0223_duasi"
  },
  {
    "id": "gh-town-gyasikrom-bosome-freho",
    "name": "Gyasikrom",
    "region": "Ashanti",
    "district": "Bosome Freho",
    "districtId": "gh-dist-bosome-freho",
    "aliases": [],
    "latitude": 6.401,
    "longitude": -1.473,
    "sourceId": "GH0223_gyasikrom"
  },
  {
    "id": "gh-town-amakom-bosomtwe",
    "name": "Amakom",
    "region": "Ashanti",
    "district": "Bosomtwe",
    "districtId": "gh-dist-bosomtwe",
    "aliases": [],
    "latitude": 6.484,
    "longitude": -1.374,
    "sourceId": "GH0224_amakom"
  },
  {
    "id": "gh-town-apinkra-bosomtwe",
    "name": "Apinkra",
    "region": "Ashanti",
    "district": "Bosomtwe",
    "districtId": "gh-dist-bosomtwe",
    "aliases": [],
    "latitude": 6.541,
    "longitude": -1.543,
    "sourceId": "GH0224_apinkra"
  },
  {
    "id": "gh-town-brodekwanu-bosomtwe",
    "name": "Brodekwanu",
    "region": "Ashanti",
    "district": "Bosomtwe",
    "districtId": "gh-dist-bosomtwe",
    "aliases": [],
    "latitude": 6.535,
    "longitude": -1.354,
    "sourceId": "GH0224_brodekwanu"
  },
  {
    "id": "gh-town-esereso-bosomtwe",
    "name": "Esereso",
    "region": "Ashanti",
    "district": "Bosomtwe",
    "districtId": "gh-dist-bosomtwe",
    "aliases": [],
    "latitude": 6.632,
    "longitude": -1.561,
    "sourceId": "GH0224_esereso"
  },
  {
    "id": "gh-town-feyiase-bosomtwe",
    "name": "Feyiase",
    "region": "Ashanti",
    "district": "Bosomtwe",
    "districtId": "gh-dist-bosomtwe",
    "aliases": [],
    "latitude": 6.613,
    "longitude": -1.56,
    "sourceId": "GH0224_feyiase"
  },
  {
    "id": "gh-town-jachie-bosomtwe",
    "name": "Jachie",
    "region": "Ashanti",
    "district": "Bosomtwe",
    "districtId": "gh-dist-bosomtwe",
    "aliases": [],
    "latitude": 6.566,
    "longitude": -1.521,
    "sourceId": "GH0224_jachie"
  },
  {
    "id": "gh-town-konkoma-bosomtwe",
    "name": "Konkoma",
    "region": "Ashanti",
    "district": "Bosomtwe",
    "districtId": "gh-dist-bosomtwe",
    "aliases": [],
    "latitude": 6.513,
    "longitude": -1.348,
    "sourceId": "GH0224_konkoma"
  },
  {
    "id": "gh-town-kuntenase-bosomtwe",
    "name": "Kuntenase",
    "region": "Ashanti",
    "district": "Bosomtwe",
    "districtId": "gh-dist-bosomtwe",
    "aliases": [],
    "latitude": 6.538,
    "longitude": -1.475,
    "sourceId": "GH0224_kuntenase"
  },
  {
    "id": "gh-town-kwaso-bosomtwe",
    "name": "Kwaso",
    "region": "Ashanti",
    "district": "Bosomtwe",
    "districtId": "gh-dist-bosomtwe",
    "aliases": [],
    "latitude": 6.628,
    "longitude": -1.447,
    "sourceId": "GH0224_kwaso"
  },
  {
    "id": "gh-town-new-kokobiriko-abijan-nkwant-bosomtwe",
    "name": "New Kokobiriko (Abijan-Nkwant",
    "region": "Ashanti",
    "district": "Bosomtwe",
    "districtId": "gh-dist-bosomtwe",
    "aliases": [],
    "latitude": 6.579,
    "longitude": -1.544,
    "sourceId": "GH0224_new-kokobiriko-abijan-nkwant"
  },
  {
    "id": "gh-town-nyameani-bosomtwe",
    "name": "Nyameani",
    "region": "Ashanti",
    "district": "Bosomtwe",
    "districtId": "gh-dist-bosomtwe",
    "aliases": [],
    "latitude": 6.565,
    "longitude": -1.43,
    "sourceId": "GH0224_nyameani"
  },
  {
    "id": "gh-town-piase-bosomtwe",
    "name": "Piase",
    "region": "Ashanti",
    "district": "Bosomtwe",
    "districtId": "gh-dist-bosomtwe",
    "aliases": [],
    "latitude": 6.591,
    "longitude": -1.452,
    "sourceId": "GH0224_piase"
  },
  {
    "id": "gh-town-pramso-bosomtwe",
    "name": "Pramso",
    "region": "Ashanti",
    "district": "Bosomtwe",
    "districtId": "gh-dist-bosomtwe",
    "aliases": [],
    "latitude": 6.559,
    "longitude": -1.512,
    "sourceId": "GH0224_pramso"
  },
  {
    "id": "gh-town-boamadumase-ejisu-municipal",
    "name": "Boamadumase",
    "region": "Ashanti",
    "district": "Ejisu Municipal",
    "districtId": "gh-dist-ejisu-municipal",
    "aliases": [],
    "latitude": 6.616,
    "longitude": -1.34,
    "sourceId": "GH0225_boamadumase"
  },
  {
    "id": "gh-town-bomfa-ejisu-municipal",
    "name": "Bomfa",
    "region": "Ashanti",
    "district": "Ejisu Municipal",
    "districtId": "gh-dist-ejisu-municipal",
    "aliases": [],
    "latitude": 6.596,
    "longitude": -1.299,
    "sourceId": "GH0225_bomfa"
  },
  {
    "id": "gh-town-ahyiayem-ejura-sekyedumase",
    "name": "Ahyiayem",
    "region": "Ashanti",
    "district": "Ejura-Sekyedumase",
    "districtId": "gh-dist-ejura-sekyedumase",
    "aliases": [],
    "latitude": 7.467,
    "longitude": -1.518,
    "sourceId": "GH0226_ahyiayem"
  },
  {
    "id": "gh-town-babaso-ejura-sekyedumase",
    "name": "Babaso",
    "region": "Ashanti",
    "district": "Ejura-Sekyedumase",
    "districtId": "gh-dist-ejura-sekyedumase",
    "aliases": [],
    "latitude": 7.341,
    "longitude": -1.324,
    "sourceId": "GH0226_babaso"
  },
  {
    "id": "gh-town-ejura-ejura-sekyedumase",
    "name": "Ejura",
    "region": "Ashanti",
    "district": "Ejura-Sekyedumase",
    "districtId": "gh-dist-ejura-sekyedumase",
    "aliases": [],
    "latitude": 7.389,
    "longitude": -1.352,
    "sourceId": "GH0226_ejura"
  },
  {
    "id": "gh-town-ejura-nkwanta-ejura-sekyedumase",
    "name": "Ejura Nkwanta",
    "region": "Ashanti",
    "district": "Ejura-Sekyedumase",
    "districtId": "gh-dist-ejura-sekyedumase",
    "aliases": [],
    "latitude": 7.514,
    "longitude": -1.347,
    "sourceId": "GH0226_ejura-nkwanta"
  },
  {
    "id": "gh-town-homako-ejura-sekyedumase",
    "name": "Homako",
    "region": "Ashanti",
    "district": "Ejura-Sekyedumase",
    "districtId": "gh-dist-ejura-sekyedumase",
    "aliases": [],
    "latitude": 7.429,
    "longitude": -1.451,
    "sourceId": "GH0226_homako"
  },
  {
    "id": "gh-town-kasei-ejura-sekyedumase",
    "name": "Kasei",
    "region": "Ashanti",
    "district": "Ejura-Sekyedumase",
    "districtId": "gh-dist-ejura-sekyedumase",
    "aliases": [],
    "latitude": 7.54,
    "longitude": -1.346,
    "sourceId": "GH0226_kasei"
  },
  {
    "id": "gh-town-kontokori-line-ejura-sekyedumase",
    "name": "Kontokori Line",
    "region": "Ashanti",
    "district": "Ejura-Sekyedumase",
    "districtId": "gh-dist-ejura-sekyedumase",
    "aliases": [],
    "latitude": 7.379,
    "longitude": -1.358,
    "sourceId": "GH0226_kontokori-line"
  },
  {
    "id": "gh-town-zambrama-ejura-sekyedumase",
    "name": "Zambrama",
    "region": "Ashanti",
    "district": "Ejura-Sekyedumase",
    "districtId": "gh-dist-ejura-sekyedumase",
    "aliases": [],
    "latitude": 7.52,
    "longitude": -1.42,
    "sourceId": "GH0226_zambrama"
  },
  {
    "id": "gh-town-adadientam-juaben-municipal",
    "name": "Adadientam",
    "region": "Ashanti",
    "district": "Juaben Municipal",
    "districtId": "gh-dist-juaben-municipal",
    "aliases": [],
    "latitude": 6.714,
    "longitude": -1.428,
    "sourceId": "GH0227_adadientam"
  },
  {
    "id": "gh-town-akyawkrom-juaben-municipal",
    "name": "Akyawkrom",
    "region": "Ashanti",
    "district": "Juaben Municipal",
    "districtId": "gh-dist-juaben-municipal",
    "aliases": [],
    "latitude": 6.733,
    "longitude": -1.461,
    "sourceId": "GH0227_akyawkrom"
  },
  {
    "id": "gh-town-besease-juaben-municipal",
    "name": "Besease",
    "region": "Ashanti",
    "district": "Juaben Municipal",
    "districtId": "gh-dist-juaben-municipal",
    "aliases": [],
    "latitude": 6.721,
    "longitude": -1.45,
    "sourceId": "GH0227_besease"
  },
  {
    "id": "gh-town-hwireso-juaben-municipal",
    "name": "Hwireso",
    "region": "Ashanti",
    "district": "Juaben Municipal",
    "districtId": "gh-dist-juaben-municipal",
    "aliases": [],
    "latitude": 6.675,
    "longitude": -1.382,
    "sourceId": "GH0227_hwireso"
  },
  {
    "id": "gh-town-juaben-juaben-municipal",
    "name": "Juaben",
    "region": "Ashanti",
    "district": "Juaben Municipal",
    "districtId": "gh-dist-juaben-municipal",
    "aliases": [],
    "latitude": 6.816,
    "longitude": -1.414,
    "sourceId": "GH0227_juaben"
  },
  {
    "id": "gh-town-oyoko-juaben-municipal",
    "name": "Oyoko",
    "region": "Ashanti",
    "district": "Juaben Municipal",
    "districtId": "gh-dist-juaben-municipal",
    "aliases": [],
    "latitude": 6.865,
    "longitude": -1.39,
    "sourceId": "GH0227_oyoko"
  },
  {
    "id": "gh-town-abed-pankrono-kumasi-metropolitan",
    "name": "Abed-Pankrono",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.753,
    "longitude": -1.613,
    "sourceId": "GH0228_abed-pankrono"
  },
  {
    "id": "gh-town-aboabo-kumasi-metropolitan",
    "name": "Aboabo",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.7,
    "longitude": -1.599,
    "sourceId": "GH0228_aboabo"
  },
  {
    "id": "gh-town-abrepo-kumasi-metropolitan",
    "name": "Abrepo",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.727,
    "longitude": -1.658,
    "sourceId": "GH0228_abrepo"
  },
  {
    "id": "gh-town-abrepo-junction-kumasi-metropolitan",
    "name": "Abrepo Junction",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.71,
    "longitude": -1.638,
    "sourceId": "GH0228_abrepo-junction"
  },
  {
    "id": "gh-town-adoato-kumasi-metropolitan",
    "name": "Adoato",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.71,
    "longitude": -1.641,
    "sourceId": "GH0228_adoato"
  },
  {
    "id": "gh-town-adukrom-kumasi-metropolitan",
    "name": "Adukrom",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.704,
    "longitude": -1.585,
    "sourceId": "GH0228_adukrom"
  },
  {
    "id": "gh-town-adum",
    "name": "Adum",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [
      "Kumasi Adum"
    ],
    "latitude": 6.81,
    "longitude": -1.639,
    "sourceId": "GH0228_adum"
  },
  {
    "id": "gh-town-afful-nkwanta-kumasi-metropolitan",
    "name": "Afful Nkwanta",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.691,
    "longitude": -1.601,
    "sourceId": "GH0228_afful-nkwanta"
  },
  {
    "id": "gh-town-ahenbronum-tafo-kumasi-metropolitan",
    "name": "Ahenbronum-Tafo",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 9.778,
    "longitude": -1.644,
    "sourceId": "GH0228_ahenbronum-tafo"
  },
  {
    "id": "gh-town-ahinsan-kumasi-metropolitan",
    "name": "Ahinsan",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.671,
    "longitude": -1.589,
    "sourceId": "GH0228_ahinsan"
  },
  {
    "id": "gh-town-ahodwo-kumasi-kumasi-metropolitan",
    "name": "Ahodwo Kumasi",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.653,
    "longitude": -1.619,
    "sourceId": "GH0228_ahodwo-kumasi"
  },
  {
    "id": "gh-town-akrome-kumasi-metropolitan",
    "name": "Akrome",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.698,
    "longitude": -1.594,
    "sourceId": "GH0228_akrome"
  },
  {
    "id": "gh-town-akwatialine-kumasi-metropolitan",
    "name": "Akwatialine",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.695,
    "longitude": -1.607,
    "sourceId": "GH0228_akwatialine"
  },
  {
    "id": "gh-town-akwatialine-zongo-kumasi-metropolitan",
    "name": "Akwatialine Zongo",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.695,
    "longitude": -1.614,
    "sourceId": "GH0228_akwatialine-zongo"
  },
  {
    "id": "gh-town-amakom-kumasi-metropolitan",
    "name": "Amakom",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.69,
    "longitude": -1.61,
    "sourceId": "GH0228_amakom"
  },
  {
    "id": "gh-town-amanfrom-kumasi-metropolitan",
    "name": "Amanfrom",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.755,
    "longitude": -1.684,
    "sourceId": "GH0228_amanfrom"
  },
  {
    "id": "gh-town-amena-kumasi-metropolitan",
    "name": "Amena",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.665,
    "longitude": -1.535,
    "sourceId": "GH0228_amena"
  },
  {
    "id": "gh-town-ampabame-kumasi-metropolitan",
    "name": "Ampabame",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.764,
    "longitude": -1.611,
    "sourceId": "GH0228_ampabame"
  },
  {
    "id": "gh-town-anloga-kumasi-metropolitan",
    "name": "Anloga",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.678,
    "longitude": -1.592,
    "sourceId": "GH0228_anloga"
  },
  {
    "id": "gh-town-anwiam-kumasi-metropolitan",
    "name": "Anwiam",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.694,
    "longitude": -1.547,
    "sourceId": "GH0228_anwiam"
  },
  {
    "id": "gh-town-anwomase-kumasi-metropolitan",
    "name": "Anwomase",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.692,
    "longitude": -1.527,
    "sourceId": "GH0228_anwomase"
  },
  {
    "id": "gh-town-anwomase-bebre-kumasi-metropolitan",
    "name": "Anwomase-Bebre",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.697,
    "longitude": -1.533,
    "sourceId": "GH0228_anwomase-bebre"
  },
  {
    "id": "gh-town-anwomaso-high-tension-kumasi-metropolitan",
    "name": "Anwomaso-High Tension",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.798,
    "longitude": -1.501,
    "sourceId": "GH0228_anwomaso-high-tension"
  },
  {
    "id": "gh-town-apatrapa-kumasi-metropolitan",
    "name": "Apatrapa",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.707,
    "longitude": -1.683,
    "sourceId": "GH0228_apatrapa"
  },
  {
    "id": "gh-town-asawase-kumasi-metropolitan",
    "name": "Asawase",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.706,
    "longitude": -1.605,
    "sourceId": "GH0228_asawase"
  },
  {
    "id": "gh-town-ash-town-kumasi-metropolitan",
    "name": "Ash Town",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.705,
    "longitude": -1.623,
    "sourceId": "GH0228_ash-town"
  },
  {
    "id": "gh-town-ashanti-new-town-kumasi-metropolitan",
    "name": "Ashanti New Town",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.709,
    "longitude": -1.619,
    "sourceId": "GH0228_ashanti-new-town"
  },
  {
    "id": "gh-town-ashanti-town-kumasi-metropolitan",
    "name": "Ashanti Town",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.7,
    "longitude": -1.619,
    "sourceId": "GH0228_ashanti-town"
  },
  {
    "id": "gh-town-asokore-mampong-kumasi-metropolitan",
    "name": "Asokore Mampong",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.788,
    "longitude": -1.561,
    "sourceId": "GH0228_asokore-mampong"
  },
  {
    "id": "gh-town-asokwa-kumasi-metropolitan",
    "name": "Asokwa",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.669,
    "longitude": -1.61,
    "sourceId": "GH0228_asokwa"
  },
  {
    "id": "gh-town-asuogya-kumasi-metropolitan",
    "name": "Asuogya",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.713,
    "longitude": -1.643,
    "sourceId": "GH0228_asuogya"
  },
  {
    "id": "gh-town-asuoyeboa-kumasi-metropolitan",
    "name": "Asuoyeboa",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.692,
    "longitude": -1.669,
    "sourceId": "GH0228_asuoyeboa"
  },
  {
    "id": "gh-town-ataafoa-pankrono-kumasi-metropolitan",
    "name": "Ataafoa-Pankrono",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.75,
    "longitude": -1.618,
    "sourceId": "GH0228_ataafoa-pankrono"
  },
  {
    "id": "gh-town-atafoa-pankrono-kumasi-metropolitan",
    "name": "Atafoa - Pankrono",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.751,
    "longitude": -1.618,
    "sourceId": "GH0228_atafoa---pankrono"
  },
  {
    "id": "gh-town-atasemanso-kumasi-metropolitan",
    "name": "Atasemanso",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.652,
    "longitude": -1.633,
    "sourceId": "GH0228_atasemanso"
  },
  {
    "id": "gh-town-atonsu-kumasi-metropolitan",
    "name": "Atonsu",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.755,
    "longitude": -1.527,
    "sourceId": "GH0228_atonsu"
  },
  {
    "id": "gh-town-atonsu-agogo-kumasi-metropolitan",
    "name": "Atonsu-Agogo",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.653,
    "longitude": -1.585,
    "sourceId": "GH0228_atonsu-agogo"
  },
  {
    "id": "gh-town-atonsu-bokro-kumasi-metropolitan",
    "name": "Atonsu-Bokro",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.644,
    "longitude": -1.592,
    "sourceId": "GH0228_atonsu-bokro"
  },
  {
    "id": "gh-town-ayigya-kumasi-metropolitan",
    "name": "Ayigya",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.687,
    "longitude": -1.573,
    "sourceId": "GH0228_ayigya"
  },
  {
    "id": "gh-town-bantama-kumasi-metropolitan",
    "name": "Bantama",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.705,
    "longitude": -1.636,
    "sourceId": "GH0228_bantama"
  },
  {
    "id": "gh-town-barracks-bantama-kumasi-metropolitan",
    "name": "Barracks-Bantama",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.808,
    "longitude": -1.539,
    "sourceId": "GH0228_barracks-bantama"
  },
  {
    "id": "gh-town-boadi-kumasi-metropolitan",
    "name": "Boadi",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.833,
    "longitude": -1.477,
    "sourceId": "GH0228_boadi"
  },
  {
    "id": "gh-town-bokro-atonsu-kumasi-metropolitan",
    "name": "Bokro-Atonsu",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.648,
    "longitude": -1.591,
    "sourceId": "GH0228_bokro-atonsu"
  },
  {
    "id": "gh-town-bompata-kumasi-metropolitan",
    "name": "Bompata",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.692,
    "longitude": -1.619,
    "sourceId": "GH0228_bompata"
  },
  {
    "id": "gh-town-bomso-kumasi-metropolitan",
    "name": "Bomso",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.685,
    "longitude": -1.579,
    "sourceId": "GH0228_bomso"
  },
  {
    "id": "gh-town-bremang-kumasi-metropolitan",
    "name": "Bremang",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.742,
    "longitude": -1.631,
    "sourceId": "GH0228_bremang"
  },
  {
    "id": "gh-town-bremang-azar-junction-kumasi-metropolitan",
    "name": "Bremang - Azar Junction",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.73,
    "longitude": -1.627,
    "sourceId": "GH0228_bremang---azar-junction"
  },
  {
    "id": "gh-town-bremang-north-kumasi-metropolitan",
    "name": "Bremang North",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.74,
    "longitude": -1.625,
    "sourceId": "GH0228_bremang-north"
  },
  {
    "id": "gh-town-buokrom-kumasi-metropolitan",
    "name": "Buokrom",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.8,
    "longitude": -1.645,
    "sourceId": "GH0228_buokrom"
  },
  {
    "id": "gh-town-buokrom-estate-kumasi-metropolitan",
    "name": "Buokrom Estate",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.74,
    "longitude": -1.596,
    "sourceId": "GH0228_buokrom-estate"
  },
  {
    "id": "gh-town-cocobod-adum-kumasi-metropolitan",
    "name": "Cocobod-Adum",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.684,
    "longitude": -1.617,
    "sourceId": "GH0228_cocobod-adum"
  },
  {
    "id": "gh-town-dichemso-kumasi-metropolitan",
    "name": "Dichemso",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.815,
    "longitude": -1.596,
    "sourceId": "GH0228_dichemso"
  },
  {
    "id": "gh-town-dompoase-kumasi-metropolitan",
    "name": "Dompoase",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.637,
    "longitude": -1.588,
    "sourceId": "GH0228_dompoase"
  },
  {
    "id": "gh-town-dr-mensah-ash-town-kumasi-metropolitan",
    "name": "Dr. Mensah - Ash Town",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.7,
    "longitude": -1.62,
    "sourceId": "GH0228_dr-mensah---ash-town"
  },
  {
    "id": "gh-town-gyinase-kumasi-metropolitan",
    "name": "Gyinase",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.662,
    "longitude": -1.576,
    "sourceId": "GH0228_gyinase"
  },
  {
    "id": "gh-town-kaase-kumasi-metropolitan",
    "name": "Kaase",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.789,
    "longitude": -1.561,
    "sourceId": "GH0228_kaase"
  },
  {
    "id": "gh-town-kentinkrono-kumasi-metropolitan",
    "name": "Kentinkrono",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.697,
    "longitude": -1.552,
    "sourceId": "GH0228_kentinkrono"
  },
  {
    "id": "gh-town-krofrom-kumasi-metropolitan",
    "name": "Krofrom",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.712,
    "longitude": -1.612,
    "sourceId": "GH0228_krofrom"
  },
  {
    "id": "gh-town-kronum-kumasi-metropolitan",
    "name": "Kronum",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.751,
    "longitude": -1.639,
    "sourceId": "GH0228_kronum"
  },
  {
    "id": "gh-town-kropo-kumasi-metropolitan",
    "name": "Kropo",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.718,
    "longitude": -1.642,
    "sourceId": "GH0228_kropo"
  },
  {
    "id": "gh-town-kumasi-kumasi-metropolitan",
    "name": "Kumasi",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.415,
    "longitude": -1.375,
    "sourceId": "GH0228_kumasi"
  },
  {
    "id": "gh-town-kwadaso-kumasi-metropolitan",
    "name": "Kwadaso",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.693,
    "longitude": -1.658,
    "sourceId": "GH0228_kwadaso"
  },
  {
    "id": "gh-town-maakro-kumasi-metropolitan",
    "name": "Maakro",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.84,
    "longitude": -1.554,
    "sourceId": "GH0228_maakro"
  },
  {
    "id": "gh-town-magazine-kumasi-metropolitan",
    "name": "Magazine",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.823,
    "longitude": -1.522,
    "sourceId": "GH0228_magazine"
  },
  {
    "id": "gh-town-makro-kumasi-metropolitan",
    "name": "Makro",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.791,
    "longitude": -1.561,
    "sourceId": "GH0228_makro"
  },
  {
    "id": "gh-town-manhyia-kumasi-metropolitan",
    "name": "Manhyia",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.704,
    "longitude": -1.612,
    "sourceId": "GH0228_manhyia"
  },
  {
    "id": "gh-town-manhyia-zongo-kumasi-metropolitan",
    "name": "Manhyia Zongo",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.7,
    "longitude": -1.614,
    "sourceId": "GH0228_manhyia-zongo"
  },
  {
    "id": "gh-town-mbrom-dichemso-kumasi-metropolitan",
    "name": "Mbrom Dichemso",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.705,
    "longitude": -1.624,
    "sourceId": "GH0228_mbrom-dichemso"
  },
  {
    "id": "gh-town-mile-3-old-tafo-kumasi-metropolitan",
    "name": "Mile 3 Old Tafo",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.727,
    "longitude": -1.615,
    "sourceId": "GH0228_mile-3-old-tafo"
  },
  {
    "id": "gh-town-mile-4-tafo-kumasi-metropolitan",
    "name": "Mile 4 - Tafo",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.742,
    "longitude": -1.613,
    "sourceId": "GH0228_mile-4---tafo"
  },
  {
    "id": "gh-town-mile-4-old-tafo-kumasi-metropolitan",
    "name": "Mile 4- Old Tafo",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.736,
    "longitude": -1.612,
    "sourceId": "GH0228_mile-4--old-tafo"
  },
  {
    "id": "gh-town-moshie-zongo-kumasi-metropolitan",
    "name": "Moshie Zongo",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.725,
    "longitude": -1.601,
    "sourceId": "GH0228_moshie-zongo"
  },
  {
    "id": "gh-town-new-amakom-kumasi-metropolitan",
    "name": "New Amakom",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.682,
    "longitude": -1.599,
    "sourceId": "GH0228_new-amakom"
  },
  {
    "id": "gh-town-new-asokwa-kumasi-metropolitan",
    "name": "New Asokwa",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.678,
    "longitude": -1.602,
    "sourceId": "GH0228_new-asokwa"
  },
  {
    "id": "gh-town-new-suame-kumasi-metropolitan",
    "name": "New Suame",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.716,
    "longitude": -1.634,
    "sourceId": "GH0228_new-suame"
  },
  {
    "id": "gh-town-new-tafo-kumasi-metropolitan",
    "name": "New Tafo",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.716,
    "longitude": -1.616,
    "sourceId": "GH0228_new-tafo"
  },
  {
    "id": "gh-town-nkontwima-bremang-kumasi-metropolitan",
    "name": "Nkontwima-Bremang",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.738,
    "longitude": -1.629,
    "sourceId": "GH0228_nkontwima-bremang"
  },
  {
    "id": "gh-town-north-zong-manhyia-kumasi-metropolitan",
    "name": "North Zong-Manhyia",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.775,
    "longitude": -1.639,
    "sourceId": "GH0228_north-zong-manhyia"
  },
  {
    "id": "gh-town-oduom-kumasi-metropolitan",
    "name": "Oduom",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.696,
    "longitude": -1.542,
    "sourceId": "GH0228_oduom"
  },
  {
    "id": "gh-town-oforikrom-kumasi-metropolitan",
    "name": "Oforikrom",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.69,
    "longitude": -1.593,
    "sourceId": "GH0228_oforikrom"
  },
  {
    "id": "gh-town-old-suame-kumasi-metropolitan",
    "name": "Old Suame",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.716,
    "longitude": -1.63,
    "sourceId": "GH0228_old-suame"
  },
  {
    "id": "gh-town-old-tafo-kumasi-metropolitan",
    "name": "Old Tafo",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.731,
    "longitude": -1.619,
    "sourceId": "GH0228_old-tafo"
  },
  {
    "id": "gh-town-osborn-junction-suame-kumasi-metropolitan",
    "name": "Osborn Junction - Suame",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.732,
    "longitude": -1.63,
    "sourceId": "GH0228_osborn-junction---suame"
  },
  {
    "id": "gh-town-pankrono-kumasi-metropolitan",
    "name": "Pankrono",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.779,
    "longitude": -1.491,
    "sourceId": "GH0228_pankrono"
  },
  {
    "id": "gh-town-pankrono-estate-kumasi-metropolitan",
    "name": "Pankrono Estate",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.741,
    "longitude": -1.605,
    "sourceId": "GH0228_pankrono-estate"
  },
  {
    "id": "gh-town-railways-adum-kumasi-metropolitan",
    "name": "Railways Adum",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.692,
    "longitude": -1.619,
    "sourceId": "GH0228_railways-adum"
  },
  {
    "id": "gh-town-s-line-atonsu-kumasi-metropolitan",
    "name": "S-line Atonsu",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.651,
    "longitude": -1.598,
    "sourceId": "GH0228_s-line-atonsu"
  },
  {
    "id": "gh-town-sawaba-kumasi-metropolitan",
    "name": "Sawaba",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.848,
    "longitude": -1.562,
    "sourceId": "GH0228_sawaba"
  },
  {
    "id": "gh-town-sepe-dote-kumasi-metropolitan",
    "name": "Sepe Dote",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.719,
    "longitude": -1.579,
    "sourceId": "GH0228_sepe-dote"
  },
  {
    "id": "gh-town-sepe-timpon-kumasi-metropolitan",
    "name": "Sepe Timpon",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.816,
    "longitude": -1.477,
    "sourceId": "GH0228_sepe-timpon"
  },
  {
    "id": "gh-town-sepe-tinpom-kumasi-metropolitan",
    "name": "Sepe-Tinpom",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.708,
    "longitude": -1.58,
    "sourceId": "GH0228_sepe-tinpom"
  },
  {
    "id": "gh-town-sokoban-kumasi-metropolitan",
    "name": "Sokoban",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.848,
    "longitude": -1.549,
    "sourceId": "GH0228_sokoban"
  },
  {
    "id": "gh-town-south-suntreso-kumasi-metropolitan",
    "name": "South Suntreso",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.69,
    "longitude": -1.64,
    "sourceId": "GH0228_south-suntreso"
  },
  {
    "id": "gh-town-stadium-kumasi-metropolitan",
    "name": "Stadium",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.68,
    "longitude": -1.604,
    "sourceId": "GH0228_stadium"
  },
  {
    "id": "gh-town-suntreso-kumasi-metropolitan",
    "name": "Suntreso",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.702,
    "longitude": -1.642,
    "sourceId": "GH0228_suntreso"
  },
  {
    "id": "gh-town-susanso-kumasi-metropolitan",
    "name": "Susanso",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.687,
    "longitude": -1.585,
    "sourceId": "GH0228_susanso"
  },
  {
    "id": "gh-town-tafo-kumasi-metropolitan",
    "name": "Tafo",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.726,
    "longitude": -1.613,
    "sourceId": "GH0228_tafo"
  },
  {
    "id": "gh-town-tafo-nhyiaeso-kumasi-metropolitan",
    "name": "Tafo Nhyiaeso",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.719,
    "longitude": -1.612,
    "sourceId": "GH0228_tafo-nhyiaeso"
  },
  {
    "id": "gh-town-tafo-nhyiaso-kumasi-metropolitan",
    "name": "Tafo Nhyiaso",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.718,
    "longitude": -1.612,
    "sourceId": "GH0228_tafo-nhyiaso"
  },
  {
    "id": "gh-town-tafo-zongo-kumasi-metropolitan",
    "name": "Tafo Zongo",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.733,
    "longitude": -1.634,
    "sourceId": "GH0228_tafo-zongo"
  },
  {
    "id": "gh-town-tanoso-kumasi-metropolitan",
    "name": "Tanoso",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.785,
    "longitude": -1.567,
    "sourceId": "GH0228_tanoso"
  },
  {
    "id": "gh-town-ugc-bremang-kumasi-metropolitan",
    "name": "UGC - Bremang",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.75,
    "longitude": -1.631,
    "sourceId": "GH0228_ugc---bremang"
  },
  {
    "id": "gh-town-zone-3-suame-kumasi-metropolitan",
    "name": "Zone 3 Suame",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.72,
    "longitude": -1.629,
    "sourceId": "GH0228_zone-3-suame"
  },
  {
    "id": "gh-town-zone-5-suame-kumasi-metropolitan",
    "name": "Zone 5 - Suame",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.723,
    "longitude": -1.631,
    "sourceId": "GH0228_zone-5---suame"
  },
  {
    "id": "gh-town-zongo-ayigya-kumasi-metropolitan",
    "name": "Zongo-Ayigya",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "districtId": "gh-dist-kumasi-metro",
    "aliases": [],
    "latitude": 6.692,
    "longitude": -1.57,
    "sourceId": "GH0228_zongo-ayigya"
  },
  {
    "id": "gh-town-abira-kwabre-east",
    "name": "Abira",
    "region": "Ashanti",
    "district": "Kwabre East",
    "districtId": "gh-dist-kwabre-east",
    "aliases": [],
    "latitude": 6.779,
    "longitude": -1.491,
    "sourceId": "GH0229_abira"
  },
  {
    "id": "gh-town-abirem-kwabre-east",
    "name": "Abirem",
    "region": "Ashanti",
    "district": "Kwabre East",
    "districtId": "gh-dist-kwabre-east",
    "aliases": [],
    "latitude": 6.751,
    "longitude": -1.542,
    "sourceId": "GH0229_abirem"
  },
  {
    "id": "gh-town-adwumakase-kese-kwabre-east",
    "name": "Adwumakase Kese",
    "region": "Ashanti",
    "district": "Kwabre East",
    "districtId": "gh-dist-kwabre-east",
    "aliases": [],
    "latitude": 6.808,
    "longitude": -1.539,
    "sourceId": "GH0229_adwumakase-kese"
  },
  {
    "id": "gh-town-antoa-kwabre-east",
    "name": "Antoa",
    "region": "Ashanti",
    "district": "Kwabre East",
    "districtId": "gh-dist-kwabre-east",
    "aliases": [],
    "latitude": 6.757,
    "longitude": -1.526,
    "sourceId": "GH0229_antoa"
  },
  {
    "id": "gh-town-asonamaso-kwabre-east",
    "name": "Asonamaso",
    "region": "Ashanti",
    "district": "Kwabre East",
    "districtId": "gh-dist-kwabre-east",
    "aliases": [],
    "latitude": 6.802,
    "longitude": -1.514,
    "sourceId": "GH0229_asonamaso"
  },
  {
    "id": "gh-town-bonwire-kwabre-east",
    "name": "Bonwire",
    "region": "Ashanti",
    "district": "Kwabre East",
    "districtId": "gh-dist-kwabre-east",
    "aliases": [],
    "latitude": 6.793,
    "longitude": -1.472,
    "sourceId": "GH0229_bonwire"
  },
  {
    "id": "gh-town-ejuratia-kwabre-east",
    "name": "Ejuratia",
    "region": "Ashanti",
    "district": "Kwabre East",
    "districtId": "gh-dist-kwabre-east",
    "aliases": [],
    "latitude": 6.823,
    "longitude": -1.522,
    "sourceId": "GH0229_ejuratia"
  },
  {
    "id": "gh-town-kenyasi-kwabre-east",
    "name": "Kenyasi",
    "region": "Ashanti",
    "district": "Kwabre East",
    "districtId": "gh-dist-kwabre-east",
    "aliases": [],
    "latitude": 6.785,
    "longitude": -1.567,
    "sourceId": "GH0229_kenyasi"
  },
  {
    "id": "gh-town-kodie-kwabre-east",
    "name": "Kodie",
    "region": "Ashanti",
    "district": "Kwabre East",
    "districtId": "gh-dist-kwabre-east",
    "aliases": [],
    "latitude": 6.789,
    "longitude": -1.561,
    "sourceId": "GH0229_kodie"
  },
  {
    "id": "gh-town-medoma-kwabre-east",
    "name": "Medoma",
    "region": "Ashanti",
    "district": "Kwabre East",
    "districtId": "gh-dist-kwabre-east",
    "aliases": [],
    "latitude": 6.791,
    "longitude": -1.561,
    "sourceId": "GH0229_medoma"
  },
  {
    "id": "gh-town-mowre-kwabre-east",
    "name": "Mowre",
    "region": "Ashanti",
    "district": "Kwabre East",
    "districtId": "gh-dist-kwabre-east",
    "aliases": [],
    "latitude": 6.816,
    "longitude": -1.477,
    "sourceId": "GH0229_mowre"
  },
  {
    "id": "gh-town-ntonso-kwabre-east",
    "name": "Ntonso",
    "region": "Ashanti",
    "district": "Kwabre East",
    "districtId": "gh-dist-kwabre-east",
    "aliases": [],
    "latitude": 6.755,
    "longitude": -1.527,
    "sourceId": "GH0229_ntonso"
  },
  {
    "id": "gh-town-sakora-wonoo-kwabre-east",
    "name": "Sakora Wonoo",
    "region": "Ashanti",
    "district": "Kwabre East",
    "districtId": "gh-dist-kwabre-east",
    "aliases": [],
    "latitude": 6.798,
    "longitude": -1.501,
    "sourceId": "GH0229_sakora-wonoo"
  },
  {
    "id": "gh-town-tikrom-kwabre-east",
    "name": "Tikrom",
    "region": "Ashanti",
    "district": "Kwabre East",
    "districtId": "gh-dist-kwabre-east",
    "aliases": [],
    "latitude": 6.739,
    "longitude": -1.511,
    "sourceId": "GH0229_tikrom"
  },
  {
    "id": "gh-town-adidwan-mampong-municipal",
    "name": "Adidwan",
    "region": "Ashanti",
    "district": "Mampong Municipal",
    "districtId": "gh-dist-mampong-municipal",
    "aliases": [],
    "latitude": 7.252,
    "longitude": -1.403,
    "sourceId": "GH0231_adidwan"
  },
  {
    "id": "gh-town-anyinasu-mampong-municipal",
    "name": "Anyinasu",
    "region": "Ashanti",
    "district": "Mampong Municipal",
    "districtId": "gh-dist-mampong-municipal",
    "aliases": [],
    "latitude": 7.226,
    "longitude": -1.58,
    "sourceId": "GH0231_anyinasu"
  },
  {
    "id": "gh-town-apaa-mampong-municipal",
    "name": "Apaa",
    "region": "Ashanti",
    "district": "Mampong Municipal",
    "districtId": "gh-dist-mampong-municipal",
    "aliases": [],
    "latitude": 6.955,
    "longitude": -1.435,
    "sourceId": "GH0231_apaa"
  },
  {
    "id": "gh-town-asaam-mampong-municipal",
    "name": "Asaam",
    "region": "Ashanti",
    "district": "Mampong Municipal",
    "districtId": "gh-dist-mampong-municipal",
    "aliases": [],
    "latitude": 7.117,
    "longitude": -1.466,
    "sourceId": "GH0231_asaam"
  },
  {
    "id": "gh-town-benim-mampong-municipal",
    "name": "Benim",
    "region": "Ashanti",
    "district": "Mampong Municipal",
    "districtId": "gh-dist-mampong-municipal",
    "aliases": [],
    "latitude": 7.091,
    "longitude": -1.465,
    "sourceId": "GH0231_benim"
  },
  {
    "id": "gh-town-birem-mampong-municipal",
    "name": "Birem",
    "region": "Ashanti",
    "district": "Mampong Municipal",
    "districtId": "gh-dist-mampong-municipal",
    "aliases": [],
    "latitude": 7.227,
    "longitude": -0.992,
    "sourceId": "GH0231_birem"
  },
  {
    "id": "gh-town-kofiase-mampong-municipal",
    "name": "Kofiase",
    "region": "Ashanti",
    "district": "Mampong Municipal",
    "districtId": "gh-dist-mampong-municipal",
    "aliases": [],
    "latitude": 7.141,
    "longitude": -1.484,
    "sourceId": "GH0231_kofiase"
  },
  {
    "id": "gh-town-krobo-mampong-municipal",
    "name": "Krobo",
    "region": "Ashanti",
    "district": "Mampong Municipal",
    "districtId": "gh-dist-mampong-municipal",
    "aliases": [],
    "latitude": 7.075,
    "longitude": -1.424,
    "sourceId": "GH0231_krobo"
  },
  {
    "id": "gh-town-kumasi-mampong-municipal",
    "name": "Kumasi",
    "region": "Ashanti",
    "district": "Mampong Municipal",
    "districtId": "gh-dist-mampong-municipal",
    "aliases": [],
    "latitude": 7.034,
    "longitude": -1.243,
    "sourceId": "GH0231_kumasi"
  },
  {
    "id": "gh-town-mampong-mampong-municipal",
    "name": "Mampong",
    "region": "Ashanti",
    "district": "Mampong Municipal",
    "districtId": "gh-dist-mampong-municipal",
    "aliases": [],
    "latitude": 7.046,
    "longitude": -1.402,
    "sourceId": "GH0231_mampong"
  },
  {
    "id": "gh-town-mampong-kokoase-mampong-municipal",
    "name": "Mampong Kokoase",
    "region": "Ashanti",
    "district": "Mampong Municipal",
    "districtId": "gh-dist-mampong-municipal",
    "aliases": [],
    "latitude": 7.059,
    "longitude": -1.397,
    "sourceId": "GH0231_mampong-kokoase"
  },
  {
    "id": "gh-town-mampong-new-town-mampong-municipal",
    "name": "Mampong New Town",
    "region": "Ashanti",
    "district": "Mampong Municipal",
    "districtId": "gh-dist-mampong-municipal",
    "aliases": [],
    "latitude": 7.066,
    "longitude": -1.402,
    "sourceId": "GH0231_mampong-new-town"
  },
  {
    "id": "gh-town-aboagye-krom-obuasi-municipal",
    "name": "Aboagye Krom",
    "region": "Ashanti",
    "district": "Obuasi Municipal",
    "districtId": "gh-dist-obuasi-municipal",
    "aliases": [],
    "latitude": 6.191,
    "longitude": -1.65,
    "sourceId": "GH0233_aboagye-krom"
  },
  {
    "id": "gh-town-abompe-new-site-obuasi-municipal",
    "name": "Abompe    New  Site",
    "region": "Ashanti",
    "district": "Obuasi Municipal",
    "districtId": "gh-dist-obuasi-municipal",
    "aliases": [],
    "latitude": 6.219,
    "longitude": -1.671,
    "sourceId": "GH0233_abompe-new-site"
  },
  {
    "id": "gh-town-akaporiso-obuasi-municipal",
    "name": "Akaporiso",
    "region": "Ashanti",
    "district": "Obuasi Municipal",
    "districtId": "gh-dist-obuasi-municipal",
    "aliases": [],
    "latitude": 6.199,
    "longitude": -1.629,
    "sourceId": "GH0233_akaporiso"
  },
  {
    "id": "gh-town-bedieso-obuasi-obuasi-municipal",
    "name": "Bedieso-Obuasi",
    "region": "Ashanti",
    "district": "Obuasi Municipal",
    "districtId": "gh-dist-obuasi-municipal",
    "aliases": [],
    "latitude": 6.207,
    "longitude": -1.681,
    "sourceId": "GH0233_bedieso-obuasi"
  },
  {
    "id": "gh-town-boete-obuasi-municipal",
    "name": "Boete",
    "region": "Ashanti",
    "district": "Obuasi Municipal",
    "districtId": "gh-dist-obuasi-municipal",
    "aliases": [],
    "latitude": 6.113,
    "longitude": -1.384,
    "sourceId": "GH0233_boete"
  },
  {
    "id": "gh-town-brahabebome-obuasi-municipal",
    "name": "Brahabebome",
    "region": "Ashanti",
    "district": "Obuasi Municipal",
    "districtId": "gh-dist-obuasi-municipal",
    "aliases": [],
    "latitude": 6.193,
    "longitude": -1.625,
    "sourceId": "GH0233_brahabebome"
  },
  {
    "id": "gh-town-brahabebome-new-site-obuasi-municipal",
    "name": "Brahabebome New Site",
    "region": "Ashanti",
    "district": "Obuasi Municipal",
    "districtId": "gh-dist-obuasi-municipal",
    "aliases": [],
    "latitude": 6.194,
    "longitude": -1.63,
    "sourceId": "GH0233_brahabebome-new-site"
  },
  {
    "id": "gh-town-estate-extension-obuasi-municipal",
    "name": "Estate Extension",
    "region": "Ashanti",
    "district": "Obuasi Municipal",
    "districtId": "gh-dist-obuasi-municipal",
    "aliases": [],
    "latitude": 6.206,
    "longitude": -1.67,
    "sourceId": "GH0233_estate-extension"
  },
  {
    "id": "gh-town-gausu-obuasi-municipal",
    "name": "Gausu",
    "region": "Ashanti",
    "district": "Obuasi Municipal",
    "districtId": "gh-dist-obuasi-municipal",
    "aliases": [],
    "latitude": 6.199,
    "longitude": -1.682,
    "sourceId": "GH0233_gausu"
  },
  {
    "id": "gh-town-kofi-krom-obuasi-municipal",
    "name": "Kofi Krom",
    "region": "Ashanti",
    "district": "Obuasi Municipal",
    "districtId": "gh-dist-obuasi-municipal",
    "aliases": [],
    "latitude": 6.196,
    "longitude": -1.68,
    "sourceId": "GH0233_kofi-krom"
  },
  {
    "id": "gh-town-kwabrafoso-obuasi-municipal",
    "name": "Kwabrafoso",
    "region": "Ashanti",
    "district": "Obuasi Municipal",
    "districtId": "gh-dist-obuasi-municipal",
    "aliases": [],
    "latitude": 6.199,
    "longitude": -1.656,
    "sourceId": "GH0233_kwabrafoso"
  },
  {
    "id": "gh-town-new-estate-obuasi-obuasi-municipal",
    "name": "New  Estate-Obuasi",
    "region": "Ashanti",
    "district": "Obuasi Municipal",
    "districtId": "gh-dist-obuasi-municipal",
    "aliases": [],
    "latitude": 6.209,
    "longitude": -1.671,
    "sourceId": "GH0233_new-estate-obuasi"
  },
  {
    "id": "gh-town-obuasi-obuasi-municipal",
    "name": "Obuasi",
    "region": "Ashanti",
    "district": "Obuasi Municipal",
    "districtId": "gh-dist-obuasi-municipal",
    "aliases": [],
    "latitude": 6.121,
    "longitude": -1.411,
    "sourceId": "GH0233_obuasi"
  },
  {
    "id": "gh-town-obuasi-stadium-obuasi-municipal",
    "name": "Obuasi - Stadium",
    "region": "Ashanti",
    "district": "Obuasi Municipal",
    "districtId": "gh-dist-obuasi-municipal",
    "aliases": [],
    "latitude": 6.206,
    "longitude": -1.684,
    "sourceId": "GH0233_obuasi---stadium"
  },
  {
    "id": "gh-town-obuasi-central-obuasi-municipal",
    "name": "Obuasi Central",
    "region": "Ashanti",
    "district": "Obuasi Municipal",
    "districtId": "gh-dist-obuasi-municipal",
    "aliases": [],
    "latitude": 6.203,
    "longitude": -1.668,
    "sourceId": "GH0233_obuasi-central"
  },
  {
    "id": "gh-town-obuasi-anyinam-obuasi-municipal",
    "name": "Obuasi-Anyinam",
    "region": "Ashanti",
    "district": "Obuasi Municipal",
    "districtId": "gh-dist-obuasi-municipal",
    "aliases": [],
    "latitude": 6.199,
    "longitude": -1.682,
    "sourceId": "GH0233_obuasi-anyinam"
  },
  {
    "id": "gh-town-rams-hill-obuasi-municipal",
    "name": "Rams Hill",
    "region": "Ashanti",
    "district": "Obuasi Municipal",
    "districtId": "gh-dist-obuasi-municipal",
    "aliases": [],
    "latitude": 6.201,
    "longitude": -1.664,
    "sourceId": "GH0233_rams-hill"
  },
  {
    "id": "gh-town-abofour-offinso-municipal",
    "name": "Abofour",
    "region": "Ashanti",
    "district": "Offinso Municipal",
    "districtId": "gh-dist-offinso-municipal",
    "aliases": [],
    "latitude": 7.075,
    "longitude": -1.436,
    "sourceId": "GH0234_abofour"
  },
  {
    "id": "gh-town-amoawi-offinso-municipal",
    "name": "Amoawi",
    "region": "Ashanti",
    "district": "Offinso Municipal",
    "districtId": "gh-dist-offinso-municipal",
    "aliases": [],
    "latitude": 6.572,
    "longitude": -1.412,
    "sourceId": "GH0234_amoawi"
  },
  {
    "id": "gh-town-anyinasuso-offinso-municipal",
    "name": "Anyinasuso",
    "region": "Ashanti",
    "district": "Offinso Municipal",
    "districtId": "gh-dist-offinso-municipal",
    "aliases": [],
    "latitude": 7.01,
    "longitude": -1.423,
    "sourceId": "GH0234_anyinasuso"
  },
  {
    "id": "gh-town-bonsua-offinso-municipal",
    "name": "Bonsua",
    "region": "Ashanti",
    "district": "Offinso Municipal",
    "districtId": "gh-dist-offinso-municipal",
    "aliases": [],
    "latitude": 6.935,
    "longitude": -1.676,
    "sourceId": "GH0234_bonsua"
  },
  {
    "id": "gh-town-brofoyedru-offinso-municipal",
    "name": "Brofoyedru",
    "region": "Ashanti",
    "district": "Offinso Municipal",
    "districtId": "gh-dist-offinso-municipal",
    "aliases": [],
    "latitude": 6.563,
    "longitude": -1.403,
    "sourceId": "GH0234_brofoyedru"
  },
  {
    "id": "gh-town-kokoben-offinso-municipal",
    "name": "Kokoben",
    "region": "Ashanti",
    "district": "Offinso Municipal",
    "districtId": "gh-dist-offinso-municipal",
    "aliases": [],
    "latitude": 7.021,
    "longitude": -1.464,
    "sourceId": "GH0234_kokoben"
  },
  {
    "id": "gh-town-offinso-offinso-municipal",
    "name": "Offinso",
    "region": "Ashanti",
    "district": "Offinso Municipal",
    "districtId": "gh-dist-offinso-municipal",
    "aliases": [],
    "latitude": 6.938,
    "longitude": -1.675,
    "sourceId": "GH0234_offinso"
  },
  {
    "id": "gh-town-offinso-adikuro-offinso-municipal",
    "name": "Offinso Adikuro",
    "region": "Ashanti",
    "district": "Offinso Municipal",
    "districtId": "gh-dist-offinso-municipal",
    "aliases": [],
    "latitude": 6.95,
    "longitude": -1.673,
    "sourceId": "GH0234_offinso-adikuro"
  },
  {
    "id": "gh-town-aboffour-offinso-north",
    "name": "Aboffour",
    "region": "Ashanti",
    "district": "Offinso North",
    "districtId": "gh-dist-offinso-north",
    "aliases": [],
    "latitude": 7.13,
    "longitude": -1.733,
    "sourceId": "GH0235_aboffour"
  },
  {
    "id": "gh-town-afrancho-offinso-north",
    "name": "Afrancho",
    "region": "Ashanti",
    "district": "Offinso North",
    "districtId": "gh-dist-offinso-north",
    "aliases": [],
    "latitude": 7.408,
    "longitude": -1.963,
    "sourceId": "GH0235_afrancho"
  },
  {
    "id": "gh-town-akomadan-offinso-north",
    "name": "Akomadan",
    "region": "Ashanti",
    "district": "Offinso North",
    "districtId": "gh-dist-offinso-north",
    "aliases": [],
    "latitude": 7.397,
    "longitude": -1.953,
    "sourceId": "GH0235_akomadan"
  },
  {
    "id": "gh-town-akomadan-zongo-offinso-north",
    "name": "Akomadan zongo",
    "region": "Ashanti",
    "district": "Offinso North",
    "districtId": "gh-dist-offinso-north",
    "aliases": [],
    "latitude": 7.406,
    "longitude": -1.961,
    "sourceId": "GH0235_akomadan-zongo"
  },
  {
    "id": "gh-town-anyinasusu-offinso-north",
    "name": "Anyinasusu",
    "region": "Ashanti",
    "district": "Offinso North",
    "districtId": "gh-dist-offinso-north",
    "aliases": [],
    "latitude": 7.015,
    "longitude": -1.709,
    "sourceId": "GH0235_anyinasusu"
  },
  {
    "id": "gh-town-nkenkasu-offinso-north",
    "name": "Nkenkasu",
    "region": "Ashanti",
    "district": "Offinso North",
    "districtId": "gh-dist-offinso-north",
    "aliases": [],
    "latitude": 7.32,
    "longitude": -1.903,
    "sourceId": "GH0235_nkenkasu"
  },
  {
    "id": "gh-town-apromase-oforikrom-municipal",
    "name": "Apromase",
    "region": "Ashanti",
    "district": "Oforikrom Municipal",
    "districtId": "gh-dist-oforikrom-municipal",
    "aliases": [],
    "latitude": 6.671,
    "longitude": -1.495,
    "sourceId": "GH0236_apromase"
  },
  {
    "id": "gh-town-donyina-oforikrom-municipal",
    "name": "Donyina",
    "region": "Ashanti",
    "district": "Oforikrom Municipal",
    "districtId": "gh-dist-oforikrom-municipal",
    "aliases": [],
    "latitude": 6.64,
    "longitude": -1.498,
    "sourceId": "GH0236_donyina"
  },
  {
    "id": "gh-town-ejisu-oforikrom-municipal",
    "name": "Ejisu",
    "region": "Ashanti",
    "district": "Oforikrom Municipal",
    "districtId": "gh-dist-oforikrom-municipal",
    "aliases": [],
    "latitude": 6.721,
    "longitude": -1.47,
    "sourceId": "GH0236_ejisu"
  },
  {
    "id": "gh-town-essienimpong-oforikrom-municipal",
    "name": "Essienimpong",
    "region": "Ashanti",
    "district": "Oforikrom Municipal",
    "districtId": "gh-dist-oforikrom-municipal",
    "aliases": [],
    "latitude": 6.661,
    "longitude": -1.45,
    "sourceId": "GH0236_essienimpong"
  },
  {
    "id": "gh-town-krapa-ejisu-oforikrom-municipal",
    "name": "Krapa-Ejisu",
    "region": "Ashanti",
    "district": "Oforikrom Municipal",
    "districtId": "gh-dist-oforikrom-municipal",
    "aliases": [],
    "latitude": 6.72,
    "longitude": -1.481,
    "sourceId": "GH0236_krapa-ejisu"
  },
  {
    "id": "gh-town-kwamo-oforikrom-municipal",
    "name": "Kwamo",
    "region": "Ashanti",
    "district": "Oforikrom Municipal",
    "districtId": "gh-dist-oforikrom-municipal",
    "aliases": [],
    "latitude": 6.721,
    "longitude": -1.493,
    "sourceId": "GH0236_kwamo"
  },
  {
    "id": "gh-town-onwe-oforikrom-municipal",
    "name": "Onwe",
    "region": "Ashanti",
    "district": "Oforikrom Municipal",
    "districtId": "gh-dist-oforikrom-municipal",
    "aliases": [],
    "latitude": 6.68,
    "longitude": -1.542,
    "sourceId": "GH0236_onwe"
  },
  {
    "id": "gh-town-serwaa-akura-oforikrom-municipal",
    "name": "Serwaa Akura",
    "region": "Ashanti",
    "district": "Oforikrom Municipal",
    "districtId": "gh-dist-oforikrom-municipal",
    "aliases": [],
    "latitude": 6.723,
    "longitude": -1.479,
    "sourceId": "GH0236_serwaa-akura"
  },
  {
    "id": "gh-town-ahwiaa-old-tafo-municipal",
    "name": "Ahwiaa",
    "region": "Ashanti",
    "district": "Old Tafo Municipal",
    "districtId": "gh-dist-old-tafo-municipal",
    "aliases": [],
    "latitude": 6.758,
    "longitude": -1.567,
    "sourceId": "GH0237_ahwiaa"
  },
  {
    "id": "gh-town-atimatim-old-tafo-municipal",
    "name": "Atimatim",
    "region": "Ashanti",
    "district": "Old Tafo Municipal",
    "districtId": "gh-dist-old-tafo-municipal",
    "aliases": [],
    "latitude": 6.764,
    "longitude": -1.611,
    "sourceId": "GH0237_atimatim"
  },
  {
    "id": "gh-town-anyinofi-sekyere-afram-plains-nor",
    "name": "Anyinofi",
    "region": "Ashanti",
    "district": "Sekyere Afram Plains North",
    "districtId": "gh-dist-sekyere-afram-plains-north",
    "aliases": [],
    "latitude": 7.425,
    "longitude": -0.77,
    "sourceId": "GH0238_anyinofi"
  },
  {
    "id": "gh-town-aframso-no-3-sekyere-central",
    "name": "Aframso No.3",
    "region": "Ashanti",
    "district": "Sekyere Central",
    "districtId": "gh-dist-sekyere-central",
    "aliases": [],
    "latitude": 7.145,
    "longitude": -1.122,
    "sourceId": "GH0239_aframso-no3"
  },
  {
    "id": "gh-town-asubuasu-sekyere-central",
    "name": "Asubuasu",
    "region": "Ashanti",
    "district": "Sekyere Central",
    "districtId": "gh-dist-sekyere-central",
    "aliases": [],
    "latitude": 7.316,
    "longitude": -1.235,
    "sourceId": "GH0239_asubuasu"
  },
  {
    "id": "gh-town-atonsu-sekyere-central",
    "name": "Atonsu",
    "region": "Ashanti",
    "district": "Sekyere Central",
    "districtId": "gh-dist-sekyere-central",
    "aliases": [],
    "latitude": 7.024,
    "longitude": -1.309,
    "sourceId": "GH0239_atonsu"
  },
  {
    "id": "gh-town-beposo-sekyere-central",
    "name": "Beposo",
    "region": "Ashanti",
    "district": "Sekyere Central",
    "districtId": "gh-dist-sekyere-central",
    "aliases": [],
    "latitude": 6.985,
    "longitude": -1.355,
    "sourceId": "GH0239_beposo"
  },
  {
    "id": "gh-town-isaaka-akura-afram-plains-sekyere-central",
    "name": "Isaaka Akura-Afram  Plains",
    "region": "Ashanti",
    "district": "Sekyere Central",
    "districtId": "gh-dist-sekyere-central",
    "aliases": [],
    "latitude": 7.415,
    "longitude": -1.138,
    "sourceId": "GH0239_isaaka-akura-afram-plains"
  },
  {
    "id": "gh-town-jeduako-sekyere-central",
    "name": "Jeduako",
    "region": "Ashanti",
    "district": "Sekyere Central",
    "districtId": "gh-dist-sekyere-central",
    "aliases": [],
    "latitude": 7.095,
    "longitude": -1.209,
    "sourceId": "GH0239_jeduako"
  },
  {
    "id": "gh-town-kwamang-sekyere-central",
    "name": "Kwamang",
    "region": "Ashanti",
    "district": "Sekyere Central",
    "districtId": "gh-dist-sekyere-central",
    "aliases": [],
    "latitude": 6.982,
    "longitude": -1.27,
    "sourceId": "GH0239_kwamang"
  },
  {
    "id": "gh-town-nsuta-sekyere-central",
    "name": "Nsuta",
    "region": "Ashanti",
    "district": "Sekyere Central",
    "districtId": "gh-dist-sekyere-central",
    "aliases": [],
    "latitude": 7.008,
    "longitude": -1.376,
    "sourceId": "GH0239_nsuta"
  },
  {
    "id": "gh-town-oku-sekyere-central",
    "name": "Oku",
    "region": "Ashanti",
    "district": "Sekyere Central",
    "districtId": "gh-dist-sekyere-central",
    "aliases": [],
    "latitude": 7.348,
    "longitude": -1.003,
    "sourceId": "GH0239_oku"
  },
  {
    "id": "gh-town-akokuaso-sekyere-east",
    "name": "Akokuaso",
    "region": "Ashanti",
    "district": "Sekyere East",
    "districtId": "gh-dist-sekyere-east",
    "aliases": [],
    "latitude": 6.854,
    "longitude": -1.336,
    "sourceId": "GH0240_akokuaso"
  },
  {
    "id": "gh-town-banko-sekyere-east",
    "name": "Banko",
    "region": "Ashanti",
    "district": "Sekyere East",
    "districtId": "gh-dist-sekyere-east",
    "aliases": [],
    "latitude": 6.758,
    "longitude": -1.285,
    "sourceId": "GH0240_banko"
  },
  {
    "id": "gh-town-dadiase-sekyere-east",
    "name": "Dadiase",
    "region": "Ashanti",
    "district": "Sekyere East",
    "districtId": "gh-dist-sekyere-east",
    "aliases": [],
    "latitude": 6.881,
    "longitude": -1.368,
    "sourceId": "GH0240_dadiase"
  },
  {
    "id": "gh-town-effiduase-sekyere-east",
    "name": "Effiduase",
    "region": "Ashanti",
    "district": "Sekyere East",
    "districtId": "gh-dist-sekyere-east",
    "aliases": [],
    "latitude": 6.845,
    "longitude": -1.384,
    "sourceId": "GH0240_effiduase"
  },
  {
    "id": "gh-town-okaikrom-sekyere-east",
    "name": "Okaikrom",
    "region": "Ashanti",
    "district": "Sekyere East",
    "districtId": "gh-dist-sekyere-east",
    "aliases": [],
    "latitude": 6.826,
    "longitude": -1.309,
    "sourceId": "GH0240_okaikrom"
  },
  {
    "id": "gh-town-sekyere-sekyere-east",
    "name": "Sekyere",
    "region": "Ashanti",
    "district": "Sekyere East",
    "districtId": "gh-dist-sekyere-east",
    "aliases": [],
    "latitude": 6.927,
    "longitude": -1.375,
    "sourceId": "GH0240_sekyere"
  },
  {
    "id": "gh-town-seniagya-sekyere-east",
    "name": "Seniagya",
    "region": "Ashanti",
    "district": "Sekyere East",
    "districtId": "gh-dist-sekyere-east",
    "aliases": [],
    "latitude": 6.798,
    "longitude": -1.32,
    "sourceId": "GH0240_seniagya"
  },
  {
    "id": "gh-town-senkyi-sekyere-east",
    "name": "Senkyi",
    "region": "Ashanti",
    "district": "Sekyere East",
    "districtId": "gh-dist-sekyere-east",
    "aliases": [],
    "latitude": 6.808,
    "longitude": -1.325,
    "sourceId": "GH0240_senkyi"
  },
  {
    "id": "gh-town-drobonso-sekyere-kumawu",
    "name": "Drobonso",
    "region": "Ashanti",
    "district": "Sekyere Kumawu",
    "districtId": "gh-dist-sekyere-kumawu",
    "aliases": [],
    "latitude": 7.007,
    "longitude": -1.127,
    "sourceId": "GH0241_drobonso"
  },
  {
    "id": "gh-town-kumawu-sekyere-kumawu",
    "name": "Kumawu",
    "region": "Ashanti",
    "district": "Sekyere Kumawu",
    "districtId": "gh-dist-sekyere-kumawu",
    "aliases": [],
    "latitude": 6.907,
    "longitude": -1.268,
    "sourceId": "GH0241_kumawu"
  },
  {
    "id": "gh-town-kumawu-bodomasi-sekyere-kumawu",
    "name": "Kumawu Bodomasi",
    "region": "Ashanti",
    "district": "Sekyere Kumawu",
    "districtId": "gh-dist-sekyere-kumawu",
    "aliases": [],
    "latitude": 6.894,
    "longitude": -1.255,
    "sourceId": "GH0241_kumawu-bodomasi"
  },
  {
    "id": "gh-town-woraso-sekyere-kumawu",
    "name": "Woraso",
    "region": "Ashanti",
    "district": "Sekyere Kumawu",
    "districtId": "gh-dist-sekyere-kumawu",
    "aliases": [],
    "latitude": 6.876,
    "longitude": -1.277,
    "sourceId": "GH0241_woraso"
  },
  {
    "id": "gh-town-afamaso-sekyere-south",
    "name": "Afamaso",
    "region": "Ashanti",
    "district": "Sekyere South",
    "districtId": "gh-dist-sekyere-south",
    "aliases": [],
    "latitude": 6.949,
    "longitude": -1.509,
    "sourceId": "GH0242_afamaso"
  },
  {
    "id": "gh-town-agona-sekyere-south",
    "name": "Agona",
    "region": "Ashanti",
    "district": "Sekyere South",
    "districtId": "gh-dist-sekyere-south",
    "aliases": [],
    "latitude": 6.936,
    "longitude": -1.498,
    "sourceId": "GH0242_agona"
  },
  {
    "id": "gh-town-asamang-sekyere-south",
    "name": "Asamang",
    "region": "Ashanti",
    "district": "Sekyere South",
    "districtId": "gh-dist-sekyere-south",
    "aliases": [],
    "latitude": 7.053,
    "longitude": -1.51,
    "sourceId": "GH0242_asamang"
  },
  {
    "id": "gh-town-bepoase-sekyere-south",
    "name": "Bepoase",
    "region": "Ashanti",
    "district": "Sekyere South",
    "districtId": "gh-dist-sekyere-south",
    "aliases": [],
    "latitude": 7.087,
    "longitude": -1.555,
    "sourceId": "GH0242_bepoase"
  },
  {
    "id": "gh-town-boanim-sekyere-south",
    "name": "Boanim",
    "region": "Ashanti",
    "district": "Sekyere South",
    "districtId": "gh-dist-sekyere-south",
    "aliases": [],
    "latitude": 7.035,
    "longitude": -1.487,
    "sourceId": "GH0242_boanim"
  },
  {
    "id": "gh-town-domeabra-sekyere-south",
    "name": "Domeabra",
    "region": "Ashanti",
    "district": "Sekyere South",
    "districtId": "gh-dist-sekyere-south",
    "aliases": [],
    "latitude": 6.939,
    "longitude": -1.558,
    "sourceId": "GH0242_domeabra"
  },
  {
    "id": "gh-town-jamasi-sekyere-south",
    "name": "Jamasi",
    "region": "Ashanti",
    "district": "Sekyere South",
    "districtId": "gh-dist-sekyere-south",
    "aliases": [],
    "latitude": 6.978,
    "longitude": -1.473,
    "sourceId": "GH0242_jamasi"
  },
  {
    "id": "gh-town-kona-sekyere-south",
    "name": "Kona",
    "region": "Ashanti",
    "district": "Sekyere South",
    "districtId": "gh-dist-sekyere-south",
    "aliases": [],
    "latitude": 6.868,
    "longitude": -1.512,
    "sourceId": "GH0242_kona"
  },
  {
    "id": "gh-town-wiamoase-sekyere-south",
    "name": "Wiamoase",
    "region": "Ashanti",
    "district": "Sekyere South",
    "districtId": "gh-dist-sekyere-south",
    "aliases": [],
    "latitude": 7.052,
    "longitude": -1.525,
    "sourceId": "GH0242_wiamoase"
  },
  {
    "id": "gh-town-wiamose-sekyere-south",
    "name": "Wiamose",
    "region": "Ashanti",
    "district": "Sekyere South",
    "districtId": "gh-dist-sekyere-south",
    "aliases": [],
    "latitude": 6.903,
    "longitude": -1.433,
    "sourceId": "GH0242_wiamose"
  },
  {
    "id": "gh-town-bronkong-suame-municipal",
    "name": "Bronkong",
    "region": "Ashanti",
    "district": "Suame Municipal",
    "districtId": "gh-dist-suame-municipal",
    "aliases": [],
    "latitude": 6.775,
    "longitude": -1.639,
    "sourceId": "GH0243_bronkong"
  }
];

export const ASHANTI_CATALOGUE_LANDMARKS: readonly AshantiCatalogueLandmark[] = [
  {
    "id": "gh-town-knust",
    "name": "KNUST",
    "category": "university",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "town": "KNUST",
    "aliases": [
      "Kwame Nkrumah University",
      "Kwame Nkrumah University of Science and Technology",
      "Tech",
      "Kumasi Tech"
    ],
    "latitude": 6.6745,
    "longitude": -1.5716
  },
  {
    "id": "gh-lm-kumasi-airport",
    "name": "Kumasi Airport",
    "category": "airport",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "town": "Kumasi",
    "aliases": [
      "KSI Airport"
    ],
    "latitude": 6.7146,
    "longitude": -1.591
  },
  {
    "id": "gh-lm-komfo-anokye",
    "name": "Komfo Anokye Teaching Hospital",
    "category": "hospital",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "town": "Bantama",
    "aliases": [
      "KATH",
      "Komfo Anokye"
    ],
    "latitude": 6.697,
    "longitude": -1.63
  },
  {
    "id": "gh-lm-kejetia",
    "name": "Kejetia Market",
    "category": "market",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "town": "Adum",
    "aliases": [
      "Kejetia",
      "Kumasi Central Market"
    ],
    "latitude": 6.695,
    "longitude": -1.624
  },
  {
    "id": "gh-lm-baba-yara",
    "name": "Baba Yara Stadium",
    "category": "stadium",
    "region": "Ashanti",
    "district": "Kumasi Metropolitan",
    "town": "Asokwa",
    "aliases": [
      "Kumasi Sports Stadium"
    ],
    "latitude": 6.67,
    "longitude": -1.605
  }
];

export const ASHANTI_ALIASES: readonly AshantiAlias[] = [
  {
    "alias": "KNUST",
    "target_id": "gh-town-knust"
  },
  {
    "alias": "Tech",
    "target_id": "gh-town-knust"
  },
  {
    "alias": "Kumasi Tech",
    "target_id": "gh-town-knust"
  },
  {
    "alias": "Kwame Nkrumah University",
    "target_id": "gh-town-knust"
  },
  {
    "alias": "Kwame Nkrumah University of Science and Technology",
    "target_id": "gh-town-knust"
  },
  {
    "alias": "Kejetia",
    "target_id": "gh-lm-kejetia"
  },
  {
    "alias": "KMA",
    "target_id": "gh-dist-kumasi-metro"
  }
];
