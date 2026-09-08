// Vercel Serverless Function (Node runtime) — lives at /api/send-fleet-alert
// on the deployed app. NEW FILE — add it to the repo at
// api/send-fleet-alert.js (same folder as send-customer-report.js).
//
// Called from Fleet's "📣 Notify Customer" button (App.js) when a machine is
// flagged. Emails the SAME issue + fix text Devon sees on the Fleet card
// (App.js passes {checkKey,label,cause,action} straight from
// topRecommendation(), so this endpoint never invents its own wording) and
// gives the recipient a button to say the work's done. Logs the send to
// `fleet_alerts` so Fleet can track it — see fleet_alerts.sql for the
// table, and api/confirm-fleet-alert.js for what happens when the button
// gets clicked.
//
// The target address (`toEmail`/`toName`) is resolved CLIENT-SIDE in
// App.js, not looked up here from a customer record — this machine may not
// be linked to a customer at all, or the customer's email on file may be a
// billing/office contact rather than whoever actually runs this specific
// mill. App.js prefers the lab-entered contact email (captured once at
// install time in MillPulse Setup) over the linked customer's email, and
// falls back sensibly. `customerId` is therefore OPTIONAL here — only used
// to tag the logged alert against a customer when one happens to be
// linked; a fully unassigned machine can still get notified as long as a
// lab contact email exists.
//
// Needs the fleet_alerts table — run fleet_alerts.sql in the Supabase SQL
// editor once before this works.
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

function buildEmailHtml({ toName, name, label, cause, action, confirmUrl }) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <h2 style="font-family:Arial,sans-serif;">${toName} — Action Needed on ${name}</h2>
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

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      throw new Error('SUPABASE_URL and/or SUPABASE_SERVICE_KEY are not configured on the server — check Vercel → Project Settings → Environment Variables.');
    }
    if (!process.env.RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY is not configured on the server yet — add it in Vercel → Project Settings → Environment Variables.');
    }

    const { serial, toEmail, toName, customerId, correctionCount, checkKey, label, cause, action } = req.body || {};
    if (!serial || !toEmail || !checkKey || !label) {
      return res.status(400).json({ error: 'serial, toEmail, checkKey and label are required' });
    }
    if (typeof toEmail !== 'string' || !EMAIL_RE.test(toEmail.trim())) {
      return res.status(400).json({ error: `"${toEmail}" doesn't look like a valid email address.` });
    }

    const machineRows = await sbSelect(`machines?serial=eq.${encodeURIComponent(serial)}`);
    const nickname = machineRows[0] && machineRows[0].nickname;
    const name = nickname ? `${nickname} (${serial})` : serial;

    const confirmToken = crypto.randomBytes(24).toString('hex');
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const base = `${proto}://${req.headers.host}`;
    const confirmUrl = `${base}/api/confirm-fleet-alert?token=${confirmToken}`;

    const html = buildEmailHtml({ toName: toName || name, name, label, cause, action, confirmUrl });

    await sendEmail({
      to: toEmail.trim(),
      bcc: process.env.DEVON_EMAIL || undefined,
      subject: `${toName || name} — Action Needed: ${label} (${name})`,
      html,
    });

    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/fleet_alerts`, {
      method: 'POST',
      headers: { ...HEADERS, Prefer: 'return=representation' },
      body: JSON.stringify({
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
      }),
    });
    const inserted = await insertRes.json();
    if (!insertRes.ok) throw new Error(inserted.message || inserted.error || 'Failed to log alert');

    return res.status(200).json({ ok: true, sentTo: toEmail.trim(), alert: Array.isArray(inserted) ? inserted[0] : inserted });
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  }
};
