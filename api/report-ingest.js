// Vercel serverless function - MillPulse fleet report ingest
// POST { serial?, raw_systemreport, raw_errorlog?, source? }
//
// Accepts BOTH report formats:
//   - Legacy  "<< SYSTEM REPORT >>"  (51D, 52D, 52DC, 52DCi)
//   - New DMS "# << SystemReport >>" (53DC)
// and extracts the SAME canonical fields the CRM app parser produces, using
// the identical parsing/translation logic ported verbatim from App.js so the
// two paths can never drift. Stores raw text + extracted fields; dedups on
// (serial, correction_count).
//
// Env vars: SUPABASE_URL, SUPABASE_SERVICE_KEY

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const NEW_FMT_MARKER = "# << SystemReport >>";

function sbHeaders(extra) {
  return Object.assign({
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
  }, extra || {});
}

// ---- Parser + translation (ported verbatim from App.js) ---------------------
function num(v) { return typeof v === 'number' && !Number.isNaN(v) ? v : null; }

function parseFieldValue(raw) {
  const v = raw.trim();
  if (v === "") return "";
  if (v.includes(",")) {
    const parts = v.split(",").map((p) => p.trim());
    if (parts.every((p) => /^-?\d+(\.\d+)?$/.test(p))) return parts.map((p) => parseFloat(p));
    return v;
  }
  if (/^-?\d+(\.\d+)?$/.test(v)) return parseFloat(v);
  return v;
}

function extractSystemReportBlock(rawText) {
  const startTok = "<< SYSTEM REPORT >>";
  const s = rawText.indexOf(startTok);
  if (s === -1) throw new Error('No "<< SYSTEM REPORT >>" marker found in this text.');
  const afterStart = s + startTok.length;
  const endTok = "<< END >>";
  const e = rawText.indexOf(endTok, afterStart);
  return rawText.slice(afterStart, e === -1 ? undefined : e);
}

function parseReportBody(body) {
  const lines = body.split("\n").map((l) => l.replace(/\r$/, "")).filter((l) => l.trim() !== "");
  const root = {};
  const stack = [{ indent: -1, obj: root, lastKey: null }];

  for (const line of lines) {
    const indent = line.length - line.trimStart().length;
    const trimmed = line.trim();
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
    const parent = stack[stack.length - 1];

    const colonIdx = trimmed.indexOf(":");
    const key = colonIdx === -1 ? trimmed : trimmed.slice(0, colonIdx).trim();
    const valuePart = colonIdx === -1 ? "" : trimmed.slice(colonIdx + 1).trim();

    if (key === "" && colonIdx !== -1) {
      const lastKey = parent.lastKey;
      if (lastKey != null) {
        const existing = parent.obj[lastKey];
        const entry = parseFieldValue(valuePart);
        if (Array.isArray(existing) && existing._isLogList) {
          existing.push(entry);
        } else {
          const list = [existing, entry];
          list._isLogList = true;
          parent.obj[lastKey] = list;
        }
      }
      continue;
    }

    if (colonIdx === -1) {
      // No colon at all → this is a section header; open a child object.
      const child = {};
      parent.obj[key] = child;
      parent.lastKey = key;
      stack.push({ indent, obj: child, lastKey: null });
    } else if (valuePart === "") {
      // Has a colon but nothing after it → an empty FIELD (e.g. "SERIAL
      // NUMBER: "), not a section. Store an empty string, never an object —
      // an object here renders as a raw {} child (React error #31) and also
      // breaks any downstream code expecting a scalar/serial value.
      parent.obj[key] = "";
      parent.lastKey = key;
    } else {
      parent.obj[key] = parseFieldValue(valuePart);
      parent.lastKey = key;
    }
  }
  return root;
}

function parseInlineObjNF(s) {
  const out = {};
  const inner = s.trim().replace(/^\{/, "").replace(/\}$/, "");
  for (const part of inner.split(",")) {
    const [k, v] = part.split(":").map((x) => (x == null ? x : x.trim()));
    if (!k) continue;
    const n = parseFloat(v);
    out[k] = Number.isNaN(n) ? v : n;
  }
  return out;
}

function parseInlineArrNF(s) {
  const inner = s.trim().replace(/^\[/, "").replace(/\]$/, "");
  if (!inner.trim()) return [];
  return inner.split(",").map((x) => { const n = parseFloat(x.trim()); return Number.isNaN(n) ? x.trim() : n; });
}

