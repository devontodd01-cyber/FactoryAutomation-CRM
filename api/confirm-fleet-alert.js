// Vercel Serverless Function (Node runtime) — lives at /api/confirm-fleet-alert
// on the deployed app. NEW FILE — add it to the repo at
// api/confirm-fleet-alert.js.
//
// Public link a customer clicks from the email api/send-fleet-alert.js sent
// them — no login required, the random confirm_token in the URL IS the
// auth (24 random bytes, effectively unguessable). Marks the alert
// 'customer_confirmed' and tells the customer what to do next: run a
// calibration, then sync.
//
// IMPORTANT: this does NOT close the loop by itself. Fleet only marks an
// alert 'resolved' once a FRESH mill_reports row for that serial actually
// comes back clean — see the reconciliation check in Fleet's load() in
// App.js. This endpoint just records that the customer says they're done.
//
// Env vars: SUPABASE_URL, SUPABASE_SERVICE_KEY, RESEND_API_KEY, FROM_EMAIL,
// DEVON_EMAIL — same ones already configured for send-customer-report.js /
// send-fleet-alert.js. RESEND_API_KEY/DEVON_EMAIL are optional here (best-
// effort "customer confirmed" heads-up to Devon; the confirmation itself
// still gets recorded even if that notification fails).

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const HEADERS = { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json' };

function page(title, bodyHtml) {
  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${title}</title></head>
<body style="font-family:Arial,sans-serif;background:#f4f4f4;margin:0;padding:40px 16px;">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:10px;padding:28px;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    ${bodyHtml}
  </div>
</body></html>`;
}

async function sendDevonEmail(subject, text) {
  if (!process.env.RESEND_API_KEY || !process.env.DEVON_EMAIL) return;
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.FROM_EMAIL || 'AXISCRM Reports <onboarding@resend.dev>',
        to: process.env.DEVON_EMAIL,
        subject,
        text,
      }),
    });
  } catch { /* best-effort — never let this block the customer's confirmation */ }
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) throw new Error('Server not configured.');
    const token = (req.query && req.query.token) || '';
    if (!token) {
      return res.status(400).send(page('Missing link', `<h2>Missing link</h2><p>This confirmation link looks incomplete. Please use the button from the original email.</p>`));
    }

    const lookupRes = await fetch(`${SUPABASE_URL}/rest/v1/fleet_alerts?confirm_token=eq.${encodeURIComponent(token)}`, { headers: HEADERS });
    const rows = await lookupRes.json();
    const alert = rows && rows[0];
    if (!alert) {
      return res.status(404).send(page('Not found', `<h2>Link not found</h2><p>This confirmation link isn't recognized — it may have already been used or the alert was cleared. Reply to the original email if you think this is wrong.</p>`));
    }

    if (alert.status === 'sent') {
      await fetch(`${SUPABASE_URL}/rest/v1/fleet_alerts?id=eq.${alert.id}`, {
        method: 'PATCH',
        headers: HEADERS,
        body: JSON.stringify({ status: 'customer_confirmed', confirmed_at: new Date().toISOString() }),
      });
      sendDevonEmail(
        `Customer confirmed: ${alert.label} on ${alert.serial}`,
        `The customer marked "${alert.label}" on ${alert.serial} as done. Waiting on a fresh MillPulse sync to confirm it actually cleared.`
      );
    }

    return res.status(200).send(page('Thanks — logged', `
      <h2 style="color:#1e8e3e;margin-top:0;">✅ Thanks — logged as complete</h2>
      <p><strong>${alert.label}</strong> on <strong>${alert.serial}</strong></p>
      <p>Next steps:</p>
      <ol style="padding-left:18px;">
        <li>Run a calibration on the machine.</li>
        <li>Then either wait for tonight's automatic MillPulse sync, or open the MillPulse tray icon on the machine's PC and choose <strong>"Sync Reports Now"</strong>.</li>
      </ol>
      <p style="color:#888;font-size:13px;">Once a fresh report comes in showing this cleared, it's closed out on our end automatically — nothing else you need to do. If it's still flagged after that, we'll follow up.</p>
    `));
  } catch (e) {
    return res.status(500).send(page('Something went wrong', `<h2>Something went wrong</h2><p>${e.message || String(e)}</p>`));
  }
};
