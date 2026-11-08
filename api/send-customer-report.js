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
  gradientMinorMax: 0.0015, // (2026-11-07, Devon) steady and only slightly over (≤ this) = MINOR:
                            // common on the DWX-53DC; worth pointing out (accuracy/quality) but not urgent
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
// Settle rule (2026-11-07, Devon): some faults take a few corrections to
// clear. A check that flags at correction N is dropped as RESOLVED when the
// same check passes again at the 3rd correction after it (N+3). If N+3 is still
// out of range, or hasn't happened yet, the flag stands.
const SETTLE_AFTER = 3;

// Each check looks at reading i (and i-1 for step checks) and returns a flag or null.
const zClean = (arr, parr, step) => !Array.isArray(arr) || !Array.isArray(parr) || arr[2] == null || parr[2] == null || Math.abs(arr[2] - parr[2]) < step;
const step = (seq, i, key, lim) => i > 0 && seq[i][key] != null && seq[i - 1][key] != null && Math.abs(seq[i][key] - seq[i - 1][key]) >= lim;
const stepArr = (seq, i, key, k, lim) => i > 0 && Array.isArray(seq[i][key]) && Array.isArray(seq[i - 1][key])
  && typeof seq[i][key][k] === 'number' && typeof seq[i - 1][key][k] === 'number' && Math.abs(seq[i][key][k] - seq[i - 1][key][k]) >= lim;
const CHECKS = [
  ...[['X', 'gradX'], ['Y', 'gradY']].map(([ax, key]) => ({ id: 'gradStep' + ax, test: (seq, i) => step(seq, i, key, T.gradientStep),
    flag: { severity: 3, index: NAME.gradient, text: `${NAME.gradient} moved more than expected between readings (axis ${ax}) — this pattern typically points to collet wear. Recommended: replace the collet.` } })),
  ...[['Y', 'aGap'], ['X', 'bGap']].map(([ax, key]) => ({ id: 'gapStep' + ax, test: (seq, i) => step(seq, i, key, T.gapStep),
    flag: { severity: 3, index: NAME.gap, text: `${NAME.gap} jumped between readings (${ax}-axis) — this pattern typically points to ballscrew wear. Recommended: have the ${ax}-axis ballscrew inspected.` } })),
  ...[['Y', 'aGap'], ['X', 'bGap']].map(([ax, key]) => ({ id: 'gapOver' + ax, test: (seq, i) => seq[i][key] != null && seq[i][key] > T.gapHard,
    flag: { severity: 2, index: NAME.gap, text: `${NAME.gap} is outside its normal range (${ax}-axis) — recommended: inspect/re-align the ${ax}-axis.` } })),
  ...['X', 'Y', 'Z'].map((ax, k) => ({ id: 'origin' + ax, test: (seq, i) => stepArr(seq, i, 'origin', k, T.originStep),
    flag: { severity: 1, index: NAME.origin, text: `${NAME.origin} shifted more than expected on the ${ax} axis. Recommended: have that axis's positioning checked.` } })),
  { id: 'magZ', test: (seq, i) => stepArr(seq, i, 'magOffset', 2, T.magOffsetStep),
    flag: { severity: 1, index: NAME.magOffset, text: `${NAME.magOffset} shifted on the tool changer's Z reference — this pattern typically points to ballscrew wear. Recommended: have the ballscrew inspected.` } },
  ...['X', 'Y'].map((ax, k) => ({ id: 'mag' + ax, test: (seq, i) => stepArr(seq, i, 'magOffset', k, T.magOffsetStep),
    flag: { severity: 1, index: NAME.magOffset, text: `${NAME.magOffset} shifted on the tool changer's ${ax} reference. Recommended: have that alignment checked.` } })),
  { id: 'baseTool', test: (seq, i) => step(seq, i, 'baseTool', T.baseToolStep)
      && zClean(seq[i].origin, seq[i - 1].origin, T.originStep) && zClean(seq[i].magOffset, seq[i - 1].magOffset, T.magOffsetStep),
    flag: { severity: 1, index: NAME.baseTool, text: `${NAME.baseTool} moved more than expected between readings, with the other axis references holding steady — this pattern typically points to a bad tool-setter switch. Recommended: have the tool setter switch inspected.` } },
];