function parseNewFormatTree(rawText) {
  const mi = rawText.indexOf(NEW_FMT_MARKER);
  const body = mi === -1 ? rawText : rawText.slice(mi + NEW_FMT_MARKER.length);
  const lines = body.split("\n").map((l) => l.replace(/\r$/, "")).filter((l) => l.trim() !== "");
  const root = {};
  const stack = [{ indent: -1, obj: root }];
  for (const line of lines) {
    const indent = line.length - line.trimStart().length;
    const trimmed = line.trim();
    const ci = trimmed.indexOf(":");
    if (ci === -1) continue;
    const key = trimmed.slice(0, ci).trim();
    const val = trimmed.slice(ci + 1).trim();
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
    const parent = stack[stack.length - 1].obj;
    if (val === "") {
      const child = {};
      parent[key] = child;
      stack.push({ indent, obj: child });
    } else if (val.startsWith("{")) {
      parent[key] = parseInlineObjNF(val);
    } else if (val.startsWith("[")) {
      parent[key] = parseInlineArrNF(val);
    } else {
      const n = parseFloat(val);
      const looksNumeric = !Number.isNaN(n) && /^-?[\d.]+$/.test(val);
      parent[key] = looksNumeric ? n : val;
    }
  }
  return root;
}

function isNewFormat(text) { return text.indexOf(NEW_FMT_MARKER) !== -1; }

function parseSpindleHours(v) {
  if (typeof v === "number" && Number.isFinite(v)) return Math.floor(v);
  if (typeof v !== "string") return null;
  const m = v.trim().match(/^(\d+):(\d{1,2})$/);
  if (m) return parseInt(m[1], 10);
  const n = parseInt(v.trim(), 10);
  return Number.isNaN(n) ? null : n;
}

function normalizeNewToLegacy(tree) {
  const rac = tree.RotaryAxisCorrection || {};
  const sections = {};
  // tree.Model / tree.SerialNumber come back as an EMPTY OBJECT ({}), not a
  // missing value, when the source line has nothing after the colon (e.g.
  // "SerialNumber:" with no value -- the tree-builder above can't tell that
  // apart from a real nested section like "FIRMWARE VERSION" and creates an
  // empty child object either way). `|| null` doesn't catch that, since {}
  // is truthy -- it was flowing through as a literal object, then getting
  // stringified into the two characters "{}" wherever it landed (Fleet,
  // mill_reports.serial), creating a bogus machine card. Only accept an
  // actual non-empty string.
  sections.MODEL = typeof tree.Model === "string" && tree.Model ? tree.Model : null;
  sections["SERIAL NUMBER"] = typeof tree.SerialNumber === "string" && tree.SerialNumber ? tree.SerialNumber : null;

  const legacyRac = {};
  legacyRac["CORRECTION COUNT"] = typeof rac.CorrectionCount === "number" ? rac.CorrectionCount : null;
  legacyRac["BASE TOOL LENGTH"] = typeof rac.BaseToolLength === "number" ? rac.BaseToolLength : null;
  if (rac.SpindleGradient) legacyRac["SPINDLE GRADIENT"] = { X: rac.SpindleGradient.x, Y: rac.SpindleGradient.y };
  // SpindleUnit.TotalTime is the service-life clock ("HH:MM", e.g. "749:58").
  // Store the whole-hours integer under the legacy section for downstream use.
  {
    const su = tree.SpindleUnit;
    const hrs = parseSpindleHours(su && su.TotalTime);
    if (hrs != null) legacyRac["SPINDLE HOURS"] = hrs;
  }

  const conv = (ax) => {
    if (!ax) return null;
    const out = {};
    if (ax.P1) out.P1 = [ax.P1.x, ax.P1.y, ax.P1.z];
    if (ax.P2) out.P2 = [ax.P2.x, ax.P2.y, ax.P2.z];
    if (ax["AngleOffset(Base)"]) out["ANGLE OFFSET (BASE)"] = ax["AngleOffset(Base)"];
    return out;
  };
  if (rac["A-AXIS"]) legacyRac["A-AXIS"] = conv(rac["A-AXIS"]);
  if (rac["B-AXIS"]) legacyRac["B-AXIS"] = conv(rac["B-AXIS"]);
  if (rac.CorrectionBasePoint) {
    legacyRac["CORRECTION BASE POINT"] = [rac.CorrectionBasePoint.x, rac.CorrectionBasePoint.y, rac.CorrectionBasePoint.z];
  }
  sections["ROTARY AXIS CORRECTION"] = legacyRac;
  // The DMS/53DC format has no single "MAGAZINE POSITION OFFSET" line like the
  // legacy format. Per the model translation table, the 53DC equivalent is
  // ToolSensorPositionOffset (the tool-setter reference) — that is the value to
  // trend for magazine drift on this platform. (StockerPositionOffset is a
  // separate per-stocker list and is NOT the magazine equivalent here.) This
  // closes the last cross-format gap: magazine drift now trends on the 53DC.
  const atc = tree.AutomaticToolChanger || {};
  const legacyAtc = {};
  const magObj = atc.ToolSensorPositionOffset;
  if (magObj && typeof magObj.x === "number") {
    legacyAtc["MAGAZINE POSITION OFFSET"] = [magObj.x, magObj.y, magObj.z];
  }
  sections["AUTOMATIC TOOL CHANGER"] = legacyAtc;
  return sections;
}

