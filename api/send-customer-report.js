// Vercel Serverless Function (Node runtime) — lives at /api/send-customer-report
// on the deployed app. Builds a customer-friendly monthly status report for
// one customer's machine(s) and either returns a preview (mode: 'preview')
// or actually emails it via Resend and logs it to `customer_reports`
// (mode: 'send'). Called from AXISCRM's Customer Reports page (App.js).
//
// This is a NEW FILE, not an edit to App.js — it needs to be added to the
// repo at api/send-customer-report.js. Vercel auto-detects anything under
// /api as a serverless function regardless of the CRA frontend alongside it,
// so no other config is required for it to start working once it's pushed.
//
// Reads these from Vercel Project Settings → Environment Variables (already
// configured on this project as of Aug 15):
//   SUPABASE_URL          — same project the rest of the app talks to
//   SUPABASE_SERVICE_KEY  — service-role key, NOT the anon key App.js uses
//                            client-side. This runs server-only, so it's safe
//                            to hold a key with full access — bypasses RLS
//                            entirely rather than relying on the same
//                            restricted key a browser gets.
//   RESEND_API_KEY        — from resend.com. Preview mode works without it;
//                            only actually SENDING mail needs it.
//   FROM_EMAIL             — e.g. "AXISCRM Reports <reports@yourdomain.com>".
//                            Falls back to Resend's shared test sender
//                            (onboarding@resend.dev) if unset — works
//                            immediately but looks less professional until a
//                            sending domain is verified in Resend.
//   DEVON_EMAIL            — if set, BCC'd on every customer send, so a copy
//                            always lands in your own inbox too (on top of
//                            it already being logged in the Reports tab).

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const HEADERS = { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, "Content-Type": "application/json" };

// Mirrors the relevant slice of DWX_THRESHOLDS in App.js. Only ported here:
// gradient (rules 1/2) and A/B gap (rule 4) — the two checks that make sense
// in a short, friendly monthly summary. The full 7-rule engine (origin,
// magazine offset, base tool length, angle offset, ballscrew-priority
// interplay) stays in AXISCRM for Devon's own technical view; a customer
// report doesn't need that level of detail. If the shop's thresholds ever
// change in App.js, update the matching numbers here too.
const THRESH = { gradientHard: 0.001, gradientStep: 0.0005, gapHard: 100, gapStep: 100 };

async function sb(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: HEADERS });
  if (!r.ok) throw new Error(`Supabase fetch failed (${r.status}): ${path}`);
  return r.json();
}

function monthBounds(monthStr) {
  const [y, m] = String(monthStr).split('-').map(Number);
  if (!y || !m) throw new Error('month must be in YYYY-MM format');
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  const label = start.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return { start, end, label };
}

// QuickChart.io renders a Chart.js config into a static PNG behind a plain
// URL — no canvas/native dependencies needed in the serverless function,
// and the resulting URL embeds directly as an <img> in the email (email
// clients can't run JS/Recharts, so this is the practical path).
function quickChartUrl(labels, series, title) {
  const config = {
    type: 'line',
    data: {
      labels,
      datasets: series.map(s => ({
        label: s.name, data: s.data, borderColor: s.color, backgroundColor: s.color,
        fill: false, pointRadius: 3, tension: 0.15,
      })),
    },
    options: {
      title: { display: true, text: title, fontSize: 13 },
      legend: { display: series.length > 1, position: 'bottom' },
    },
  };
  return `https://quickchart.io/chart?w=560&h=260&bkg=white&c=${encodeURIComponent(JSON.stringify(config))}`;
}

