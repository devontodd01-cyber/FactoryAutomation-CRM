// Vercel Serverless Function (Node runtime) — lives at /api/machine-status
//
// Read-only counterpart to /api/ingest-report. The sync agent only ever
// POSTs data in; nothing before this could answer "what's this machine's
// status right now?" -- which is exactly what the MillPulse tray app needs
// to poll so it can show a live clean/flagged indicator on the customer's
// desktop.
//
// This is a server-side port of the SAME rule engine Fleet uses client-side
// (App.js's fleetDiagnose() + annotateDiagnosticPriority() + CHECK_INFO),
// scoped to the same subset of rules Fleet's flat mill_reports columns can
// support: Rule 1/2 (spindle gradient X/Y, magnitude + bounce) and Rule 4
// (A/B-axis P1/P2 gap, magnitude + bounce). Rules 3/5/6/7 need raw
// origin/magazine/angle-offset arrays that mill_reports doesn't store as
// flat columns (only inside raw_systemreport) -- same limitation Fleet's
// card already has, so this endpoint never says something Fleet wouldn't.
//
// IMPORTANT: if you change wording/thresholds in App.js's CHECK_INFO /
// DWX_THRESHOLDS / fleetDiagnose, mirror the change here too -- this is a
// deliberate duplicate (same reason ingest-report.js duplicates the parser:
// App.js is bundled separately by CRA and can't be required from a Vercel
// function directly).
//
// Required env vars: SUPABASE_URL, SUPABASE_SERVICE_KEY, INGEST_API_KEY
//
// Request:  GET /api/machine-status?serial=KFN0154
//           header  x-ingest-key: <INGEST_API_KEY>
// Response: { ok:true, serial, model, correctionCount, reportDate,
//             status: "flagged"|"clean", flag: {label,action,cause}|null }

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const INGEST_API_KEY = process.env.INGEST_API_KEY;
const HEADERS = {
  apikey: SUPABASE_SERVICE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
  "Content-Type": "application/json",
};

// ── Thresholds — mirror App.js's DWX_THRESHOLDS (the subset fleetDiagnose uses) ──
const DWX_THRESHOLDS = {
  priorityOrder: [
    "spindle_gradient_x_drift",
    "spindle_gradient_y_drift",
    "a_axis_p1_p2_gap_drift",
    "b_axis_p1_p2_gap_drift",
    "spindle_gradient_x_collet_wear",
    "spindle_gradient_y_collet_wear",
    "a_axis_p1_p2_gap",
    "b_axis_p1_p2_gap",
  ],
  aAxisP1P2YGapMax: 100,
  bAxisP1P2XGapMax: 100,
  spindleGradientXColletWearMax: 0.001,
  spindleGradientYColletWearMax: 0.001,
  spindleGradientXStepMax: 0.0005,
  spindleGradientYStepMax: 0.0005,
  aAxisP1P2YGapStepMax: 100,
  bAxisP1P2XGapStepMax: 100,
};

// ── Labels/actions — mirror App.js's CHECK_INFO (the subset fleetDiagnose uses) ──
const CHECK_INFO = {
  spindle_gradient_x_collet_wear: { label: "Spindle Misalignment X Axis", cause: "Magnitude over ±0.001. If stable report-to-report this points to spindle misalignment.", action: "Re-align the spindle. If it's also bouncing, replace the collet first." },
  spindle_gradient_y_collet_wear: { label: "Spindle Misalignment Y Axis", cause: "Magnitude over ±0.001. If stable report-to-report this points to spindle misalignment.", action: "Re-align the spindle. If it's also bouncing, replace the collet first." },
  spindle_gradient_x_drift: { label: "Replace Collet", cause: "Moved ≥0.0005 since the previous report — the signature of collet wear, not progressive misalignment.", action: "Replace the collet." },
  spindle_gradient_y_drift: { label: "Replace Collet", cause: "Moved ≥0.0005 since the previous report — the signature of collet wear, not progressive misalignment.", action: "Replace the collet." },
  a_axis_p1_p2_gap: { label: "Y Axis Misalignment", cause: "Stable and over 100 units — Y-axis alignment issue.", action: "Inspect/re-align the Y-axis." },
  b_axis_p1_p2_gap: { label: "X Axis Misalignment", cause: "Stable and over 100 units — X-axis alignment issue.", action: "Inspect/re-align the X-axis." },
  a_axis_p1_p2_gap_drift: { label: "Y Axis Ballscrew", cause: "Bouncing ≥100 units between reports — Y-axis ballscrew wear (not repeating), not alignment.", action: "Inspect the Y-axis ballscrew for wear/backlash." },
  b_axis_p1_p2_gap_drift: { label: "X Axis Ballscrew", cause: "Bouncing ≥100 units between reports — X-axis ballscrew wear (not repeating), not alignment.", action: "Inspect the X-axis ballscrew for wear/backlash." },
};

