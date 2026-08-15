// Vercel serverless function - MillPulse fleet report ingest
// POST { serial?, raw_systemreport, raw_errorlog?, source? }
//
// Receives a raw DWX system report (new DMS "# << SystemReport >>" format)
// from the MillPulse desktop agent. Extracts the same key fields the CRM's
// diagnostics engine consumes, stores BOTH raw text and extracted fields,
// and dedups on (serial, correction_count) so history is one row per count.
//
// The raw text is preserved as the source of truth - the CRM re-parses it
// with its own engine, so diagnostics logic lives in exactly one place.
//
// Env vars (already set in the project):
//   SUPABASE_URL, SUPABASE_SERVICE_KEY

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

function sbHeaders(extra) {
  return Object.assign({
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
  }, extra || {});
}

// ---- New-format parser (mirrors the CRM's parseNewFormatTree) ---------------
const NEW_FMT_MARKER = '# << SystemReport >>';

function parseInlineObjNF(s) {
  const out = {};
  const inner = s.trim().replace(/^\{/, '').replace(/\}$/, '');
  for (const part of inner.split(',')) {
    const idx = part.indexOf(':');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    const n = parseFloat(v);
    out[k] = Number.isNaN(n) ? v : n;
  }
  return out;
}
function parseInlineArrNF(s) {
  const inner = s.trim().replace(/^\[/, '').replace(/\]$/, '');
  if (!inner.trim()) return [];
  return inner.split(',').map((x) => {
    const n = parseFloat(x.trim());
    return Number.isNaN(n) ? x.trim() : n;
  });
}
function parseNewFormatTree(rawText) {
  const mi = rawText.indexOf(NEW_FMT_MARKER);
  const body = mi === -1 ? rawText : rawText.slice(mi + NEW_FMT_MARKER.length);
  const lines = body.split('\n').map((l) => l.replace(/\r$/, '')).filter((l) => l.trim() !== '');
  const root = {};
  const stack = [{ indent: -1, obj: root }];
  for (const line of lines) {
    const indent = line.length - line.trimStart().length;
    const trimmed = line.trim();
    if (trimmed.startsWith('#')) continue;           // comment / list markers we don't tree
    const ci = trimmed.indexOf(':');
    if (ci === -1) continue;
    const key = trimmed.slice(0, ci).trim();
    const val = trimmed.slice(ci + 1).trim();
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
    const parent = stack[stack.length - 1].obj;
    if (val === '') {
      const child = {};
      parent[key] = child;
      stack.push({ indent, obj: child });
    } else if (val.startsWith('{')) {
      parent[key] = parseInlineObjNF(val);
    } else if (val.startsWith('[')) {
      parent[key] = parseInlineArrNF(val);
    } else {
      const n = parseFloat(val);
      const looksNumeric = !Number.isNaN(n) && /^-?[\d.]+$/.test(val);
      parent[key] = looksNumeric ? n : val;
    }
  }
  return root;
}

function readReportDate(rawText) {
  const m = rawText.match(/^Date:\s*(.+)$/m);
  return m ? m[1].trim() : null;
}

// Pull recent error codes from errorlog.txt: "YYYY/MM/DD\tHH:MM:SS\tCODE"
function parseErrorLog(raw, limit) {
  if (!raw) return [];
  const out = [];
  const lines = raw.split('\n');
  for (const line of lines) {
    const parts = line.replace(/\r$/, '').split('\t');
    if (parts.length >= 3 && parts[2].trim()) {
      out.push({ date: parts[0].trim(), time: parts[1].trim(), code: parts[2].trim() });
    }
  }
  return out.slice(-(limit || 25)).reverse(); // most recent first
}

