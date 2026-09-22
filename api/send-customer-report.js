// Vercel Serverless Function (Node runtime) — lives at /api/send-customer-report
// on the deployed app. Builds a customer-friendly monthly status report for
// one customer's machine(s) and either returns a preview (mode: 'preview')
// or actually emails it via Resend and logs it to `customer_reports`
// (mode: 'send'). Called from AXISCRM's Customer Reports page (App.js).
//
// REWRITE (Sep 2026): previously this only checked 2 of the shop's 7
// diagnostic rules (gradient + A/B gap magnitude) and only ever showed the
// SINGLE worst issue, silently dropping any other concern active on the
// same machine at the same time. Devon asked for two things: (1) show 5
// charts instead of 2, so the report reads as more thorough, and (2) don't
// reveal the exact metric names/thresholds the shop's diagnostics are built
// on -- a customer (or a competitor) shouldn't be able to reverse-engineer
// exactly what's parsed from the machine's report or what triggers a flag.
// So every chart/section below is built from the REAL numbers and the REAL
// thresholds (ported from DWX_THRESHOLDS in App.js -- same values, kept in
// sync manually since this runs server-side and can't import App.js
// directly), but labeled with generic "index" names instead of the
// internal field names, and the two positional metrics (origin, magazine
// offset) are shown as normalized ±10 trend lines rather than their raw
// units -- same technique the internal Fleet view already uses for those
// two charts, which conveniently also obscures the real-world scale.
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

// Real thresholds, ported 1:1 from DWX_THRESHOLDS in App.js (rules 1,2,3,4,5,6
// in the shop technician's own numbering). Keep these in sync by hand if the
// shop's calibration technician ever changes a number in App.js -- there is
// no shared import between this serverless function and the CRA frontend.
const T = {
  gradientHard: 0.001,   // rule 1 — stable magnitude → spindle misalignment
  gradientStep: 0.0005,  // rule 2 — bounce → collet wear (outranks rule 1 on the same axis)
  gapHard: 100,          // rule 4 — stable magnitude → axis alignment issue
  gapStep: 100,          // rule 4 — bounce → ballscrew wear (outranks the magnitude check)
  originStep: 100,       // rule 3 — any axis bouncing → flag that axis
  magOffsetStep: 100,    // rule 5 — any axis bouncing → X/Y = that axis misaligned, Z = ballscrew
  baseToolStep: 100,     // rule 6 — bouncing while Z-origin & magazine-Z stay clean → bad tool setter switch
};

// Generic, non-revealing display names. The underlying data and thresholds
// above are the real ones; only the labels shown to a customer are renamed
// so the exact VPanel/RotaryAxisCorrection field names and the shop's
// specific tolerance numbers aren't handed to whoever reads the email.
const NAME = {
  gradient: 'Precision Calibration Index',
  gap: 'Structural Alignment Index',
  origin: 'Positional Stability Index',
  magOffset: 'Tool Changer Consistency Index',
  baseTool: 'Reference Tool Stability',
};

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
function quickChartUrl(labels, series, title, yFormat) {
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
      ...(yFormat ? { scales: { yAxes: [{ ticks: { callback: yFormat } }] } } : {}),
    },
  };
  return `https://quickchart.io/chart?w=560&h=260&bkg=white&c=${encodeURIComponent(JSON.stringify(config))}`;
}

// Mean-center each key across the window, then divide every deviation by the
// single largest deviation seen across ALL keys (not per-key), so the
// resulting lines sit on a shared ±10 scale. This is the same technique the
// internal Fleet view uses for origin drift / magazine offset charts — it
// happens to also be exactly what we want here: the customer sees genuine
// relative movement without ever seeing the real-world units.
function normalizeToIndex(rows, keys) {
  const means = {};
  for (const k of keys) {
    const vals = rows.map(r => r[k]).filter(v => typeof v === 'number' && !Number.isNaN(v));
    means[k] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }
  let maxDev = 0;
  for (const r of rows) {
    for (const k of keys) {
      if (typeof r[k] === 'number' && means[k] != null) maxDev = Math.max(maxDev, Math.abs(r[k] - means[k]));
    }
  }
  return rows.map(r => {
    const out = { ...r };
    for (const k of keys) {
      if (typeof r[k] === 'number' && means[k] != null) {
        out[k + 'Idx'] = maxDev === 0 ? 0 : ((r[k] - means[k]) / maxDev) * 10;
      } else {
        out[k + 'Idx'] = null;
      }
    }
    return out;
  });
}