// Lean, customer-friendly read on the month's LATEST report vs. the one
// before it — same priority idea as Fleet's "recommended fix" (bounce beats
// magnitude, worst issue wins), just written in plain language and limited
// to gradient + A/B gap.
function diagnoseSimple(sortedReports) {
  if (!sortedReports.length) return { status: 'no-data', text: 'No reports were recorded this month.' };
  const latest = sortedReports[sortedReports.length - 1];
  const prev = sortedReports.length > 1 ? sortedReports[sortedReports.length - 2] : null;
  const flags = [];

  const checkGradient = (axisLabel, val, prevVal) => {
    if (val == null) return;
    const bounced = prevVal != null && Math.abs(val - prevVal) >= THRESH.gradientStep;
    const over = Math.abs(val) > THRESH.gradientHard;
    if (bounced) flags.push({ severity: 2, text: `Spindle ${axisLabel} calibration moved more than expected between readings — this typically points to collet wear. Recommended: replace the collet.` });
    else if (over) flags.push({ severity: 1, text: `Spindle ${axisLabel} calibration is outside its normal range — this typically points to spindle misalignment. Recommended: re-align the spindle.` });
  };
  checkGradient('X', latest.spindle_gradient_x, prev?.spindle_gradient_x);
  checkGradient('Y', latest.spindle_gradient_y, prev?.spindle_gradient_y);

  if (latest.a_y_gap != null && latest.a_y_gap > THRESH.gapHard) {
    flags.push({ severity: 1, text: 'Y-axis alignment is outside its normal range. Recommended: inspect/re-align the Y-axis.' });
  }
  if (latest.b_x_gap != null && latest.b_x_gap > THRESH.gapHard) {
    flags.push({ severity: 1, text: 'X-axis alignment is outside its normal range. Recommended: inspect/re-align the X-axis.' });
  }

  if (!flags.length) return { status: 'clean', text: 'Everything checked out within normal range this month — no action needed.' };
  flags.sort((a, b) => b.severity - a.severity);
  return { status: 'flagged', text: flags[0].text };
}

function buildMachineSection(serial, nickname, reports, monthLabel) {
  const sorted = [...reports].sort((a, b) => (a.correction_count || 0) - (b.correction_count || 0));
  const diag = diagnoseSimple(sorted);
  const statusColor = diag.status === 'flagged' ? '#c0392b' : diag.status === 'no-data' ? '#888' : '#1e8e3e';
  const statusLabel = diag.status === 'flagged' ? '⚠ Flagged' : diag.status === 'no-data' ? 'No data this month' : '✓ All normal';
  const name = nickname ? `${nickname} (${serial})` : serial;

  let charts = '';
  if (sorted.length >= 2) {
    const labels = sorted.map(r => `cc ${r.correction_count}`);
    const gradChart = quickChartUrl(labels, [
      { name: 'Gradient X', data: sorted.map(r => r.spindle_gradient_x), color: '#f472b6' },
      { name: 'Gradient Y', data: sorted.map(r => r.spindle_gradient_y), color: '#ffb020' },
    ], `${name} — Spindle Calibration (${monthLabel})`);
    const gapChart = quickChartUrl(labels, [
      { name: 'A-axis gap', data: sorted.map(r => r.a_y_gap), color: '#a78bfa' },
      { name: 'B-axis gap', data: sorted.map(r => r.b_x_gap), color: '#22d47a' },
    ], `${name} — Axis Alignment (${monthLabel})`);
    charts = `
      <img src="${gradChart}" width="100%" style="max-width:560px;display:block;margin-bottom:10px;border-radius:4px;" alt="Spindle calibration chart"/>
      <img src="${gapChart}" width="100%" style="max-width:560px;display:block;border-radius:4px;" alt="Axis alignment chart"/>
    `;
  }

  return `
    <div style="margin-bottom:28px;padding:16px;border:1px solid #e2e2e2;border-radius:8px;">
      <h3 style="margin:0 0 4px;font-family:Arial,sans-serif;">${name}</h3>
      <div style="font-family:Arial,sans-serif;font-size:13px;color:${statusColor};font-weight:bold;margin-bottom:10px;">${statusLabel}</div>
      <div style="font-family:Arial,sans-serif;font-size:13px;color:#333;margin-bottom:14px;">${diag.text}</div>
      ${charts}
      <div style="font-family:Arial,sans-serif;font-size:11px;color:#888;margin-top:10px;">${sorted.length} report${sorted.length === 1 ? '' : 's'} recorded this month${sorted.length === 1 ? ' — charts need at least 2 to draw a trend.' : ''}.</div>
    </div>
  `;
}