function extract(rawText) {
  const t = parseNewFormatTree(rawText);
  const rac = t.RotaryAxisCorrection || {};
  const aP1 = rac['A-AXIS'] && rac['A-AXIS'].P1;
  const aP2 = rac['A-AXIS'] && rac['A-AXIS'].P2;
  const bP1 = rac['B-AXIS'] && rac['B-AXIS'].P1;
  const bP2 = rac['B-AXIS'] && rac['B-AXIS'].P2;
  const aYGap = aP1 && aP2 && typeof aP1.y === 'number' && typeof aP2.y === 'number'
    ? Math.abs(aP2.y - aP1.y) : null;
  const bXGap = bP1 && bP2 && typeof bP1.x === 'number' && typeof bP2.x === 'number'
    ? Math.abs(bP2.x - bP1.x) : null;

  return {
    model: t.Model || null,
    serial: t.SerialNumber || null,
    correction_count: typeof rac.CorrectionCount === 'number' ? rac.CorrectionCount : null,
    firmware_main: (t.FirmwareVersion && t.FirmwareVersion.Main) || null,
    base_tool_length: typeof rac.BaseToolLength === 'number' ? rac.BaseToolLength : null,
    spindle_gradient_x: rac.SpindleGradient ? rac.SpindleGradient.x : null,
    spindle_gradient_y: rac.SpindleGradient ? rac.SpindleGradient.y : null,
    a_p1: aP1 || null, a_p2: aP2 || null,
    a_angle_offset_base: (rac['A-AXIS'] && rac['A-AXIS']['AngleOffset(Base)']) || null,
    a_y_gap: aYGap,
    b_p1: bP1 || null, b_p2: bP2 || null,
    b_x_gap: bXGap,
    spindle_hours: (t.SpindleUnit && t.SpindleUnit.TotalTime) || null,
    total_work_time: (t.System && t.System.TotalWorkTime) || null,
    report_date: readReportDate(rawText),
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { raw_systemreport, raw_errorlog, source } = req.body || {};
  if (!raw_systemreport || raw_systemreport.indexOf(NEW_FMT_MARKER) === -1) {
    return res.status(400).json({ error: 'raw_systemreport (new DMS format) is required' });
  }

  try {
    const x = extract(raw_systemreport);
    const serial = (req.body.serial || x.serial || '').trim();
    if (!serial) return res.status(400).json({ error: 'could not determine serial' });
    if (x.correction_count == null) {
      return res.status(400).json({ error: 'could not read CorrectionCount' });
    }

    const recent_errors = parseErrorLog(raw_errorlog, 25);

    const row = {
      serial,
      correction_count: x.correction_count,
      model: x.model,
      raw_systemreport,
      raw_errorlog: raw_errorlog || null,
      firmware_main: x.firmware_main,
      base_tool_length: x.base_tool_length,
      spindle_gradient_x: x.spindle_gradient_x,
      spindle_gradient_y: x.spindle_gradient_y,
      a_p1: x.a_p1, a_p2: x.a_p2, a_angle_offset_base: x.a_angle_offset_base, a_y_gap: x.a_y_gap,
      b_p1: x.b_p1, b_p2: x.b_p2, b_x_gap: x.b_x_gap,
      spindle_hours: x.spindle_hours,
      total_work_time: x.total_work_time,
      recent_errors,
      report_date: x.report_date,
      source: source || 'millpulse',
      is_latest: true,
    };

    // 1) clear is_latest on prior rows for this serial
    await fetch(`${SUPABASE_URL}/rest/v1/mill_reports?serial=eq.${encodeURIComponent(serial)}&is_latest=eq.true`, {
      method: 'PATCH',
      headers: sbHeaders({ Prefer: 'return=minimal' }),
      body: JSON.stringify({ is_latest: false }),
    });

    // 2) upsert on (serial, correction_count) - resolves duplicates cleanly
    const up = await fetch(`${SUPABASE_URL}/rest/v1/mill_reports?on_conflict=serial,correction_count`, {
      method: 'POST',
      headers: sbHeaders({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify(row),
    });
    if (!up.ok) throw new Error(`Supabase upsert ${up.status}: ${await up.text()}`);

    return res.status(200).json({
      ok: true,
      serial,
      correction_count: x.correction_count,
      model: x.model,
      flags: {
        spindle_x: x.spindle_gradient_x != null ? Math.abs(x.spindle_gradient_x) > 0.001 : null,
        a_gap: x.a_y_gap != null ? x.a_y_gap > 40 : null,
        b_gap: x.b_x_gap != null ? x.b_x_gap > 40 : null,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'ingest failed' });
  }
}