// Every real rule the shop's technician defined, ALL of them evaluated (not
// just the worst one) — a machine with two independent problems at once
// should say so twice, not pick one and hide the other. `sorted` is the
// merged mill_reports + diagnostic_reports history for the month, oldest
// first. Bounce checks compare the last two points inside this month's
// window (same simplification the original version used for gradient —
// a true cross-month-boundary comparison would need last month's final
// reading too, which is a reasonable future improvement but out of scope
// here).
function diagnoseFull(sorted) {
  if (!sorted.length) return { status: 'no-data', flags: [] };
  const latest = sorted[sorted.length - 1];
  const prev = sorted.length > 1 ? sorted[sorted.length - 2] : null;
  const flags = [];

  // Rules 1 & 2 — spindle calibration (Precision Calibration Index)
  const checkGradient = (axisLabel, val, prevVal) => {
    if (val == null) return;
    const bounced = prevVal != null && Math.abs(val - prevVal) >= T.gradientStep;
    const over = Math.abs(val) > T.gradientHard;
    if (bounced) flags.push({ severity: 3, index: NAME.gradient, text: `${NAME.gradient} moved more than expected between readings (axis ${axisLabel}) — this pattern typically points to collet wear. Recommended: replace the collet.` });
    else if (over) flags.push({ severity: 2, index: NAME.gradient, text: `${NAME.gradient} is outside its normal range (axis ${axisLabel}) — this pattern typically points to spindle misalignment. Recommended: have the spindle re-aligned.` });
  };
  checkGradient('X', latest.gradX, prev?.gradX);
  checkGradient('Y', latest.gradY, prev?.gradY);

  // Rule 4 — axis alignment gap (Structural Alignment Index), magnitude + bounce
  const checkGap = (axisLabel, val, prevVal) => {
    if (val == null) return;
    const bounced = prevVal != null && Math.abs(val - prevVal) >= T.gapStep;
    const over = val > T.gapHard;
    if (bounced) flags.push({ severity: 3, index: NAME.gap, text: `${NAME.gap} jumped between readings (${axisLabel}-axis) — this pattern typically points to ballscrew wear. Recommended: have the ${axisLabel}-axis ballscrew inspected.` });
    else if (over) flags.push({ severity: 2, index: NAME.gap, text: `${NAME.gap} is outside its normal range (${axisLabel}-axis) — recommended: inspect/re-align the ${axisLabel}-axis.` });
  };
  checkGap('Y', latest.aGap, prev?.aGap);
  checkGap('X', latest.bGap, prev?.bGap);

  // Rule 3 — origin drift (Positional Stability Index), any axis bouncing
  if (Array.isArray(latest.origin) && Array.isArray(prev?.origin)) {
    const axisLabels = ['X', 'Y', 'Z'];
    latest.origin.forEach((v, i) => {
      const pv = prev.origin[i];
      if (typeof v === 'number' && typeof pv === 'number' && Math.abs(v - pv) >= T.originStep) {
        flags.push({ severity: 1, index: NAME.origin, text: `${NAME.origin} shifted more than expected on the ${axisLabels[i]} axis. Recommended: have that axis's positioning checked.` });
      }
    });
  }

  // Rule 5 — magazine/tool-changer offset (Tool Changer Consistency Index)
  if (Array.isArray(latest.magOffset) && Array.isArray(prev?.magOffset)) {
    const flaggedAxes = [];
    latest.magOffset.forEach((v, i) => {
      const pv = prev.magOffset[i];
      if (typeof v === 'number' && typeof pv === 'number' && Math.abs(v - pv) >= T.magOffsetStep) {
        flaggedAxes.push(['X', 'Y', 'Z'][i]);
      }
    });
    if (flaggedAxes.length) {
      const zHit = flaggedAxes.includes('Z');
      const xyHit = flaggedAxes.filter(a => a !== 'Z');
      if (zHit) flags.push({ severity: 1, index: NAME.magOffset, text: `${NAME.magOffset} shifted on the tool changer's Z reference — this pattern typically points to ballscrew wear. Recommended: have the ballscrew inspected.` });
      if (xyHit.length) flags.push({ severity: 1, index: NAME.magOffset, text: `${NAME.magOffset} shifted on the tool changer's ${xyHit.join('/')} reference. Recommended: have that alignment checked.` });
    }
  }

  // Rule 6 — reference tool length (Reference Tool Stability), gated on a
  // clean Z-origin and clean magazine-Z (isolates the cause to the tool
  // setter switch itself rather than a real Z-axis movement).
  if (typeof latest.baseTool === 'number' && typeof prev?.baseTool === 'number') {
    const bounced = Math.abs(latest.baseTool - prev.baseTool) >= T.baseToolStep;
    if (bounced) {
      const originZClean = !Array.isArray(latest.origin) || !Array.isArray(prev.origin)
        || latest.origin[2] == null || prev.origin[2] == null
        || Math.abs(latest.origin[2] - prev.origin[2]) < T.originStep;
      const magZClean = !Array.isArray(latest.magOffset) || !Array.isArray(prev.magOffset)
        || latest.magOffset[2] == null || prev.magOffset[2] == null
        || Math.abs(latest.magOffset[2] - prev.magOffset[2]) < T.magOffsetStep;
      if (originZClean && magZClean) {
        flags.push({ severity: 1, index: NAME.baseTool, text: `${NAME.baseTool} moved more than expected between readings, with the other axis references holding steady — this pattern typically points to a bad tool-setter switch. Recommended: have the tool setter switch inspected.` });
      }
    }
  }

  if (!flags.length) return { status: 'clean', flags: [] };
  flags.sort((a, b) => b.severity - a.severity);
  return { status: 'flagged', flags };
}

