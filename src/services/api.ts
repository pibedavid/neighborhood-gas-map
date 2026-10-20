import { GasReport, NewReportInput } from '../types';

const STORAGE_KEY = 'neighborhood_gas_reports_v1';

// Seed initial reports based on the user's Facebook post to jumpstart the map
const SEED_REPORTS: GasReport[] = [
  {
    id: 'seed-1',
    lat: 33.03485,
    lng: -97.04615,
    timeOfDay: 'afternoon',
    observedDate: '2026-10-18',
    observedTime: '03:15 PM',
    intensity: 'moderate',
    smellType: 'rotten-egg',
    windCondition: 'light-breeze',
    windDirection: 'South',
    notes: 'Outside corner house on Golden Aspen Dr. Atmos tech inspected meter/perimeter later and found no leak at meter.',
    reportedBy: 'Dave (Golden Aspen Dr)',
    createdAt: '2026-10-18T15:30:00.000Z'
  },
  {
    id: 'seed-2',
    lat: 33.03532,
    lng: -97.04662,
    timeOfDay: 'evening',
    observedDate: '2026-10-19',
    observedTime: '08:45 PM',
    intensity: 'moderate',
    smellType: 'rotten-egg',
    windCondition: 'calm',
    notes: 'Distinct whiff coming across the wooden bridge over the pond / spillway path.',
    reportedBy: 'Dave (Golden Aspen Dr)',
    createdAt: '2026-10-19T21:00:00.000Z'
  },
  {
    id: 'seed-3',
    lat: 33.03518,
    lng: -97.04780,
    timeOfDay: 'morning',
    observedDate: '2026-10-20',
    observedTime: '08:10 AM',
    intensity: 'faint',
    smellType: 'sulfur',
    windCondition: 'light-breeze',
    notes: 'Neighbor walking path between Golden Aspen and far side of the pond noticed it on morning walk.',
    reportedBy: 'Walking Neighbor',
    createdAt: '2026-10-20T08:30:00.000Z'
  }
];

function getLocalReports(): GasReport[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(SEED_REPORTS));
      return SEED_REPORTS;
    }
    return JSON.parse(raw);
  } catch {
    return SEED_REPORTS;
  }
}

function saveLocalReports(reports: GasReport[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(reports));
  } catch (err) {
    console.error('Failed to save to localStorage', err);
  }
}

export async function fetchReports(): Promise<GasReport[]> {
  try {
    const res = await fetch('/api/reports', {
      headers: { Accept: 'application/json' }
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        return data;
      }
    }
  } catch {
    // Edge API unavailable (e.g. local dev); proceed to localStorage fallback
  }

  return getLocalReports();
}

const MY_REPORTS_KEY = 'neighborhood_my_report_ids_v1';

export function getMyReportIds(): string[] {
  try {
    const raw = localStorage.getItem(MY_REPORTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveMyReportId(id: string): void {
  try {
    const current = getMyReportIds();
    if (!current.includes(id)) {
      localStorage.setItem(MY_REPORTS_KEY, JSON.stringify([id, ...current]));
    }
  } catch {
    // ignore
  }
}

export function removeMyReportId(id: string): void {
  try {
    const current = getMyReportIds();
    localStorage.setItem(MY_REPORTS_KEY, JSON.stringify(current.filter((x) => x !== id)));
  } catch {
    // ignore
  }
}

export function isMyReport(id: string): boolean {
  return getMyReportIds().includes(id);
}

export async function submitReport(input: NewReportInput): Promise<GasReport> {
  const newReport: GasReport = {
    ...input,
    id: 'rep-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
    reportedBy: input.reportedBy?.trim() || 'Anonymous Neighbor',
    createdAt: new Date().toISOString()
  };

  saveMyReportId(newReport.id);

  // Attempt to submit to Cloudflare Pages Function
  try {
    const res = await fetch('/api/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newReport)
    });
    if (res.ok) {
      const saved = await res.json();
      // Mirror to local storage for instant responsiveness
      const current = getLocalReports();
      saveLocalReports([saved, ...current]);
      return saved;
    }
  } catch {
    // Fall back to local storage
  }

  const current = getLocalReports();
  const updated = [newReport, ...current];
  saveLocalReports(updated);
  return newReport;
}

export async function updateReport(
  id: string,
  updates: Partial<GasReport>
): Promise<GasReport> {
  const current = getLocalReports();
  const existing = current.find((r) => r.id === id);
  const updated: GasReport = {
    ...(existing || (updates as GasReport)),
    ...updates,
    id
  };

  // Attempt Cloudflare Pages Function PUT
  try {
    const res = await fetch('/api/reports', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated)
    });
    if (res.ok) {
      const saved = await res.json();
      const updatedList = current.map((r) => (r.id === id ? saved : r));
      saveLocalReports(updatedList);
      return saved;
    }
  } catch {
    // Fall back to local storage
  }

  const updatedList = current.map((r) => (r.id === id ? updated : r));
  saveLocalReports(updatedList);
  return updated;
}

export async function deleteReport(id: string): Promise<boolean> {
  removeMyReportId(id);

  try {
    await fetch(`/api/reports?id=${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
  } catch {
    // ignore
  }

  const current = getLocalReports();
  const filtered = current.filter((r) => r.id !== id);
  saveLocalReports(filtered);
  return true;
}
