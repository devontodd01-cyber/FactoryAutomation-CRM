// api/_fleetDiagnose.js
//
// Full server-side port of the shop's complete diagnostic rule engine — the
// SAME parser and the SAME checks Mill Diagnostics runs in the browser
// (App.js: parseVPanelReport / DIAGNOSTIC_CHECKS / diagnoseReport), so Fleet's
// card and the automatic-notify engine (api/check-and-notify.js) can flag
// EXACTLY what Mill Diagnostics would flag for the same two reports — no
// approximation, no reduced subset. This works by re-parsing each report's
// raw_text (stored in `diagnostic_reports.raw_text` on every sync, by
// api/ingest-report.js) instead of reading pre-reduced columns, which is
// what makes full parity possible even for the checks that need a report's
// full raw curve (angle offset) rather than a single stored scalar.
//
// Keep this in sync BY HAND with the matching sections of src/App.js
// (DWX_THRESHOLDS, MACHINE_PROFILES/getProfile, CHECK_INFO, every
// diagnose*() function, DIAGNOSTIC_CHECKS, annotateDiagnosticPriority,
// diagnoseReport, and the parser from extractSystemReportBlock through
// parseVPanelReport) if the shop's calibration technician ever changes a
// number, or a new report format shows up — there's no shared import
// between the CRA frontend and these serverless functions.
//
// Thresholds last updated 2026-09-23 per Devon (shop owner):
//   - A/B-axis gap BOUNCE tolerance: 100 -> 50 units (the STABLE/magnitude
//     tolerance for the same check stays 100 -- only the report-to-report
//     jump got tighter).
//   - Origin axis bounce: 100 -> 50 units.
//   - Magazine offset bounce: 100 -> 50 units.
//   - Base tool length bounce: 100 -> 50 units.
//   - NEW: Angle offset bounce (A-axis / B-axis independently) -- the
//     AngleOffset(Base) RANGE moving >=100 units between consecutive
//     reports signals that axis is wearing and not repeating. This is
//     separate from the existing single-report range/adjacent-diff check
//     (still 200 / 50, unchanged) -- that one asks "is this one report's
//     curve too spread out", this new one asks "did the spread change a
//     lot since last time."

// ── Profiles / thresholds ────────────────────────────────────────────────

const DWX_THRESHOLDS = {
  priorityOrder: [
    // Bounce checks first — these represent active wear and take priority
    // over the corresponding stable/magnitude check on the same metric.
    "spindle_gradient_x_drift",
    "spindle_gradient_y_drift",
    "a_axis_p1_p2_gap_drift",
    "b_axis_p1_p2_gap_drift",
    // Stable/magnitude checks.
    "spindle_gradient_x_collet_wear",
    "spindle_gradient_y_collet_wear",
    "a_axis_p1_p2_gap",
    "b_axis_p1_p2_gap",
    // Independent axis/positional checks.
    "origin_x_drift",
    "origin_y_drift",
    "origin_z_drift",
    "magazine_offset_drift",
    "base_tool_length_drift",
    // Angle-offset bounce (new) outranks the same-metric single-report
    // range check, same convention as gradient/gap above.
    "a_axis_angle_offset_drift",
    "b_axis_angle_offset_drift",
    "a_axis_angle_offset",
    "b_axis_angle_offset",
  ],
  aAxisP1P2YGapMax: 100,
  bAxisP1P2XGapMax: 100,
  spindleGradientXColletWearMax: 0.001,
  spindleGradientYColletWearMax: 0.001,
  // Rate-of-change ("bounce") triggers — a value can sit safely inside its
  // hard tolerance but still be moving unusually fast report-to-report,
  // which is itself the diagnostic signal. Threshold = max allowed
  // |value[n] − value[n-1]| between two consecutive saved reports for the
  // same machine.
  spindleGradientXStepMax: 0.0005,
  spindleGradientYStepMax: 0.0005,
  aAxisP1P2YGapStepMax: 50,
  bAxisP1P2XGapStepMax: 50,
  originAxisStepMax: 50,
  magazineOffsetStepMax: 50,
  baseToolLengthStepMax: 50,
  angleOffsetRangeMax: 200,
  angleOffsetAdjacentDiffMax: 50,
  angleOffsetRangeStepMax: 100,
};

const MACHINE_PROFILES = {
  "DWX-52DCi": { thresholds: DWX_THRESHOLDS, thresholdsValidated: true },
  "DWX-52D":   { thresholds: DWX_THRESHOLDS, thresholdsValidated: true },
  "DWX-53DC":  { thresholds: DWX_THRESHOLDS, thresholdsValidated: false },
  "DWX-51D":   { thresholds: DWX_THRESHOLDS, thresholdsValidated: false },
};
const DEFAULT_PROFILE = { thresholds: DWX_THRESHOLDS, thresholdsValidated: false };
function getProfile(model) { return MACHINE_PROFILES[model] || DEFAULT_PROFILE; }

// ── Parser — ported 1:1 from App.js (extractSystemReportBlock through
// parseVPanelReport, including the newer "# << SystemReport >>" DMS format) ──