// sorted = this month's readings (oldest first); baseline = last reading before
// the month; after = the next few readings after the month (to see if flags settled).
function diagnoseFull(sorted, baseline, after = []) {
  if (!sorted.length) return { status: 'no-data', flags: [], resolved: 0 };
  const seq = [...(baseline ? [baseline] : []), ...sorted, ...after];
  const first = baseline ? 1 : 0, last = first + sorted.length - 1;
  const latest = sorted[sorted.length - 1];
  const flags = []; const seen = new Set(); let resolved = 0;

  // Gradient slightly over and steady → MINOR (a standing condition, not an event)
  const gradStepHit = new Set();
  for (const [axisLabel, key] of [['X', 'gradX'], ['Y', 'gradY']]) {
    const vals = sorted.map(r => r[key]).filter(v => v != null);
    const overCount = vals.filter(v => Math.abs(v) > T.gradientHard).length;
    const mostlyOver = vals.length && (overCount / vals.length >= 0.5 || Math.abs(latest[key] ?? 0) > T.gradientHard);
    const worst = vals.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
    if (!mostlyOver) continue;
    if (worst <= T.gradientMinorMax) flags.push({ severity: 0, minor: true, index: NAME.gradient, text: `${NAME.gradient} sat slightly outside its ideal range (axis ${axisLabel}) on ${overCount} of ${vals.length} readings this month. This isn't urgent and the machine is fine to keep running, but it can reduce fit accuracy and surface finish quality. Recommended: have the spindle alignment checked at your next service visit.` });
    else flags.push({ severity: 2, index: NAME.gradient, text: `${NAME.gradient} is outside its normal range (axis ${axisLabel}) — this pattern typically points to spindle misalignment. Recommended: have the spindle re-aligned.` });
  }

  // Event checks: flagged at reading i (inside this month); dropped if the same
  // check passes at reading i + SETTLE_AFTER.
  for (const c of CHECKS) {
    let open = null;
    for (let i = Math.max(first, 1); i <= last; i++) {
      if (!c.test(seq, i)) continue;
      const j = i + SETTLE_AFTER;
      if (j < seq.length && !c.test(seq, j)) { resolved++; continue; }
      open = i;
    }
    if (open != null && !seen.has(c.id)) {
      seen.add(c.id);
      const p = seq[open - 1], l = seq[open];
      const where = p?.cc != null && l?.cc != null ? ` Seen between correction #${p.cc} and #${l.cc}.` : '';
      flags.push({ ...c.flag, text: c.flag.text + where });
    }
  }

  if (!flags.length) return { status: 'clean', flags: [], resolved };
  flags.sort((a, b) => b.severity - a.severity);
  return { status: flags.some(f => !f.minor) ? 'flagged' : 'minor', flags, resolved };
}

const STATUS_STYLE = {
  flagged: { color: '#c0392b', bg: '#fdf1f1', bdr: '#f5c6c6', text: '#7f1d1d', chip: '⚠ Needs attention' },
  minor:   { color: '#b7791f', bg: '#fff8e6', bdr: '#f6deb0', text: '#7a4f0a', chip: '● Minor — worth noting' },
  clean:   { color: '#1e8e3e', chip: '✓ All normal' },
  'no-data': { color: '#888', chip: 'No data this month' },
};

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

function toPoint(r, diagByCC) {
  return {
    cc: r.correction_count, gradX: r.spindle_gradient_x, gradY: r.spindle_gradient_y,
    aGap: r.a_y_gap, bGap: r.b_x_gap, baseTool: r.base_tool_length,
    origin: diagByCC?.[r.correction_count]?.origin || null,
    magOffset: diagByCC?.[r.correction_count]?.magOffset || null,
  };
}

