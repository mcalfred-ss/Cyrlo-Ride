import {
  Map as MapLibreMap,
  NavigationControl,
  type GeoJSONSource,
  type MapLayerMouseEvent,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { AdminServiceZone } from '../../api/types';
import {
  ASHANTI_BOUNDS,
  zoneBounds,
  zonesToFeatureCollection,
  type ZoneFeatureProperties,
} from './zoneMapHelpers';

type GeoJsonData = Parameters<GeoJSONSource['setData']>[0];

const SOURCE_ID = 'ashanti-zones';
const FILL_LAYER = 'ashanti-zones-fill';
const LINE_LAYER = 'ashanti-zones-line';

/** Free raster basemap (Carto Positron / OSM data). No API token required. */
const BASEMAP_STYLE = {
  version: 8 as const,
  sources: {
    basemap: {
      type: 'raster' as const,
      tiles: [
        'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
        'https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
        'https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    },
  },
  layers: [{ id: 'basemap', type: 'raster' as const, source: 'basemap' }],
};

export interface ZoneMapProps {
  zones: readonly AdminServiceZone[];
  selectedId: string | null;
  onSelect: (zoneId: string | null) => void;
  /** Called when the pointer enters/leaves a district (keeps the directory list highlight in sync). */
  onHover?: (zoneId: string | null) => void;
  /** Zone currently hovered in the directory list (highlighted on the map). */
  hoveredId?: string | null;
}

interface Tooltip {
  name: string;
  x: number;
  y: number;
}

export function ZoneMap({ zones, selectedId, onSelect, onHover, hoveredId = null }: ZoneMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [ready, setReady] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  const [basemapIssue, setBasemapIssue] = useState(false);
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);

  const onSelectRef = useRef(onSelect);
  const onHoverRef = useRef(onHover);
  const mapHoverId = useRef<string | null>(null);
  const appliedState = useRef<{ selected: string | null; hovered: string | null }>({
    selected: null,
    hovered: null,
  });
  /** Zone id selected by clicking the map itself; skips re-fitting the camera for it. */
  const skipFitFor = useRef<string | null>(null);
  useEffect(() => {
    onSelectRef.current = onSelect;
    onHoverRef.current = onHover;
  });

  const collection = useMemo(() => zonesToFeatureCollection(zones), [zones]);
  const collectionRef = useRef(collection);
  collectionRef.current = collection;

  // Create the map once.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let map: MapLibreMap;
    try {
      map = new MapLibreMap({
        container,
        style: BASEMAP_STYLE,
        bounds: [ASHANTI_BOUNDS[0], ASHANTI_BOUNDS[1], ASHANTI_BOUNDS[2], ASHANTI_BOUNDS[3]],
        fitBoundsOptions: { padding: 24 },
        attributionControl: { compact: true },
      });
    } catch {
      setMapFailed(true);
      return;
    }
    mapRef.current = map;
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right');

    map.on('error', () => setBasemapIssue(true));
    map.on('load', () => {
      map.addSource(SOURCE_ID, {
        type: 'geojson',
        data: collectionRef.current as unknown as GeoJsonData,
        promoteId: 'zoneId',
      });
      map.addLayer({
        id: FILL_LAYER,
        type: 'fill',
        source: SOURCE_ID,
        paint: {
          'fill-color': ['get', 'fill'],
          'fill-opacity': [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            0.7,
            ['boolean', ['feature-state', 'hover'], false],
            0.55,
            0.33,
          ],
        },
      });
      map.addLayer({
        id: LINE_LAYER,
        type: 'line',
        source: SOURCE_ID,
        paint: {
          'line-color': ['get', 'stroke'],
          'line-width': [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            3.5,
            ['boolean', ['feature-state', 'hover'], false],
            2.5,
            1.25,
          ],
        },
      });

      map.on('mousemove', FILL_LAYER, (e: MapLayerMouseEvent) => {
        const props = e.features?.[0]?.properties as ZoneFeatureProperties | undefined;
        if (!props) return;
        map.getCanvas().style.cursor = 'pointer';
        setTooltip({ name: props.name, x: e.point.x, y: e.point.y });
        if (mapHoverId.current !== props.zoneId) {
          mapHoverId.current = props.zoneId;
          onHoverRef.current?.(props.zoneId);
        }
      });
      map.on('mouseleave', FILL_LAYER, () => {
        map.getCanvas().style.cursor = '';
        setTooltip(null);
        mapHoverId.current = null;
        onHoverRef.current?.(null);
      });
      map.on('click', FILL_LAYER, (e: MapLayerMouseEvent) => {
        const props = e.features?.[0]?.properties as ZoneFeatureProperties | undefined;
        if (!props) return;
        skipFitFor.current = props.zoneId;
        onSelectRef.current(props.zoneId);
      });
      setReady(true);
    });

    return () => {
      setReady(false);
      mapRef.current = null;
      appliedState.current = { selected: null, hovered: null };
      map.remove();
    };
  }, []);

  // Push zone data.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
    source?.setData(collection as unknown as GeoJsonData);
    // Feature state is keyed by feature id; re-apply after data swaps.
    appliedState.current = { selected: null, hovered: null };
  }, [collection, ready]);

  // Selected + hovered feature state.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const prev = appliedState.current;
    const set = (id: string | null, key: 'selected' | 'hover', value: boolean) => {
      if (id) map.setFeatureState({ source: SOURCE_ID, id }, { [key]: value });
    };
    if (prev.selected !== selectedId) set(prev.selected, 'selected', false);
    if (prev.hovered !== hoveredId) set(prev.hovered, 'hover', false);
    set(selectedId, 'selected', true);
    set(hoveredId, 'hover', true);
    appliedState.current = { selected: selectedId, hovered: hoveredId };
  }, [selectedId, hoveredId, ready, collection]);

  // Fit the camera to a zone chosen from the list.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !selectedId) return;
    if (skipFitFor.current === selectedId) {
      skipFitFor.current = null;
      return;
    }
    const zone = zones.find((z) => z.id === selectedId);
    const bounds = zone ? zoneBounds(zone) : null;
    if (bounds) {
      map.fitBounds(bounds, { padding: 60, maxZoom: 12, duration: 500 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to selection changes
  }, [selectedId, ready]);

  if (mapFailed) {
    return (
      <div
        className="flex h-full min-h-[320px] items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-center text-sm text-[var(--color-muted)]"
        data-testid="ashanti-map-unavailable"
      >
        The interactive map could not start in this browser (WebGL may be unavailable). Use the
        district list to review zones.
      </div>
    );
  }

  return (
    <div className="relative h-full min-h-[420px] overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
      <div ref={containerRef} className="absolute inset-0" data-testid="ashanti-map-canvas" />
      {tooltip ? (
        <div
          className="pointer-events-none absolute z-10 -translate-y-full rounded-md bg-slate-900/90 px-2 py-1 text-xs font-medium text-white shadow"
          style={{ left: tooltip.x + 8, top: tooltip.y - 8 }}
          data-testid="ashanti-map-tooltip"
        >
          {tooltip.name}
        </div>
      ) : null}
      {basemapIssue ? (
        <p
          className="absolute bottom-6 left-2 z-10 rounded bg-amber-50 px-2 py-1 text-xs text-amber-800 shadow"
          data-testid="ashanti-map-basemap-issue"
        >
          Some basemap tiles failed to load. District shapes are still shown.
        </p>
      ) : null}
    </div>
  );
}