function yGap(pointObj) {
  const p1 = pointObj.P1, p2 = pointObj.P2;
  if (!Array.isArray(p1) || !Array.isArray(p2) || p1.length < 2 || p2.length < 2) return null;
  return Math.abs(p2[1] - p1[1]);
}

function xGap(pointObj) {
  const p1 = pointObj.P1, p2 = pointObj.P2;
  if (!Array.isArray(p1) || !Array.isArray(p2) || p1.length < 1 || p2.length < 1) return null;
  return Math.abs(p2[0] - p1[0]);
}

function triplet(v) { return Array.isArray(v) && v.length >= 3 ? [num(v[0]), num(v[1]), num(v[2])] : [null, null, null]; }

function axisOffsetRange(rac, axisKey) {
  const ax = rac && rac[axisKey];
  const curve = ax && ax["ANGLE OFFSET (BASE)"];
  if (!Array.isArray(curve) || curve.length < 2) return null;
  const nums = curve.slice(1).filter(v => typeof v === 'number' && !Number.isNaN(v));
  if (nums.length < 2) return null;
  return Math.max(...nums) - Math.min(...nums);
}

function angleOffsetRange(rac) { return axisOffsetRange(rac, "A-AXIS"); }

function bAxisOffsetRange(rac) { return axisOffsetRange(rac, "B-AXIS"); }

function extractOrigin(sections, rac) {
  const candidates = [
    rac && rac["CORRECTION BASE POINT"],
    rac && rac["BASE POINT"],
    rac && rac["ORIGIN"],
    sections && sections["CORRECTION BASE POINT"],
    sections && sections["BASE POINT"],
    sections && sections["ORIGIN"],
    sections && sections["WORK ORIGIN"],
  ];
  for (const c of candidates) {
    if (Array.isArray(c)) return triplet(c);
    // Some formats nest X/Y/Z as leaf fields under an object header
    if (c && typeof c === 'object' && ('X' in c || 'Y' in c || 'Z' in c)) {
      return [num(c.X), num(c.Y), num(c.Z)];
    }
  }
  return [null, null, null];
}


// Build the normalized legacy-shaped sections tree for EITHER format.
function parseAny(rawText) {
  if (isNewFormat(rawText)) {
    const tree = parseNewFormatTree(rawText);
    const sections = normalizeNewToLegacy(tree);
    const rac = sections["ROTARY AXIS CORRECTION"] || {};
    const atc = sections["AUTOMATIC TOOL CHANGER"] || {};
    return {
      model: tree.Model || null,
      serial: tree.SerialNumber || null,
      firmware_main: (tree.FirmwareVersion && tree.FirmwareVersion.Main) || null,
      total_work_time: (tree.System && tree.System.TotalWorkTime) || null,
      sections, rac, atc,
    };
  }
  const block = extractSystemReportBlock(rawText);
  const sections = parseReportBody(block);
  const rac = sections["ROTARY AXIS CORRECTION"] || {};
  const atc = sections["AUTOMATIC TOOL CHANGER"] || {};
  // Spindle hours: legacy stores under SPINDLE UNIT / TOTAL TIME.
  const su = sections["SPINDLE UNIT"];
  if (su && rac["SPINDLE HOURS"] == null) {
    const hrs = parseSpindleHours(su["TOTAL TIME"] != null ? su["TOTAL TIME"] : su["TOTALTIME"]);
    if (hrs != null) rac["SPINDLE HOURS"] = hrs;
  }
  return {
    model: typeof sections.MODEL === "string" ? sections.MODEL : null,
    serial: typeof sections["SERIAL NUMBER"] === "string" ? sections["SERIAL NUMBER"] : null,
    firmware_main: (sections["FIRMWARE VERSION"] && sections["FIRMWARE VERSION"].MAIN) || null,
    total_work_time: (sections.SYSTEM && sections.SYSTEM["TOTAL WORK TIME"]) || null,
    sections, rac, atc,
  };
}

function readReportDate(rawText) {
  const m = rawText.match(/^Date:\s*(.+)$/m);
  return m ? m[1].trim() : null;
}

function parseErrorLog(raw, limit) {
  if (!raw) return [];
  const out = [];
  for (const line of raw.split('\n')) {
    const parts = line.replace(/\r$/, '').split('\t');
    if (parts.length >= 3 && parts[2].trim()) {
      out.push({ date: parts[0].trim(), time: parts[1].trim(), code: parts[2].trim() });
    }
  }
  return out.slice(-(limit || 25)).reverse();
}

