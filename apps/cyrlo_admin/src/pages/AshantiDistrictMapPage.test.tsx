import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AdminServiceZone } from '../api/types';
import { ApiError } from '../api/types';
import type { StaffRole } from '../config/permissions';
import { AshantiDistrictMapPage } from './AshantiDistrictMapPage';

type Handler = (event: unknown) => void;

interface MockMapInstance {
  options: Record<string, unknown>;
  removed: boolean;
  sources: Record<string, { data: unknown }>;
  layers: string[];
  featureState: Array<{ id: string; state: Record<string, boolean> }>;
  fitBounds: ReturnType<typeof vi.fn>;
  fire: (type: string, layerOrEvent?: string | unknown, event?: unknown) => void;
}

const maplibre = vi.hoisted(() => ({ instances: [] as unknown[] }));

vi.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}));
vi.mock('maplibre-gl', () => {
  class MockMap {
    options: Record<string, unknown>;
    removed = false;
    sources: Record<string, { data: unknown }> = {};
    layers: string[] = [];
    featureState: Array<{ id: string; state: Record<string, boolean> }> = [];
    fitBounds = vi.fn();
    private handlers: Array<{ type: string; layer?: string; cb: Handler }> = [];
    private canvas = { style: { cursor: '' } };

    constructor(options: Record<string, unknown>) {
      this.options = options;
      maplibre.instances.push(this);
    }
    addControl() {}
    on(type: string, layerOrCb: string | Handler, cb?: Handler) {
      if (typeof layerOrCb === 'function') this.handlers.push({ type, cb: layerOrCb });
      else if (cb) this.handlers.push({ type, layer: layerOrCb, cb });
    }
    addSource(id: string, spec: { data: unknown }) {
      this.sources[id] = { data: spec.data };
    }
    addLayer(spec: { id: string }) {
      this.layers.push(spec.id);
    }
    getSource(id: string) {
      const source = this.sources[id];
      return source ? { setData: (data: unknown) => (source.data = data) } : undefined;
    }
    setFeatureState(target: { id: string }, state: Record<string, boolean>) {
      this.featureState.push({ id: target.id, state });
    }
    getCanvas() {
      return this.canvas;
    }
    remove() {
      this.removed = true;
    }
    fire(type: string, layerOrEvent?: string | unknown, event?: unknown) {
      const layer = typeof layerOrEvent === 'string' ? layerOrEvent : undefined;
      const payload = layer ? event : layerOrEvent;
      for (const h of this.handlers) {
        if (h.type === type && h.layer === layer) h.cb(payload);
      }
    }
  }
  class NavigationControl {}
  return { Map: MockMap, NavigationControl };
});

vi.mock('../auth/AuthProvider', () => ({
  useAuth: () => mockAuth,
}));

vi.mock('../api/admin-zones', async () => {
  const actual = await vi.importActual<typeof import('../api/admin-zones')>('../api/admin-zones');
  return {
    ...actual,
    fetchServiceZones: vi.fn(),
    listZoneRiders: vi.fn(),
    submitZoneReview: vi.fn(),
    verifyServiceZone: vi.fn(),
    activateServiceZone: vi.fn(),
    suspendServiceZone: vi.fn(),
    deactivateServiceZone: vi.fn(),
    lockServiceZone: vi.fn(),
  };
});

import * as zonesApi from '../api/admin-zones';

let mockAuth: { staffRole: StaffRole | null };

const ATWIMA_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const DRAFT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

function ring(west: number, south: number): number[][] {
  return [
    [west, south],
    [west + 0.1, south],
    [west + 0.1, south + 0.1],
    [west, south + 0.1],
    [west, south],
  ];
}

function makeZone(
  id: string,
  name: string,
  west: number,
  south: number,
  overrides: Partial<AdminServiceZone> = {},
): AdminServiceZone {
  return {
    id,
    communityId: null,
    districtId: `district-${id}`,
    name,
    slug: null,
    description: null,
    isActive: false,
    status: 'DRAFT',
    boundaryVerificationStatus: 'UNVERIFIED',
    geographicSource: 'GADM',
    geographicAttribution: 'GADM 4.1 attribution',
    geographicDatasetVersion: 'v4.1',
    geographicShapeId: 'shape-1',
    activatedAt: null,
    activatedById: null,
    suspendedAt: null,
    suspendedById: null,
    boundary: { type: 'Polygon', coordinates: [ring(west, south)] },
    boundingBox: {
      minLongitude: west,
      minLatitude: south,
      maxLongitude: west + 0.1,
      maxLatitude: south + 0.1,
    },
    createdById: null,
    updatedById: null,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    ...overrides,
  };
}

