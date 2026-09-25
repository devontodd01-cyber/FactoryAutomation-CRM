// api/_applog.js — VPanel applog.txt parser + summarizer (server-side).
//
// JS port of Devon's applog_parser.py: handles DWX-52D/52DCi (space
// separated) and DWX-53DC (tab separated) logs. Used by ingest-report.js
// when the sync agent sends the applog.txt sitting next to a
// systemreport.txt. Produces a compact summary (significant events +
// successful calibrations) that Fleet reads for its "between calibrations"
// warnings; the raw text is stored separately for the 🧾 App Log pane.
//
// Timestamps: always the PC-clock timestamp at the start of each line
// (the 53DC EVENTLOG's embedded machine-clock time can be an hour off).
// Stored as naive local strings "YYYY-MM-DD HH:MM:SS" — the same clock the
// systemreport "Date:" line uses, which is what we anchor calibration
// numbers to.

const TS_RE = /^(\d{4})\/(\d{2})\/(\d{2})[ \t](\d{2}:\d{2}:\d{2})[ \t]+(.*)$/;
const RESULT_RE = /\((\d+)[:=](SEQ_RESULT_\w+)\)/;

// ERROR group -> kind. 102A = spindle overcurrent, 102E = collision.
const ERROR_KINDS = {
  '102E': 'collision',
  '1006': 'axis_error',
  '101E': 'tool_break',
  '1022': 'tool_not_detected',
  '102A': 'spindle_overcurrent',
};
const SLOT_ERRORS = new Set(['1022', '101E']); // error suffix = slot number (hex)

const KIND_INFO = {
  collision:           { icon: '💥', label: 'Crash (mechanical collision)', alert: true },
  spindle_overcurrent: { icon: '⚡', label: 'Spindle overcurrent',          alert: true },
  axis_error:          { icon: '⚠',  label: 'Axis error',                   alert: true },
  tool_break:          { icon: '🔨', label: 'Tool break',                   alert: true },
  tool_not_detected:   { icon: '❔', label: 'Tool not detected',            alert: false },
  correction_failed:   { icon: '✖',  label: 'Calibration failed',           alert: false },
  spindle_replacement: { icon: '🔧', label: 'Spindle replacement',          alert: false },
  spindle_run_in:      { icon: '🔄', label: 'Spindle run-in',               alert: false },
};

const MAX_EVENTS = 500;
const MAX_CALIBRATIONS = 300;
const COLLAPSE_SECONDS = 10; // same kind within 10s = one event (EVENTLOG + ERROR echo)

const toSecs = (ts) => Date.parse(ts.replace(' ', 'T') + 'Z') / 1000;

// Parse one log text into { events, calibrations, format, lastTs }.
function parseApplog(text) {
  const lines = String(text || '').split(/\r?\n/);
  const raw = [];
  let tabCount = 0, lineCount = 0;
  let toolInSpindle = null;

  for (const line of lines) {
    const m = line.match(TS_RE);
    if (!m) continue;
    lineCount++;
    if (line.includes('\t')) tabCount++;
    const ts = `${m[1]}-${m[2]}-${m[3]} ${m[4]}`;
    let body = m[5];

    // EVENTLOG prefix: 53DC "EVENTLOG\tn\tDATE\tTIME\t..." / 52D "EVENTLOG <hex> ..."
    const em = body.match(/^EVENTLOG[ \t]+[0-9A-Fa-f]+[ \t]+(?:\d{4}\/\d{2}\/\d{2}[ \t]\d{2}:\d{2}:\d{2}[ \t]*)?(.*)$/);
    if (em) body = em[1].trim();
    const toks = body.split(/[ \t]+/);
    const head = toks[0];

    const take = body.match(/^(TAKE|RETURN) ?TOOL[ \t]+(\d+)[ \t]+(-?\d+)/);
    if (take) {
      if (take[1] === 'TAKE') toolInSpindle = parseInt(take[2], 10);
      else if (toolInSpindle === parseInt(take[2], 10)) toolInSpindle = null;
      continue;
    }

    if (body.includes('MECHANICAL COLLISION') || /^60[ \t]+UNKNOWN/.test(body)) {
      const tm = body.match(/Tool (\d+): (-?\d+)/);
      raw.push({ ts, kind: 'collision', code: '102E', tool: tm && tm[1] !== '0' ? parseInt(tm[1], 10) : toolInSpindle });
    } else if (head === 'ERROR' && toks[1]) {
      const code = toks[1];
      const [grp, sub] = code.split('-');
      const kind = ERROR_KINDS[grp];
      if (!kind) continue;
      const ev = { ts, kind, code };
      if (SLOT_ERRORS.has(grp) && sub) ev.tool = parseInt(sub, 16);
      else if (toolInSpindle != null) ev.tool = toolInSpindle;
      raw.push(ev);
    } else if (head === 'BEGIN' && toks[1] === 'MoveToSpindleReplacementPosition') {
      raw.push({ ts, kind: 'spindle_replacement' });
    } else if (head === 'END' && toks[1]) {
      const r = body.match(RESULT_RE);
      const ok = r ? r[2] === 'SEQ_RESULT_SUCCESS' : null;
      if (toks[1] === 'SpindleRunIn' && ok) raw.push({ ts, kind: 'spindle_run_in' });
      if (toks[1] === 'AutomaticCorrection') {
        if (ok) raw.push({ ts, kind: 'calibration' });
        // BUTTON_PRESSED = operator cancelled it -- not a machine fault, skip.
        else if (ok === false && !(r && r[2] === 'SEQ_RESULT_BUTTON_PRESSED')) raw.push({ ts, kind: 'correction_failed', code: r ? r[2] : null });
      }
    }
  }

  // Collapse echoes: same kind within COLLAPSE_SECONDS -> keep the first.
  const events = [], calibrations = [];
  const lastByKind = {};
  for (const e of raw) {
    if (e.kind === 'calibration') { calibrations.push({ ts: e.ts }); continue; }
    const t = toSecs(e.ts), prev = lastByKind[e.kind];
    lastByKind[e.kind] = t;
    if (prev != null && t - prev >= 0 && t - prev <= COLLAPSE_SECONDS) continue;
    events.push(e);
  }
  const lastTs = raw.length ? raw[raw.length - 1].ts : null;
  return { events, calibrations, format: lineCount && tabCount / lineCount > 0.5 ? '53DC' : '52D', lastTs };
}