function annotateDiagnosticPriority(results) {
  const byKey = {};
  for (const r of results) byKey[r.check] = r;
  const pair = (hardKey, driftKey, hardCause, driftCause) => {
    const hard = byKey[hardKey], drift = byKey[driftKey];
    if (hard && hard.flagged && drift && drift.flagged) {
      hard.priorityNote = `Also bouncing report-to-report — treat as ${driftCause}, not ${hardCause}.`;
    }
  };
  pair("spindle_gradient_x_collet_wear", "spindle_gradient_x_drift", "spindle misalignment", "collet wear");
  pair("spindle_gradient_y_collet_wear", "spindle_gradient_y_drift", "spindle misalignment", "collet wear");
  pair("a_axis_p1_p2_gap", "a_axis_p1_p2_gap_drift", "a Y-axis alignment issue", "Y-axis ballscrew wear");
  pair("b_axis_p1_p2_gap", "b_axis_p1_p2_gap_drift", "an X-axis alignment issue", "X-axis ballscrew wear");

  const gradientFlagged = ["spindle_gradient_x_collet_wear", "spindle_gradient_y_collet_wear", "spindle_gradient_x_drift", "spindle_gradient_y_drift"]
    .some((k) => byKey[k] && byKey[k].flagged);
  const gapDriftFlags = ["a_axis_p1_p2_gap_drift", "b_axis_p1_p2_gap_drift"].map((k) => byKey[k]).filter((g) => g && g.flagged);
  if (gradientFlagged && gapDriftFlags.length) {
    for (const k of ["spindle_gradient_x_collet_wear", "spindle_gradient_y_collet_wear", "spindle_gradient_x_drift", "spindle_gradient_y_drift"]) {
      const g = byKey[k];
      if (g && g.flagged) g.priorityNote = "The A/B-axis gap is also bouncing — address the ballscrew wear FIRST, then re-check this gradient reading.";
    }
  }
  return results;
}

function fleetDiagnose(latest, prev) {
  if (!latest) return [];
  const th = DWX_THRESHOLDS;
  const out = [];
  const gradientAxis = (axis, col, hardKey, stepKey) => {
    const v = latest[col];
    if (v == null) return;
    const hardThreshold = th[hardKey];
    out.push({ check: `spindle_gradient_${axis.toLowerCase()}_collet_wear`, axis, currentValue: v, threshold: hardThreshold, flagged: Math.abs(v) > hardThreshold });
    const pv = prev ? prev[col] : null;
    const stepThreshold = th[stepKey];
    const drift = { check: `spindle_gradient_${axis.toLowerCase()}_drift`, axis, currentValue: v, previousValue: pv ?? null, delta: null, threshold: stepThreshold, flagged: false };
    if (pv != null) { drift.delta = v - pv; drift.flagged = Math.abs(drift.delta) >= stepThreshold; }
    out.push(drift);
  };
  gradientAxis("X", "spindle_gradient_x", "spindleGradientXColletWearMax", "spindleGradientXStepMax");
  gradientAxis("Y", "spindle_gradient_y", "spindleGradientYColletWearMax", "spindleGradientYStepMax");

  const gapAxis = (checkPrefix, col, hardKey, stepKey) => {
    const v = latest[col];
    if (v == null) return;
    const hardThreshold = th[hardKey];
    out.push({ check: `${checkPrefix}_p1_p2_gap`, gap: v, threshold: hardThreshold, flagged: v > hardThreshold });
    const pv = prev ? prev[col] : null;
    const stepThreshold = th[stepKey];
    const drift = { check: `${checkPrefix}_p1_p2_gap_drift`, gap: v, previousGap: pv ?? null, delta: null, threshold: stepThreshold, flagged: false };
    if (pv != null) { drift.delta = v - pv; drift.flagged = Math.abs(drift.delta) >= stepThreshold; }
    out.push(drift);
  };
  // checkPrefix must be "a_axis"/"b_axis" to match priorityOrder/CHECK_INFO's
  // key names -- see the matching note in App.js's fleetDiagnose (same bug
  // existed there; fixed there too).
  gapAxis("a_axis", "a_y_gap", "aAxisP1P2YGapMax", "aAxisP1P2YGapStepMax");
  gapAxis("b_axis", "b_x_gap", "bAxisP1P2XGapMax", "bAxisP1P2XGapStepMax");

  return annotateDiagnosticPriority(out);
}

module.exports = async (req, res) => {
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });
  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_KEY are not configured on the server.");
    if (!INGEST_API_KEY) throw new Error("INGEST_API_KEY is not configured on the server.");
    const providedKey = req.headers["x-ingest-key"];
    if (!providedKey || providedKey !== INGEST_API_KEY) {
      return res.status(401).json({ error: "Missing or invalid x-ingest-key header." });
    }

    const serial = (req.query && req.query.serial) || "";
    if (!serial || typeof serial !== "string") {
      return res.status(400).json({ error: "serial query param is required, e.g. /api/machine-status?serial=KFN0154" });
    }

    const url = `${SUPABASE_URL}/rest/v1/mill_reports?serial=eq.${encodeURIComponent(serial)}&select=serial,model,correction_count,spindle_gradient_x,spindle_gradient_y,a_y_gap,b_x_gap,base_tool_length,report_date,is_latest&order=correction_count.desc&limit=2`;
    const r = await fetch(url, { headers: HEADERS });
    const rows = await r.json().catch(() => null);
    if (!r.ok) throw new Error((rows && rows.message) || `Supabase query failed (${r.status})`);

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(404).json({ error: `No reports found yet for serial ${serial}.` });
    }

    const latest = rows[0];
    const prev = rows[1] || null;
    const diag = fleetDiagnose(latest, prev);
    let topFlag = null;
    for (const key of DWX_THRESHOLDS.priorityOrder) {
      const hit = diag.find((d) => d.check === key && d.flagged);
      if (hit) {
        const info = CHECK_INFO[key] || {};
        topFlag = { check: key, label: info.label || key, action: hit.priorityNote || info.action || "", cause: info.cause || "" };
        break;
      }
    }

    return res.status(200).json({
      ok: true,
      serial: latest.serial,
      model: latest.model,
      correctionCount: latest.correction_count,
      reportDate: latest.report_date,
      status: topFlag ? "flagged" : "clean",
      flag: topFlag,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  }
};