function extractSystemReportBlock(rawText) {
  const startTok = "<< SYSTEM REPORT >>";
  const s = rawText.indexOf(startTok);
  if (s === -1) throw new Error('No "<< SYSTEM REPORT >>" marker found in this text.');
  const afterStart = s + startTok.length;
  const endTok = "<< END >>";
  const e = rawText.indexOf(endTok, afterStart);
  return rawText.slice(afterStart, e === -1 ? undefined : e);
}

function splitReports(rawText) {
  const legacyTok = "<< SYSTEM REPORT >>";
  const newTok = "# << SystemReport >>";
  const startTok = rawText.indexOf(legacyTok) !== -1 ? legacyTok : newTok;
  const indices = [];
  let idx = rawText.indexOf(startTok);
  while (idx !== -1) {
    indices.push(idx);
    idx = rawText.indexOf(startTok, idx + startTok.length);
  }
  if (indices.length <= 1) return [rawText];
  const chunks = [];
  for (let i = 0; i < indices.length; i++) {
    const start = indices[i];
    const stop = i + 1 < indices.length ? indices[i + 1] : rawText.length;
    chunks.push(rawText.slice(start, stop));
  }
  return chunks;
}

function parseFieldValue(raw) {
  const v = raw.trim();
  if (v === "") return "";
  if (v.includes(",")) {
    const parts = v.split(",").map((p) => p.trim());
    if (parts.every((p) => /^-?\d+(\.\d+)?$/.test(p))) return parts.map((p) => parseFloat(p));
    return v;
  }
  if (/^-?\d+(\.\d+)?$/.test(v)) return parseFloat(v);
  return v;
}

function parseReportBody(body) {
  const lines = body.split("\n").map((l) => l.replace(/\r$/, "")).filter((l) => l.trim() !== "");
  const root = {};
  const stack = [{ indent: -1, obj: root, lastKey: null }];
  for (const line of lines) {
    const indent = line.length - line.trimStart().length;
    const trimmed = line.trim();
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
    const parent = stack[stack.length - 1];
    const colonIdx = trimmed.indexOf(":");
    const key = colonIdx === -1 ? trimmed : trimmed.slice(0, colonIdx).trim();
    const valuePart = colonIdx === -1 ? "" : trimmed.slice(colonIdx + 1).trim();
    if (key === "" && colonIdx !== -1) {
      const lastKey = parent.lastKey;
      if (lastKey != null) {
        const existing = parent.obj[lastKey];
        const entry = parseFieldValue(valuePart);
        if (Array.isArray(existing) && existing._isLogList) {
          existing.push(entry);
        } else {
          const list = [existing, entry];
          list._isLogList = true;
          parent.obj[lastKey] = list;
        }
      }
      continue;
    }
    if (colonIdx === -1 || valuePart === "") {
      const child = {};
      parent.obj[key] = child;
      parent.lastKey = key;
      stack.push({ indent, obj: child, lastKey: null });
    } else {
      parent.obj[key] = parseFieldValue(valuePart);
      parent.lastKey = key;
    }
  }
  return root;
}

const NEW_FMT_MARKER = "# << SystemReport >>";
function isNewFormat(text) { return text.indexOf(NEW_FMT_MARKER) !== -1; }

function parseInlineObjNF(s) {
  const out = {};
  const inner = s.trim().replace(/^\{/, "").replace(/\}$/, "");
  for (const part of inner.split(",")) {
    const [k, v] = part.split(":").map((x) => (x == null ? x : x.trim()));
    if (!k) continue;
    const n = parseFloat(v);
    out[k] = Number.isNaN(n) ? v : n;
  }
  return out;
}
function parseInlineArrNF(s) {
  const inner = s.trim().replace(/^\[/, "").replace(/\]$/, "");
  if (!inner.trim()) return [];
  return inner.split(",").map((x) => { const n = parseFloat(x.trim()); return Number.isNaN(n) ? x.trim() : n; });
}

function parseNewFormatTree(rawText) {
  const mi = rawText.indexOf(NEW_FMT_MARKER);
  const body = mi === -1 ? rawText : rawText.slice(mi + NEW_FMT_MARKER.length);
  const lines = body.split("\n").map((l) => l.replace(/\r$/, "")).filter((l) => l.trim() !== "");
  const root = {};
  const stack = [{ indent: -1, obj: root }];
  for (const line of lines) {
    const indent = line.length - line.trimStart().length;
    const trimmed = line.trim();
    const ci = trimmed.indexOf(":");
    if (ci === -1) continue;
    const key = trimmed.slice(0, ci).trim();
    const val = trimmed.slice(ci + 1).trim();
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
    const parent = stack[stack.length - 1].obj;
    if (val === "") {
      const child = {};
      parent[key] = child;
      stack.push({ indent, obj: child });
    } else if (val.startsWith("{")) {
      parent[key] = parseInlineObjNF(val);
    } else if (val.startsWith("[")) {
      parent[key] = parseInlineArrNF(val);
    } else {
      const n = parseFloat(val);
      const looksNumeric = !Number.isNaN(n) && /^-?[\d.]+$/.test(val);
      parent[key] = looksNumeric ? n : val;
    }
  }
  return root;
}

