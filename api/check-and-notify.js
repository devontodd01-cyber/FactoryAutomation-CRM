// Vercel Serverless Function (Node runtime) — lives at /api/check-and-notify
//
// The "automatic notification" engine. Two doors into the same core logic:
//   - checkAndNotifySerial(serial) — called IN-PROCESS (a direct function
//     call, no HTTP round trip) by api/ingest-report.js right after a fresh
//     sync lands. This is the main path: the daily 3am / on-startup sync
//     agent run is what actually drives auto-notify, with nothing new to
//     schedule.
//   - the default HTTP handler below — called from Fleet's "➕ Add Report"
//     paste box in App.js (saveManualReports), since that path writes
//     straight to Supabase from the browser and never goes through
//     ingest-report.js. Both doors call the exact same
//     checkAndNotifySerial(), so a machine gets the same automatic
//     treatment no matter which way its data came in.
//
// What "automatic" means here — Devon's own design choices:
//   - TRIGGER TIMING (set 2026-09-23): a check must flag on TWO CONSECUTIVE
//     syncs in a row (not just the latest one) before it emails anyone. A
//     single glitchy reading never reaches a customer. This applies to
//     EVERY check below, including the 4 newly added ones — see
//     isConfirmedTwice() below.
//   - SCOPE (updated 2026-09-23): the FULL diagnostic engine — all of
//     spindle gradient, A/B-axis gap, origin drift (X/Y/Z), magazine offset
//     drift, base tool length drift, and angle-offset drift (new) and the
//     existing single-report angle-offset check. See api/_fleetDiagnose.js
//     for the exact rules and thresholds (kept in sync by hand with
//     src/App.js's copy, since Fleet's card and Mill Diagnostics now use
//     the identical engine too — "what a customer gets emailed about, you
//     also see flagged in the app" holds for the full rule set now, not
//     just gradient/gap).
//   - NEW REPORTS ONLY (2026-09-23): ingest-report.js only calls this when a
//     correction_count higher than anything saved arrives. Unchanged nightly
//     re-sends never trigger it.
//   - ONE EMAIL PER CHECK PER CALIBRATION (2026-09-23): skipped if a
//     fleet_alerts row already exists for this serial+check+correction_count.
//     If the customer recalibrates and the same check STILL flags (new
//     correction_count), they get notified again automatically.
//   - DEVON'S OVERSIGHT: he gets his own heads-up email the instant an
//     automatic send goes out (on top of the DEVON_EMAIL bcc
//     send-fleet-alert.js already puts on every alert email), so he's never
//     blindsided by a customer replying to something he didn't know was
//     sent. See notifyDevonOfAutoSend() below. No delay/approval step —
//     the customer email goes out right away.
//
// How the confirm-twice check gets its data: it re-parses the last 3
// diagnostic_reports.raw_text rows for the serial (NOT the reduced
// mill_reports columns) through the same full engine Mill Diagnostics uses,
// so every check — including the ones that need a full raw curve, like
// angle offset — gets exact parity. 3 rows is enough because every check
// only ever needs ONE previous reading, not deep history: the oldest of the
// 3 seeds prev-state, the middle one is "the previous evaluation", the
// newest is "now".
//
// Needs api/send-fleet-alert.js's exported sendFleetAlert() core, and the
// fleet_alerts.triggered_by column — run fleet_alerts_auto_notify.sql once
// in Supabase (send-fleet-alert.js degrades gracefully if that hasn't
// happened yet, so this still works either way).
//
// Env vars — same ones already configured for send-fleet-alert.js /
// send-customer-report.js: SUPABASE_URL, SUPABASE_SERVICE_KEY,
// RESEND_API_KEY, FROM_EMAIL, DEVON_EMAIL.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const HEADERS = { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json' };

const { diagnoseHistory, topFlagged } = require('./_fleetDiagnose');
const { sendFleetAlert } = require('./send-fleet-alert');

async function sbSelect(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: HEADERS });
  if (!r.ok) throw new Error(`Supabase select failed (${r.status}): ${path}`);
  return r.json();
}

