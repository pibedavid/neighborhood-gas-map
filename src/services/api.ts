import { GasReport, NewReportInput } from '../types';

const STORAGE_KEY = 'neighborhood_gas_reports_v2';
const TOKENS_KEY = 'neighborhood_report_tokens_v1';

// Clean slate: no fake mock pins in production
const SEED_REPORTS: GasReport[] = [];

// Edit Tokens map: { [id: string]: string }
function getTokensMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(TOKENS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveEditToken(id: string, token: string): void {
  try {
    const map = getTokensMap();
    map[id] = token;
    localStorage.setItem(TOKENS_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

export function getEditToken(id: string): string | undefined {
  return getTokensMap()[id];
}

export function removeEditToken(id: string): void {
  try {
    const map = getTokensMap();
    delete map[id];
    localStorage.setItem(TOKENS_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

export function getMyReportIds(): string[] {
  return Object.keys(getTokensMap());
}

export function isMyReport(id: string): boolean {
  return Boolean(getEditToken(id));
}

export function getLocalTodayDate(): string {
  // Returns YYYY-MM-DD in local browser time zone (fixes UTC after-7pm bug)
  return new Date().toLocaleDateString('en-CA');
}

function getLocalReports(): GasReport[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return SEED_REPORTS;
    }
    const parsed = JSON.parse(raw);
    // Filter out any legacy test seed pins
    return Array.isArray(parsed)
      ? parsed.filter((r: GasReport) => !r.id.startsWith('seed-'))
      : SEED_REPORTS;
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
      if (Array.isArray(data)) {
        // Filter out legacy seeds
        const cleaned = data.filter((r) => !r.id.startsWith('seed-'));
        saveLocalReports(cleaned);
        return cleaned;
      }
    }
  } catch {
    // Edge API unavailable (e.g. offline dev); fall back to local storage
  }

  return getLocalReports();
}

export async function submitReport(
  input: NewReportInput,
  turnstileToken?: string
): Promise<GasReport> {
  const payload = {
    ...input,
    turnstileToken
  };

  try {
    const res = await fetch('/api/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      const saved = await res.json();
      if (saved.editToken) {
        saveEditToken(saved.id, saved.editToken);
      }
      const current = getLocalReports();
      saveLocalReports([saved, ...current]);
      return saved;
    } else {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Failed to submit report');
    }
  } catch (err) {
    // If running in pure offline dev with no backend
    if (import.meta.env.DEV) {
      const localReport: GasReport = {
        ...input,
        id: 'rep-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
        reportedBy: input.reportedBy?.trim() || 'Anonymous Neighbor',
        createdAt: new Date().toISOString()
      };
      saveEditToken(localReport.id, 'dev-token');
      const current = getLocalReports();
      saveLocalReports([localReport, ...current]);
      return localReport;
    }
    throw err;
  }
}

export async function updateReport(
  id: string,
  updates: Partial<GasReport>
): Promise<GasReport> {
  const token = getEditToken(id);

  try {
    const res = await fetch('/api/reports', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'X-Edit-Token': token } : {})
      },
      body: JSON.stringify({ id, ...updates })
    });

    if (res.ok) {
      const saved = await res.json();
      const current = getLocalReports();
      const updatedList = current.map((r) => (r.id === id ? saved : r));
      saveLocalReports(updatedList);
      return saved;
    } else {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Failed to update report');
    }
  } catch (err) {
    if (import.meta.env.DEV) {
      const current = getLocalReports();
      const existing = current.find((r) => r.id === id);
      const updated: GasReport = {
        ...(existing || (updates as GasReport)),
        ...updates,
        id
      };
      saveLocalReports(current.map((r) => (r.id === id ? updated : r)));
      return updated;
    }
    throw err;
  }
}

export async function deleteReport(id: string): Promise<boolean> {
  const token = getEditToken(id);

  try {
    const res = await fetch(`/api/reports?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: {
        ...(token ? { 'X-Edit-Token': token } : {})
      }
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Failed to delete report');
    }
  } catch (err) {
    if (!import.meta.env.DEV) {
      throw err;
    }
  }

  removeEditToken(id);
  const current = getLocalReports();
  const filtered = current.filter((r) => r.id !== id);
  saveLocalReports(filtered);
  return true;
}
