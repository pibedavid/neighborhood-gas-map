// Cloudflare Pages Function: /api/reports

interface Env {
  GAS_REPORTS_KV?: KVNamespace;
}

const KV_LIST_KEY = 'all_gas_reports';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const kv = context.env.GAS_REPORTS_KV;

  if (!kv) {
    // If running in preview or KV is not bound yet, return 200 with empty array
    // so client falls back to client storage seed
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const raw = await kv.get(KV_LIST_KEY);
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
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const kv = context.env.GAS_REPORTS_KV;

  try {
    const body = await context.request.json() as Record<string, unknown>;
    
    // Basic validation
    if (typeof body.lat !== 'number' || typeof body.lng !== 'number') {
      return new Response(JSON.stringify({ error: 'Valid lat and lng are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const report = {
      ...body,
      id: body.id || 'rep-' + Date.now(),
      createdAt: body.createdAt || new Date().toISOString()
    };

    if (kv) {
      const raw = await kv.get(KV_LIST_KEY);
      const reports = raw ? JSON.parse(raw) : [];
      reports.unshift(report);
      // Cap at 200 recent reports to keep within KV size bounds
      if (reports.length > 200) reports.length = 200;
      await kv.put(KV_LIST_KEY, JSON.stringify(reports));
    }

    return new Response(JSON.stringify(report), {
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

export const onRequestPut: PagesFunction<Env> = async (context) => {
  const kv = context.env.GAS_REPORTS_KV;

  try {
    const body = await context.request.json() as Record<string, unknown>;
    const id = body.id as string;
    if (!id) {
      return new Response(JSON.stringify({ error: 'Missing report id' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (kv) {
      const raw = await kv.get(KV_LIST_KEY);
      if (raw) {
        const reports = JSON.parse(raw);
        const index = reports.findIndex((r: { id: string }) => r.id === id);
        if (index !== -1) {
          reports[index] = {
            ...reports[index],
            ...body,
            updatedAt: new Date().toISOString()
          };
          await kv.put(KV_LIST_KEY, JSON.stringify(reports));
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

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const kv = context.env.GAS_REPORTS_KV;
  const url = new URL(context.request.url);
  const id = url.searchParams.get('id');

  if (!id) {
    return new Response(JSON.stringify({ error: 'Missing report id' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (kv) {
    const raw = await kv.get(KV_LIST_KEY);
    if (raw) {
      const reports = JSON.parse(raw);
      const filtered = reports.filter((r: { id: string }) => r.id !== id);
      await kv.put(KV_LIST_KEY, JSON.stringify(filtered));
    }
  }

  return new Response(JSON.stringify({ success: true, id }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};