function normalizeNewToLegacy(tree) {
  const rac = tree.RotaryAxisCorrection || {};
  const sections = {};
  sections.MODEL = typeof tree.Model === "string" && tree.Model ? tree.Model : null;
  sections["SERIAL NUMBER"] = typeof tree.SerialNumber === "string" && tree.SerialNumber ? tree.SerialNumber : null;
  const legacyRac = {};
  legacyRac["CORRECTION COUNT"] = typeof rac.CorrectionCount === "number" ? rac.CorrectionCount : null;
  legacyRac["BASE TOOL LENGTH"] = typeof rac.BaseToolLength === "number" ? rac.BaseToolLength : null;
  if (rac.SpindleGradient) legacyRac["SPINDLE GRADIENT"] = { X: rac.SpindleGradient.x, Y: rac.SpindleGradient.y };
  const conv = (ax) => {
    if (!ax) return null;
    const out = {};
    if (ax.P1) out.P1 = [ax.P1.x, ax.P1.y, ax.P1.z];
    if (ax.P2) out.P2 = [ax.P2.x, ax.P2.y, ax.P2.z];
    if (ax["AngleOffset(Base)"]) out["ANGLE OFFSET (BASE)"] = ax["AngleOffset(Base)"];
    return out;
  };
  if (rac["A-AXIS"]) legacyRac["A-AXIS"] = conv(rac["A-AXIS"]);
  if (rac["B-AXIS"]) legacyRac["B-AXIS"] = conv(rac["B-AXIS"]);
  if (rac.CorrectionBasePoint) {
    legacyRac["CORRECTION BASE POINT"] = [rac.CorrectionBasePoint.x, rac.CorrectionBasePoint.y, rac.CorrectionBasePoint.z];
  }
  sections["ROTARY AXIS CORRECTION"] = legacyRac;
  // The new format exposes the same touch-off/magazine calibration point as
  // AutomaticToolChanger.ToolSensorPositionOffset instead of a top-level
  // "MAGAZINE POSITION OFFSET" field -- confirmed it's the same physical
  // value by comparing captured reports (it matches RotaryAxisCorrection's
  // RotaryUnitOffset exactly in every sample seen). Map it across so
  // magazine_offset_drift (and the Z-clean gate on base_tool_length_drift)
  // work on DMS-format machines too, instead of silently no-op'ing.
  const atcSrc = tree.AutomaticToolChanger || {};
  const tsOffset = atcSrc.ToolSensorPositionOffset;
  sections["AUTOMATIC TOOL CHANGER"] = tsOffset
    ? { "MAGAZINE POSITION OFFSET": [tsOffset.x, tsOffset.y, tsOffset.z] }
    : {};
  return sections;
}

function parseVPanelReportNew(rawText) {
  const text = (rawText || "").trim();
  if (!text) throw new Error("Empty report text");
  const tree = parseNewFormatTree(text);
  const sections = normalizeNewToLegacy(tree);
  const model = sections.MODEL || null;
  const serial = sections["SERIAL NUMBER"] || null;
  const profile = getProfile(model);
  const rac = sections["ROTARY AXIS CORRECTION"] || {};
  const atc = sections["AUTOMATIC TOOL CHANGER"] || {};
  return {
    model, serial, profile, sections, rac, atc,
    correctionCount: typeof rac["CORRECTION COUNT"] === "number" ? rac["CORRECTION COUNT"] : null,
    archiveKey: `${model || "UNKNOWN_MODEL"}_${serial || "UNKNOWN_SERIAL"}`,
  };
}

function parseVPanelReport(rawText) {
  const text = (rawText || "").trim();
  if (!text) throw new Error("Empty report text");
  if (isNewFormat(text) && text.indexOf("<< SYSTEM REPORT >>") === -1) {
    return parseVPanelReportNew(text);
  }
  const block = extractSystemReportBlock(text);
  const sections = parseReportBody(block);
  const model = sections.MODEL || null;
  const serial = sections["SERIAL NUMBER"] || null;
  const profile = getProfile(model);
  const rac = sections["ROTARY AXIS CORRECTION"] || {};
  const atc = sections["AUTOMATIC TOOL CHANGER"] || {};
  return {
    model, serial, profile, sections, rac, atc,
    correctionCount: typeof rac["CORRECTION COUNT"] === "number" ? rac["CORRECTION COUNT"] : null,
    archiveKey: `${model || "UNKNOWN_MODEL"}_${serial || "UNKNOWN_SERIAL"}`,
  };
}

function num(v) { return typeof v === "number" && !Number.isNaN(v) ? v : null; }
function triplet(v) { return Array.isArray(v) && v.length >= 3 ? [num(v[0]), num(v[1]), num(v[2])] : [null, null, null]; }

function yGap(pointObj) {
  const p1 = pointObj.P1, p2 = pointObj.P2;
  if (!Array.isArray(p1) || !Array.isArray(p2) || p1.length < 2 || p2.length < 2) return null;
  return Math.abs(p2[1] - p1[1]);
}
function xGap(pointObj) {
  const p1 = pointObj.P1, p2 = pointObj.P2;
  if (!Array.isArray(p1) || !Array.isArray(p2) || p1.length < 1 || p2.length < 1) return null;
  return Math.abs(p2[0] - p1[0]);
}

