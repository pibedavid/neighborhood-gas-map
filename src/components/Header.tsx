import React, { useState } from 'react';
import { AlertTriangle, MapPin, List, FileSpreadsheet, Layers, Filter } from 'lucide-react';
import { FilterState, GasReport } from '../types';

interface HeaderProps {
  reports: GasReport[];
  filter: FilterState;
  onFilterChange: (f: FilterState) => void;
  onOpenReportModal: () => void;
  onOpenListModal: () => void;
  onOpenExportModal: () => void;
  tileLayer: 'street' | 'satellite';
  onToggleTileLayer: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  reports,
  filter,
  onFilterChange,
  onOpenReportModal,
  onOpenListModal,
  onOpenExportModal,
  tileLayer,
  onToggleTileLayer
}) => {
  const [showSafetyBanner, setShowSafetyBanner] = useState(true);
  const [showFilterBar, setShowFilterBar] = useState(false);

  const activeReportsCount = reports.length;

  return (
    <header className="header-wrapper" style={{ zIndex: 600 }}>
      {/* Emergency Notice Ribbon */}
      {showSafetyBanner && (
        <div
          style={{
            background: 'linear-gradient(90deg, #b91c1c 0%, #dc2626 100%)',
            color: '#ffffff',
            padding: '6px 16px',
            fontSize: '12px',
            fontWeight: '600',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 2px 6px rgba(0,0,0,0.2)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <AlertTriangle size={15} style={{ flexShrink: 0 }} />
            <span>
              <strong>Safety Reminder:</strong> If you smell strong gas indoors or near your house meter, leave immediately and call Atmos Energy at{' '}
              <a href="tel:8663228667" style={{ color: '#fef08a', textDecoration: 'underline', fontWeight: '700' }}>
                866-322-8667
              </a>{' '}
              or <strong>911</strong>.
            </span>
          </div>
          <button
            onClick={() => setShowSafetyBanner(false)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'rgba(255,255,255,0.8)',
              fontSize: '16px',
              cursor: 'pointer',
              padding: '0 4px',
              marginLeft: '8px'
            }}
            title="Dismiss notice"
          >
            ×
          </button>
        </div>
      )}

      {/* Main Glass Navbar */}
      <div
        className="glass-panel"
        style={{
          padding: '12px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          borderBottom: '1px solid rgba(226, 232, 240, 0.9)'
        }}
      >
        {/* Brand / Context */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #f59e0b 0%, #ea580c 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              boxShadow: '0 4px 10px rgba(234, 88, 12, 0.3)',
              flexShrink: 0
            }}
          >
            <MapPin size={22} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 style={{ fontSize: '16px', fontWeight: '800', color: '#0f172a', letterSpacing: '-0.3px' }}>
                Gas Odor Community Tracker
              </h1>
              <span
                style={{
                  background: '#eff6ff',
                  color: '#1d4ed8',
                  padding: '2px 8px',
                  borderRadius: '20px',
                  fontSize: '11px',
                  fontWeight: '700',
                  border: '1px solid #bfdbfe'
                }}
              >
                {activeReportsCount} {activeReportsCount === 1 ? 'Report' : 'Reports'}
              </span>
            </div>
            <p style={{ fontSize: '12px', color: '#64748b', fontWeight: '500' }}>
              Golden Aspen Dr • Pond & Trail Common Area (Flower Mound)
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {/* Tile Layer Toggle: Street vs Satellite */}
          <button
            onClick={onToggleTileLayer}
            className="btn-secondary"
            title="Toggle Aerial Satellite View"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Layers size={15} />
            <span className="hide-on-mobile">{tileLayer === 'street' ? 'Satellite View' : 'Map View'}</span>
          </button>

          {/* Filter Toggle */}
          <button
            onClick={() => setShowFilterBar(!showFilterBar)}
            className="btn-secondary"
            style={{
              background: showFilterBar || filter.timeOfDay.length < 4 ? '#eff6ff' : '#ffffff',
              borderColor: showFilterBar || filter.timeOfDay.length < 4 ? '#3b82f6' : '#cbd5e1'
            }}
          >
            <Filter size={15} />
            <span className="hide-on-mobile">Filter</span>
          </button>

          {/* List Modal */}
          <button onClick={onOpenListModal} className="btn-secondary">
            <List size={15} />
            <span className="hide-on-mobile">View All</span>
          </button>

          {/* HOA & Atmos Export Dossier */}
          <button
            onClick={onOpenExportModal}
            className="btn-secondary"
            style={{ borderColor: '#0d9488', color: '#0f766e', background: '#f0fdfa' }}
            title="Generate formatted report for HOA and Atmos Techs"
          >
            <FileSpreadsheet size={15} />
            <span>Export for HOA / Atmos</span>
          </button>

          {/* Primary Action Button */}
          <button onClick={onOpenReportModal} className="btn-primary">
            <MapPin size={16} />
            <span>+ Report Smell</span>
          </button>
        </div>
      </div>

      {/* Filter Bar (Collapsible) */}
      {showFilterBar && (
        <div
          className="glass-panel"
          style={{
            padding: '10px 18px',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            flexWrap: 'wrap',
            fontSize: '13px'
          }}
        >
          <span style={{ fontWeight: '700', color: '#334155' }}>Filter by Time of Day:</span>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {(['morning', 'afternoon', 'evening', 'night'] as const).map((tod) => {
              const active = filter.timeOfDay.includes(tod);
              const labels = {
                morning: '🌅 Morning (Yellow)',
                afternoon: '☀️ Afternoon (Blue)',
                evening: '🌆 Evening (Red)',
                night: '🌙 Night (Purple)'
              };
              return (
                <button
                  key={tod}
                  onClick={() => {
                    const next = active
                      ? filter.timeOfDay.filter((t) => t !== tod)
                      : [...filter.timeOfDay, tod];
                    // Keep at least one or restore all
                    onFilterChange({
                      ...filter,
                      timeOfDay: next.length === 0 ? ['morning', 'afternoon', 'evening', 'night'] : next
                    });
                  }}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '20px',
                    fontSize: '12px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    border: '1px solid',
                    borderColor: active ? '#2563eb' : '#cbd5e1',
                    background: active ? '#eff6ff' : '#ffffff',
                    color: active ? '#1d4ed8' : '#64748b'
                  }}
                >
                  {labels[tod]}
                </button>
              );
            })}
          </div>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
            <button
              onClick={() =>
                onFilterChange({
                  timeOfDay: ['morning', 'afternoon', 'evening', 'night'],
                  intensity: ['faint', 'moderate', 'strong'],
                  date: 'all'
                })
              }
              style={{
                background: 'none',
                border: 'none',
                color: '#64748b',
                cursor: 'pointer',
                fontSize: '12px',
                textDecoration: 'underline'
              }}
            >
              Reset Filters
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
