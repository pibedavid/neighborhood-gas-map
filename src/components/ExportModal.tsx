import React, { useState } from 'react';
import { X, Download, Copy, Check, FileSpreadsheet } from 'lucide-react';
import { GasReport } from '../types';
import { getLocalTodayDate } from '../services/api';

interface ExportModalProps {
  reports: GasReport[];
  onClose: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({ reports, onClose }) => {
  const [copied, setCopied] = useState(false);

  // Stats calculation
  const totalReports = reports.length;
  const morningCount = reports.filter((r) => r.timeOfDay === 'morning').length;
  const afternoonCount = reports.filter((r) => r.timeOfDay === 'afternoon').length;
  const eveningCount = reports.filter((r) => r.timeOfDay === 'evening').length;
  const nightCount = reports.filter((r) => r.timeOfDay === 'night').length;
  const strongCount = reports.filter((r) => r.intensity === 'strong').length;

  // Build plain text summary for HOA email / FB post
  const buildTextSummary = () => {
    let text = `NEIGHBORHOOD NATURAL GAS ODOR INCIDENT REPORT\n`;
    text += `Area: Golden Aspen Dr, Rosewood Trail, Neighborhood Pond Common Area (Flower Mound, TX)\n`;
    text += `Generated: ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}\n`;
    text += `Total Community Reports: ${totalReports}\n`;
    text += `Breakdown: Morning: ${morningCount} | Afternoon: ${afternoonCount} | Evening: ${eveningCount} | Night: ${nightCount}\n`;
    text += `High Intensity Sightings: ${strongCount}\n\n`;
    text += `DETAILED SIGHTINGS LOG:\n`;
    text += `------------------------------------------------------------\n`;

    reports.forEach((r, idx) => {
      const latStr = typeof r.lat === 'number' ? r.lat.toFixed(6) : 'N/A';
      const lngStr = typeof r.lng === 'number' ? r.lng.toFixed(6) : 'N/A';
      text += `${idx + 1}. [${r.observedDate || ''} @ ${r.observedTime || ''}] (${(r.timeOfDay || '').toUpperCase()} - ${(r.intensity || '').toUpperCase()})\n`;
      text += `   Coordinates: ${latStr}, ${lngStr}\n`;
      if (r.notes) text += `   Location / Notes: "${r.notes}"\n`;
      text += `   Reported by: ${r.reportedBy || 'Anonymous'} | Wind: ${r.windCondition || 'N/A'}\n\n`;
    });

    text += `------------------------------------------------------------\n`;
    text += `Purpose: Provided to HOA Board & Atmos Energy field investigation crew to identify common easement/drainage line pockets.`;
    return text;
  };

  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(buildTextSummary());
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // ignore
    }
  };

  const sanitizeCsvCell = (val: string | number | undefined | null): string => {
    if (val === undefined || val === null) return '""';
    let s = String(val);
    // Escape formula triggers for spreadsheet apps
    if (/^[=+\-@\t\r]/.test(s)) {
      s = "'" + s;
    }
    return `"${s.replace(/"/g, '""')}"`;
  };

  const handleDownloadCSV = () => {
    const headers = [
      'Report ID',
      'Date',
      'Time',
      'Time Of Day',
      'Intensity',
      'Smell Type',
      'Wind Condition',
      'Latitude',
      'Longitude',
      'Notes',
      'Reported By',
      'Created At'
    ];

    const rows = reports.map((r) => [
      sanitizeCsvCell(r.id),
      sanitizeCsvCell(r.observedDate),
      sanitizeCsvCell(r.observedTime),
      sanitizeCsvCell(r.timeOfDay),
      sanitizeCsvCell(r.intensity),
      sanitizeCsvCell(r.smellType),
      sanitizeCsvCell(r.windCondition),
      typeof r.lat === 'number' ? r.lat.toFixed(6) : '',
      typeof r.lng === 'number' ? r.lng.toFixed(6) : '',
      sanitizeCsvCell(r.notes),
      sanitizeCsvCell(r.reportedBy),
      sanitizeCsvCell(r.createdAt)
    ]);

    // Use UTF-8 BOM (\uFEFF) and Blob object URL to prevent truncation at '#' or encoding loss
    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `neighborhood_gas_reports_${getLocalTodayDate()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };


  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '640px' }}
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: '#f0fdfa',
                color: '#0d9488',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <FileSpreadsheet size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: '16px', fontWeight: '800', color: '#0f172a' }}>
                HOA & Atmos Field Dossier
              </h2>
              <p style={{ fontSize: '11px', color: '#64748b' }}>
                Exportable summary for HOA board, property management & Atmos Energy techs
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '20px' }}>
          {/* Quick Metrics */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '8px',
              marginBottom: '16px'
            }}
          >
            <div
              style={{
                background: '#f8fafc',
                padding: '10px',
                borderRadius: '10px',
                textAlign: 'center',
                border: '1px solid #e2e8f0'
              }}
            >
              <div style={{ fontSize: '20px', fontWeight: '800', color: '#0f172a' }}>
                {totalReports}
              </div>
              <div style={{ fontSize: '11px', color: '#64748b' }}>Total Sightings</div>
            </div>
            <div
              style={{
                background: '#fef3c7',
                padding: '10px',
                borderRadius: '10px',
                textAlign: 'center',
                border: '1px solid #fde68a'
              }}
            >
              <div style={{ fontSize: '20px', fontWeight: '800', color: '#d97706' }}>
                {morningCount}
              </div>
              <div style={{ fontSize: '11px', color: '#b45309' }}>🌅 Morning</div>
            </div>
            <div
              style={{
                background: '#ffedd5',
                padding: '10px',
                borderRadius: '10px',
                textAlign: 'center',
                border: '1px solid #fed7aa'
              }}
            >
              <div style={{ fontSize: '20px', fontWeight: '800', color: '#ea580c' }}>
                {afternoonCount}
              </div>
              <div style={{ fontSize: '11px', color: '#c2410c' }}>☀️ Afternoon</div>
            </div>
            <div
              style={{
                background: '#ede9fe',
                padding: '10px',
                borderRadius: '10px',
                textAlign: 'center',
                border: '1px solid #ddd6fe'
              }}
            >
              <div style={{ fontSize: '20px', fontWeight: '800', color: '#7c3aed' }}>
                {eveningCount + nightCount}
              </div>
              <div style={{ fontSize: '11px', color: '#6d28d9' }}>🌆 Night/Eve</div>
            </div>
          </div>

          {/* Text preview box */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '12px', fontWeight: '700', color: '#334155', display: 'block', marginBottom: '6px' }}>
              Summary Text (Formatted for Email / Facebook)
            </label>
            <textarea
              readOnly
              rows={8}
              value={buildTextSummary()}
              style={{
                width: '100%',
                fontFamily: 'monospace',
                fontSize: '11px',
                padding: '10px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                background: '#f8fafc',
                color: '#1e293b',
                lineHeight: '1.4'
              }}
            />
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              onClick={handleCopyText}
              className="btn-secondary"
              style={{ flex: 1, justifyContent: 'center' }}
            >
              {copied ? <Check size={16} color="#16a34a" /> : <Copy size={16} />}
              <span>{copied ? 'Copied to Clipboard!' : 'Copy Summary Text'}</span>
            </button>
            <button
              onClick={handleDownloadCSV}
              className="btn-primary"
              style={{
                flex: 1,
                justifyContent: 'center',
                background: 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)',
                boxShadow: '0 4px 14px rgba(13, 148, 136, 0.4)'
              }}
            >
              <Download size={16} />
              <span>Download CSV File</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