function extractOrigin(sections, rac) {
  const candidates = [
    rac && rac["CORRECTION BASE POINT"],
    rac && rac["BASE POINT"],
    rac && rac["ORIGIN"],
    sections && sections["CORRECTION BASE POINT"],
    sections && sections["BASE POINT"],
    sections && sections["ORIGIN"],
    sections && sections["WORK ORIGIN"],
  ];
  for (const c of candidates) {
    if (Array.isArray(c)) return triplet(c);
    if (c && typeof c === "object" && ("X" in c || "Y" in c || "Z" in c)) {
      return [num(c.X), num(c.Y), num(c.Z)];
    }
  }
  return [null, null, null];
}

// Shared curve-trim helper for the two angle-offset checks below (index 0
// is a fixed baseline, not a real measured point, on both formats).
function trimmedAngleCurve(r, axisKey) {
  const ax = r.rac[axisKey];
  const rawCurve = ax && ax["ANGLE OFFSET (BASE)"];
  if (!Array.isArray(rawCurve) || rawCurve.length < 2) return null;
  const trimmed = rawCurve.slice(1).filter((v) => typeof v === "number" && !Number.isNaN(v));
  return trimmed.length >= 2 ? trimmed : null;
}

// ── Rule 1 / 2 — Spindle Gradient (X and Y, each independently) ────────────

function diagnoseGradientHard(r, axis) {
  const grad = r.rac["SPINDLE GRADIENT"];
  if (!grad || typeof grad[axis] !== "number") return null;
  const v = grad[axis];
  const threshold = axis === "X" ? r.profile.thresholds.spindleGradientXColletWearMax : r.profile.thresholds.spindleGradientYColletWearMax;
  return { check: `spindle_gradient_${axis.toLowerCase()}_collet_wear`, axis, currentValue: v, threshold, flagged: Math.abs(v) > threshold, thresholdsValidatedForModel: r.profile.thresholdsValidated };
}
function diagnoseSpindleGradientXHard(r) { return diagnoseGradientHard(r, "X"); }
function diagnoseSpindleGradientYHard(r) { return diagnoseGradientHard(r, "Y"); }

function diagnoseGradientDrift(r, axis, previousValue) {
  const grad = r.rac["SPINDLE GRADIENT"];
  if (!grad || typeof grad[axis] !== "number") return null;
  const v = grad[axis];
  const threshold = axis === "X" ? r.profile.thresholds.spindleGradientXStepMax : r.profile.thresholds.spindleGradientYStepMax;
  const result = { check: `spindle_gradient_${axis.toLowerCase()}_drift`, axis, currentValue: v, previousValue: previousValue ?? null, delta: null, threshold, flagged: false, thresholdsValidatedForModel: r.profile.thresholdsValidated };
  if (previousValue != null) {
    result.delta = v - previousValue;
    result.flagged = Math.abs(result.delta) >= threshold;
  }
  return result;
}
function diagnoseSpindleGradientXDrift(r, previousGradientX) { return diagnoseGradientDrift(r, "X", previousGradientX); }
function diagnoseSpindleGradientYDrift(r, previousGradientY) { return diagnoseGradientDrift(r, "Y", previousGradientY); }

// ── Rule 4 — A/B-axis P1/P2 gap (A = Y-gap, B = X-gap) ──────────────────────

function diagnoseAxisGap(r, axisKey, gapFn, checkKey, thresholdKey) {
  const ax = r.rac[axisKey];
  if (!ax) return null;
  const gap = gapFn(ax);
  if (gap == null) return null;
  const threshold = r.profile.thresholds[thresholdKey];
  return { check: checkKey, gap, threshold, flagged: gap > threshold, thresholdsValidatedForModel: r.profile.thresholdsValidated };
}
function diagnoseAAxisGap(r) { return diagnoseAxisGap(r, "A-AXIS", yGap, "a_axis_p1_p2_gap", "aAxisP1P2YGapMax"); }
function diagnoseBAxisGap(r) { return diagnoseAxisGap(r, "B-AXIS", xGap, "b_axis_p1_p2_gap", "bAxisP1P2XGapMax"); }

function diagnoseAxisGapDrift(r, axisKey, gapFn, previousGap, checkKey, thresholdKey) {
  const ax = r.rac[axisKey];
  if (!ax) return null;
  const gap = gapFn(ax);
  if (gap == null) return null;
  const threshold = r.profile.thresholds[thresholdKey];
  const result = { check: checkKey, gap, previousGap: previousGap ?? null, delta: null, threshold, flagged: false, thresholdsValidatedForModel: r.profile.thresholdsValidated };
  if (previousGap != null) {
    result.delta = gap - previousGap;
    result.flagged = Math.abs(result.delta) >= threshold;
  }
  return result;
}
function diagnoseAAxisGapDrift(r, previousAGap) { return diagnoseAxisGapDrift(r, "A-AXIS", yGap, previousAGap, "a_axis_p1_p2_gap_drift", "aAxisP1P2YGapStepMax"); }
function diagnoseBAxisGapDrift(r, previousBGap) { return diagnoseAxisGapDrift(r, "B-AXIS", xGap, previousBGap, "b_axis_p1_p2_gap_drift", "bAxisP1P2XGapStepMax"); }

