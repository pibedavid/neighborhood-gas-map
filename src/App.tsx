import React, { useState, useEffect, useMemo } from 'react';
import { Header } from './components/Header';
import { Map } from './components/Map';
import { Legend } from './components/Legend';
import { ReportModal } from './components/ReportModal';
import { ExportModal } from './components/ExportModal';
import { ReportListModal } from './components/ReportListModal';
import { GasReport, NewReportInput, FilterState } from './types';
import { fetchReports, submitReport, deleteReport } from './services/api';
import { Plus, FileSpreadsheet } from 'lucide-react';

export const App: React.FC = () => {
  const [reports, setReports] = useState<GasReport[]>([]);

  // Modals
  const [reportModalOpen, setReportModalOpen] = useState<boolean>(false);
  const [clickedLocation, setClickedLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [exportModalOpen, setExportModalOpen] = useState<boolean>(false);
  const [listModalOpen, setListModalOpen] = useState<boolean>(false);

  // Map state
  const [tileLayer, setTileLayer] = useState<'street' | 'satellite'>('street');
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);

  // Filters
  const [filter, setFilter] = useState<FilterState>({
    timeOfDay: ['morning', 'afternoon', 'evening', 'night'],
    intensity: ['faint', 'moderate', 'strong'],
    date: 'all'
  });

  // Load reports
  useEffect(() => {
    async function load() {
      try {
        const data = await fetchReports();
        setReports(data);
      } catch (err) {
        console.error('Error fetching reports', err);
      }
    }
    load();
  }, []);

  // Filtered reports
  const filteredReports = useMemo(() => {
    return reports.filter((r) => {
      if (!filter.timeOfDay.includes(r.timeOfDay)) return false;
      if (!filter.intensity.includes(r.intensity)) return false;
      return true;
    });
  }, [reports, filter]);

  // Handle Map Click to Drop Pin
  const handleMapClick = (coords: { lat: number; lng: number }) => {
    setClickedLocation(coords);
    setReportModalOpen(true);
  };

  // Handle New Report Submit
  const handleAddReport = async (input: NewReportInput) => {
    const saved = await submitReport(input);
    setReports((prev) => [saved, ...prev]);
    setSelectedReportId(saved.id);
  };

  // Handle Delete Report
  const handleDeleteReport = async (id: string) => {
    await deleteReport(id);
    setReports((prev) => prev.filter((r) => r.id !== id));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw' }}>
      {/* Top Header & Emergency Banner */}
      <Header
        reports={filteredReports}
        filter={filter}
        onFilterChange={setFilter}
        onOpenReportModal={() => {
          setClickedLocation(null);
          setReportModalOpen(true);
        }}
        onOpenListModal={() => setListModalOpen(true)}
        onOpenExportModal={() => setExportModalOpen(true)}
        tileLayer={tileLayer}
        onToggleTileLayer={() => setTileLayer(tileLayer === 'street' ? 'satellite' : 'street')}
      />

      {/* Main Map Area */}
      <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
        <Map
          reports={filteredReports}
          tileLayerType={tileLayer}
          onMapClick={handleMapClick}
          selectedReportId={selectedReportId}
          onSelectReport={(id) => setSelectedReportId(id)}
        />

        {/* Legend */}
        <Legend />

        {/* Floating Quick Action Button on Mobile */}
        <div className="floating-bottom-bar glass-panel">
          <button
            onClick={() => {
              setClickedLocation(null);
              setReportModalOpen(true);
            }}
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
      </div>

      {/* Modals */}
      {reportModalOpen && (
        <ReportModal
          initialLocation={clickedLocation}
          onClose={() => setReportModalOpen(false)}
          onSubmit={handleAddReport}
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
