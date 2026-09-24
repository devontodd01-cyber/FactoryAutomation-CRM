// Vercel Serverless Function (Node runtime) — lives at /api/send-fleet-alert
// on the deployed app.
//
// Called from two places now:
//   - Fleet's "📣 Notify Customer" / "🔁 Re-notify" button (App.js), via the
//     HTTP handler below — a person clicked something.
//   - api/check-and-notify.js's automatic path, which calls the exported
//     sendFleetAlert() function DIRECTLY (in-process, no HTTP round trip) —
//     a check flagged on 2 consecutive syncs in a row with nobody clicking
//     anything. See check-and-notify.js for what "automatic" means here.
// Both paths emit the exact same email and log the exact same shape of row
// to fleet_alerts — the only difference is the `triggered_by` column, so
// Fleet/Reports can eventually show which sends were manual vs. automatic.
//
// Emails the SAME issue + fix text Devon sees on the Fleet card (App.js
// passes {checkKey,label,cause,action} straight from topRecommendation(),
// and check-and-notify.js uses the identical server-side port of that same
// function — see _fleetDiagnose.js — so this endpoint never invents its own
// wording either way) and gives the recipient a button to say the work's
// done. Logs the send to `fleet_alerts` so Fleet can track it — see
// fleet_alerts.sql for the table, fleet_alerts_auto_notify.sql for the
// triggered_by column, and api/confirm-fleet-alert.js for what happens when
// the button gets clicked.
//
// The target address (`toEmail`/`toName`) is resolved by the CALLER, not
// looked up here from a customer record — a machine may not be linked to a
// customer at all, or the customer's email on file may be a billing/office
// contact rather than whoever actually runs this specific mill. Both App.js
// and check-and-notify.js prefer the lab-entered contact email (captured
// once at install time in MillPulse Setup) over the linked customer's
// email, and fall back sensibly. `customerId` is therefore OPTIONAL here —
// only used to tag the logged alert against a customer when one happens to
// be linked; a fully unassigned machine can still get notified straight at
// its lab-entered contact email.
//
// Needs the fleet_alerts table — run fleet_alerts.sql in the Supabase SQL
// editor once before this works, and fleet_alerts_auto_notify.sql once more
// for the triggered_by column (this degrades gracefully if that second one
// hasn't been run yet — see the try/catch around the insert below).
//
// Env vars — the SAME ones send-customer-report.js already uses, nothing
// new to configure in Vercel:
//   SUPABASE_URL, SUPABASE_SERVICE_KEY, RESEND_API_KEY, FROM_EMAIL, DEVON_EMAIL

const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const HEADERS = { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json' };

const EMAIL_RE = /^\S+@\S+\.\S+$/;

async function sbSelect(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: HEADERS });
  if (!r.ok) throw new Error(`Supabase select failed (${r.status}): ${path}`);
  return r.json();
}

async function sendEmail({ to, bcc, subject, html }) {
  const body = { from: process.env.FROM_EMAIL || 'AXISCRM Reports <onboarding@resend.dev>', to, subject, html };
  if (bcc) body.bcc = bcc;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.message || 'Resend API error');
  return data;
}

// Machine ID block — model + serial on every alert, since many labs run
// several machines (Devon, 2026-09-24).
function machineBlock({ model, serial, nickname, correctionCount }) {
  const row = (k, v) => v == null || v === '' ? '' : `<tr><td style="font-family:Arial,sans-serif;font-size:13px;color:#777;padding:2px 12px 2px 0;">${k}</td><td style="font-family:Arial,sans-serif;font-size:13px;color:#111;font-weight:bold;">${v}</td></tr>`;
  return `<table style="margin:12px 0;border-collapse:collapse;">
    ${row('Machine', model || 'Unknown model')}
    ${row('Serial #', serial)}
    ${row('Name', nickname)}
    ${row('Calibration #', correctionCount)}
  </table>`;
}

function buildEmailHtml({ toName, machineLine, label, cause, action, confirmUrl, model, serial, nickname, correctionCount }) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <h2 style="font-family:Arial,sans-serif;">${toName} — Action Needed on ${machineLine}</h2>
      ${machineBlock({ model, serial, nickname, correctionCount })}
      <p style="font-family:Arial,sans-serif;font-size:13px;color:#555;">
        MillPulse picked up something on this machine's latest reading that's worth addressing.
      </p>
      <div style="margin:18px 0;padding:16px;border:1px solid #e2e2e2;border-radius:8px;">
        <div style="font-family:Arial,sans-serif;font-size:13px;color:#c0392b;font-weight:bold;margin-bottom:8px;">⚠ ${label}</div>
        ${cause ? `<div style="font-family:Arial,sans-serif;font-size:13px;color:#333;margin-bottom:10px;">${cause}</div>` : ''}
        <div style="font-family:Arial,sans-serif;font-size:13px;color:#333;"><strong>What to do:</strong> ${action || 'Please have this looked at.'}</div>
      </div>
      <div style="text-align:center;margin:24px 0;">
        <a href="${confirmUrl}" style="display:inline-block;background:#1e8e3e;color:#fff;text-decoration:none;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;padding:12px 24px;border-radius:6px;">
          ✅ Yes, I've completed this
        </a>
      </div>
      <p style="font-family:Arial,sans-serif;font-size:11px;color:#999;">
        Questions before doing this? Just reply to this email.
      </p>
    </div>
  `;
}

async function insertAlert(row) {
  const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/fleet_alerts`, {
    method: 'POST',
    headers: { ...HEADERS, Prefer: 'return=representation' },
    body: JSON.stringify(row),
  });
  const data = await insertRes.json();
  if (!insertRes.ok) throw new Error((data && (data.message || data.error)) || 'Failed to log alert');
  return Array.isArray(data) ? data[0] : data;
}

