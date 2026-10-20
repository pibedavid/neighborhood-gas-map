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
  const markersMapRef = useRef<Record<string, L.Marker>>({});

  // Prevent map click when popup closes
  const lastPopupCloseTimeRef = useRef<number>(0);

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

    // Track popup close timing to prevent immediate map-click trigger
    map.on('popupclose', () => {
      lastPopupCloseTimeRef.current = Date.now();
    });

    // Map Click Listener
    map.on('click', (e: L.LeafletMouseEvent) => {
      // If a popup was just closed, don't open the report modal
      if (Date.now() - lastPopupCloseTimeRef.current < 250) {
        return;
      }

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

  // Keep moving marker in sync if movingCoords changed via map click
  useEffect(() => {
    if (!movingReportId || !movingCoords) return;
    const marker = markersMapRef.current[movingReportId];
    if (marker) {
      marker.setLatLng([movingCoords.lat, movingCoords.lng]);
    }
  }, [movingReportId, movingCoords]);

  // Update Markers when reports list, selection, or move mode changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    const markersGroup = markersLayerRef.current;
    if (!map || !markersGroup) return;

    markersGroup.clearLayers();
    markersMapRef.current = {};

    reports.forEach((report) => {
      // Defensive check against malformed reports
      if (
        !report ||
        typeof report.lat !== 'number' ||
        typeof report.lng !== 'number' ||
        isNaN(report.lat) ||
        isNaN(report.lng)
      ) {
        return;
      }

      const isMoving = movingReportId === report.id;
      const isMine = myReportIds.includes(report.id);
      const todConf = TIME_OF_DAY_CONFIG[report.timeOfDay] || TIME_OF_DAY_CONFIG.morning;
      const intConf = INTENSITY_CONFIG[report.intensity] || INTENSITY_CONFIG.moderate;
      const isStrong = report.intensity === 'strong';

      const initialLat = isMoving && movingCoords ? movingCoords.lat : report.lat;
      const initialLng = isMoving && movingCoords ? movingCoords.lng : report.lng;

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

      const marker = L.marker([initialLat, initialLng], {
        icon,
        draggable: isMoving
      });

      markersMapRef.current[report.id] = marker;

      // Drag events for repositioning without mid-drag layer rebuild
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

      // Build safe popup DOM using textContent (Neutralizes stored XSS completely)
      const popupDiv = document.createElement('div');
      popupDiv.style.minWidth = '230px';
      popupDiv.style.fontFamily = "'Plus Jakarta Sans', system-ui, sans-serif";

      // Top row: Time of day badge + Time text
      const topRow = document.createElement('div');
      topRow.style.display = 'flex';
      topRow.style.alignItems = 'center';
      topRow.style.justifyContent = 'space-between';
      topRow.style.marginBottom = '6px';

      const todBadge = document.createElement('span');
      todBadge.style.display = 'inline-flex';
      todBadge.style.alignItems = 'center';
      todBadge.style.gap = '4px';
      todBadge.style.background = todConf.bg;
      todBadge.style.color = todConf.color;
      todBadge.style.fontSize = '11px';
      todBadge.style.fontWeight = '700';
      todBadge.style.padding = '2px 8px';
      todBadge.style.borderRadius = '12px';
      todBadge.style.border = `1px solid ${todConf.border}`;
      todBadge.textContent = `${todConf.emoji} ${todConf.label}`;

      const timeSpan = document.createElement('span');
      timeSpan.style.fontSize = '11px';
      timeSpan.style.color = '#64748b';
      timeSpan.style.fontWeight = '600';
      timeSpan.textContent = report.observedTime || 'Observed';

      topRow.appendChild(todBadge);
      topRow.appendChild(timeSpan);
      popupDiv.appendChild(topRow);

      // Main date + intensity line
      const mainLine = document.createElement('div');
      mainLine.style.fontSize = '13px';
      mainLine.style.fontWeight = '800';
      mainLine.style.color = '#0f172a';
      mainLine.style.marginBottom = '4px';
      mainLine.textContent = `${report.observedDate || ''} • ${intConf.label}`;
      popupDiv.appendChild(mainLine);

      // Notes (if present, safely escaped via textContent)
      if (report.notes && report.notes.trim()) {
        const notesBox = document.createElement('div');
        notesBox.style.background = '#f8fafc';
        notesBox.style.borderLeft = '3px solid #2563eb';
        notesBox.style.padding = '6px 8px';
        notesBox.style.borderRadius = '4px';
        notesBox.style.fontSize = '12px';
        notesBox.style.color = '#334155';
        notesBox.style.margin = '6px 0';
        notesBox.style.lineHeight = '1.4';
        notesBox.textContent = `"${report.notes}"`;
        popupDiv.appendChild(notesBox);
      }

      // Metadata section
      const metaBox = document.createElement('div');
      metaBox.style.fontSize = '11px';
      metaBox.style.color = '#64748b';
      metaBox.style.marginTop = '6px';
      metaBox.style.display = 'flex';
      metaBox.style.flexDirection = 'column';
      metaBox.style.gap = '2px';

      const smellDiv = document.createElement('div');
      const smellLabel = report.smellType === 'rotten-egg' ? 'Mercaptan (Rotten Egg)' : report.smellType;
      smellDiv.textContent = `Smell: ${smellLabel}`;
      metaBox.appendChild(smellDiv);

      const windDiv = document.createElement('div');
      const windDirText = report.windDirection ? ` (${report.windDirection})` : '';
      windDiv.textContent = `Wind: ${report.windCondition}${windDirText}`;
      metaBox.appendChild(windDiv);

      const reporterDiv = document.createElement('div');
      reporterDiv.style.marginTop = '4px';
      reporterDiv.style.color = '#94a3b8';
      reporterDiv.textContent = `Reported by: ${report.reportedBy || 'Anonymous Neighbor'}`;
      metaBox.appendChild(reporterDiv);

      popupDiv.appendChild(metaBox);

      // Action buttons for owner
      if (isMine) {
        const btnRow = document.createElement('div');
        btnRow.style.marginTop = '10px';
        btnRow.style.paddingTop = '8px';
        btnRow.style.borderTop = '1px solid #e2e8f0';
        btnRow.style.display = 'flex';
        btnRow.style.gap = '6px';

        const moveBtn = document.createElement('button');
        moveBtn.style.flex = '1';
        moveBtn.style.padding = '6px 8px';
        moveBtn.style.fontSize = '11px';
        moveBtn.style.fontWeight = '700';
        moveBtn.style.background = '#eff6ff';
        moveBtn.style.color = '#1d4ed8';
        moveBtn.style.border = '1px solid #bfdbfe';
        moveBtn.style.borderRadius = '6px';
        moveBtn.style.cursor = 'pointer';
        moveBtn.textContent = '📍 Move Pin';
        moveBtn.onclick = (e) => {
          e.stopPropagation();
          marker.closePopup();
          onStartMovePin(report.id);
        };
        btnRow.appendChild(moveBtn);

        const editBtn = document.createElement('button');
        editBtn.style.flex = '1';
        editBtn.style.padding = '6px 8px';
        editBtn.style.fontSize = '11px';
        editBtn.style.fontWeight = '700';
        editBtn.style.background = '#f8fafc';
        editBtn.style.color = '#334155';
        editBtn.style.border = '1px solid #cbd5e1';
        editBtn.style.borderRadius = '6px';
        editBtn.style.cursor = 'pointer';
        editBtn.textContent = '✏️ Edit';
        editBtn.onclick = (e) => {
          e.stopPropagation();
          marker.closePopup();
          onEditReport(report);
        };
        btnRow.appendChild(editBtn);

        const delBtn = document.createElement('button');
        delBtn.style.padding = '6px 8px';
        delBtn.style.fontSize = '11px';
        delBtn.style.fontWeight = '700';
        delBtn.style.background = '#fef2f2';
        delBtn.style.color = '#b91c1c';
        delBtn.style.border = '1px solid #fecaca';
        delBtn.style.borderRadius = '6px';
        delBtn.style.cursor = 'pointer';
        delBtn.title = 'Delete my pin';
        delBtn.textContent = '🗑️';
        delBtn.onclick = (e) => {
          e.stopPropagation();
          if (confirm('Delete this pin report?')) {
            marker.closePopup();
            onDeleteReport(report.id);
          }
        };
        btnRow.appendChild(delBtn);

        popupDiv.appendChild(btnRow);
      }

      marker.bindPopup(popupDiv, { maxWidth: 300 });

      marker.on('popupopen', () => {
        onSelectReport(report.id);
      });

      marker.on('click', () => {
        onSelectReport(report.id);
      });

      marker.addTo(markersGroup);

      if (selectedReportId === report.id && !isMoving) {
        marker.openPopup();
      }
    });
  }, [reports, selectedReportId, movingReportId, myReportIds]);

  return <div ref={mapContainerRef} className="map-container" />;
};

