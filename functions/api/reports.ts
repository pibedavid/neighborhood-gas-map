// Cloudflare Pages Function: /api/reports
// Backed exclusively by Cloudflare D1 (Serverless SQLite)

interface Env {
  DB?: D1Database;
  TURNSTILE_SECRET_KEY?: string;
  ADMIN_API_KEY?: string;
}

interface ReportRow {
  id: string;
  lat: number;
  lng: number;
  time_of_day: string;
  observed_date: string;
  observed_time: string;
  intensity: string;
  smell_type: string;
  wind_condition: string;
  wind_direction?: string | null;
  notes?: string | null;
  reported_by?: string | null;
  edit_token_hash?: string | null;
  is_deleted?: number;
  created_at: string;
  updated_at?: string | null;
}

interface ValidatedReportFields {
  lat: number;
  lng: number;
  timeOfDay: string;
  observedDate: string;
  observedTime: string;
  intensity: string;
  smellType: string;
  windCondition: string;
  windDirection: string | null;
  notes: string;
  reportedBy: string;
}

async function sha256(text: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function formatClientReport(row: ReportRow) {
  return {
    id: row.id,
    lat: Number(row.lat),
    lng: Number(row.lng),
    timeOfDay: row.time_of_day,
    observedDate: row.observed_date,
    observedTime: row.observed_time,
    intensity: row.intensity,
    smellType: row.smell_type,
    windCondition: row.wind_condition,
    windDirection: row.wind_direction || undefined,
    notes: row.notes || '',
    reportedBy: row.reported_by || 'Anonymous Neighbor',
    createdAt: row.created_at,
    updatedAt: row.updated_at || undefined
  };
}

// Single Shared Validator for both POST (Create) and PUT (Update)
function validateReportFields(
  body: Record<string, unknown>,
  existing?: ReportRow
): { valid: true; data: ValidatedReportFields } | { valid: false; error: string } {
  // 1. Coordinates Validation
  const lat = body.lat !== undefined ? Number(body.lat) : (existing ? Number(existing.lat) : NaN);
  const lng = body.lng !== undefined ? Number(body.lng) : (existing ? Number(existing.lng) : NaN);

  if (isNaN(lat) || isNaN(lng) || !isFinite(lat) || !isFinite(lng)) {
    return { valid: false, error: 'Valid numerical coordinates are required' };
  }

  // Pin geofence: Confines pin drops to the Flower Mound neighborhood & trails (approx 2.5 miles)
  if (lat < 33.01 || lat > 33.06 || lng < -97.08 || lng > -97.02) {
    return {
      valid: false,
      error: 'Pin coordinates must be within the Flower Mound neighborhood area (Golden Aspen / Pond vicinity)'
    };
  }

  // 2. Strict Enum Validations
  const timeOfDay = String(body.timeOfDay ?? (existing ? existing.time_of_day : 'morning'));
  if (!['morning', 'afternoon', 'evening', 'night'].includes(timeOfDay)) {
    return { valid: false, error: 'Invalid timeOfDay: must be morning, afternoon, evening, or night' };
  }

  const intensity = String(body.intensity ?? (existing ? existing.intensity : 'moderate'));
  if (!['faint', 'moderate', 'strong'].includes(intensity)) {
    return { valid: false, error: 'Invalid intensity: must be faint, moderate, or strong' };
  }

  const smellType = String(body.smellType ?? (existing ? existing.smell_type : 'rotten-egg'));
  if (!['rotten-egg', 'sulfur', 'chemical', 'other'].includes(smellType)) {
    return { valid: false, error: 'Invalid smellType: must be rotten-egg, sulfur, chemical, or other' };
  }

  const windCondition = String(body.windCondition ?? (existing ? existing.wind_condition : 'light-breeze'));
  if (!['light-breeze', 'calm', 'windy', 'unknown'].includes(windCondition)) {
    return { valid: false, error: 'Invalid windCondition: must be light-breeze, calm, windy, or unknown' };
  }

  // 3. Strict Date Validation (YYYY-MM-DD, within 90 days, not in future)
  const observedDate = String(body.observedDate ?? (existing ? existing.observed_date : ''));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(observedDate)) {
    return { valid: false, error: 'Invalid observedDate format: must be YYYY-MM-DD' };
  }
  const dateObj = new Date(observedDate + 'T00:00:00Z');
  if (isNaN(dateObj.getTime())) {
    return { valid: false, error: 'Invalid calendar date' };
  }
  const now = Date.now();
  const maxFuture = now + 86400000 * 2; // 2 days leeway for time zones
  const maxPast = now - 86400000 * 90; // Within past 90 days
  if (dateObj.getTime() > maxFuture || dateObj.getTime() < maxPast) {
    return { valid: false, error: 'Date must be within the last 90 days and not in the future' };
  }

  // 4. String Length Limits
  const observedTime = String(body.observedTime ?? (existing ? existing.observed_time : 'Approx. Sighting')).substring(0, 40);
  const windDirection = body.windDirection !== undefined
    ? (body.windDirection ? String(body.windDirection).substring(0, 60) : null)
    : (existing ? existing.wind_direction : null);
  const notes = body.notes !== undefined
    ? String(body.notes || '').substring(0, 500)
    : (existing ? existing.notes || '' : '');
  const reportedBy = body.reportedBy !== undefined
    ? (String(body.reportedBy || '').trim().substring(0, 80) || 'Anonymous Neighbor')
    : (existing ? existing.reported_by || 'Anonymous Neighbor' : 'Anonymous Neighbor');

  return {
    valid: true,
    data: {
      lat,
      lng,
      timeOfDay,
      observedDate,
      observedTime,
      intensity,
      smellType,
      windCondition,
      windDirection,
      notes,
      reportedBy
    }
  };
}

