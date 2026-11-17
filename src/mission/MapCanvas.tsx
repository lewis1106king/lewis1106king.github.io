import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import type { LatLng } from '../domain/rules';
import { taskLabel } from '../domain/rules';
import { cellCovers, searchGrid } from '../map/geo';
import type { InterestPoint, Member, Zone } from './types';

const tone: Record<string, string> = {
  unverified: '#3182f6',
  confirmed: '#03b26c',
  recheck: '#ff9f0a',
  interrupted: '#f04452',
  completed: '#03b26c',
};

const marks: Record<string, string> = { person: '#03b26c', hazard: '#f04452', entry: '#3182f6' };

type MapCanvasProps = {
  zones: Zone[];
  points: InterestPoint[];
  members: Member[];
  selfId?: string;
  selectedZoneId?: string | null;
  draft?: LatLng[];
  base?: 'map' | 'sat';
  heading?: number | null;
  showLocate?: boolean;
  showTools?: boolean;
  closeUp?: boolean;
  active?: boolean;
  onPick?: (point: LatLng) => void;
  onSelectZone?: (id: string) => void;
  onSelectMember?: (id: string) => void;
  onSelectPoint?: (id: string) => void;
  onVertex?: (index: number) => void;
  onBase?: (base: 'map' | 'sat') => void;
  onFullscreen?: () => void;
  onZoom?: (zoom: number) => void;
};

