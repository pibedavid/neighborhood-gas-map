// Cloudflare Pages Function: /api/reports
// Supports Cloudflare D1 (Serverless SQLite) and KV fallback

interface Env {
  DB?: D1Database;
  GAS_REPORTS_KV?: KVNamespace;
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

// Ensure table exists on first run
async function ensureD1Table(db: D1Database) {
  await db
    .prepare(`
      CREATE TABLE IF NOT EXISTS reports (
        id TEXT PRIMARY KEY,
        lat REAL NOT NULL,
        lng REAL NOT NULL,
        time_of_day TEXT NOT NULL,
        observed_date TEXT NOT NULL,
        observed_time TEXT NOT NULL,
        intensity TEXT NOT NULL,
        smell_type TEXT NOT NULL,
        wind_condition TEXT NOT NULL,
        wind_direction TEXT,
        notes TEXT,
        reported_by TEXT,
        edit_token_hash TEXT,
        is_deleted INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT
      )
    `)
    .run();
}


// ----------------------------------------------------
// GET /api/reports
// ----------------------------------------------------
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const db = context.env.DB;
  const kv = context.env.GAS_REPORTS_KV;

  if (db) {
    try {
      await ensureD1Table(db);
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
      return new Response(JSON.stringify({ error: msg }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  // Fallback to KV if bound
  if (kv) {
    try {
      const raw = await kv.get('all_gas_reports');
      const reports = raw ? JSON.parse(raw) : [];
      return new Response(JSON.stringify(reports), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        }
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return new Response(JSON.stringify({ error: msg }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  // Local/unbound fallback: return empty list with header
  return new Response(JSON.stringify([]), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'X-Storage': 'unbound' }
  });
};

// ----------------------------------------------------
// POST /api/reports
// ----------------------------------------------------
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const db = context.env.DB;
  const kv = context.env.GAS_REPORTS_KV;

  try {
    const body = (await context.request.json()) as Record<string, unknown>;

    // 1. Bot Protection (Turnstile if secret is configured)
    if (context.env.TURNSTILE_SECRET_KEY && body.turnstileToken) {
      const verifyRes = await fetch(
        'https://challenges.cloudflare.com/turnstile/v0/siteverify',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `secret=${encodeURIComponent(
            context.env.TURNSTILE_SECRET_KEY
          )}&response=${encodeURIComponent(body.turnstileToken as string)}`
        }
      );
      const outcome = (await verifyRes.json()) as { success: boolean };
      if (!outcome.success) {
        return new Response(
          JSON.stringify({ error: 'Turnstile verification failed' }),
          { status: 403, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    // 2. Schema Validation
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return new Response(
        JSON.stringify({ error: 'Valid numerical coordinates required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const timeOfDay = String(body.timeOfDay || 'morning');
    if (!['morning', 'afternoon', 'evening', 'night'].includes(timeOfDay)) {
      return new Response(
        JSON.stringify({ error: 'Invalid timeOfDay value' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const intensity = String(body.intensity || 'moderate');
    if (!['faint', 'moderate', 'strong'].includes(intensity)) {
      return new Response(
        JSON.stringify({ error: 'Invalid intensity value' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const smellType = String(body.smellType || 'rotten-egg');
    const windCondition = String(body.windCondition || 'light-breeze');
    const windDirection = body.windDirection
      ? String(body.windDirection).substring(0, 60)
      : null;
    const notes = body.notes ? String(body.notes).substring(0, 500) : '';
    const reportedBy = body.reportedBy
      ? String(body.reportedBy).substring(0, 80)
      : 'Anonymous Neighbor';
    const observedDate = String(body.observedDate || new Date().toISOString().split('T')[0]);
    const observedTime = String(body.observedTime || 'Approx. Sighting').substring(0, 30);

    // 3. Generate authoritative server-side IDs and private editToken
    const id = 'rep-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8);
    const editToken = crypto.randomUUID();
    const editTokenHash = await sha256(editToken);
    const createdAt = new Date().toISOString();

    // 4. Persist in D1
    if (db) {
      await ensureD1Table(db);
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
          reportedBy,
          editTokenHash,
          createdAt
        )
        .run();
    } else if (kv) {
      // Fallback KV save
      const raw = await kv.get('all_gas_reports');
      const reports = raw ? JSON.parse(raw) : [];
      reports.unshift({
        id,
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
        reportedBy,
        createdAt,
        editTokenHash
      });
      await kv.put('all_gas_reports', JSON.stringify(reports));
    }

    const clientResponse = {
      id,
      lat,
      lng,
      timeOfDay,
      observedDate,
      observedTime,
      intensity,
      smellType,
      windCondition,
      windDirection: windDirection || undefined,
      notes,
      reportedBy,
      createdAt,
      editToken // Private token returned to authoring device only!
    };

    return new Response(JSON.stringify(clientResponse), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
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
  const kv = context.env.GAS_REPORTS_KV;

  try {
    const body = (await context.request.json()) as Record<string, unknown>;
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

    if (db) {
      await ensureD1Table(db);
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

      // Check edit authorization
      if (!isAdmin) {
        if (!clientToken) {
          return new Response(JSON.stringify({ error: 'Unauthorized: missing edit token' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        const clientHash = await sha256(clientToken);
        if (existing.edit_token_hash && clientHash !== existing.edit_token_hash) {
          return new Response(JSON.stringify({ error: 'Forbidden: invalid edit token' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }

      const lat = body.lat !== undefined ? Number(body.lat) : existing.lat;
      const lng = body.lng !== undefined ? Number(body.lng) : existing.lng;
      const timeOfDay = body.timeOfDay ? String(body.timeOfDay) : existing.time_of_day;
      const observedDate = body.observedDate ? String(body.observedDate) : existing.observed_date;
      const observedTime = body.observedTime ? String(body.observedTime) : existing.observed_time;
      const intensity = body.intensity ? String(body.intensity) : existing.intensity;
      const smellType = body.smellType ? String(body.smellType) : existing.smell_type;
      const windCondition = body.windCondition ? String(body.windCondition) : existing.wind_condition;
      const windDirection = body.windDirection !== undefined ? (body.windDirection ? String(body.windDirection).substring(0, 60) : null) : existing.wind_direction;
      const notes = body.notes !== undefined ? String(body.notes).substring(0, 500) : existing.notes;
      const reportedBy = body.reportedBy !== undefined ? String(body.reportedBy).substring(0, 80) : existing.reported_by;
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
          lat, lng, timeOfDay, observedDate, observedTime,
          intensity, smellType, windCondition, windDirection,
          notes, reportedBy, updatedAt, id
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
    }

    // KV fallback
    if (kv) {
      const raw = await kv.get('all_gas_reports');
      if (raw) {
        const reports = JSON.parse(raw);
        const index = reports.findIndex((r: { id: string }) => r.id === id);
        if (index !== -1) {
          reports[index] = { ...reports[index], ...body, updatedAt: new Date().toISOString() };
          await kv.put('all_gas_reports', JSON.stringify(reports));
          return new Response(JSON.stringify(reports[index]), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }
    }

    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

// ----------------------------------------------------
// DELETE /api/reports?id=...
// ----------------------------------------------------
export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const db = context.env.DB;
  const kv = context.env.GAS_REPORTS_KV;
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

  if (db) {
    await ensureD1Table(db);
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

    // Verify token or admin authorization
    if (!isAdmin) {
      if (!clientToken) {
        return new Response(JSON.stringify({ error: 'Unauthorized: missing edit token' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      const clientHash = await sha256(clientToken);
      if (existing.edit_token_hash && clientHash !== existing.edit_token_hash) {
        return new Response(JSON.stringify({ error: 'Forbidden: invalid edit token' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // Soft delete for audit trail
    await db
      .prepare('UPDATE reports SET is_deleted = 1, updated_at = ? WHERE id = ?')
      .bind(new Date().toISOString(), id)
      .run();

    return new Response(JSON.stringify({ success: true, id }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // KV fallback
  if (kv) {
    const raw = await kv.get('all_gas_reports');
    if (raw) {
      const reports = JSON.parse(raw);
      const filtered = reports.filter((r: { id: string }) => r.id !== id);
      await kv.put('all_gas_reports', JSON.stringify(filtered));
    }
  }

  return new Response(JSON.stringify({ success: true, id }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};