const evKey = (e) => `${e.ts}|${e.kind}|${e.code || ''}`;

function mergeByKey(a, b, keyFn, max) {
  const map = new Map();
  for (const x of [...(a || []), ...(b || [])]) map.set(keyFn(x), { ...map.get(keyFn(x)), ...x });
  return [...map.values()].sort((x, y) => (x.ts < y.ts ? -1 : x.ts > y.ts ? 1 : 0)).slice(-max);
}

// Number successful calibrations using the systemreport sent alongside:
// the last calibration that finished at/before the report's Date is that
// report's CorrectionCount; earlier ones count down, later ones count up.
// (Field-checked on KFQ0275: corr 51, 53, 54, 57 all line up this way.)
function numberCalibrations(calibrations, anchor) {
  if (!anchor || anchor.cc == null || !anchor.date) return calibrations;
  const limit = anchor.date;
  let idx = -1;
  for (let i = 0; i < calibrations.length; i++) if (calibrations[i].ts <= limit) idx = i;
  if (idx === -1) return calibrations;
  return calibrations.map((c, i) => ({ ...c, cc: anchor.cc + (i - idx) }));
}

// Tag each event with the calibration it happened after (after_cc /
// after_ts). An event before the first known calibration gets nulls.
function tagWindows(events, calibrations) {
  return events.map((e) => {
    let last = null;
    for (const c of calibrations) { if (c.ts <= e.ts) last = c; else break; }
    return { ...e, after_cc: last && last.cc != null ? last.cc : null, after_ts: last ? last.ts : null };
  });
}

// Build the stored summary from a fresh parse + the previously stored
// summary (so history survives the log rolling over or being trimmed).
function buildSummary(text, previous, anchor) {
  const parsed = parseApplog(text);
  const prevEvents = (previous && previous.events) || [];
  const prevCals = (previous && previous.calibrations) || [];
  let calibrations = mergeByKey(prevCals.map(({ ts }) => ({ ts })), parsed.calibrations, (c) => c.ts, MAX_CALIBRATIONS);
  const useAnchor = anchor && anchor.cc != null ? anchor : (previous && previous.anchor) || null;
  calibrations = numberCalibrations(calibrations, useAnchor);
  const events = tagWindows(
    mergeByKey(prevEvents.map(({ ts, kind, code, tool }) => ({ ts, kind, code, tool })), parsed.events, evKey, MAX_EVENTS),
    calibrations
  );
  return {
    format: parsed.format,
    lastTs: parsed.lastTs || (previous && previous.lastTs) || null,
    anchor: useAnchor,
    calibrations,
    events,
  };
}

// "Date: 2026-05-12 14:26:29" (or 2026/05/12) from a systemreport chunk.
function reportDate(chunk) {
  const m = String(chunk || '').match(/^\s*Date:\s*(\d{4})[-/](\d{2})[-/](\d{2})[ T](\d{2}:\d{2}:\d{2})/m);
  return m ? `${m[1]}-${m[2]}-${m[3]} ${m[4]}` : null;
}

module.exports = { parseApplog, buildSummary, reportDate, KIND_INFO };
