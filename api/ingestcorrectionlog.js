// Vercel Serverless Function (Node runtime) — lives at /api/ingest-correction-log
//
// PURE ARCHIVE endpoint for the older Roland-branded machine generation
// (confirmed so far: DWX-51D) whose live diagnostic data does NOT live in a
// "<< SYSTEM REPORT >>" formatted systemreport.txt at all -- it lives in a
// flat, ever-growing raw log file (e.g. "Roland DWX-51D_correctionlog.txt")
// with lines like:
//   2023/07/05 11:06:45 tool_sensor_z = -68729
//   2023/07/05 11:08:14 <SCAN> M_Y1: {89000, 157475, -32285}
// This is NOT the same shape as mill_reports (which expects RAC-derived
// columns: spindle_gradient_x/y, a_y_gap, b_x_gap, base_tool_length, a
// correction_count, etc.) -- none of that exists in this format, so trying
// to force it into mill_reports would mean inventing fake/null data.
//
// Until the diagnostic rules for THIS format are dictated (same process as
// the original 7-rule session -- see App.js's DWX_THRESHOLDS comment) this
// endpoint just archives the raw text so nothing is lost while that
// happens. No parsing, no diagnosis, no thresholds -- just capture.
//
// Because the source file is a single ever-growing log (each correction
// run appends more lines, so the newest copy is a superset of all older
// ones), this UPSERTS on source_path rather than inserting a new row every
// day -- we only need the latest full snapshot, not one near-duplicate row
// per day forever.
//
// Required env vars (same ones already set for the other endpoints):
//   SUPABASE_URL, SUPABASE_SERVICE_KEY, INGEST_API_KEY
//
// Request:  POST /api/ingest-correction-log
//           header  x-ingest-key: <INGEST_API_KEY>
//           body    { "rawText": "...", "sourcePath": "C:\\...\\Roland DWX-51D_correctionlog.txt" }
// Response: { ok: true, id, modelGuess, charCount }

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const INGEST_API_KEY = process.env.INGEST_API_KEY;
const HEADERS = {
  apikey: SUPABASE_SERVICE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
  "Content-Type": "application/json",
};

// Best-effort model guess from the filename/path -- e.g. "...\Roland
// DWX-51D_correctionlog.txt" -> "DWX-51D". Purely informational (for
// sorting/filtering the archive later); nothing downstream depends on it
// being correct.
function guessModel(sourcePath) {
  if (!sourcePath) return null;
  const m = sourcePath.match(/DWX-\d+[A-Za-z]*/i);
  return m ? m[0].toUpperCase() : null;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_KEY are not configured on the server.");
    if (!INGEST_API_KEY) throw new Error("INGEST_API_KEY is not configured on the server.");
    const providedKey = req.headers["x-ingest-key"];
    if (!providedKey || providedKey !== INGEST_API_KEY) {
      return res.status(401).json({ error: "Missing or invalid x-ingest-key header." });
    }

    const { rawText, sourcePath } = req.body || {};
    if (!rawText || typeof rawText !== "string" || !rawText.trim()) {
      return res.status(400).json({ error: "rawText is required (the raw correction-log file contents)." });
    }
    if (!sourcePath || typeof sourcePath !== "string") {
      return res.status(400).json({ error: "sourcePath is required (used as the archive's dedupe key)." });
    }

    const modelGuess = guessModel(sourcePath);
    const row = {
      source_path: sourcePath,
      model_guess: modelGuess,
      raw_text: rawText,
      char_count: rawText.length,
      ingested_at: new Date().toISOString(),
    };

    const r = await fetch(`${SUPABASE_URL}/rest/v1/correction_logs?on_conflict=source_path`, {
      method: "POST",
      headers: { ...HEADERS, Prefer: "return=representation,resolution=merge-duplicates" },
      body: JSON.stringify(row),
    });
    const data = await r.json().catch(() => null);
    if (!r.ok) throw new Error((data && (data.message || data.hint)) || `Supabase insert failed (${r.status})`);

    return res.status(200).json({ ok: true, modelGuess, charCount: rawText.length });
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  }
};
