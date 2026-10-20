import React from 'react';
import { X, MapPin, Trash2 } from 'lucide-react';
import { GasReport, TIME_OF_DAY_CONFIG, INTENSITY_CONFIG } from '../types';
import { isMyReport } from '../services/api';

interface ReportListModalProps {
  reports: GasReport[];
  onClose: () => void;
  onSelectReport: (id: string) => void;
  onDeleteReport: (id: string) => void;
}

export const ReportListModal: React.FC<ReportListModalProps> = ({
  reports,
  onClose,
  onSelectReport,
  onDeleteReport
}) => {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '580px' }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div>
            <h2 style={{ fontSize: '16px', fontWeight: '800', color: '#0f172a' }}>
              All Reported Sightings ({reports.length})
            </h2>
            <p style={{ fontSize: '11px', color: '#64748b' }}>
              Chronological log of reported natural gas odors around Golden Aspen & Pond
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* List Content */}
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {reports.length === 0 ? (
            <div style={{ padding: '30px', textAlign: 'center', color: '#64748b' }}>
              No odor reports logged yet.
            </div>
          ) : (
            reports.map((report) => {
              const todConf = TIME_OF_DAY_CONFIG[report.timeOfDay] || TIME_OF_DAY_CONFIG.morning;
              const intConf = INTENSITY_CONFIG[report.intensity] || INTENSITY_CONFIG.moderate;
              const isMine = isMyReport(report.id);

              return (
                <div
                  key={report.id}
                  style={{
                    border: '1px solid #e2e8f0',
                    borderRadius: '12px',
                    padding: '14px',
                    background: '#ffffff',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      marginBottom: '8px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span
                        style={{
                          background: todConf.bg,
                          color: todConf.color,
                          border: `1px solid ${todConf.border}`,
                          fontSize: '11px',
                          fontWeight: '700',
                          padding: '2px 8px',
                          borderRadius: '12px'
                        }}
                      >
                        {todConf.emoji} {todConf.label}
                      </span>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: '600',
                          color: '#475569',
                          background: '#f1f5f9',
                          padding: '2px 6px',
                          borderRadius: '6px'
                        }}
                      >
                        {intConf.label}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button
                        onClick={() => {
                          onSelectReport(report.id);
                          onClose();
                        }}
                        style={{
                          background: '#eff6ff',
                          color: '#2563eb',
                          border: 'none',
                          padding: '4px 8px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: '700',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        <MapPin size={12} />
                        <span>Locate</span>
                      </button>

                      {isMine && (
                        <button
                          onClick={() => {
                            if (confirm('Delete your report?')) {
                              onDeleteReport(report.id);
                            }
                          }}
                          style={{
                            background: '#fef2f2',
                            border: '1px solid #fecaca',
                            color: '#b91c1c',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            padding: '4px 8px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '11px',
                            fontWeight: '600'
                          }}
                          title="Delete my pin"
                        >
                          <Trash2 size={12} />
                          <span>Delete</span>
                        </button>
                      )}
                    </div>
                  </div>


                  <div style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a', marginBottom: '4px' }}>
                    {report.observedDate} at {report.observedTime}
                  </div>

                  {report.notes && (
                    <div
                      style={{
                        fontSize: '12px',
                        color: '#334155',
                        background: '#f8fafc',
                        padding: '8px 10px',
                        borderRadius: '6px',
                        marginBottom: '8px',
                        lineHeight: '1.4'
                      }}
                    >
                      "{report.notes}"
                    </div>
                  )}

                  <div
                    style={{
                      fontSize: '11px',
                      color: '#64748b',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '6px'
                    }}
                  >
                    <span>
                      Smell: <strong>{report.smellType}</strong> • Wind: <strong>{report.windCondition}</strong>
                    </span>
                    <span>Reported by: <strong>{report.reportedBy}</strong></span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