function extract(rawText) {
  const r = parseAny(rawText);
  const rac = r.rac, atc = r.atc, sections = r.sections;
  const grad = rac["SPINDLE GRADIENT"] || {};
  const origin = extractOrigin(sections, rac);
  const mag = triplet(atc["MAGAZINE POSITION OFFSET"]);
  const ccRaw = rac["CORRECTION COUNT"] != null ? rac["CORRECTION COUNT"] : rac["CorrectionCount"];
  return {
    model: r.model,
    serial: r.serial,
    firmware_main: r.firmware_main,
    total_work_time: r.total_work_time,
    correction_count: typeof ccRaw === "number" ? ccRaw : null,
    base_tool_length: typeof rac["BASE TOOL LENGTH"] === "number" ? rac["BASE TOOL LENGTH"] : null,
    spindle_gradient_x: typeof grad.X === "number" ? grad.X : null,
    spindle_gradient_y: typeof grad.Y === "number" ? grad.Y : null,
    a_p1: (rac["A-AXIS"] && rac["A-AXIS"].P1) || null,
    a_p2: (rac["A-AXIS"] && rac["A-AXIS"].P2) || null,
    a_angle_offset_base: (rac["A-AXIS"] && rac["A-AXIS"]["ANGLE OFFSET (BASE)"]) || null,
    a_y_gap: rac["A-AXIS"] ? yGap(rac["A-AXIS"]) : null,
    a_angle_offset_range: angleOffsetRange(rac),
    b_p1: (rac["B-AXIS"] && rac["B-AXIS"].P1) || null,
    b_p2: (rac["B-AXIS"] && rac["B-AXIS"].P2) || null,
    b_angle_offset_base: (rac["B-AXIS"] && rac["B-AXIS"]["ANGLE OFFSET (BASE)"]) || null,
    b_x_gap: rac["B-AXIS"] ? xGap(rac["B-AXIS"]) : null,
    b_angle_offset_range: bAxisOffsetRange(rac),
    origin_x: origin[0], origin_y: origin[1], origin_z: origin[2],
    magazine_offset_x: mag[0], magazine_offset_y: mag[1], magazine_offset_z: mag[2],
    spindle_hours: typeof rac["SPINDLE HOURS"] === "number" ? rac["SPINDLE HOURS"] : null,
    report_date: readReportDate(rawText),
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { raw_systemreport, raw_errorlog, source } = req.body || {};
  // Accept either format marker.
  const hasNew = raw_systemreport && raw_systemreport.indexOf(NEW_FMT_MARKER) !== -1;
  const hasLegacy = raw_systemreport && raw_systemreport.indexOf("<< SYSTEM REPORT >>") !== -1;
  if (!raw_systemreport || (!hasNew && !hasLegacy)) {
    return res.status(400).json({ error: 'raw_systemreport (legacy or DMS format) is required' });
  }

  try {
    const x = extract(raw_systemreport);
    const serial = (req.body.serial || x.serial || '').trim();
    if (!serial) return res.status(400).json({ error: 'could not determine serial' });
    if (x.correction_count == null) {
      return res.status(400).json({ error: 'could not read correction count' });
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
      b_p1: x.b_p1, b_p2: x.b_p2, b_angle_offset_base: x.b_angle_offset_base, b_x_gap: x.b_x_gap,
      a_angle_offset_range: x.a_angle_offset_range,
      b_angle_offset_range: x.b_angle_offset_range,
      origin_x: x.origin_x, origin_y: x.origin_y, origin_z: x.origin_z,
      magazine_offset_x: x.magazine_offset_x, magazine_offset_y: x.magazine_offset_y, magazine_offset_z: x.magazine_offset_z,
      spindle_hours: x.spindle_hours,
      total_work_time: x.total_work_time,
      recent_errors,
      report_date: x.report_date,
      source: source || 'millpulse',
      is_latest: true,
    };

    await fetch(`${SUPABASE_URL}/rest/v1/mill_reports?serial=eq.${encodeURIComponent(serial)}&is_latest=eq.true`, {
      method: 'PATCH',
      headers: sbHeaders({ Prefer: 'return=minimal' }),
      body: JSON.stringify({ is_latest: false }),
    });

    const up = await fetch(`${SUPABASE_URL}/rest/v1/mill_reports?on_conflict=serial,correction_count`, {
      method: 'POST',
      headers: sbHeaders({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify(row),
    });
    if (!up.ok) throw new Error(`Supabase upsert ${up.status}: ${await up.text()}`);

    return res.status(200).json({
      ok: true, serial, correction_count: x.correction_count, model: x.model,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'ingest failed' });
  }
}
