import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { GasReport, TIME_OF_DAY_CONFIG, INTENSITY_CONFIG } from '../types';

interface MapProps {
  reports: GasReport[];
  tileLayerType: 'street' | 'satellite';
  onMapClick: (coords: { lat: number; lng: number }) => void;
  selectedReportId: string | null;
  onSelectReport: (id: string | null) => void;
}

// Center of Golden Aspen Dr & Pond area in Flower Mound, TX
const NEIGHBORHOOD_CENTER: [number, number] = [33.03505, -97.04638];

export const Map: React.FC<MapProps> = ({
  reports,
  tileLayerType,
  onMapClick,
  selectedReportId,
  onSelectReport
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const landmarksLayerRef = useRef<L.LayerGroup | null>(null);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: NEIGHBORHOOD_CENTER,
      zoom: 17,
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

    const landmarksGroup = L.layerGroup().addTo(map);
    landmarksLayerRef.current = landmarksGroup;

    // Add neighborhood landmark reference labels
    const landmarks = [
      { coords: [33.03525, -97.04710] as [number, number], title: '🦆 Neighborhood Pond' },
      { coords: [33.03530, -97.04655] as [number, number], title: '🪵 Pond Bridge' },
      { coords: [33.03470, -97.04610] as [number, number], title: '📍 Golden Aspen Dr' },
      { coords: [33.03575, -97.04750] as [number, number], title: '🌲 Rosewood Trail' }
    ];

    landmarks.forEach((lm) => {
      const icon = L.divIcon({
        className: 'landmark-marker-container',
        html: `<div class="landmark-label">${lm.title}</div>`,
        iconSize: [120, 24],
        iconAnchor: [60, 12]
      });
      L.marker(lm.coords, { icon, interactive: false }).addTo(landmarksGroup);
    });

    // Map Click Listener
    map.on('click', (e: L.LeafletMouseEvent) => {
      onMapClick({ lat: e.latlng.lat, lng: e.latlng.lng });
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
      // Esri World Imagery (High resolution satellite)
      tileLayerRef.current = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        {
          attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
          maxZoom: 19
        }
      ).addTo(map);
    } else {
      // Standard OpenStreetMap
      tileLayerRef.current = L.tileLayer(
        'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        {
          attribution: '&copy; OpenStreetMap contributors',
          maxZoom: 19
        }
      ).addTo(map);
    }
  }, [tileLayerType]);

  // Update Markers when reports change
  useEffect(() => {
    const map = mapInstanceRef.current;
    const markersGroup = markersLayerRef.current;
    if (!map || !markersGroup) return;

    markersGroup.clearLayers();

    reports.forEach((report) => {
      const todConf = TIME_OF_DAY_CONFIG[report.timeOfDay];
      const intConf = INTENSITY_CONFIG[report.intensity];
      const isStrong = report.intensity === 'strong';

      const customHtml = `
        <div class="custom-pin" id="pin-${report.id}">
          ${isStrong ? `<div class="pin-pulse" style="background-color: ${todConf.border};"></div>` : ''}
          <div class="pin-badge" style="background: ${todConf.color};">
            ${todConf.emoji}
          </div>
        </div>
      `;

      const icon = L.divIcon({
        className: 'custom-pin-container',
        html: customHtml,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
        popupAnchor: [0, -18]
      });

      const marker = L.marker([report.lat, report.lng], { icon });

      // Build rich popup content
      const popupContent = document.createElement('div');
      popupContent.style.minWidth = '220px';
      popupContent.style.fontFamily = "'Plus Jakarta Sans', system-ui, sans-serif";
      popupContent.innerHTML = `
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

      marker.bindPopup(popupContent, { maxWidth: 300 });

      marker.on('click', () => {
        onSelectReport(report.id);
      });

      marker.addTo(markersGroup);

      if (selectedReportId === report.id) {
        marker.openPopup();
      }
    });
  }, [reports, selectedReportId]);

  return <div ref={mapContainerRef} className="map-container" />;
};