// ── Rule 3 — Origin drift, per axis (X / Y / Z independently) ──────────────

function diagnoseOriginAxisDrift(r, previousOrigin, idx, axisLabel, checkKey) {
  const origin = extractOrigin(r.sections || {}, r.rac);
  const v = origin[idx];
  if (v == null) return null;
  const threshold = r.profile.thresholds.originAxisStepMax;
  const prevV = Array.isArray(previousOrigin) ? previousOrigin[idx] : null;
  const result = { check: checkKey, axis: axisLabel, currentValue: v, previousValue: prevV ?? null, delta: null, threshold, flagged: false, thresholdsValidatedForModel: r.profile.thresholdsValidated };
  if (prevV != null) {
    result.delta = v - prevV;
    result.flagged = Math.abs(result.delta) >= threshold;
  }
  return result;
}
function diagnoseOriginXDrift(r, previousOrigin) { return diagnoseOriginAxisDrift(r, previousOrigin, 0, "X", "origin_x_drift"); }
function diagnoseOriginYDrift(r, previousOrigin) { return diagnoseOriginAxisDrift(r, previousOrigin, 1, "Y", "origin_y_drift"); }
function diagnoseOriginZDrift(r, previousOrigin) { return diagnoseOriginAxisDrift(r, previousOrigin, 2, "Z", "origin_z_drift"); }

// ── Rule 5 — Magazine offset bounce, dual-cause ─────────────────────────────

function diagnoseMagazineOffsetDrift(r, previousMagazineOffset) {
  const current = r.atc["MAGAZINE POSITION OFFSET"];
  if (!Array.isArray(current)) return null;
  const threshold = r.profile.thresholds.magazineOffsetStepMax;
  const axisNames = ["X", "Y", "Z"];
  const result = {
    check: "magazine_offset_drift", currentMagazineOffset: current,
    previousMagazineOffset: previousMagazineOffset ?? null,
    delta: null, flaggedAxes: [], threshold, flagged: false,
    thresholdsValidatedForModel: r.profile.thresholdsValidated,
  };
  if (!Array.isArray(previousMagazineOffset)) return result;
  const delta = {};
  current.forEach((v, i) => { delta[axisNames[i] || i] = v - (previousMagazineOffset[i] ?? v); });
  result.delta = delta;
  result.flaggedAxes = Object.entries(delta).filter(([, d]) => Math.abs(d) >= threshold).map(([axis]) => axis);
  result.flagged = result.flaggedAxes.length > 0;
  return result;
}

// ── Rule 6 — Base tool length bounce → bad tool setter switch ──────────────

function diagnoseBaseToolLengthDrift(r, previousBaseToolLength, previousOrigin, previousMagazineOffset) {
  const current = r.rac["BASE TOOL LENGTH"];
  if (typeof current !== "number") return null;
  const threshold = r.profile.thresholds.baseToolLengthStepMax;
  const result = {
    check: "base_tool_length_drift", currentValue: current,
    previousValue: previousBaseToolLength ?? null, delta: null,
    threshold, flagged: false, bounceObservedButZDirty: false,
    thresholdsValidatedForModel: r.profile.thresholdsValidated,
  };
  if (previousBaseToolLength == null) return result;
  result.delta = current - previousBaseToolLength;
  const bounced = Math.abs(result.delta) >= threshold;
  if (!bounced) return result;

  const origin = extractOrigin(r.sections || {}, r.rac);
  const originZ = origin[2];
  const originZPrev = Array.isArray(previousOrigin) ? previousOrigin[2] : null;
  const originZClean = originZ == null || originZPrev == null || Math.abs(originZ - originZPrev) < r.profile.thresholds.originAxisStepMax;

  const mag = r.atc["MAGAZINE POSITION OFFSET"];
  const magZ = Array.isArray(mag) ? mag[2] : null;
  const magZPrev = Array.isArray(previousMagazineOffset) ? previousMagazineOffset[2] : null;
  const magZClean = magZ == null || magZPrev == null || Math.abs(magZ - magZPrev) < r.profile.thresholds.magazineOffsetStepMax;

  if (originZClean && magZClean) {
    result.flagged = true;
  } else {
    result.bounceObservedButZDirty = true;
  }
  return result;
}

// ── Rule 7 — Angle offset, A and B independently ────────────────────────────
// Single-report check (unchanged): range of the curve (index 0 excluded) >
// 200 units, OR any two adjacent values differing by > 50 units.

