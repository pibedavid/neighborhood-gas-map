import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { GasReport, TIME_OF_DAY_CONFIG, INTENSITY_CONFIG } from '../types';

interface MapProps {
  reports: GasReport[];
  tileLayerType: 'street' | 'satellite';
  onMapClick: (coords: { lat: number; lng: number }) => void;
  selectedReportId: string | null;
  onSelectReport: (id: string | null) => void;
  movingReportId: string | null;
  movingCoords: { lat: number; lng: number } | null;
  onPinDrag: (id: string, lat: number, lng: number) => void;
  onStartMovePin: (id: string) => void;
  onEditReport: (report: GasReport) => void;
  onDeleteReport: (id: string) => void;
  myReportIds: string[];
}

// Center of the neighborhood (centered between west-side homes and pond/Golden Aspen)
const NEIGHBORHOOD_CENTER: [number, number] = [33.0352, -97.0482];

export const Map: React.FC<MapProps> = ({
  reports,
  tileLayerType,
  onMapClick,
  selectedReportId,
  onSelectReport,
  movingReportId,
  movingCoords,
  onPinDrag,
  onStartMovePin,
  onEditReport,
  onDeleteReport,
  myReportIds
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);

  // Keep fresh refs for event listeners
  const movingReportIdRef = useRef(movingReportId);
  movingReportIdRef.current = movingReportId;

  const onMapClickRef = useRef(onMapClick);
  onMapClickRef.current = onMapClick;

  const onPinDragRef = useRef(onPinDrag);
  onPinDragRef.current = onPinDrag;

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: NEIGHBORHOOD_CENTER,
      zoom: 16.6,
      zoomSnap: 0.1,
      minZoom: 15,
      maxZoom: 19,
      zoomControl: false
    });

    // Add zoom controls to top-right
    L.control.zoom({ position: 'topright' }).addTo(map);

    // Initial Street Layer (OpenStreetMap)
    const initialTileLayer = L.tileLayer(
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19
      }
    ).addTo(map);

    tileLayerRef.current = initialTileLayer;

    // Layer groups for markers
    const markersGroup = L.layerGroup().addTo(map);
    markersLayerRef.current = markersGroup;

    // Map Click Listener
    map.on('click', (e: L.LeafletMouseEvent) => {
      if (movingReportIdRef.current) {
        onPinDragRef.current(movingReportIdRef.current, e.latlng.lat, e.latlng.lng);
      } else {
        onMapClickRef.current({ lat: e.latlng.lat, lng: e.latlng.lng });
      }
    });

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update Tile Layer (Street vs Satellite)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }

    if (tileLayerType === 'satellite') {
      tileLayerRef.current = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        {
          attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
          maxZoom: 19
        }
      ).addTo(map);
    } else {
      tileLayerRef.current = L.tileLayer(
        'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        {
          attribution: '&copy; OpenStreetMap contributors',
          maxZoom: 19
        }
      ).addTo(map);
    }
  }, [tileLayerType]);

  // Update Markers when reports change or move
  useEffect(() => {
    const map = mapInstanceRef.current;
    const markersGroup = markersLayerRef.current;
    if (!map || !markersGroup) return;

    markersGroup.clearLayers();

    reports.forEach((report) => {
      const isMoving = movingReportId === report.id;
      const isMine = myReportIds.includes(report.id);
      const todConf = TIME_OF_DAY_CONFIG[report.timeOfDay];
      const intConf = INTENSITY_CONFIG[report.intensity];
      const isStrong = report.intensity === 'strong';

      const currentLat = isMoving && movingCoords ? movingCoords.lat : report.lat;
      const currentLng = isMoving && movingCoords ? movingCoords.lng : report.lng;

      const customHtml = `
        <div class="custom-pin ${isMoving ? 'pin-moving' : ''}" id="pin-${report.id}">
          ${(isStrong || isMoving) ? `<div class="pin-pulse" style="background-color: ${isMoving ? '#2563eb' : todConf.color};"></div>` : ''}
          <div class="pin-badge" style="background: ${todConf.color}; ${isMoving ? 'transform: scale(1.6); border-color: #2563eb; box-shadow: 0 0 10px #2563eb;' : ''}"></div>
        </div>
      `;

      const icon = L.divIcon({
        className: 'custom-pin-container',
        html: customHtml,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
        popupAnchor: [0, -10]
      });

      const marker = L.marker([currentLat, currentLng], {
        icon,
        draggable: isMoving
      });

      // Drag event for repositioning
      marker.on('drag', (e: L.LeafletEvent) => {
        const target = e.target as L.Marker;
        const pos = target.getLatLng();
        onPinDrag(report.id, pos.lat, pos.lng);
      });

      marker.on('dragend', (e: L.LeafletEvent) => {
        const target = e.target as L.Marker;
        const pos = target.getLatLng();
        onPinDrag(report.id, pos.lat, pos.lng);
      });

      // Build rich popup content
      const popupDiv = document.createElement('div');
      popupDiv.style.minWidth = '230px';
      popupDiv.style.fontFamily = "'Plus Jakarta Sans', system-ui, sans-serif";

      let popupHtml = `
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
          <span style="display: inline-flex; align-items: center; gap: 4px; background: ${todConf.bg}; color: ${todConf.color}; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 12px; border: 1px solid ${todConf.border};">
            ${todConf.emoji} ${todConf.label}
          </span>
          <span style="font-size: 11px; color: #64748b; font-weight: 600;">
            ${report.observedTime}
          </span>
        </div>

        <div style="font-size: 13px; font-weight: 800; color: #0f172a; margin-bottom: 4px;">
          ${report.observedDate} • ${intConf.label}
        </div>

        ${report.notes ? `
          <div style="background: #f8fafc; border-left: 3px solid #2563eb; padding: 6px 8px; border-radius: 4px; font-size: 12px; color: #334155; margin: 6px 0; line-height: 1.4;">
            "${report.notes}"
          </div>
        ` : ''}

        <div style="font-size: 11px; color: #64748b; margin-top: 6px; display: flex; flex-direction: column; gap: 2px;">
          <div><strong>Smell:</strong> ${report.smellType === 'rotten-egg' ? 'Mercaptan (Rotten Egg)' : report.smellType}</div>
          <div><strong>Wind:</strong> ${report.windCondition} ${report.windDirection ? `(${report.windDirection})` : ''}</div>
          <div style="margin-top: 4px; color: #94a3b8;">Reported by: <strong>${report.reportedBy}</strong></div>
        </div>
      `;

      // If this pin belongs to the local user, show Move / Edit / Delete buttons
      if (isMine) {
        popupHtml += `
          <div style="margin-top: 10px; padding-top: 8px; border-top: 1px solid #e2e8f0; display: flex; gap: 6px;">
            <button id="btn-move-${report.id}" style="flex: 1; padding: 6px 8px; font-size: 11px; font-weight: 700; background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px;">
              📍 Move Pin
            </button>
            <button id="btn-edit-${report.id}" style="flex: 1; padding: 6px 8px; font-size: 11px; font-weight: 700; background: #f8fafc; color: #334155; border: 1px solid #cbd5e1; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px;">
              ✏️ Edit
            </button>
            <button id="btn-del-${report.id}" style="padding: 6px 8px; font-size: 11px; font-weight: 700; background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; border-radius: 6px; cursor: pointer;" title="Delete my pin">
              🗑️
            </button>
          </div>
        `;
      }

      popupDiv.innerHTML = popupHtml;

      marker.bindPopup(popupDiv, { maxWidth: 300 });

      // Attach event listeners when popup opens
      marker.on('popupopen', () => {
        onSelectReport(report.id);
        if (isMine) {
          const moveBtn = document.getElementById(`btn-move-${report.id}`);
          if (moveBtn) {
            moveBtn.onclick = (e) => {
              e.stopPropagation();
              marker.closePopup();
              onStartMovePin(report.id);
            };
          }

          const editBtn = document.getElementById(`btn-edit-${report.id}`);
          if (editBtn) {
            editBtn.onclick = (e) => {
              e.stopPropagation();
              marker.closePopup();
              onEditReport(report);
            };
          }

          const delBtn = document.getElementById(`btn-del-${report.id}`);
          if (delBtn) {
            delBtn.onclick = (e) => {
              e.stopPropagation();
              if (confirm('Delete this pin report?')) {
                marker.closePopup();
                onDeleteReport(report.id);
              }
            };
          }
        }
      });

      marker.on('click', () => {
        onSelectReport(report.id);
      });

      marker.addTo(markersGroup);

      if (selectedReportId === report.id && !isMoving) {
        marker.openPopup();
      }
    });
  }, [reports, selectedReportId, movingReportId, movingCoords, myReportIds]);

  return <div ref={mapContainerRef} className="map-container" />;
};
