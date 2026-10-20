import React, { useState } from 'react';
import { X, MapPin, AlertCircle } from 'lucide-react';
import {
  GasReport,
  NewReportInput,
  TimeOfDay,
  Intensity,
  SmellType,
  WindCondition,
  TIME_OF_DAY_CONFIG,
  INTENSITY_CONFIG
} from '../types';
import { getLocalTodayDate } from '../services/api';

interface ReportModalProps {
  initialLocation: { lat: number; lng: number } | null;
  editingReport?: GasReport | null;
  onClose: () => void;
  onSubmit: (input: NewReportInput) => Promise<void>;
  onUpdate?: (id: string, updates: Partial<GasReport>) => Promise<void>;
}

export const ReportModal: React.FC<ReportModalProps> = ({
  initialLocation,
  editingReport,
  onClose,
  onSubmit,
  onUpdate
}) => {
  const defaultCoords = editingReport
    ? { lat: editingReport.lat, lng: editingReport.lng }
    : initialLocation || { lat: 33.03505, lng: -97.04638 };
  const lat = defaultCoords.lat;
  const lng = defaultCoords.lng;

  // Auto-detect current time of day if new report
  const currentHour = new Date().getHours();
  const defaultTod: TimeOfDay =
    currentHour >= 6 && currentHour < 12
      ? 'morning'
      : currentHour >= 12 && currentHour < 18
      ? 'afternoon'
      : currentHour >= 18 && currentHour < 22
      ? 'evening'
      : 'night';

  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>(
    editingReport?.timeOfDay || defaultTod
  );
  const [observedDate, setObservedDate] = useState<string>(
    editingReport?.observedDate || getLocalTodayDate()
  );
  const [observedTime, setObservedTime] = useState<string>(
    editingReport?.observedTime ||
      new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  );

  const [intensity, setIntensity] = useState<Intensity>(
    editingReport?.intensity || 'moderate'
  );
  const [smellType, setSmellType] = useState<SmellType>(
    editingReport?.smellType || 'rotten-egg'
  );
  const [windCondition, setWindCondition] = useState<WindCondition>(
    editingReport?.windCondition || 'light-breeze'
  );
  const [windDirection, setWindDirection] = useState<string>(
    editingReport?.windDirection || ''
  );
  const [notes, setNotes] = useState<string>(editingReport?.notes || '');
  const [reportedBy, setReportedBy] = useState<string>(
    editingReport?.reportedBy || ''
  );
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      if (editingReport && onUpdate) {
        await onUpdate(editingReport.id, {
          timeOfDay,
          observedDate,
          observedTime,
          intensity,
          smellType,
          windCondition,
          windDirection: windDirection.trim() || undefined,
          notes: notes.trim(),
          reportedBy: reportedBy.trim() || undefined
        });
      } else {
        await onSubmit({
          lat,
          lng,
          timeOfDay,
          observedDate,
          observedTime,
          intensity,
          smellType,
          windCondition,
          windDirection: windDirection.trim() || undefined,
          notes: notes.trim(),
          reportedBy: reportedBy.trim() || undefined
        });
      }
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save report';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: '#eff6ff',
                color: '#2563eb',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <MapPin size={18} />
            </div>
            <div>
              <h2 style={{ fontSize: '16px', fontWeight: '800', color: '#0f172a' }}>
                {editingReport ? 'Edit My Gas Sighting' : 'Report Gas Odor Sighting'}
              </h2>
              <p style={{ fontSize: '11px', color: '#64748b' }}>
                Pin location: {lat.toFixed(5)}, {lng.toFixed(5)}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#64748b',
              cursor: 'pointer',
              padding: '6px'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body Form */}
        <form onSubmit={handleSubmit} style={{ padding: '20px' }}>
          {error && (
            <div
              style={{
                padding: '10px 14px',
                background: '#fee2e2',
                color: '#b91c1c',
                borderRadius: '10px',
                fontSize: '13px',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {/* Time of Day (Crucial for Pin Color) */}
          <div className="form-group">
            <label className="form-label">
              <span>Time of Day (Sets Pin Color)</span>
              <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '500' }}>Required</span>
            </label>
            <div className="time-grid">
              {(['morning', 'afternoon', 'evening', 'night'] as TimeOfDay[]).map((tod) => {
                const conf = TIME_OF_DAY_CONFIG[tod];
                const isSelected = timeOfDay === tod;
                return (
                  <div
                    key={tod}
                    className={`time-card ${isSelected ? 'selected' : ''}`}
                    onClick={() => setTimeOfDay(tod)}
                    style={{
                      borderColor: isSelected ? conf.border : '#e2e8f0',
                      background: isSelected ? conf.bg : '#ffffff'
                    }}
                  >
                    <span style={{ fontSize: '20px' }}>{conf.emoji}</span>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{ fontSize: '13px', fontWeight: '700', color: conf.color }}>
                          {conf.label}
                        </div>
                        <span
                          style={{
                            width: '10px',
                            height: '10px',
                            borderRadius: '50%',
                            background: conf.color,
                            border: '1.5px solid #ffffff',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                            display: 'inline-block'
                          }}
                        />
                      </div>
                      <div style={{ fontSize: '10px', color: '#64748b' }}>{conf.timeRange}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Date & Specific Time */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="form-group">
              <label className="form-label">Date Noticed</label>
              <input
                type="date"
                className="form-input"
                value={observedDate}
                onChange={(e) => setObservedDate(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Approx. Time</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. 08:30 AM or Dusk"
                value={observedTime}
                onChange={(e) => setObservedTime(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Odor Intensity */}
          <div className="form-group">
            <label className="form-label">Odor Intensity</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              {(['faint', 'moderate', 'strong'] as Intensity[]).map((lvl) => {
                const conf = INTENSITY_CONFIG[lvl];
                const isSelected = intensity === lvl;
                return (
                  <button
                    type="button"
                    key={lvl}
                    onClick={() => setIntensity(lvl)}
                    style={{
                      padding: '10px 6px',
                      borderRadius: '10px',
                      border: '1.5px solid',
                      borderColor: isSelected ? '#2563eb' : '#cbd5e1',
                      background: isSelected ? '#eff6ff' : '#ffffff',
                      color: isSelected ? '#1d4ed8' : '#334155',
                      fontWeight: isSelected ? '700' : '600',
                      fontSize: '12px',
                      cursor: 'pointer',
                      textAlign: 'center'
                    }}
                  >
                    <div>{conf.label}</div>
                    <div style={{ fontSize: '10px', opacity: 0.8, marginTop: '2px' }}>{conf.badge}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Smell Type & Wind Condition */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="form-group">
              <label className="form-label">Smell Type</label>
              <select
                className="form-select"
                value={smellType}
                onChange={(e) => setSmellType(e.target.value as SmellType)}
              >
                <option value="rotten-egg">Rotten Egg (Mercaptan)</option>
                <option value="sulfur">Sulfur / Skunky</option>
                <option value="chemical">Chemical / Gasoline</option>
                <option value="other">Other / Stagnant</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Wind / Air Flow</label>
              <select
                className="form-select"
                value={windCondition}
                onChange={(e) => setWindCondition(e.target.value as WindCondition)}
              >
                <option value="light-breeze">Light Breeze</option>
                <option value="calm">Calm / Stagnant Air</option>
                <option value="windy">Windy / Gusts</option>
                <option value="unknown">Not sure</option>
              </select>
            </div>
          </div>

          {/* Wind Direction (Optional) */}
          {windCondition !== 'calm' && (
            <div className="form-group">
              <label className="form-label">
                <span>Wind Direction (Optional)</span>
                <span style={{ fontSize: '11px', color: '#64748b' }}>e.g. South, North, Toward Pond</span>
              </label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Blowing from South / toward trail"
                value={windDirection}
                onChange={(e) => setWindDirection(e.target.value)}
              />
            </div>
          )}

          {/* Specific Location Details / Landmark */}
          <div className="form-group">
            <label className="form-label">
              <span>Specific Location / Landmarks</span>
              <span style={{ fontSize: '11px', color: '#64748b' }}>Helpful for Atmos Tech</span>
            </label>
            <textarea
              className="form-textarea"
              rows={2}
              placeholder="e.g. Walking path across the bridge, near storm drain on west side of pond, or outside corner meter..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* Reporter Identity (Optional) */}
          <div className="form-group">
            <label className="form-label">
              <span>Your Name or Street (Optional)</span>
              <span style={{ fontSize: '11px', color: '#64748b' }}>Leave blank for Anonymous</span>
            </label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. Dave G., Pond neighbor, Golden Aspen resident (optional)"
              value={reportedBy}
              onChange={(e) => setReportedBy(e.target.value)}
            />
          </div>

          {/* Privacy & Community Notice */}
          <div style={{ fontSize: '11px', color: '#64748b', background: '#f8fafc', padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', marginTop: '8px', lineHeight: '1.4' }}>
            ℹ️ <strong>Community Record:</strong> Sightings are publicly visible on this map to help compile shared documentation for our HOA Board and Atmos Energy field technicians.
          </div>

          {/* Submit Actions */}
          <div style={{ marginTop: '20px', display: 'flex', gap: '10px' }}>
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary"
              style={{ flex: 1, justifyContent: 'center' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="btn-primary"
              style={{ flex: 2, justifyContent: 'center' }}
            >
              {submitting ? 'Saving...' : editingReport ? 'Update Sighting' : 'Pin This Sighting'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