function diagnoseAxisAngleOffset(r, axisKey, axisLabel, checkKey) {
  const trimmed = trimmedAngleCurve(r, axisKey);
  if (!trimmed) return null;
  const ax = r.rac[axisKey];
  const rawCurve = ax["ANGLE OFFSET (BASE)"];
  const range = Math.max(...trimmed) - Math.min(...trimmed);
  let maxAdjacentDiff = 0;
  for (let i = 1; i < trimmed.length; i++) maxAdjacentDiff = Math.max(maxAdjacentDiff, Math.abs(trimmed[i] - trimmed[i - 1]));
  const rangeThreshold = r.profile.thresholds.angleOffsetRangeMax;
  const adjacentThreshold = r.profile.thresholds.angleOffsetAdjacentDiffMax;
  return {
    check: checkKey, axis: axisLabel, curve: rawCurve, trimmedCurve: trimmed,
    range, rangeThreshold, maxAdjacentDiff, adjacentThreshold,
    flagged: range > rangeThreshold || maxAdjacentDiff > adjacentThreshold,
    thresholdsValidatedForModel: r.profile.thresholdsValidated,
  };
}
function diagnoseAAxisAngleOffset(r) { return diagnoseAxisAngleOffset(r, "A-AXIS", "A", "a_axis_angle_offset"); }
function diagnoseBAxisAngleOffset(r) { return diagnoseAxisAngleOffset(r, "B-AXIS", "B", "b_axis_angle_offset"); }

// NEW (Devon, 2026-09-23) — report-to-report bounce on the angle-offset
// RANGE itself: if the curve's range moved >=100 units since the previous
// report, that axis is wearing and not repeating position-to-position.
// Only needs the two reports' reduced range values (computed from each
// one's own curve), not a cross-report curve comparison point-by-point.
function diagnoseAxisAngleOffsetDrift(r, axisKey, axisLabel, checkKey, previousRange) {
  const trimmed = trimmedAngleCurve(r, axisKey);
  if (!trimmed) return null;
  const range = Math.max(...trimmed) - Math.min(...trimmed);
  const threshold = r.profile.thresholds.angleOffsetRangeStepMax;
  const result = { check: checkKey, axis: axisLabel, currentRange: range, previousRange: previousRange ?? null, delta: null, threshold, flagged: false, thresholdsValidatedForModel: r.profile.thresholdsValidated };
  if (previousRange != null) {
    result.delta = range - previousRange;
    result.flagged = Math.abs(result.delta) >= threshold;
  }
  return result;
}
function diagnoseAAxisAngleOffsetDrift(r, previousRange) { return diagnoseAxisAngleOffsetDrift(r, "A-AXIS", "A", "a_axis_angle_offset_drift", previousRange); }
function diagnoseBAxisAngleOffsetDrift(r, previousRange) { return diagnoseAxisAngleOffsetDrift(r, "B-AXIS", "B", "b_axis_angle_offset_drift", previousRange); }

// Reads the current report's own angle-offset range for a given axis, for
// prev-state tracking between reports (mirrors how aGap/bGap/origin/etc.
// are re-derived from the current report each loop iteration below).
function currentAngleOffsetRange(r, axisKey) {
  const trimmed = trimmedAngleCurve(r, axisKey);
  return trimmed ? Math.max(...trimmed) - Math.min(...trimmed) : null;
}

const CHECK_INFO = {
  spindle_gradient_x_collet_wear: { label: "Spindle Misalignment X Axis", cause: "Magnitude over ±0.001. If stable report-to-report (see the accompanying rapid-change flag) this points to spindle misalignment.", action: "Re-align the spindle. If it's also bouncing, replace the collet first — see the rapid-change flag." },
  spindle_gradient_y_collet_wear: { label: "Spindle Misalignment Y Axis", cause: "Magnitude over ±0.001. If stable report-to-report (see the accompanying rapid-change flag) this points to spindle misalignment.", action: "Re-align the spindle. If it's also bouncing, replace the collet first — see the rapid-change flag." },
  spindle_gradient_x_drift: { label: "Replace Collet", cause: "Moved ≥0.0005 since the previous report — regardless of whether it's inside or outside the ±0.001 tolerance. This is the signature of collet wear, not progressive misalignment.", action: "Replace the collet." },
  spindle_gradient_y_drift: { label: "Replace Collet", cause: "Moved ≥0.0005 since the previous report — regardless of whether it's inside or outside the ±0.001 tolerance. This is the signature of collet wear, not progressive misalignment.", action: "Replace the collet." },
  a_axis_p1_p2_gap: { label: "Y Axis Misalignment", cause: "Stable and over 100 units — Y-axis alignment issue.", action: "Inspect/re-align the Y-axis." },
  b_axis_p1_p2_gap: { label: "X Axis Misalignment", cause: "Stable and over 100 units — X-axis alignment issue.", action: "Inspect/re-align the X-axis." },
  a_axis_p1_p2_gap_drift: { label: "Y Axis Ballscrew", cause: "Bouncing ≥50 units between reports — Y-axis ballscrew wear (not repeating), not alignment.", action: "Inspect the Y-axis ballscrew for wear/backlash." },
  b_axis_p1_p2_gap_drift: { label: "X Axis Ballscrew", cause: "Bouncing ≥50 units between reports — X-axis ballscrew wear (not repeating), not alignment.", action: "Inspect the X-axis ballscrew for wear/backlash." },
  origin_x_drift: { label: "X Axis Ballscrew", cause: "Origin X moved ≥50 units since the previous report.", action: "Inspect the X-axis ballscrew for wear/backlash." },
  origin_y_drift: { label: "Y Axis Ballscrew", cause: "Origin Y moved ≥50 units since the previous report.", action: "Inspect the Y-axis ballscrew for wear/backlash." },
  origin_z_drift: { label: "Z Axis Ballscrew", cause: "Origin Z moved ≥50 units since the previous report.", action: "Inspect the Z-axis ballscrew for wear/backlash." },
  magazine_offset_drift: { label: "Magazine Offset", cause: "Magazine offset bouncing ≥50 units between reports. X or Y axis bouncing points to that axis being misaligned; Z axis bouncing points to a ballscrew fault.", action: "If X or Y is flagged, inspect/re-align that axis. If Z is flagged, inspect the ballscrew for wear/backlash." },
  base_tool_length_drift: { label: "Tool Sensor", cause: "Bouncing ≥50 units between reports while the Z origin and magazine Z-axis value both stay clean — isolates the fault to the tool setter switch itself.", action: "Inspect/replace the tool setter switch." },
  a_axis_angle_offset: { label: "Bad A Axis", cause: "AngleOffset(Base) curve (excluding the fixed index-0 baseline) has a range over 200 units or an adjacent-value jump over 50 units — bad A-axis.", action: "Inspect the A-axis." },
  b_axis_angle_offset: { label: "Bad B Axis", cause: "AngleOffset(Base) curve (excluding the fixed index-0 baseline) has a range over 200 units or an adjacent-value jump over 50 units — bad B-axis.", action: "Inspect the B-axis." },
  a_axis_angle_offset_drift: { label: "A Axis Wear (Not Repeating)", cause: "AngleOffset(Base) range moved ≥100 units since the previous report — the A-axis is wearing and not repeating position-to-position.", action: "Inspect the A-axis for wear." },
  b_axis_angle_offset_drift: { label: "B Axis Wear (Not Repeating)", cause: "AngleOffset(Base) range moved ≥100 units since the previous report — the B-axis is wearing and not repeating position-to-position.", action: "Inspect the B-axis for wear." },
};

