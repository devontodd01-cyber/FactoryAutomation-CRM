// Vercel Serverless Function (Node runtime) — lives at /api/ingest-report
//
// This is the first real piece of the "MillPulse sync agent" — the local
// script running on a machine's PC (see millpulse-sync.ps1, delivered
// alongside this file, not part of this repo) reads that machine's
// VPanel/DMS systemreport.txt off disk and POSTs the raw text here on a
// schedule (Task Scheduler, daily @ 3am). This endpoint parses it with the
// EXACT SAME parser Mill Diagnostics / Fleet's manual-paste box uses
// (ported straight from App.js — extractSystemReportBlock / splitReports /
// parseReportBody / the new-format DMS parser / parseVPanelReport) and
// upserts into `mill_reports`, the same table manual entry writes to. One
// parser, three entry paths (paste, OCR, this).
//
// Auth: a shared secret, NOT the Supabase service key — this endpoint is a
// public URL that unattended scripts on customer PCs call unattended, so it
// gets its own narrow, write-only credential rather than the DB master key.
// Required env vars (add in Vercel → Settings → Environment Variables):
//   SUPABASE_URL           — already set (same as the rest of AXISCRM)
//   SUPABASE_SERVICE_KEY    — already set (same as send-customer-report.js)
//   INGEST_API_KEY          — NEW. Generate any long random string and set it
//                             here AND in millpulse-sync.ps1's $API_KEY.
//
// Request:  POST /api/ingest-report
//           header  x-ingest-key: <INGEST_API_KEY>
//           body    { "rawText": "<< SYSTEM REPORT >> ... << END >>", "sourcePath": "C:\\...\\systemreport.txt" (optional, logging only) }
// Response: { ok: true, results: [ { serial, model, correctionCount, action: "inserted"|"duplicate"|"error", error? } ] }

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const INGEST_API_KEY = process.env.INGEST_API_KEY;
const HEADERS = {
  apikey: SUPABASE_SERVICE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
  "Content-Type": "application/json",
};

// ── Parser, ported 1:1 from App.js (extractSystemReportBlock through xGap) ──

function extractSystemReportBlock(rawText) {
  const startTok = "<< SYSTEM REPORT >>";
  const s = rawText.indexOf(startTok);
  if (s === -1) throw new Error('No "<< SYSTEM REPORT >>" marker found in this text.');
  const afterStart = s + startTok.length;
  const endTok = "<< END >>";
  const e = rawText.indexOf(endTok, afterStart);
  return rawText.slice(afterStart, e === -1 ? undefined : e);
}

function splitReports(rawText) {
  const legacyTok = "<< SYSTEM REPORT >>";
  const newTok = "# << SystemReport >>";
  const startTok = rawText.indexOf(legacyTok) !== -1 ? legacyTok : newTok;
  const indices = [];
  let idx = rawText.indexOf(startTok);
  while (idx !== -1) {
    indices.push(idx);
    idx = rawText.indexOf(startTok, idx + startTok.length);
  }
  if (indices.length <= 1) return [rawText];
  const chunks = [];
  for (let i = 0; i < indices.length; i++) {
    const start = indices[i];
    const stop = i + 1 < indices.length ? indices[i + 1] : rawText.length;
    chunks.push(rawText.slice(start, stop));
  }
  return chunks;
}

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
    if (colonIdx === -1 || valuePart === "") {
      const child = {};
      parent.obj[key] = child;
      parent.lastKey = key;
      stack.push({ indent, obj: child, lastKey: null });
    } else {
      parent.obj[key] = parseFieldValue(valuePart);
      parent.lastKey = key;
    }
  }
  return root;
}

const DWX_THRESHOLDS_STUB = {}; // getProfile() below only needs a shape; full thresholds live in App.js
function getProfile() { return { thresholds: DWX_THRESHOLDS_STUB, thresholdsValidated: false }; }

const NEW_FMT_MARKER = "# << SystemReport >>";
function isNewFormat(text) { return text.indexOf(NEW_FMT_MARKER) !== -1; }

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

function normalizeNewToLegacy(tree) {
  const rac = tree.RotaryAxisCorrection || {};
  const sections = {};
  // See App.js's copy of this function for why this can't just be `|| null`
  // -- an empty "SerialNumber:" line parses to {} (object), not undefined,
  // and {} is truthy, so it was flowing through as a literal object that
  // got stringified into the two characters "{}" in mill_reports.serial.
  sections.MODEL = typeof tree.Model === "string" && tree.Model ? tree.Model : null;
  sections["SERIAL NUMBER"] = typeof tree.SerialNumber === "string" && tree.SerialNumber ? tree.SerialNumber : null;
  const legacyRac = {};
  legacyRac["CORRECTION COUNT"] = typeof rac.CorrectionCount === "number" ? rac.CorrectionCount : null;
  legacyRac["BASE TOOL LENGTH"] = typeof rac.BaseToolLength === "number" ? rac.BaseToolLength : null;
  if (rac.SpindleGradient) legacyRac["SPINDLE GRADIENT"] = { X: rac.SpindleGradient.x, Y: rac.SpindleGradient.y };
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
  sections["AUTOMATIC TOOL CHANGER"] = {};
  return sections;
}