export default function MapCanvas({
  zones,
  points,
  members,
  selfId,
  selectedZoneId,
  draft = [],
  base = 'map',
  heading = null,
  showLocate = false,
  showTools = false,
  closeUp = false,
  active = true,
  onPick,
  onSelectZone,
  onSelectMember,
  onSelectPoint,
  onVertex,
  onBase,
  onFullscreen,
  onZoom,
}: MapCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const streetsRef = useRef<L.TileLayer | null>(null);
  const aerialRef = useRef<L.TileLayer | null>(null);
  const fitted = useRef(false);
  const pickRef = useRef(onPick);
  const selectRef = useRef(onSelectZone);
  const memberRef = useRef(onSelectMember);
  const pointRef = useRef(onSelectPoint);
  const vertexRef = useRef(onVertex);
  const zoomRef = useRef(onZoom);
  pickRef.current = onPick;
  selectRef.current = onSelectZone;
  memberRef.current = onSelectMember;
  pointRef.current = onSelectPoint;
  vertexRef.current = onVertex;
  zoomRef.current = onZoom;
  const [zoom, setZoom] = useState(closeUp ? 17 : 7);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || mapRef.current) return undefined;
    const map = L.map(host, { zoomControl: false, attributionControl: true, maxZoom: 21 }).setView([36.5, 127.8], closeUp ? 17 : 7);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.control.scale({ imperial: false, metric: true, position: 'bottomleft' }).addTo(map);
    const streets = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 21,
      maxNativeZoom: 19,
      attribution: '&copy; OpenStreetMap',
    });
    const aerial = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 21,
      maxNativeZoom: 19,
      attribution: 'Tiles &copy; Esri',
    });
    streets.addTo(map);
    streetsRef.current = streets;
    aerialRef.current = aerial;
    layerRef.current = L.layerGroup().addTo(map);
    map.on('click', (event) => pickRef.current?.({ lat: event.latlng.lat, lng: event.latlng.lng }));
    map.on('zoomend', () => {
      const next = map.getZoom();
      setZoom(next);
      zoomRef.current?.(next);
    });
    mapRef.current = map;
    const frame = window.requestAnimationFrame(() => map.invalidateSize());
    if (closeUp) map.locate({ setView: true, maxZoom: 19, enableHighAccuracy: true });
    return () => {
      window.cancelAnimationFrame(frame);
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, [closeUp]);

  useEffect(() => {
    const map = mapRef.current;
    const streets = streetsRef.current;
    const aerial = aerialRef.current;
    if (!map || !streets || !aerial) return;
    if (base === 'sat') {
      if (map.hasLayer(streets)) map.removeLayer(streets);
      if (!map.hasLayer(aerial)) aerial.addTo(map);
    } else {
      if (map.hasLayer(aerial)) map.removeLayer(aerial);
      if (!map.hasLayer(streets)) streets.addTo(map);
    }
  }, [base]);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    zones.forEach((zone) => {
      if (zone.path.length < 3) return;
      const selected = zone.id === selectedZoneId;
      const color = zone.taskStatus === 'completed' ? tone.completed : zone.taskStatus === 'interrupted' ? tone.interrupted : tone[zone.observationStatus];
      const polygon = L.polygon(zone.path.map((point) => [point.lat, point.lng] as [number, number]), {
        color,
        weight: selected ? 3 : 2,
        fillColor: color,
        fillOpacity: selected ? 0.22 : 0.12,
      });
      polygon.bindTooltip(`${zone.label} · ${taskLabel[zone.taskStatus]}`, { permanent: true, direction: 'center', className: 'zone-label' });
      polygon.on('click', (event) => {
        L.DomEvent.stopPropagation(event);
        selectRef.current?.(zone.id);
      });
      polygon.addTo(layer);
      if (selected) {
        const trails = members.flatMap((member) => member.trail);
        searchGrid(zone.path, 40).forEach((cell) => {
          const seen = trails.some((point) => cellCovers(cell, point));
          L.rectangle([[cell.south, cell.west], [cell.north, cell.east]], {
            color: seen ? '#03b26c' : '#ffffff',
            weight: 1,
            fillColor: seen ? '#03b26c' : '#191f28',
            fillOpacity: seen ? 0.28 : 0.06,
          }).addTo(layer);
        });
        zone.path.forEach((point, index) => {
          const handle = L.circleMarker([point.lat, point.lng], { radius: 7, color: '#191f28', fillColor: '#fff', fillOpacity: 1, weight: 2 });
          handle.on('click', (event) => {
            L.DomEvent.stopPropagation(event);
            vertexRef.current?.(index);
          });
          handle.addTo(layer);
        });
      }
    });
    if (!fitted.current && zones.some((zone) => zone.path.length >= 3)) {
      const bounds = L.latLngBounds(zones.flatMap((zone) => zone.path.map((point) => [point.lat, point.lng] as [number, number])));
      map.fitBounds(bounds, { padding: [56, 56], maxZoom: 19 });
      fitted.current = true;
    }
    if (draft.length) {
      const shape = draft.length >= 3
        ? L.polygon(draft.map((point) => [point.lat, point.lng] as [number, number]), { color: '#191f28', weight: 2, fillOpacity: 0.08 })
        : L.polyline(draft.map((point) => [point.lat, point.lng] as [number, number]), { color: '#191f28', dashArray: '6 6', weight: 2 });
      shape.addTo(layer);
      draft.forEach((point, index) => {
        L.circleMarker([point.lat, point.lng], { radius: 6, color: '#191f28', fillColor: '#fff', fillOpacity: 1, weight: 2 })
          .bindTooltip(String(index + 1))
          .addTo(layer);
      });
    }
    points.forEach((point) => {
      const marker = L.circleMarker([point.lat, point.lng], {
        radius: 8,
        color: '#fff',
        weight: 2,
        fillColor: marks[point.kind] ?? '#ff9f0a',
        fillOpacity: 1,
      }).bindTooltip(point.label, { permanent: true, direction: 'top', className: 'zone-label' });
      marker.on('click', (event) => {
        L.DomEvent.stopPropagation(event);
        pointRef.current?.(point.id);
      });
      marker.addTo(layer);
    });
    members.forEach((member) => {
      if (member.trail.length > 1) {
        L.polyline(member.trail.map((point) => [point.lat, point.lng] as [number, number]), {
          color: member.userId === selfId ? '#3182f6' : '#191f28',
          weight: 3,
          opacity: 0.55,
        }).addTo(layer);
      }
      if (member.lat === null || member.lng === null) return;
      const mine = member.userId === selfId;
      const lost = member.droneStatus === 'lost';
      const marker = L.marker([member.lat, member.lng], {
        icon: L.divIcon({
          className: 'drone-pin',
          html: `<i style="transform:rotate(${member.heading ?? 0}deg);border-bottom-color:${lost ? '#f04452' : mine ? '#3182f6' : '#191f28'}"></i>`,
          iconSize: [28, 28],
          iconAnchor: [14, 22],
        }),
        zIndexOffset: 400,
      }).bindTooltip(member.callsign, { permanent: true, direction: 'right', className: 'zone-label' });
      marker.on('click', (event) => {
        L.DomEvent.stopPropagation(event);
        memberRef.current?.(member.userId);
      });
      marker.addTo(layer);
    });
  }, [zones, points, members, draft, selectedZoneId, selfId]);

  useEffect(() => {
    if (!active) return undefined;
    const frame = window.requestAnimationFrame(() => mapRef.current?.invalidateSize());
    return () => window.cancelAnimationFrame(frame);
  }, [active]);

  const locate = () => mapRef.current?.locate({ setView: true, maxZoom: 19, enableHighAccuracy: true });

  return (
    <div className="map-frame" ref={frameRef} data-zoom={zoom} data-base={base}>
      <div ref={hostRef} className="map-canvas" />
      {showTools || showLocate ? (
        <div className="map-tools">
          {showLocate ? <button type="button" onClick={locate}>내 위치</button> : null}
          {showTools ? <button type="button" onClick={() => onBase?.(base === 'sat' ? 'map' : 'sat')}>{base === 'sat' ? '지도' : '위성'}</button> : null}
          {showTools ? <button type="button" onClick={onFullscreen}>화면</button> : null}
          <i className="compass" style={{ transform: `rotate(${-(heading ?? 0)}deg)` }} aria-label="나침반" />
        </div>
      ) : null}
      {showTools ? (
        <ul className="legend">
          <li><s style={{ background: '#3182f6' }} />미확인</li>
          <li><s style={{ background: '#03b26c' }} />수색됨</li>
          <li><s style={{ background: '#191f28' }} />드론</li>
        </ul>
      ) : null}
    </div>
  );
}