const DIAGNOSTIC_CHECKS = {
  spindle_gradient_x_drift: (r, prev) => diagnoseSpindleGradientXDrift(r, prev.gradientX),
  spindle_gradient_y_drift: (r, prev) => diagnoseSpindleGradientYDrift(r, prev.gradientY),
  a_axis_p1_p2_gap_drift: (r, prev) => diagnoseAAxisGapDrift(r, prev.aGap),
  b_axis_p1_p2_gap_drift: (r, prev) => diagnoseBAxisGapDrift(r, prev.bGap),
  spindle_gradient_x_collet_wear: (r) => diagnoseSpindleGradientXHard(r),
  spindle_gradient_y_collet_wear: (r) => diagnoseSpindleGradientYHard(r),
  a_axis_p1_p2_gap: (r) => diagnoseAAxisGap(r),
  b_axis_p1_p2_gap: (r) => diagnoseBAxisGap(r),
  origin_x_drift: (r, prev) => diagnoseOriginXDrift(r, prev.origin),
  origin_y_drift: (r, prev) => diagnoseOriginYDrift(r, prev.origin),
  origin_z_drift: (r, prev) => diagnoseOriginZDrift(r, prev.origin),
  magazine_offset_drift: (r, prev) => diagnoseMagazineOffsetDrift(r, prev.magazineOffset),
  base_tool_length_drift: (r, prev) => diagnoseBaseToolLengthDrift(r, prev.baseToolLength, prev.origin, prev.magazineOffset),
  a_axis_angle_offset: (r) => diagnoseAAxisAngleOffset(r),
  b_axis_angle_offset: (r) => diagnoseBAxisAngleOffset(r),
  a_axis_angle_offset_drift: (r, prev) => diagnoseAAxisAngleOffsetDrift(r, prev.aAngleOffsetRange),
  b_axis_angle_offset_drift: (r, prev) => diagnoseBAxisAngleOffsetDrift(r, prev.bAngleOffsetRange),
};

function annotateDiagnosticPriority(results) {
  const byKey = {};
  for (const r of results) byKey[r.check] = r;
  const pair = (hardKey, driftKey, hardCause, driftCause) => {
    const hard = byKey[hardKey], drift = byKey[driftKey];
    if (hard && hard.flagged && drift && drift.flagged) {
      hard.priorityNote = `Also bouncing report-to-report — treat as ${driftCause}, not ${hardCause}. See the accompanying rapid-change flag.`;
    }
  };
  pair("spindle_gradient_x_collet_wear", "spindle_gradient_x_drift", "spindle misalignment", "collet wear");
  pair("spindle_gradient_y_collet_wear", "spindle_gradient_y_drift", "spindle misalignment", "collet wear");
  pair("a_axis_p1_p2_gap", "a_axis_p1_p2_gap_drift", "a Y-axis alignment issue", "Y-axis ballscrew wear");
  pair("b_axis_p1_p2_gap", "b_axis_p1_p2_gap_drift", "an X-axis alignment issue", "X-axis ballscrew wear");
  pair("a_axis_angle_offset", "a_axis_angle_offset_drift", "a bad A-axis (curve spread)", "the A-axis wearing and not repeating");
  pair("b_axis_angle_offset", "b_axis_angle_offset_drift", "a bad B-axis (curve spread)", "the B-axis wearing and not repeating");

  const gradientFlagged = ["spindle_gradient_x_collet_wear", "spindle_gradient_y_collet_wear", "spindle_gradient_x_drift", "spindle_gradient_y_drift"]
    .some(k => byKey[k] && byKey[k].flagged);
  const gapDriftFlags = ["a_axis_p1_p2_gap_drift", "b_axis_p1_p2_gap_drift"].map(k => byKey[k]).filter(g => g && g.flagged);
  if (gradientFlagged && gapDriftFlags.length) {
    for (const g of gapDriftFlags) g.priorityOverGradient = true;
    for (const k of ["spindle_gradient_x_collet_wear", "spindle_gradient_y_collet_wear", "spindle_gradient_x_drift", "spindle_gradient_y_drift"]) {
      const g = byKey[k];
      if (g && g.flagged) g.priorityNote = "The A/B-axis gap is also bouncing — address the ballscrew wear FIRST, then re-check this gradient reading (gradient is computed downstream of the A/B calibration points).";
    }
  }
  return results;
}

