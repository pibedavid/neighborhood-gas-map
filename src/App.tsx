import React, { useState, useEffect, useMemo } from 'react';
import { Header } from './components/Header';
import { Map } from './components/Map';
import { Legend } from './components/Legend';
import { ReportModal } from './components/ReportModal';
import { ExportModal } from './components/ExportModal';
import { ReportListModal } from './components/ReportListModal';
import { GasReport, NewReportInput, FilterState } from './types';
import {
  fetchReports,
  submitReport,
  updateReport,
  deleteReport,
  getMyReportIds
} from './services/api';
import { Plus, FileSpreadsheet, MapPin, Undo2, Check, X, Navigation } from 'lucide-react';

export const App: React.FC = () => {
  const [reports, setReports] = useState<GasReport[]>([]);
  const [myReportIds, setMyReportIds] = useState<string[]>([]);

  // Modals
  const [reportModalOpen, setReportModalOpen] = useState<boolean>(false);
  const [clickedLocation, setClickedLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [editingReport, setEditingReport] = useState<GasReport | null>(null);
  const [exportModalOpen, setExportModalOpen] = useState<boolean>(false);
  const [listModalOpen, setListModalOpen] = useState<boolean>(false);

  // Pin Placement Mode (Option A)
  const [isPlacingPin, setIsPlacingPin] = useState<boolean>(false);
  const [isLocatingGps, setIsLocatingGps] = useState<boolean>(false);

  // Undo / Move Pin state
  const [recentPinnedId, setRecentPinnedId] = useState<string | null>(null);
  const [movingReportId, setMovingReportId] = useState<string | null>(null);
  const [movingCoords, setMovingCoords] = useState<{ lat: number; lng: number } | null>(null);

  // Map state
  const [tileLayer, setTileLayer] = useState<'street' | 'satellite'>('street');
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);

  // Filters
  const [filter, setFilter] = useState<FilterState>({
    timeOfDay: ['morning', 'afternoon', 'evening', 'night'],
    intensity: ['faint', 'moderate', 'strong'],
    date: 'all'
  });

  // Load reports and device pin IDs
  useEffect(() => {
    async function load() {
      try {
        const data = await fetchReports();
        setReports(data);
        setMyReportIds(getMyReportIds());
      } catch (err) {
        console.error('Error fetching reports', err);
      }
    }
    load();
  }, []);

  // Auto-dismiss undo banner after 30 seconds
  useEffect(() => {
    if (!recentPinnedId) return;
    const timer = setTimeout(() => {
      setRecentPinnedId(null);
    }, 30000);
    return () => clearTimeout(timer);
  }, [recentPinnedId]);

  // Filtered reports
  const filteredReports = useMemo(() => {
    return reports.filter((r) => {
      if (!filter.timeOfDay.includes(r.timeOfDay)) return false;
      if (!filter.intensity.includes(r.intensity)) return false;
      return true;
    });
  }, [reports, filter]);

  // Handle Map Click to Drop Pin (or move pin if in move mode)
  const handleMapClick = (coords: { lat: number; lng: number }) => {
    if (movingReportId) {
      setMovingCoords(coords);
      return;
    }
    setIsPlacingPin(false);
    setClickedLocation(coords);
    setEditingReport(null);
    setReportModalOpen(true);
  };

  // Start Placement Mode when clicking "+ Report Smell"
  const handleStartPlacementMode = () => {
    setMovingReportId(null);
    setMovingCoords(null);
    setIsPlacingPin(true);
  };

  // GPS Geolocation Handler
  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your mobile browser. Please tap directly on the map.');
      return;
    }

    setIsLocatingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocatingGps(false);
        setIsPlacingPin(false);
        const coords = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude
        };
        setClickedLocation(coords);
        setEditingReport(null);
        setReportModalOpen(true);
      },
      (err) => {
        setIsLocatingGps(false);
        alert(`Location access denied or unavailable (${err.message}). Please tap on the map directly.`);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  };

  // Handle New Report Submit
  const handleAddReport = async (input: NewReportInput) => {
    const saved = await submitReport(input);
    setReports((prev) => [saved, ...prev]);
    setMyReportIds(getMyReportIds());
    setSelectedReportId(saved.id);
    setRecentPinnedId(saved.id); // Trigger undo/move toast!
  };

  // Handle Report Update (from edit modal)
  const handleUpdateReport = async (id: string, updates: Partial<GasReport>) => {
    const updated = await updateReport(id, updates);
    setReports((prev) => prev.map((r) => (r.id === id ? updated : r)));
    setEditingReport(null);
  };

  // Handle Delete Report
  const handleDeleteReport = async (id: string) => {
    await deleteReport(id);
    setReports((prev) => prev.filter((r) => r.id !== id));
    setMyReportIds(getMyReportIds());
    if (recentPinnedId === id) setRecentPinnedId(null);
    if (movingReportId === id) {
      setMovingReportId(null);
      setMovingCoords(null);
    }
  };

  // Move Pin Flow
  const handleStartMovePin = (id: string) => {
    const report = reports.find((r) => r.id === id);
    if (report) {
      setIsPlacingPin(false);
      setMovingReportId(id);
      setMovingCoords({ lat: report.lat, lng: report.lng });
      setSelectedReportId(id);
    }
  };

  const handlePinDrag = (_id: string, lat: number, lng: number) => {
    setMovingCoords({ lat, lng });
  };

  const handleSaveMovedPin = async () => {
    if (!movingReportId || !movingCoords) return;
    await handleUpdateReport(movingReportId, {
      lat: movingCoords.lat,
      lng: movingCoords.lng
    });
    setMovingReportId(null);
    setMovingCoords(null);
  };

  const handleCancelMovePin = () => {
    setMovingReportId(null);
    setMovingCoords(null);
  };

  const handleUndoRecent = async () => {
    if (recentPinnedId) {
      await handleDeleteReport(recentPinnedId);
      setRecentPinnedId(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw' }}>
      {/* Top Header & Emergency Banner */}
      <Header
        reports={filteredReports}
        filter={filter}
        onFilterChange={setFilter}
        onOpenReportModal={handleStartPlacementMode}
        onOpenListModal={() => setListModalOpen(true)}
        onOpenExportModal={() => setExportModalOpen(true)}
        tileLayer={tileLayer}
        onToggleTileLayer={() => setTileLayer(tileLayer === 'street' ? 'satellite' : 'street')}
      />

      {/* Main Map Area */}
      <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
        {/* Placement Mode Banner (Option A UX: Tap map or Use GPS) */}
        {isPlacingPin && (
          <div
            className="glass-panel"
            style={{
              position: 'absolute',
              top: '16px',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 700,
              padding: '10px 18px',
              borderRadius: '40px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              border: '2px solid #ea580c',
              background: 'rgba(255, 255, 255, 0.98)',
              boxShadow: '0 8px 30px rgba(234, 88, 12, 0.35)',
              animation: 'slideDown 0.2s ease'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <MapPin size={18} color="#ea580c" />
              <span style={{ fontSize: '13px', fontWeight: '800', color: '#0f172a' }}>
                Tap map where you smelled it
              </span>
            </div>
            <button
              onClick={handleUseCurrentLocation}
              disabled={isLocatingGps}
              className="btn-primary"
              style={{
                padding: '6px 14px',
                fontSize: '12px',
                borderRadius: '20px',
                background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                boxShadow: '0 4px 12px rgba(2, 132, 199, 0.35)'
              }}
            >
              <Navigation size={14} />
              <span>{isLocatingGps ? 'Locating...' : 'Use My GPS'}</span>
            </button>
            <button
              onClick={() => setIsPlacingPin(false)}
              className="btn-secondary"
              style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '20px' }}
            >
              <X size={14} />
              <span>Cancel</span>
            </button>
          </div>
        )}

        {/* Active Move Pin Repositioning Banner */}
        {movingReportId && (
          <div
            className="glass-panel"
            style={{
              position: 'absolute',
              top: '16px',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 700,
              padding: '10px 18px',
              borderRadius: '40px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              border: '2px solid #2563eb',
              background: 'rgba(255, 255, 255, 0.96)',
              boxShadow: '0 8px 30px rgba(37, 99, 235, 0.3)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <MapPin size={18} color="#2563eb" />
              <span style={{ fontSize: '13px', fontWeight: '800', color: '#0f172a' }}>
                Tap map or drag pin to relocate
              </span>
            </div>
            <button
              onClick={handleSaveMovedPin}
              className="btn-primary"
              style={{ padding: '6px 14px', fontSize: '12px', borderRadius: '20px' }}
            >
              <Check size={14} />
              <span>Save Position</span>
            </button>
            <button
              onClick={handleCancelMovePin}
              className="btn-secondary"
              style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '20px' }}
            >
              <X size={14} />
              <span>Cancel</span>
            </button>
          </div>
        )}

        <Map
          reports={filteredReports}
          tileLayerType={tileLayer}
          onMapClick={handleMapClick}
          selectedReportId={selectedReportId}
          onSelectReport={(id) => setSelectedReportId(id)}
          movingReportId={movingReportId}
          movingCoords={movingCoords}
          onPinDrag={handlePinDrag}
          onStartMovePin={handleStartMovePin}
          onEditReport={(rep) => {
            setEditingReport(rep);
            setReportModalOpen(true);
          }}
          onDeleteReport={handleDeleteReport}
          myReportIds={myReportIds}
        />

        {/* Legend */}
        <Legend />

        {/* Floating Quick Action Button on Mobile */}
        <div className="floating-bottom-bar glass-panel">
          <button
            onClick={handleStartPlacementMode}
            className="btn-primary"
            style={{ fontSize: '13px', padding: '9px 18px' }}
          >
            <Plus size={16} />
            <span>Pin Odor Smell</span>
          </button>

          <button
            onClick={() => setExportModalOpen(true)}
            className="btn-secondary"
            style={{ fontSize: '12px', padding: '8px 12px' }}
            title="Export for HOA and Atmos Techs"
          >
            <FileSpreadsheet size={15} color="#0d9488" />
            <span>HOA Dossier</span>
          </button>
        </div>


        {/* Immediate Undo / Move Toast Banner after Pinning */}
        {recentPinnedId && !movingReportId && (
          <div
            className="glass-panel"
            style={{
              position: 'absolute',
              bottom: '80px',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 700,
              padding: '10px 18px',
              borderRadius: '40px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              background: '#0f172a',
              color: '#ffffff',
              boxShadow: '0 10px 30px rgba(0, 0, 0, 0.4)',
              animation: 'slideUp 0.25s ease'
            }}
          >
            <span style={{ fontSize: '12px', fontWeight: '600' }}>
              📍 Sighting pinned! Misclicked?
            </span>
            <button
              onClick={() => {
                handleStartMovePin(recentPinnedId);
                setRecentPinnedId(null);
              }}
              style={{
                background: '#2563eb',
                color: '#ffffff',
                border: 'none',
                borderRadius: '16px',
                padding: '5px 12px',
                fontSize: '11px',
                fontWeight: '700',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <MapPin size={12} />
              <span>Move Pin</span>
            </button>
            <button
              onClick={handleUndoRecent}
              style={{
                background: 'rgba(239, 68, 68, 0.2)',
                color: '#fca5a5',
                border: '1px solid #ef4444',
                borderRadius: '16px',
                padding: '4px 10px',
                fontSize: '11px',
                fontWeight: '700',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <Undo2 size={12} />
              <span>Undo</span>
            </button>
            <button
              onClick={() => setRecentPinnedId(null)}
              style={{
                background: 'none',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                fontSize: '16px',
                padding: '0 4px'
              }}
            >
              ×
            </button>
          </div>
        )}
      </div>

      {/* Modals */}
      {reportModalOpen && (
        <ReportModal
          initialLocation={clickedLocation}
          editingReport={editingReport}
          onClose={() => {
            setReportModalOpen(false);
            setEditingReport(null);
          }}
          onSubmit={handleAddReport}
          onUpdate={handleUpdateReport}
        />
      )}

      {exportModalOpen && (
        <ExportModal reports={reports} onClose={() => setExportModalOpen(false)} />
      )}

      {listModalOpen && (
        <ReportListModal
          reports={reports}
          onClose={() => setListModalOpen(false)}
          onSelectReport={(id) => setSelectedReportId(id)}
          onDeleteReport={handleDeleteReport}
        />
      )}
    </div>
  );
};

export default App;
