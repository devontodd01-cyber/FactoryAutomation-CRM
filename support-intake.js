// Vercel serverless function - Factory Automation DWX support intake
// POST { name, email, errorCode, message }
//
// No npm dependencies - uses fetch against Supabase REST API (same pattern as the CRM).
//
// Flow:
//   1. Normalize the incoming error code, look it up in Supabase error_fixes (with wildcards).
//   2. Log the submission to Supabase submissions.
//   3. Auto-reply to the customer (matched fix, or holding reply if no match).
//   4. Notify Devon - always, flagged for tier 2/3 or no-match.
//
// Env vars (Vercel -> Settings -> Environment Variables):
//   SUPABASE_URL           https://untsjmmqtfasejkwjnlf.supabase.co
//   SUPABASE_SERVICE_KEY   service_role key (secret; bypasses RLS)
//   RESEND_API_KEY         from the factoryautomation@outlook.com Resend account
//   FROM_EMAIL             support@factory-automation.ca
//   DEVON_EMAIL            factoryautomation@outlook.com

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

// --- Supabase REST helpers ---------------------------------------------------
function sbHeaders() {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
  };
}

async function sbSelect(table, query) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    headers: sbHeaders(),
  });
  if (!res.ok) throw new Error(`Supabase select ${res.status}: ${await res.text()}`);
  return res.json();
}

async function sbInsert(table, row) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...sbHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`Supabase insert ${res.status}: ${await res.text()}`);
}

// --- Error-code matching (exact, then wildcard) ------------------------------
function candidateCodes(raw) {
  const code = String(raw || '').trim().toUpperCase();
  const out = [code];
  const m = code.match(/^([0-9A-F]{4})-([0-9A-F]{4})$/);
  if (m) {
    const [, id, param] = m;
    out.push(`${id}-${param.slice(0, 2)}XX`);
    out.push(`${id}-XXXX`);
    out.push(`${id}-${param.slice(0, 3)}X`);
  }
  return [...new Set(out)];
}

async function lookupFix(rawCode) {
  const candidates = candidateCodes(rawCode);
  const inList = candidates.map((c) => `"${c}"`).join(',');
  const rows = await sbSelect(
    'error_fixes',
    `error_code=in.(${encodeURIComponent(inList)})&is_active=eq.true`
  );
  if (!rows || rows.length === 0) return null;
  rows.sort(
    (a, b) =>
      (a.error_code.match(/X/g)?.length || 0) - (b.error_code.match(/X/g)?.length || 0)
  );
  return rows[0];
}

// --- Resend send -------------------------------------------------------------
async function sendEmail({ to, subject, text, replyTo }) {
  const body = { from: process.env.FROM_EMAIL, to, subject, text };
  if (replyTo) body.reply_to = replyTo;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
  return res.json();
}

// --- Handler -----------------------------------------------------------------
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { name, email, errorCode, message } = req.body || {};
  if (!name || !email || !errorCode) {
    return res.status(400).json({ error: 'name, email and errorCode are required' });
  }

  try {
    const fix = await lookupFix(errorCode);
    const tier = fix ? fix.tier : null;
    const needsDevon = !fix || tier >= 2;

    await sbInsert('submissions', {
      customer_name: name,
      customer_email: email,
      error_code: errorCode,
      message: message || null,
      matched_code: fix ? fix.error_code : null,
      tier,
      auto_replied: true,
      needs_devon: needsDevon,
    });

    const customerBody = fix
      ? fix.customer_email_body
      : `Thanks for reaching out about error ${errorCode} on your DWX machine.\n\n` +
        `We've received your message and Factory Automation will get back to you shortly ` +
        `with the next steps. If the machine has stopped, please leave it powered down until we follow up.\n\n` +
        `- Factory Automation`;

    await sendEmail({
      to: email,
      subject: `DWX support: error ${errorCode}`,
      text: customerBody,
      replyTo: process.env.DEVON_EMAIL,
    });

    const flag = !fix
      ? 'NO MATCH - add this code'
      : tier === 3
      ? 'EMERGENCY STOP - urgent'
      : tier === 2
      ? 'Service visit likely'
      : 'Customer-actionable (auto-handled)';

    await sendEmail({
      to: process.env.DEVON_EMAIL,
      subject: `[${flag}] ${errorCode} - ${name}`,
      text:
        `Customer: ${name} <${email}>\n` +
        `Error code: ${errorCode}\n` +
        `Matched: ${fix ? fix.error_code : 'none'} (tier ${tier == null ? '-' : tier})\n` +
        `Message: ${message || '(none)'}\n\n` +
        `Auto-reply sent to customer: yes`,
    });

    return res.status(200).json({ ok: true, matched: fix ? fix.error_code : null, tier });
  } catch (err) {
    console.error(err);
    try {
      await sendEmail({
        to: process.env.DEVON_EMAIL,
        subject: `[INTAKE ERROR] ${errorCode || '?'} - ${name || '?'}`,
        text: `Something failed handling a submission.\n\n${err.message}\n\nCustomer: ${name} <${email}>`,
      });
    } catch (_) {}
    return res.status(500).json({ error: 'intake failed' });
  }
}