function diagnoseReport(r, prev = {}) {
  const order = r.profile.thresholds.priorityOrder;
  const results = [];
  for (const name of order) {
    const fn = DIAGNOSTIC_CHECKS[name];
    if (!fn) continue;
    const out = fn(r, prev);
    if (out) results.push(out);
  }
  return annotateDiagnosticPriority(results);
}

// Highest-priority ACTIONABLE (flagged) check in a diagnoseReport() result
// array, in the same priority order used everywhere else — so a
// notification, a Fleet badge, or Mill Diagnostics' own summary can never
// pick a different "the" issue for the same reading.
function topFlagged(diagResults, model) {
  if (!Array.isArray(diagResults) || !diagResults.length) return null;
  const order = getProfile(model).thresholds.priorityOrder;
  for (const key of order) {
    const hit = diagResults.find((d) => d.check === key && d.flagged);
    if (hit) {
      const info = CHECK_INFO[key] || {};
      return { check: key, label: info.label || key, action: hit.priorityNote || info.action || '', cause: info.cause || '' };
    }
  }
  return null;
}

// Runs the full engine across a serial's report HISTORY (ascending by
// correction_count), re-parsing each row's raw_text and tracking prev-state
// exactly like Mill Diagnostics' own runDiagnosis() loop does -- so a bounce
// check comparing report N to report N-1 sees the SAME "previous report" a
// human pasting both into Mill Diagnostics would. `rows` is
// [{ raw_text, correction_count }], any extra fields ignored. Returns one
// entry per row (skipping rows whose raw_text fails to parse), in the same
// ascending order:
//   [{ correctionCount, model, diagnostics: [...] }, ...]
function diagnoseHistory(rows) {
  const out = [];
  let prevGradientX = null, prevGradientY = null, prevMagOffset = null, prevBaseToolLength = null,
    prevAGap = null, prevBGap = null, prevOrigin = null, prevAAngleOffsetRange = null, prevBAngleOffsetRange = null;
  for (const row of rows || []) {
    let r;
    try { r = parseVPanelReport(row.raw_text); } catch { continue; }
    const diag = diagnoseReport(r, {
      gradientX: prevGradientX, gradientY: prevGradientY,
      magazineOffset: prevMagOffset, baseToolLength: prevBaseToolLength,
      aGap: prevAGap, bGap: prevBGap, origin: prevOrigin,
      aAngleOffsetRange: prevAAngleOffsetRange, bAngleOffsetRange: prevBAngleOffsetRange,
    });
    out.push({ correctionCount: r.correctionCount != null ? r.correctionCount : row.correction_count, model: r.model, diagnostics: diag });

    const grad = r.rac["SPINDLE GRADIENT"];
    if (grad && typeof grad.X === "number") prevGradientX = grad.X;
    if (grad && typeof grad.Y === "number") prevGradientY = grad.Y;
    const mo = r.atc["MAGAZINE POSITION OFFSET"];
    if (Array.isArray(mo)) prevMagOffset = mo;
    if (typeof r.rac["BASE TOOL LENGTH"] === "number") prevBaseToolLength = r.rac["BASE TOOL LENGTH"];
    const aGapNow = r.rac["A-AXIS"] ? yGap(r.rac["A-AXIS"]) : null;
    if (aGapNow != null) prevAGap = aGapNow;
    const bGapNow = r.rac["B-AXIS"] ? xGap(r.rac["B-AXIS"]) : null;
    if (bGapNow != null) prevBGap = bGapNow;
    const originNow = extractOrigin(r.sections || {}, r.rac);
    if (originNow.some((v) => v != null)) prevOrigin = originNow;
    const aRangeNow = currentAngleOffsetRange(r, "A-AXIS");
    if (aRangeNow != null) prevAAngleOffsetRange = aRangeNow;
    const bRangeNow = currentAngleOffsetRange(r, "B-AXIS");
    if (bRangeNow != null) prevBAngleOffsetRange = bRangeNow;
  }
  return out;
}

module.exports = {
  DWX_THRESHOLDS, getProfile, CHECK_INFO,
  parseVPanelReport, splitReports,
  diagnoseReport, diagnoseHistory, topFlagged,
};