async function parseJsonBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// ----------------------------------------------------
// GET /api/reports
// ----------------------------------------------------
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const db = context.env.DB;
  if (!db) {
    return new Response(JSON.stringify({ error: 'Storage not configured: missing D1 DB binding' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const { results } = await db
      .prepare('SELECT * FROM reports WHERE is_deleted = 0 ORDER BY created_at DESC LIMIT 500')
      .all<ReportRow>();

    const clientReports = (results || []).map(formatClientReport);
    return new Response(JSON.stringify(clientReports), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      }
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: 'Database query failed', details: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

// ----------------------------------------------------
// POST /api/reports (Submit Sighting)
// ----------------------------------------------------
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const db = context.env.DB;
  if (!db) {
    return new Response(JSON.stringify({ error: 'Storage not configured: missing D1 DB binding' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const body = await parseJsonBody(context.request);
  if (!body) {
    return new Response(JSON.stringify({ error: 'Malformed JSON payload' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Bot Protection (Turnstile if secret is configured in Pages environment)
  if (context.env.TURNSTILE_SECRET_KEY) {
    const token = body.turnstileToken;
    if (!token || typeof token !== 'string') {
      return new Response(JSON.stringify({ error: 'Turnstile verification token required' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    try {
      const verifyRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `secret=${encodeURIComponent(context.env.TURNSTILE_SECRET_KEY)}&response=${encodeURIComponent(token)}`
      });
      const outcome = (await verifyRes.json()) as { success: boolean };
      if (!outcome.success) {
        return new Response(JSON.stringify({ error: 'Turnstile bot challenge failed' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    } catch {
      return new Response(JSON.stringify({ error: 'Bot verification service unavailable' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  // Schema Validation via Shared Validator
  const validation = validateReportFields(body);
  if (!validation.valid) {
    return new Response(JSON.stringify({ error: validation.error }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  const f = validation.data;

  // Authoritative server-side ID & private editToken
  const id = 'rep-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8);
  const editToken = crypto.randomUUID();
  const editTokenHash = await sha256(editToken);
  const createdAt = new Date().toISOString();

  try {
    await db
      .prepare(`
        INSERT INTO reports (
          id, lat, lng, time_of_day, observed_date, observed_time,
          intensity, smell_type, wind_condition, wind_direction,
          notes, reported_by, edit_token_hash, is_deleted, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
      `)
      .bind(
        id,
        f.lat,
        f.lng,
        f.timeOfDay,
        f.observedDate,
        f.observedTime,
        f.intensity,
        f.smellType,
        f.windCondition,
        f.windDirection,
        f.notes,
        f.reportedBy,
        editTokenHash,
        createdAt
      )
      .run();

    const clientResponse = {
      id,
      lat: f.lat,
      lng: f.lng,
      timeOfDay: f.timeOfDay,
      observedDate: f.observedDate,
      observedTime: f.observedTime,
      intensity: f.intensity,
      smellType: f.smellType,
      windCondition: f.windCondition,
      windDirection: f.windDirection || undefined,
      notes: f.notes,
      reportedBy: f.reportedBy,
      createdAt,
      editToken // Private token returned to authoring device only
    };

    return new Response(JSON.stringify(clientResponse), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: 'Failed to insert report', details: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

// ----------------------------------------------------
// PUT /api/reports (Update / Move Pin)
// ----------------------------------------------------
export const onRequestPut: PagesFunction<Env> = async (context) => {
  const db = context.env.DB;
  if (!db) {
    return new Response(JSON.stringify({ error: 'Storage not configured: missing D1 DB binding' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const body = await parseJsonBody(context.request);
  if (!body) {
    return new Response(JSON.stringify({ error: 'Malformed JSON payload' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const id = String(body.id || '');
  if (!id) {
    return new Response(JSON.stringify({ error: 'Missing report id' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Authorization: X-Edit-Token or X-Admin-Key
  const clientToken = context.request.headers.get('X-Edit-Token') || (body.editToken as string);
  const adminKey = context.request.headers.get('X-Admin-Key');
  const isAdmin = Boolean(context.env.ADMIN_API_KEY && adminKey === context.env.ADMIN_API_KEY);

  try {
    const existing = await db
      .prepare('SELECT * FROM reports WHERE id = ? AND is_deleted = 0')
      .bind(id)
      .first<ReportRow>();

    if (!existing) {
      return new Response(JSON.stringify({ error: 'Report not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Fail-Closed Edit Authorization
    if (!isAdmin) {
      if (!clientToken) {
        return new Response(JSON.stringify({ error: 'Unauthorized: missing edit token' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      if (!existing.edit_token_hash) {
        return new Response(JSON.stringify({ error: 'Forbidden: record requires admin authorization' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      const clientHash = await sha256(clientToken);
      if (clientHash !== existing.edit_token_hash) {
        return new Response(JSON.stringify({ error: 'Forbidden: invalid edit token' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // Shared Schema Validation on PUT (fixes P1 update validation gap)
    const validation = validateReportFields(body, existing);
    if (!validation.valid) {
      return new Response(JSON.stringify({ error: validation.error }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    const f = validation.data;
    const updatedAt = new Date().toISOString();

    await db
      .prepare(`
        UPDATE reports SET
          lat = ?, lng = ?, time_of_day = ?, observed_date = ?, observed_time = ?,
          intensity = ?, smell_type = ?, wind_condition = ?, wind_direction = ?,
          notes = ?, reported_by = ?, updated_at = ?
        WHERE id = ?
      `)
      .bind(
        f.lat,
        f.lng,
        f.timeOfDay,
        f.observedDate,
        f.observedTime,
        f.intensity,
        f.smellType,
        f.windCondition,
        f.windDirection,
        f.notes,
        f.reportedBy,
        updatedAt,
        id
      )
      .run();

    const updatedRow = await db
      .prepare('SELECT * FROM reports WHERE id = ?')
      .bind(id)
      .first<ReportRow>();

    return new Response(JSON.stringify(formatClientReport(updatedRow!)), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: 'Failed to update report', details: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

// ----------------------------------------------------
// DELETE /api/reports?id=... (Soft Delete)
// ----------------------------------------------------
export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const db = context.env.DB;
  if (!db) {
    return new Response(JSON.stringify({ error: 'Storage not configured: missing D1 DB binding' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const url = new URL(context.request.url);
  const id = url.searchParams.get('id');

  if (!id) {
    return new Response(JSON.stringify({ error: 'Missing report id' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const clientToken = context.request.headers.get('X-Edit-Token');
  const adminKey = context.request.headers.get('X-Admin-Key');
  const isAdmin = Boolean(context.env.ADMIN_API_KEY && adminKey === context.env.ADMIN_API_KEY);

  try {
    const existing = await db
      .prepare('SELECT * FROM reports WHERE id = ? AND is_deleted = 0')
      .bind(id)
      .first<ReportRow>();

    if (!existing) {
      return new Response(JSON.stringify({ error: 'Report not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Fail-Closed Delete Authorization
    if (!isAdmin) {
      if (!clientToken) {
        return new Response(JSON.stringify({ error: 'Unauthorized: missing edit token' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      if (!existing.edit_token_hash) {
        return new Response(JSON.stringify({ error: 'Forbidden: record requires admin authorization' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      const clientHash = await sha256(clientToken);
      if (clientHash !== existing.edit_token_hash) {
        return new Response(JSON.stringify({ error: 'Forbidden: invalid edit token' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // Soft delete preserves audit record for Atmos Energy / HOA
    await db
      .prepare('UPDATE reports SET is_deleted = 1, updated_at = ? WHERE id = ?')
      .bind(new Date().toISOString(), id)
      .run();

    return new Response(JSON.stringify({ success: true, id }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: 'Failed to delete report', details: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