// Core send+log logic. `triggeredBy` is 'manual' unless the caller passes
// 'auto' — stored on the fleet_alerts row (best-effort: if
// fleet_alerts_auto_notify.sql hasn't been run yet, the column won't exist,
// so this retries the insert once without it rather than losing the whole
// send over a migration that hasn't happened). Note this function does NOT
// send Devon his separate auto-send heads-up email — check-and-notify.js
// does that itself, since only it knows *why* the send happened (confirmed
// on 2 syncs) and what to say about it.
async function sendFleetAlert({ serial, model, toEmail, toName, customerId, correctionCount, checkKey, label, cause, action, host, proto, triggeredBy }) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error('SUPABASE_URL and/or SUPABASE_SERVICE_KEY are not configured on the server — check Vercel → Project Settings → Environment Variables.');
  }
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not configured on the server yet — add it in Vercel → Project Settings → Environment Variables.');
  }
  const missing = [];
  if (!serial) missing.push('serial');
  if (!toEmail) missing.push('toEmail');
  if (!checkKey) missing.push('checkKey');
  if (!label) missing.push('label');
  if (missing.length) throw new Error(`Missing required field(s): ${missing.join(', ')}`);
  if (typeof toEmail !== 'string' || !EMAIL_RE.test(toEmail.trim())) {
    throw new Error(`"${toEmail}" doesn't look like a valid email address.`);
  }

  const machineRows = await sbSelect(`machines?serial=eq.${encodeURIComponent(serial)}`);
  const nickname = machineRows[0] && machineRows[0].nickname;
  const name = nickname ? `${nickname} (${serial})` : serial;
  // Model: caller's value if given (auto path passes it), else the latest
  // report's model from mill_reports (covers the manual Notify button).
  let machineModel = model || (machineRows[0] && machineRows[0].model) || null;
  if (!machineModel) {
    try {
      const m = await sbSelect(`mill_reports?serial=eq.${encodeURIComponent(serial)}&select=model&order=correction_count.desc&limit=1`);
      machineModel = (m[0] && m[0].model) || null;
    } catch { /* best-effort — email still goes out with the serial */ }
  }
  const machineLine = `${machineModel ? machineModel + ' ' : ''}SN ${serial}${nickname ? ` (${nickname})` : ''}`;

  const confirmToken = crypto.randomBytes(24).toString('hex');
  const base = `${proto || 'https'}://${host || 'axiscrm.vercel.app'}`;
  const confirmUrl = `${base}/api/confirm-fleet-alert?token=${confirmToken}`;

  const html = buildEmailHtml({ toName: toName || name, machineLine, label, cause, action, confirmUrl,
    model: machineModel, serial, nickname, correctionCount });

  await sendEmail({
    to: toEmail.trim(),
    bcc: process.env.DEVON_EMAIL || undefined,
    subject: `Action Needed: ${label} — ${machineLine}`,
    html,
  });

  const row = {
    serial,
    customer_id: customerId || null,
    check_key: checkKey,
    label,
    cause: cause || null,
    action: action || null,
    correction_count: correctionCount != null ? correctionCount : null,
    status: 'sent',
    sent_to: toEmail.trim(),
    confirm_token: confirmToken,
  };

  let inserted;
  try {
    inserted = await insertAlert({ ...row, triggered_by: triggeredBy || 'manual' });
  } catch (e) {
    // Most likely cause: triggered_by column doesn't exist yet on this
    // Supabase project (fleet_alerts_auto_notify.sql not run). Retry once
    // without it so the actual customer email + row still get logged.
    inserted = await insertAlert(row);
  }

  return { ok: true, sentTo: toEmail.trim(), alert: inserted, name, model: machineModel, machineLine };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    const { serial, model, toEmail, toName, customerId, correctionCount, checkKey, label, cause, action } = req.body || {};
    // TEMP DEBUG — logs the exact payload this endpoint received, so a failed
    // send shows up in Vercel → Deployments → (latest) → Logs with the real
    // reason instead of a generic 400. Safe to leave in; remove later if it
    // gets noisy.
    console.log('send-fleet-alert received:', JSON.stringify({ serial, toEmail, toName, customerId, correctionCount, checkKey, label }));
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const result = await sendFleetAlert({
      serial, model, toEmail, toName, customerId, correctionCount, checkKey, label, cause, action,
      host: req.headers.host, proto, triggeredBy: 'manual',
    });
    return res.status(200).json(result);
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  }
};

module.exports.sendFleetAlert = sendFleetAlert;