// Checks that still show on Fleet / Mill Diagnostics but NEVER email a
// customer automatically, per model. (Devon, 2026-09-24: DWX-53DC Y-axis
// spindle alignment always reads out of tolerance on this model — a known
// platform trait, not a fault — so every 53DC customer would get the same
// email. X-axis alignment still emails. The X and Y gradient BOUNCE checks
// (spindle_gradient_*_drift, same ≥0.0005 tolerance as before) still email
// on every model, 53DC included.)
const EMAIL_SUPPRESSED_CHECKS = {
  DWX53DC: ['spindle_gradient_y_collet_wear'],
};
const modelKey = (model) => String(model || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
function emailableDiagnostics(diagnostics, model) {
  const blocked = EMAIL_SUPPRESSED_CHECKS[modelKey(model)] || [];
  return blocked.length ? diagnostics.filter((d) => !blocked.includes(d.check)) : diagnostics;
}

async function notifyDevonOfAutoSend({ serial, model, correctionCount, name, toEmail, label, cause, action }) {
  const machineLine = `${model ? model + ' ' : ''}SN ${serial}`;
  if (!process.env.RESEND_API_KEY || !process.env.DEVON_EMAIL) return;
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.FROM_EMAIL || 'AXISCRM Reports <onboarding@resend.dev>',
        to: process.env.DEVON_EMAIL,
        subject: `🤖 Auto-notified ${name} — ${label} — ${machineLine}`,
        text: `MillPulse automatically emailed ${toEmail} about ${name}.\n\n`
          + `Machine: ${model || 'Unknown model'}\nSerial #: ${serial}\nCalibration #: ${correctionCount != null ? correctionCount : '—'}\n\n`
          + `Why: "${label}" flagged on two syncs in a row, so it cleared the auto-notify bar without anyone clicking anything.\n\n`
          + `${cause || ''}\n\nWhat was sent as the fix: ${action || ''}\n\n`
          + `This is already logged in Fleet like any other alert — it'll auto-resolve once a clean sync comes back in, same as a manual notify. No action needed from you unless you want to follow up directly.`,
      }),
    });
  } catch { /* best-effort — never let this block the actual customer send */ }
}

// Was the SAME check flagged on the immediately-preceding evaluation too
// (report N-1 vs N-2), not just the current one (report N vs N-1)?
// `history` is diagnoseHistory()'s ascending output; needs at least 3
// entries — with only 2, there's no earlier evaluation to confirm against
// yet (returns false: pending, will get re-checked on the next sync).
function isConfirmedTwice(history, checkKey) {
  const n = history.length;
  if (n < 2) return false;
  const flaggedNow = history[n - 1].diagnostics.some((d) => d.check === checkKey && d.flagged);
  const flaggedPrev = history[n - 2].diagnostics.some((d) => d.check === checkKey && d.flagged);
  return flaggedNow && flaggedPrev;
}