function chartSection(title, subtitle, imgUrl, caption) {
  return `
    <div style="margin-bottom:18px;">
      <div style="font-family:Arial,sans-serif;font-size:12.5px;font-weight:bold;color:#111;margin-bottom:2px;">${title}</div>
      ${subtitle ? `<div style="font-family:Arial,sans-serif;font-size:10.5px;color:#888;margin-bottom:6px;">${subtitle}</div>` : ''}
      <img src="${imgUrl}" width="100%" style="max-width:560px;display:block;border-radius:4px;border:1px solid #eee;" alt="${title}"/>
      ${caption ? `<div style="font-family:Arial,sans-serif;font-size:10.5px;color:#888;margin-top:4px;">${caption}</div>` : ''}
    </div>
  `;
}

function buildMachineSection(serial, nickname, millRows, diagRows, monthLabel) {
  const diagByCC = {};
  for (const d of diagRows) {
    const rm = d.raw_metrics || {};
    diagByCC[d.correction_count] = { origin: Array.isArray(rm.origin) ? rm.origin : null, magOffset: Array.isArray(rm.magOffset) ? rm.magOffset : null };
  }

  const sorted = [...millRows]
    .sort((a, b) => (a.correction_count || 0) - (b.correction_count || 0))
    .map(r => ({
      cc: r.correction_count,
      gradX: r.spindle_gradient_x,
      gradY: r.spindle_gradient_y,
      aGap: r.a_y_gap,
      bGap: r.b_x_gap,
      baseTool: r.base_tool_length,
      origin: diagByCC[r.correction_count]?.origin || null,
      magOffset: diagByCC[r.correction_count]?.magOffset || null,
    }));

  const diag = diagnoseFull(sorted);
  const name = nickname ? `${nickname} (${serial})` : serial;
  const statusColor = diag.status === 'flagged' ? '#c0392b' : diag.status === 'no-data' ? '#888' : '#1e8e3e';
  const statusLabel = diag.status === 'flagged' ? `⚠ ${diag.flags.length} thing${diag.flags.length === 1 ? '' : 's'} need attention` : diag.status === 'no-data' ? 'No data this month' : '✓ All normal';

  let concernsHtml = '';
  if (diag.flags.length) {
    concernsHtml = `
      <div style="border:1px solid #f5c6c6;background:#fdf1f1;border-radius:6px;padding:10px 12px;margin-bottom:14px;">
        ${diag.flags.map((f, i) => `
          <div style="font-family:Arial,sans-serif;font-size:12.5px;color:#7f1d1d;padding:${i === 0 ? '0' : '8px 0 0'};${i > 0 ? 'border-top:1px solid #f5c6c6;margin-top:8px;' : ''}">
            <strong>${i + 1}.</strong> ${f.text}
          </div>
        `).join('')}
      </div>
    `;
  } else if (diag.status === 'clean') {
    concernsHtml = `<div style="font-family:Arial,sans-serif;font-size:13px;color:#1e8e3e;margin-bottom:14px;">Everything checked out within normal range this month — no action needed.</div>`;
  }

  let charts = '';
  if (sorted.length >= 2) {
    const labels = sorted.map(r => `#${r.cc}`);

    charts += chartSection(
      NAME.gradient,
      'Last readings this month',
      quickChartUrl(labels, [
        { name: 'X', data: sorted.map(r => r.gradX), color: '#f472b6' },
        { name: 'Y', data: sorted.map(r => r.gradY), color: '#ffb020' },
      ], `${name} — ${NAME.gradient}`),
    );

    charts += chartSection(
      NAME.gap,
      'Last readings this month',
      quickChartUrl(labels, [
        { name: 'Y-axis', data: sorted.map(r => r.aGap), color: '#a78bfa' },
        { name: 'X-axis', data: sorted.map(r => r.bGap), color: '#22d47a' },
      ], `${name} — ${NAME.gap}`),
    );

    const haveOrigin = sorted.filter(r => Array.isArray(r.origin)).length >= 2;
    if (haveOrigin) {
      const normed = normalizeToIndex(sorted.map(r => ({ x: r.origin?.[0], y: r.origin?.[1], z: r.origin?.[2] })), ['x', 'y', 'z']);
      charts += chartSection(
        NAME.origin,
        'Normalized index — relative movement, not raw units',
        quickChartUrl(labels, [
          { name: 'X', data: normed.map(r => r.xIdx), color: '#ec4899' },
          { name: 'Y', data: normed.map(r => r.yIdx), color: '#f59e0b' },
          { name: 'Z', data: normed.map(r => r.zIdx), color: '#3b82f6' },
        ], `${name} — ${NAME.origin}`),
      );
    }

    const haveMag = sorted.filter(r => Array.isArray(r.magOffset)).length >= 2;
    if (haveMag) {
      const normed = normalizeToIndex(sorted.map(r => ({ x: r.magOffset?.[0], y: r.magOffset?.[1], z: r.magOffset?.[2] })), ['x', 'y', 'z']);
      charts += chartSection(
        NAME.magOffset,
        'Normalized index — relative movement, not raw units',
        quickChartUrl(labels, [
          { name: 'X', data: normed.map(r => r.xIdx), color: '#8b5cf6' },
          { name: 'Y', data: normed.map(r => r.yIdx), color: '#f59e0b' },
          { name: 'Z', data: normed.map(r => r.zIdx), color: '#10b981' },
        ], `${name} — ${NAME.magOffset}`),
      );
    }

    const baseToolVals = sorted.map(r => r.baseTool).filter(v => typeof v === 'number');
    if (baseToolVals.length >= 2) {
      const baseline = baseToolVals[0];
      const pctSeries = sorted.map(r => typeof r.baseTool === 'number' && baseline ? ((r.baseTool - baseline) / baseline) * 100 : null);
      charts += chartSection(
        NAME.baseTool,
        '% change from the start of this month',
        quickChartUrl(labels, [
          { name: '% change', data: pctSeries, color: '#00c8ff' },
        ], `${name} — ${NAME.baseTool}`),
      );
    }
  }

  return `
    <div style="margin-bottom:28px;padding:16px;border:1px solid #e2e2e2;border-radius:8px;">
      <h3 style="margin:0 0 4px;font-family:Arial,sans-serif;">${name}</h3>
      <div style="font-family:Arial,sans-serif;font-size:13px;color:${statusColor};font-weight:bold;margin-bottom:10px;">${statusLabel}</div>
      ${concernsHtml}
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
    const millRows = await sb(
      `mill_reports?serial=eq.${encodeURIComponent(m.serial)}&report_date=gte.${start.toISOString()}&report_date=lt.${end.toISOString()}&select=correction_count,spindle_gradient_x,spindle_gradient_y,a_y_gap,b_x_gap,base_tool_length,report_date`
    );
    const ccList = millRows.map(r => r.correction_count).filter(v => v != null);
    const diagRows = ccList.length
      ? await sb(`diagnostic_reports?serial=eq.${encodeURIComponent(m.serial)}&correction_count=in.(${ccList.join(',')})&select=correction_count,raw_metrics`)
      : [];
    sections.push(buildMachineSection(m.serial, m.nickname, millRows, diagRows, label));
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