async function buildReport(customerId, monthStr) {
  const { start, end, label } = monthBounds(monthStr);
  const customerRows = await sb(`customers?id=eq.${customerId}`);
  const customer = customerRows[0];
  if (!customer) throw new Error('Customer not found');
  const machineRows = await sb(`machines?customer_id=eq.${customerId}`);
  if (!machineRows.length) throw new Error('This customer has no machines linked yet — assign one in Fleet first.');

  const sections = [];
  for (const m of machineRows) {
    const reports = await sb(
      `mill_reports?serial=eq.${encodeURIComponent(m.serial)}&report_date=gte.${start.toISOString()}&report_date=lt.${end.toISOString()}&select=correction_count,spindle_gradient_x,spindle_gradient_y,a_y_gap,b_x_gap,report_date`
    );
    sections.push(buildMachineSection(m.serial, m.nickname, reports, label));
  }

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <h2 style="font-family:Arial,sans-serif;">${customer.company} — ${label} Machine Status</h2>
      <p style="font-family:Arial,sans-serif;font-size:13px;color:#555;">Here's a summary of your machine${machineRows.length > 1 ? 's' : ''} for ${label}, generated from your MillPulse readings.</p>
      ${sections.join('')}
      <p style="font-family:Arial,sans-serif;font-size:11px;color:#999;margin-top:20px;">Questions about this report? Just reply to this email.</p>
    </div>
  `;
  return { html, customer, machineCount: machineRows.length };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      throw new Error('SUPABASE_URL and/or SUPABASE_SERVICE_KEY are not configured on the server — check Vercel → Project Settings → Environment Variables.');
    }
    const { customerId, month, mode } = req.body || {};
    if (!customerId || !month) return res.status(400).json({ error: 'customerId and month (YYYY-MM) are required' });

    const { html, customer, machineCount } = await buildReport(customerId, month);

    if (mode === 'preview') {
      return res.status(200).json({ html, customer: customer.company, machineCount });
    }

    if (!customer.email) throw new Error('This customer has no email address on file — add one in the Customers tab first.');
    if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is not configured on the server yet — add it in Vercel → Project Settings → Environment Variables.');

    const sendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.FROM_EMAIL || 'AXISCRM Reports <onboarding@resend.dev>',
        to: customer.email,
        ...(process.env.DEVON_EMAIL ? { bcc: process.env.DEVON_EMAIL } : {}),
        subject: `${customer.company} — Machine Status Report`,
        html,
      }),
    });
    const sendData = await sendRes.json();
    if (!sendRes.ok) throw new Error(sendData.message || 'Resend API error');

    await fetch(`${SUPABASE_URL}/rest/v1/customer_reports`, {
      method: 'POST',
      headers: { ...HEADERS, Prefer: 'return=minimal' },
      body: JSON.stringify({
        customer_id: customerId,
        report_month: `${month}-01`,
        html_body: html,
        status: 'sent',
        sent_to: customer.email,
      }),
    });

    return res.status(200).json({ ok: true, sentTo: customer.email, machineCount });
  } catch (e) {
    // Best-effort failure log so a broken send still shows up in the Reports
    // archive instead of vanishing silently.
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/customer_reports`, {
        method: 'POST',
        headers: { ...HEADERS, Prefer: 'return=minimal' },
        body: JSON.stringify({
          customer_id: (req.body || {}).customerId || null,
          report_month: (req.body || {}).month ? `${(req.body || {}).month}-01` : null,
          status: 'failed',
          error: e.message || String(e),
        }),
      });
    } catch { /* logging the failure is best-effort, never let it mask the real error */ }
    return res.status(500).json({ error: e.message || String(e) });
  }
};