const atwima = makeZone(ATWIMA_ID, 'Atwima Kwanwoma', -1.75, 6.6, {
  status: 'ACTIVE',
  isActive: true,
  boundaryVerificationStatus: 'VERIFIED',
});
const draft = makeZone(DRAFT_ID, 'Ejisu', -1.5, 6.7);

function pageOf(items: AdminServiceZone[]) {
  return {
    items,
    meta: { page: 1, pageSize: 100, total: items.length, hasNextPage: false },
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <AshantiDistrictMapPage />
    </MemoryRouter>,
  );
}

function lastMap(): MockMapInstance {
  return maplibre.instances[maplibre.instances.length - 1] as MockMapInstance;
}

async function renderLoaded() {
  renderPage();
  await screen.findByTestId('ashanti-directory');
  await waitFor(() => {
    expect(maplibre.instances.length).toBeGreaterThan(0);
  });
  act(() => lastMap().fire('load'));
}

describe('AshantiDistrictMapPage', () => {
  beforeEach(() => {
    maplibre.instances.length = 0;
    vi.resetAllMocks();
    mockAuth = { staffRole: 'SUPER_ADMIN' };
    vi.mocked(zonesApi.fetchServiceZones).mockResolvedValue(pageOf([atwima, draft]));
    vi.mocked(zonesApi.listZoneRiders).mockResolvedValue([
      { approvalId: '1', riderId: 'r1', status: 'APPROVED' },
      { approvalId: '2', riderId: 'r2', status: 'APPROVED' },
      { approvalId: '3', riderId: 'r3', status: 'PENDING' },
    ] as Awaited<ReturnType<typeof zonesApi.listZoneRiders>>);
  });

  it('shows a loading state while zones are fetched', () => {
    vi.mocked(zonesApi.fetchServiceZones).mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByTestId('ashanti-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('ashanti-directory')).not.toBeInTheDocument();
  });

  it('requests zones with the max page size', async () => {
    await renderLoaded();
    expect(zonesApi.fetchServiceZones).toHaveBeenCalledWith({ page: 1, pageSize: 100 });
  });

  it('shows an error state with retry', async () => {
    vi.mocked(zonesApi.fetchServiceZones).mockRejectedValueOnce(
      new ApiError(500, 'INTERNAL', 'Zones exploded'),
    );
    renderPage();
    const error = await screen.findByTestId('ashanti-error');
    expect(error).toHaveTextContent('Zones exploded');

    await userEvent.click(within(error).getByRole('button', { name: 'Retry' }));
    expect(await screen.findByTestId('ashanti-directory')).toBeInTheDocument();
  });

  it('labels 403 responses as permission denied', async () => {
    vi.mocked(zonesApi.fetchServiceZones).mockRejectedValueOnce(
      new ApiError(403, 'FORBIDDEN', 'Insufficient permissions'),
    );
    renderPage();
    expect(await screen.findByTestId('ashanti-error')).toHaveTextContent('Permission denied');
  });

  it('shows permission denied without fetching when the role has no zone access', () => {
    mockAuth = { staffRole: null };
    renderPage();
    expect(screen.getByTestId('ashanti-forbidden')).toBeInTheDocument();
    expect(zonesApi.fetchServiceZones).not.toHaveBeenCalled();
  });

  it('shows an empty state when no district boundaries are returned', async () => {
    vi.mocked(zonesApi.fetchServiceZones).mockResolvedValue(pageOf([]));
    renderPage();
    expect(await screen.findByTestId('ashanti-empty')).toBeInTheDocument();
    expect(maplibre.instances).toHaveLength(0);
  });

  it('draws district polygons on the map and renders the legend', async () => {
    await renderLoaded();
    const map = lastMap();
    expect(map.options.bounds).toEqual([-2.45, 5.85, -0.2, 7.65]);
    expect(map.layers).toEqual(['ashanti-zones-fill', 'ashanti-zones-line']);
    const data = map.sources['ashanti-zones'].data as {
      features: Array<{ properties: { zoneId: string; fill: string } }>;
    };
    expect(data.features.map((f) => f.properties.zoneId)).toEqual([ATWIMA_ID, DRAFT_ID]);
    expect(data.features[0].properties.fill).not.toBe(data.features[1].properties.fill);

    const legend = screen.getByTestId('ashanti-legend');
    expect(within(legend).getByText('Active')).toBeInTheDocument();
    expect(within(legend).getByText('Under review')).toBeInTheDocument();
    expect(within(legend).getByText(/Draft \/ locked/)).toBeInTheDocument();
    expect(within(legend).getByText('Suspended')).toBeInTheDocument();
  });

  it('selects from the list: renders the panel and highlights the map feature', async () => {
    await renderLoaded();
    expect(screen.getByTestId('ashanti-panel-empty')).toBeInTheDocument();

    await userEvent.click(screen.getByTestId(`ashanti-item-${ATWIMA_ID}`));

    const panel = await screen.findByTestId('ashanti-zone-panel');
    expect(within(panel).getByTestId('panel-zone-name')).toHaveTextContent('Atwima Kwanwoma');
    expect(within(panel).getByTestId('panel-zone-status')).toHaveTextContent('ACTIVE');
    expect(within(panel).getByText('Ashanti Region')).toBeInTheDocument();
    expect(within(panel).getByTestId('panel-zone-id')).toHaveTextContent(ATWIMA_ID);
    expect(within(panel).getByTestId('panel-boundary-verification')).toHaveTextContent('VERIFIED');
    expect(within(panel).getByTestId('panel-geo-source')).toHaveTextContent('GADM · v4.1');
    expect(within(panel).getByTestId('panel-geo-attribution')).toHaveTextContent(
      'GADM 4.1 attribution',
    );
    expect(await within(panel).findByTestId('zone-riders-count')).toHaveTextContent('2');
    expect(zonesApi.listZoneRiders).toHaveBeenCalledWith(ATWIMA_ID);

    expect(lastMap().featureState).toContainEqual({ id: ATWIMA_ID, state: { selected: true } });
    expect(lastMap().fitBounds).toHaveBeenCalledTimes(1);
  });

  it('selects from the map: panel and list stay in sync, without re-fitting the camera', async () => {
    await renderLoaded();
    const map = lastMap();

    act(() =>
      map.fire('click', 'ashanti-zones-fill', {
        features: [{ properties: { zoneId: DRAFT_ID, name: 'Ejisu' } }],
        point: { x: 10, y: 10 },
      }),
    );

    const panel = await screen.findByTestId('ashanti-zone-panel');
    expect(within(panel).getByTestId('panel-zone-name')).toHaveTextContent('Ejisu');
    expect(within(panel).getByTestId('panel-zone-status')).toHaveTextContent('DRAFT');
    expect(screen.getByTestId(`ashanti-item-${DRAFT_ID}`)).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId(`ashanti-item-${ATWIMA_ID}`)).toHaveAttribute('aria-pressed', 'false');
    expect(map.featureState).toContainEqual({ id: DRAFT_ID, state: { selected: true } });
    expect(map.fitBounds).not.toHaveBeenCalled();
  });

  it('shows the district name on hover and clears it on leave', async () => {
    await renderLoaded();
    const map = lastMap();

    act(() =>
      map.fire('mousemove', 'ashanti-zones-fill', {
        features: [{ properties: { zoneId: ATWIMA_ID, name: 'Atwima Kwanwoma' } }],
        point: { x: 40, y: 50 },
      }),
    );
    expect(screen.getByTestId('ashanti-map-tooltip')).toHaveTextContent('Atwima Kwanwoma');
    expect(map.featureState).toContainEqual({ id: ATWIMA_ID, state: { hover: true } });

    act(() => map.fire('mouseleave', 'ashanti-zones-fill'));
    expect(screen.queryByTestId('ashanti-map-tooltip')).not.toBeInTheDocument();
  });

  it('filters the directory by search and status', async () => {
    await renderLoaded();
    expect(screen.getByTestId('ashanti-count')).toHaveTextContent('2 of 2');

    await userEvent.type(screen.getByTestId('ashanti-search'), 'atwi');
    expect(screen.getByTestId(`ashanti-item-${ATWIMA_ID}`)).toBeInTheDocument();
    expect(screen.queryByTestId(`ashanti-item-${DRAFT_ID}`)).not.toBeInTheDocument();

    await userEvent.clear(screen.getByTestId('ashanti-search'));
    await userEvent.selectOptions(screen.getByTestId('ashanti-status-filter'), 'DRAFT');
    expect(screen.queryByTestId(`ashanti-item-${ATWIMA_ID}`)).not.toBeInTheDocument();
    expect(screen.getByTestId(`ashanti-item-${DRAFT_ID}`)).toBeInTheDocument();

    await userEvent.type(screen.getByTestId('ashanti-search'), 'zzz');
    expect(screen.getByTestId('ashanti-list-empty')).toBeInTheDocument();
  });

  it('offers permitted lifecycle actions per status and calls the real API', async () => {
    const submitted = { ...draft, status: 'UNDER_REVIEW' as const };
    vi.mocked(zonesApi.submitZoneReview).mockResolvedValue(submitted);
    await renderLoaded();

    await userEvent.click(screen.getByTestId(`ashanti-item-${ATWIMA_ID}`));
    expect(screen.getByTestId('panel-action-suspend')).toBeInTheDocument();
    expect(screen.getByTestId('panel-action-deactivate')).toBeInTheDocument();
    expect(screen.queryByTestId('panel-action-submit-review')).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId(`ashanti-item-${DRAFT_ID}`));
    await userEvent.click(await screen.findByTestId('panel-action-submit-review'));
    await userEvent.click(screen.getByTestId('panel-confirm-submit'));

    await waitFor(() => expect(zonesApi.submitZoneReview).toHaveBeenCalledWith(DRAFT_ID));
    // Status comes from the API response, not a local flip.
    await waitFor(() =>
      expect(screen.getByTestId('panel-zone-status')).toHaveTextContent('UNDER_REVIEW'),
    );
    expect(screen.getByTestId('panel-notice')).toHaveTextContent('now UNDER_REVIEW');
  });

  it('keeps the old status and shows the error when a lifecycle action fails', async () => {
    vi.mocked(zonesApi.suspendServiceZone).mockRejectedValue(
      new ApiError(409, 'CONFLICT', 'Cannot suspend'),
    );
    await renderLoaded();
    await userEvent.click(screen.getByTestId(`ashanti-item-${ATWIMA_ID}`));
    await userEvent.click(screen.getByTestId('panel-action-suspend'));
    await userEvent.click(screen.getByTestId('panel-confirm-submit'));

    expect(await screen.findByText('Cannot suspend')).toBeInTheDocument();
    expect(screen.getByTestId('panel-zone-status')).toHaveTextContent('ACTIVE');
  });

  it('hides write actions and rider counts from read-only roles', async () => {
    mockAuth = { staffRole: 'SUPPORT_ADMIN' };
    await renderLoaded();
    await userEvent.click(screen.getByTestId(`ashanti-item-${ATWIMA_ID}`));

    expect(await screen.findByTestId('panel-readonly')).toBeInTheDocument();
    expect(screen.queryByTestId('panel-actions')).not.toBeInTheDocument();
    expect(screen.getByTestId('zone-riders-restricted')).toBeInTheDocument();
    expect(zonesApi.listZoneRiders).not.toHaveBeenCalled();
  });

  it('only offers verify to roles with VerifyServiceZones', async () => {
    mockAuth = { staffRole: 'OPERATIONS_ADMIN' };
    await renderLoaded();
    await userEvent.click(screen.getByTestId(`ashanti-item-${DRAFT_ID}`));
    expect(await screen.findByTestId('panel-action-submit-review')).toBeInTheDocument();
    expect(screen.queryByTestId('panel-action-verify')).not.toBeInTheDocument();
  });
});
