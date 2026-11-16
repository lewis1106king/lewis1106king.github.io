import { useEffect, useRef } from 'react';
import L from 'leaflet';
import type { LatLng } from '../domain/rules';
import { observationLabel, taskLabel } from '../domain/rules';
import type { InterestPoint, Member, Zone } from './types';

const tone: Record<string, string> = {
  unverified: '#3182f6',
  confirmed: '#03b26c',
  recheck: '#ff9f0a',
  interrupted: '#f04452',
};

type MapCanvasProps = {
  zones: Zone[];
  points: InterestPoint[];
  members: Member[];
  selfId?: string;
  selectedZoneId?: string | null;
  draft?: LatLng[];
  showLocate?: boolean;
  active?: boolean;
  onPick?: (point: LatLng) => void;
  onSelectZone?: (id: string) => void;
};

export default function MapCanvas({
  zones,
  points,
  members,
  selfId,
  selectedZoneId,
  draft = [],
  showLocate = false,
  active = true,
  onPick,
  onSelectZone,
}: MapCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const pickRef = useRef(onPick);
  const selectRef = useRef(onSelectZone);
  pickRef.current = onPick;
  selectRef.current = onSelectZone;

  useEffect(() => {
    const host = hostRef.current;
    if (!host || mapRef.current) return undefined;
    const map = L.map(host, { zoomControl: false, attributionControl: true }).setView([36.5, 127.8], 7);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    map.on('click', (event) => {
      pickRef.current?.({ lat: event.latlng.lat, lng: event.latlng.lng });
    });
    mapRef.current = map;
    const frame = window.requestAnimationFrame(() => map.invalidateSize());
    return () => {
      window.cancelAnimationFrame(frame);
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    zones.forEach((zone) => {
      if (zone.path.length < 3) return;
      const selected = zone.id === selectedZoneId;
      const color = zone.taskStatus === 'interrupted' ? tone.interrupted : tone[zone.observationStatus];
      const polygon = L.polygon(zone.path.map((point) => [point.lat, point.lng] as [number, number]), {
        color,
        weight: selected ? 3 : 2,
        fillColor: color,
        fillOpacity: selected ? 0.28 : 0.16,
      });
      polygon.bindTooltip(`${zone.label} · ${taskLabel[zone.taskStatus]} · ${observationLabel[zone.observationStatus]}`, { sticky: true });
      polygon.on('click', (event) => {
        L.DomEvent.stopPropagation(event);
        selectRef.current?.(zone.id);
      });
      polygon.addTo(layer);
    });
    if (draft.length) {
      L.polyline(draft.map((point) => [point.lat, point.lng] as [number, number]), { color: '#191f28', dashArray: '6 6', weight: 2 }).addTo(layer);
      draft.forEach((point, index) => {
        L.circleMarker([point.lat, point.lng], { radius: 6, color: '#191f28', fillColor: '#fff', fillOpacity: 1, weight: 2 })
          .bindTooltip(String(index + 1))
          .addTo(layer);
      });
    }
    points.forEach((point) => {
      L.circleMarker([point.lat, point.lng], { radius: 7, color: '#ff9f0a', fillColor: '#fff4e5', fillOpacity: 1, weight: 2 })
        .bindTooltip(point.label)
        .addTo(layer);
    });
    members.forEach((member) => {
      if (member.lat === null || member.lng === null) return;
      const mine = member.userId === selfId;
      L.circleMarker([member.lat, member.lng], {
        radius: mine ? 9 : 7,
        color: '#fff',
        weight: 2,
        fillColor: mine ? '#3182f6' : '#191f28',
        fillOpacity: 1,
      }).bindTooltip(`${member.callsign}${member.droneName ? ` · ${member.droneName}` : ''}`).addTo(layer);
    });
  }, [zones, points, members, draft, selectedZoneId, selfId]);

  useEffect(() => {
    if (!active) return undefined;
    const frame = window.requestAnimationFrame(() => mapRef.current?.invalidateSize());
    return () => window.cancelAnimationFrame(frame);
  }, [active]);

  const locate = () => {
    mapRef.current?.locate({ setView: true, maxZoom: 16, enableHighAccuracy: true });
  };

  return (
    <div className="map-frame">
      <div ref={hostRef} className="map-canvas" />
      {showLocate ? <button type="button" className="map-locate" onClick={locate}>내 위치</button> : null}
    </div>
  );
}