function parseVPanelReportNew(rawText) {
  const text = (rawText || "").trim();
  if (!text) throw new Error("Empty report text");
  const tree = parseNewFormatTree(text);
  const sections = normalizeNewToLegacy(tree);
  const model = sections.MODEL || null;
  const serial = sections["SERIAL NUMBER"] || null;
  const rac = sections["ROTARY AXIS CORRECTION"] || {};
  return {
    model, serial, sections, rac,
    correctionCount: typeof rac["CORRECTION COUNT"] === "number" ? rac["CORRECTION COUNT"] : null,
  };
}

function parseVPanelReport(rawText) {
  const text = (rawText || "").trim();
  if (!text) throw new Error("Empty report text");
  if (isNewFormat(text) && text.indexOf("<< SYSTEM REPORT >>") === -1) {
    return parseVPanelReportNew(text);
  }
  const block = extractSystemReportBlock(text);
  const sections = parseReportBody(block);
  const model = sections.MODEL || null;
  const serial = sections["SERIAL NUMBER"] || null;
  const rac = sections["ROTARY AXIS CORRECTION"] || {};
  return {
    model, serial, sections, rac,
    correctionCount: typeof rac["CORRECTION COUNT"] === "number" ? rac["CORRECTION COUNT"] : null,
  };
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

// Same shape App.js's buildMillReportRow() writes for a manual paste — see
// the comment there for why raw_systemreport is required (NOT NULL column).
function buildMillReportRow(report, rawText) {
  const rac = report.rac || {};
  const grad = rac["SPINDLE GRADIENT"] || {};
  return {
    serial: report.serial,
    model: report.model,
    correction_count: report.correctionCount,
    spindle_gradient_x: typeof grad.X === "number" ? grad.X : null,
    spindle_gradient_y: typeof grad.Y === "number" ? grad.Y : null,
    a_y_gap: rac["A-AXIS"] ? yGap(rac["A-AXIS"]) : null,
    b_x_gap: rac["B-AXIS"] ? xGap(rac["B-AXIS"]) : null,
    base_tool_length: typeof rac["BASE TOOL LENGTH"] === "number" ? rac["BASE TOOL LENGTH"] : null,
    report_date: new Date().toISOString(),
    raw_systemreport: rawText,
  };
}

async function upsertMillReport(row) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/mill_reports?on_conflict=serial,correction_count`, {
    method: "POST",
    headers: { ...HEADERS, Prefer: "return=representation,resolution=merge-duplicates" },
    body: JSON.stringify(row),
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error((data && (data.message || data.hint)) || `Supabase insert failed (${r.status})`);
  return data;
}

async function reconcileLatestFlag(serial) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/mill_reports?serial=eq.${encodeURIComponent(serial)}&select=correction_count`, { headers: HEADERS });
  const rows = await r.json().catch(() => []);
  if (!Array.isArray(rows) || !rows.length) return;
  const maxCC = Math.max(...rows.map((x) => (typeof x.correction_count === "number" ? x.correction_count : -Infinity)));
  await fetch(`${SUPABASE_URL}/rest/v1/mill_reports?serial=eq.${encodeURIComponent(serial)}&correction_count=neq.${maxCC}`, {
    method: "PATCH", headers: HEADERS, body: JSON.stringify({ is_latest: false }),
  });
  await fetch(`${SUPABASE_URL}/rest/v1/mill_reports?serial=eq.${encodeURIComponent(serial)}&correction_count=eq.${maxCC}`, {
    method: "PATCH", headers: HEADERS, body: JSON.stringify({ is_latest: true }),
  });
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_KEY are not configured on the server.");
    if (!INGEST_API_KEY) throw new Error("INGEST_API_KEY is not configured on the server — set it in Vercel env vars first.");
    const providedKey = req.headers["x-ingest-key"];
    if (!providedKey || providedKey !== INGEST_API_KEY) {
      return res.status(401).json({ error: "Missing or invalid x-ingest-key header." });
    }

    const { rawText, sourcePath } = req.body || {};
    if (!rawText || typeof rawText !== "string" || !rawText.trim()) {
      return res.status(400).json({ error: "rawText is required (the raw systemreport.txt contents)." });
    }

    const chunks = splitReports(rawText);
    const results = [];
    const touchedSerials = new Set();
    for (const chunk of chunks) {
      try {
        const report = parseVPanelReport(chunk);
        if (!report.serial) throw new Error("No serial number found in this report");
        if (report.correctionCount == null) throw new Error("No correction count found in this report");
        await upsertMillReport(buildMillReportRow(report, chunk));
        touchedSerials.add(report.serial);
        results.push({ serial: report.serial, model: report.model, correctionCount: report.correctionCount, action: "ok" });
      } catch (e) {
        results.push({ error: e.message || String(e) });
      }
    }
    for (const serial of touchedSerials) {
      try { await reconcileLatestFlag(serial); } catch { /* non-fatal */ }
    }

    return res.status(200).json({ ok: true, sourcePath: sourcePath || null, results });
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  }
};