function buildMachineSection(serial, nickname, millRows, diagRows, monthLabel, baselineRow, afterRows = []) {
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

  const diag = diagnoseFull(sorted, baselineRow ? toPoint(baselineRow, diagByCC) : null, afterRows.map(r => toPoint(r, diagByCC)));
  const name = nickname ? `${nickname} (${serial})` : serial;
  const st = STATUS_STYLE[diag.status];
  const statusColor = st.color;
  const statusLabel = st.chip;

  const box = (items, sty, heading) => items.length ? `
      <div style="border:1px solid ${sty.bdr};background:${sty.bg};border-radius:6px;padding:10px 12px;margin-bottom:12px;">
        <div style="font-family:Arial,sans-serif;font-size:11px;font-weight:bold;letter-spacing:.4px;color:${sty.color};margin-bottom:6px;">${heading}</div>
        ${items.map((f, i) => `
          <div style="font-family:Arial,sans-serif;font-size:12.5px;color:${sty.text};${i > 0 ? `border-top:1px solid ${sty.bdr};margin-top:8px;padding-top:8px;` : ''}">
            ${items.length > 1 ? `<strong>${i + 1}.</strong> ` : ''}${f.text}
          </div>
        `).join('')}
      </div>` : '';

  let concernsHtml = '';
  if (diag.flags.length) {
    concernsHtml = box(diag.flags.filter(f => !f.minor), STATUS_STYLE.flagged, 'NEEDS ATTENTION')
      + box(diag.flags.filter(f => f.minor), STATUS_STYLE.minor, 'MINOR — NOT URGENT');
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

  return { status: diag.status, name, html: `
    <div style="margin-bottom:28px;padding:16px;border:1px solid #e2e2e2;border-left:4px solid ${statusColor};border-radius:8px;">
      <h3 style="margin:0 0 4px;font-family:Arial,sans-serif;">${name}</h3>
      <div style="font-family:Arial,sans-serif;font-size:13px;color:${statusColor};font-weight:bold;margin-bottom:10px;">${statusLabel}</div>
      ${concernsHtml}
      ${diag.resolved ? `<div style="font-family:Arial,sans-serif;font-size:11.5px;color:#666;margin:-4px 0 12px;">${diag.resolved === 1 ? 'One brief irregularity' : `${diag.resolved} brief irregularities`} this month settled by ${diag.resolved === 1 ? 'itself' : 'themselves'} within a few corrections — no action needed.</div>` : ''}
      ${charts}
      <div style="font-family:Arial,sans-serif;font-size:11px;color:#888;margin-top:10px;">${sorted.length} report${sorted.length === 1 ? '' : 's'} recorded this month${sorted.length === 1 ? ' — charts need at least 2 to draw a trend' : ''}.</div>
    </div>
  ` };
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
      `mill_reports?serial=eq.${encodeURIComponent(m.serial)}&created_at=gte.${start.toISOString()}&created_at=lt.${end.toISOString()}&select=correction_count,spindle_gradient_x,spindle_gradient_y,a_y_gap,b_x_gap,base_tool_length,created_at`
    );
    // last reading before this month — comparison point for the first report of the month
    const before = millRows.length ? await sb(
      `mill_reports?serial=eq.${encodeURIComponent(m.serial)}&created_at=lt.${start.toISOString()}&select=correction_count,spindle_gradient_x,spindle_gradient_y,a_y_gap,b_x_gap,base_tool_length&order=correction_count.desc&limit=1`
    ).catch(() => []) : [];
    // the next few readings after the month, to see whether a late-month flag settled
    const after = millRows.length ? await sb(
      `mill_reports?serial=eq.${encodeURIComponent(m.serial)}&created_at=gte.${end.toISOString()}&select=correction_count,spindle_gradient_x,spindle_gradient_y,a_y_gap,b_x_gap,base_tool_length&order=correction_count.asc&limit=${SETTLE_AFTER}`
    ).catch(() => []) : [];
    const ccList = [...millRows, ...before, ...after].map(r => r.correction_count).filter(v => v != null);
    const diagRows = ccList.length
      ? await sb(`diagnostic_reports?serial=eq.${encodeURIComponent(m.serial)}&correction_count=in.(${ccList.join(',')})&select=correction_count,raw_metrics`)
      : [];
    sections.push(buildMachineSection(m.serial, m.nickname, millRows, diagRows, label, before[0], after));
  }

  const summary = `
      <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:6px 0 22px;font-family:Arial,sans-serif;font-size:13px;">
        ${sections.map(sec => `
          <tr>
            <td style="padding:8px 10px;border-bottom:1px solid #eee;">${sec.name}</td>
            <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:right;font-weight:bold;color:${STATUS_STYLE[sec.status].color};white-space:nowrap;">${STATUS_STYLE[sec.status].chip}</td>
          </tr>`).join('')}
      </table>`;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <h2 style="font-family:Arial,sans-serif;">${customer.company} — ${label} Machine Status</h2>
      <p style="font-family:Arial,sans-serif;font-size:13px;color:#555;">Here's a summary of your machine${machineRows.length > 1 ? 's' : ''} for ${label}, generated from your MillPulse readings.</p>
      ${sections.length > 1 ? summary : ''}
      ${sections.map(sec => sec.html).join('')}
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