async function checkAndNotifySerial(serial, opts = {}) {
  if (!serial) return { skipped: 'no serial' };

  // Last 3 diagnostic_reports rows (raw_text needed to re-parse through the
  // full engine) — descending, then reversed to ascending for diagnoseHistory.
  // 2 reports is enough to confirm a check that flags on its own (magnitude
  // checks); change/drift checks naturally need 3, since the first report has
  // nothing to compare against.
  const diagRowsDesc = await sbSelect(
    `diagnostic_reports?serial=eq.${encodeURIComponent(serial)}&select=correction_count,raw_text&order=correction_count.desc&limit=3`
  );
  const diagRows = Array.isArray(diagRowsDesc) ? [...diagRowsDesc].reverse() : [];
  if (diagRows.length < 2) return { skipped: 'not enough history yet (need 2+ reports)' };

  const history = diagnoseHistory(diagRows);
  if (history.length < 2) return { skipped: 'not enough parseable history yet' };

  const latestEntry = history[history.length - 1];
  // Highest-priority flag that's allowed to email for this model (a
  // suppressed check is skipped, so the next real issue can still go out).
  const rec = topFlagged(emailableDiagnostics(latestEntry.diagnostics, latestEntry.model), latestEntry.model);
  if (!rec) return { skipped: 'nothing flagged' };
  if (!isConfirmedTwice(history, rec.check)) return { skipped: 'flagged, but not yet confirmed on a 2nd consecutive sync', check: rec.check };

  // One notification per check PER CALIBRATION (correction_count), any
  // status, manual or auto. Same report re-sent / re-pasted -> no repeat.
  // Customer calibrates again and it STILL flags -> new correction_count ->
  // notify again. (Set 2026-09-23 per Devon; replaces the old "any open
  // alert blocks it" rule.)
  const cc = latestEntry.correctionCount;
  const alreadyForThisReport = await sbSelect(
    `fleet_alerts?serial=eq.${encodeURIComponent(serial)}&check_key=eq.${encodeURIComponent(rec.check)}&correction_count=eq.${encodeURIComponent(cc)}&select=id`
  );
  if (Array.isArray(alreadyForThisReport) && alreadyForThisReport.length) return { skipped: 'already notified for this check on this correction count', check: rec.check };
  const earlierAlerts = await sbSelect(
    `fleet_alerts?serial=eq.${encodeURIComponent(serial)}&check_key=eq.${encodeURIComponent(rec.check)}&select=correction_count&order=correction_count.desc&limit=1`
  );
  const repeatOf = Array.isArray(earlierAlerts) && earlierAlerts.length ? earlierAlerts[0].correction_count : null;

  // Contact info + correction_count for the alert row still come from
  // mill_reports (lab_email/lab_name aren't stored on diagnostic_reports).
  const millLatest = await sbSelect(
    `mill_reports?serial=eq.${encodeURIComponent(serial)}&select=correction_count,lab_email,lab_name&order=correction_count.desc&limit=1`
  );
  const latestMill = millLatest[0] || {};

  const machineRows = await sbSelect(`machines?serial=eq.${encodeURIComponent(serial)}`);
  const owner = machineRows[0] || null;
  let customer = null;
  if (owner && owner.customer_id) {
    const custRows = await sbSelect(`customers?id=eq.${encodeURIComponent(owner.customer_id)}`);
    customer = custRows[0] || null;
  }
  const notifyEmail = latestMill.lab_email || (customer && customer.email) || null;
  const notifyName = (customer && customer.company) || (owner && owner.nickname) || latestMill.lab_name || serial;

  if (!notifyEmail) {
    // Called only on new calibrations from the sync agent, so this heads-up
    // goes out at most once per correction_count via that path.
    // Confirmed twice, nothing to send to — still worth telling Devon so a
    // real issue doesn't just sit there unnoticed for lack of a contact.
    await notifyDevonOfAutoSend({
      serial, model: latestEntry.model, correctionCount: cc, name: notifyName, toEmail: '(no contact email on file)',
      label: rec.label,
      cause: `Confirmed on 2 consecutive syncs, but there's no lab-entered contact email and no linked customer email to send it to. ${rec.cause}`,
      action: 'Add a contact email at install time, or link a customer with an email, then use 🔁 Re-notify on the Fleet card.',
    });
    return { skipped: 'confirmed but no contact email on file', check: rec.check };
  }

  const result = await sendFleetAlert({
    serial, model: latestEntry.model, toEmail: notifyEmail, toName: notifyName, customerId: (customer && customer.id) || null,
    correctionCount: cc,
    checkKey: rec.check, label: rec.label, cause: rec.cause, action: rec.action,
    host: opts.host, proto: opts.proto, triggeredBy: 'auto',
  });

  await notifyDevonOfAutoSend({ serial, model: latestEntry.model, correctionCount: cc, name: notifyName, toEmail: notifyEmail, label: rec.label,
    cause: (repeatOf != null ? `REPEAT: customer was already notified at correction #${repeatOf}, recalibrated (now #${cc}), and it still flags. ` : '') + rec.cause,
    action: rec.action });

  return { sent: true, sentTo: notifyEmail, check: rec.check, alert: result.alert };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_KEY are not configured on the server.');
    const { serial } = req.body || {};
    if (!serial) return res.status(400).json({ error: 'serial is required' });
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const result = await checkAndNotifySerial(serial, { host: req.headers.host, proto });
    return res.status(200).json({ ok: true, ...result });
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  }
};

module.exports.checkAndNotifySerial = checkAndNotifySerial;
module.exports.emailableDiagnostics = emailableDiagnostics;
