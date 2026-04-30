import { useState, useEffect, useCallback, useRef } from "react";

const SUPABASE_URL = "https://untsjmmqtfasejkwjnlf.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVudHNqbW1xdGZhc2Vqa3dqbmxmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3OTc3NDksImV4cCI6MjA4OTM3Mzc0OX0.dqBbwFHC1tsPEtl9KD_qNUvhGW0H33NFj19h6MFeqAo";

const db = {
  async get(table) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?order=created_at.asc`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
    });
    return r.json();
  },
  async insert(table, data) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify(data)
    });
    return r.json();
  },
  async update(table, id, data) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
      method: "PATCH",
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify(data)
    });
    return r.json();
  },
  async delete(table, id) {
    await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
      method: "DELETE",
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
    });
  }
};

const storage = {
  async upload(file, jobId) {
    const ext = file.name.split('.').pop();
    const path = `${jobId}/${Date.now()}.${ext}`;
    const r = await fetch(`${SUPABASE_URL}/storage/v1/object/job-photos/${path}`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': file.type },
      body: file
    });
    if (!r.ok) throw new Error('Upload failed');
    return `${SUPABASE_URL}/storage/v1/object/public/job-photos/${path}`;
  },
  async list(jobId) {
    const r = await fetch(`${SUPABASE_URL}/storage/v1/object/list/job-photos`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix: `${jobId}/`, limit: 50 })
    });
    const files = await r.json();
    if (!Array.isArray(files)) return [];
    return files.map(f => `${SUPABASE_URL}/storage/v1/object/public/job-photos/${jobId}/${f.name}`);
  },
  async delete(url) {
    const path = url.split('/job-photos/')[1];
    await fetch(`${SUPABASE_URL}/storage/v1/object/job-photos/${path}`, {
      method: 'DELETE',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
    });
  },
  async uploadFile(file) {
    const safeName = Date.now() + '_' + file.name.replace(/[^a-zA-Z0-9._-]/g,'_');
    const path = `refs/${safeName}`;
    const r = await fetch(`${SUPABASE_URL}/storage/v1/object/job-photos/${path}`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': file.type },
      body: file
    });
    if (!r.ok) throw new Error('Upload failed');
    return { url: `${SUPABASE_URL}/storage/v1/object/public/job-photos/${path}`, name: file.name, size: file.size, path };
  },
  async deleteFile(path) {
    await fetch(`${SUPABASE_URL}/storage/v1/object/job-photos/${path}`, {
      method: 'DELETE',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
    });
  }
};

// ── PDF Import Data ──────────────────────────────────────────────────────────
const PDF_JOBS = [
  { customer: "Aurum Equipment", equipment: "Meditherm Gold30700802", date: "2026-02-03", notes: "Meditherm gold30700802\nFuse", status: "Complete" },
  { customer: "Schell", equipment: "SN 910500638", date: "2026-01-22", notes: "910500638\nDecent no concerns", status: "Complete" },
  { customer: "Schell", equipment: "SN 910000147", date: "2026-01-22", notes: "910000147\nNoisy z axis ballscrew. Needs replacing.\nNew collet, supplied by customer\nY bs dirty.", status: "Complete" },
  { customer: "Schell", equipment: "SN 9106000681", date: "2026-01-22", notes: "9106000681\nNoisy y belt. Lubricated.\nAll other serviced.\nNoisy x bs. Needs replacing", status: "Complete" },
  { customer: "Schell", equipment: "450i", date: "2026-01-22", notes: "450i\nTool alignments out. Holder shifted.\nAligned, tightened and calibrated. Tested crown", status: "Complete" },
  { customer: "Schell", equipment: "350iPlus SN2022-S3709", date: "2026-01-21", notes: "350iplus sn2022-s3709\nAdjust medentika holder, over clamped. New one ordered\nZero clamp full service\nX tension, grease\nZ tension. Greased\nCollet maintenance.\nChecked tool pockets\nScratched x, 50 microns.\nChiller bypassed", status: "Complete" },
  { customer: "Evergreen Hans", equipment: "52DCI SN ZES1575", date: "2026-01-15", notes: "52dci sn ZES1575\nFailing calibrations. And clamp bearing fault.\nBad cont. Tested in rotary axis. 2Mohms\nNew collet\nBs cleaned and lube\nDice", status: "Complete" },
  { customer: "Evergreen Hans", equipment: "51D SN ZDA1995", date: "2026-01-15", notes: "51d sn ZDA1995\nVacuum low, dusty inside. Oil and water in air lines.\nDamaged y axis left cover. Replaced.\nAdjusted x waycover.\nReseat xyz bs\nRecommend x bs.\nRecommend a axis rebuild, backlash\nCollet replaced\nDice good", status: "Complete" },
  { customer: "Hitech", equipment: "Select – Loader", date: "2026-01-12", notes: "Select\nLoader issues.\nLower motor loose.\nPerhaps crimped, zipped tie cable.\nCalibration off. Helped alot.\nTop left switch replaced due to lever bending. $800 charge", status: "Complete" },
  { customer: "Core3d", equipment: "Imes 150N04", date: "2026-01-08", notes: "Imes 150n04\nB axis sensor not reading.\nDirty\nCalibration due to values being way out", status: "Complete" },
  { customer: "Aurum Equipment", equipment: "Bego Meditherm 307 377", date: "2026-01-07", notes: "Bego meditherm 307 377\nThermocouple.\n3 hours", status: "Complete" },
  { customer: "Aurum Equipment", equipment: "EP5000 875530", date: "2026-01-06", notes: "Ep5000, 875530\nVacuum and heater failure. Err20\nLower vacuum seal. Heater power cable. #748474", status: "Complete" },
  { customer: "Core3d", equipment: "150i No1", date: "2025-12-29", notes: "150i no1\nBack to smaller last purchased make of coolant pump", status: "Complete" },
  { customer: "Refurbished Units", equipment: "DWX52DCI SN KEW0159", date: "2025-12-20", notes: "Dwx52dci sn kew0159\nB gear\nA gear\nXyz bs\nSpindle\nLoader upgrade", status: "Complete" },
  { customer: "Core3d", equipment: "360Pro+", date: "2025-12-18", notes: "360pro+\nSpindle replacement\nOld 91520\nNew 91517\nGreased belts", status: "Complete" },
  { customer: "Protec CB", equipment: "Imes350ProPlus 701041", date: "2025-12-12", notes: "Imes350proplus 701041\nNew belts, red.\nFull cali.\nOil build up on z belt. Need to check again if rtv sealant has kept it clean", status: "Complete" },
  { customer: "Protec CB", equipment: "52DC No5 ZCZ0173", date: "2025-12-12", notes: "52dc no5 zcz0173\nZ Bs\nX bs\nCollet. A gear\nRepeatability xyz\nLoader clean and cali\nBetter but small mismatch line.\nDice is good. Suggested manual correction for now.", status: "Complete" },
  { customer: "Protec CB", equipment: "52D ZDY1683 No6", date: "2025-12-11", notes: "52d zdy1683 NO6\nNew collet\nBoth white clamps.\nAdjust x,y bs seating\nGood dice good crowns", status: "Complete" },
  { customer: "Protec CB", equipment: "PM7 252 – Denture Right No2/3/7", date: "2025-12-11", notes: "Pm7 252 (denture right.)\nFingers. 3 sets.\nNo2\nNo3\nNo7", status: "Complete" },
  { customer: "Protec CB", equipment: "PM7 834 – Denture Right", date: "2025-12-11", notes: "Pm7 834 (denture right)\nPreventative maintenance.\nJust needed clean and lube.\nDid Loader test", status: "Complete" },
  { customer: "Protec CB", equipment: "DWX52D ZEM2776 No1", date: "2025-12-10", notes: "Dwx52d ZEM2776 (NO1)\nXYZ BS NEW\nA GEAR\nB backlash\nTwist.\nDice good.\nGood crowns", status: "Complete" },
  { customer: "Refurbished Units", equipment: "DWX52D ZDJ0203", date: "2025-12-09", notes: "Dwx52d zdj0203\nXyz BS\nFA AXIS\nStandard B axis", status: "Complete" },
  { customer: "Rema Dents", equipment: "DWC50 ZBL1400", date: "2025-12-03", notes: "Dwc50.ZBL1400", status: "Complete" },
  { customer: "Core3d", equipment: "150N02", date: "2025-12-01", notes: "150n02\nFull service.\nZ belt.\nNew spindle\nNew touch setter\n3 new tools sockets.\nClean and lubricant\nNew coolant good pump", status: "Complete" },
  { customer: "Trosvic Seattle", equipment: "350i Pro Loader 697804/1", date: "2025-11-28", notes: "350i pro loader. 697804/1\nDust eaten through alot of mechanical components.\nZ axis ballscrew noisy. Repeatability good.\nX axis ballscrew had to be adjust on ballnut. Recommend new xyz ballscrew.\nNew belts.\nAlignments.\nNew collet\nFull calibration incl. 5 axis\nMain door missing rail.\nZero clamp system worn for dust. (replaced seals.)\nPc slow boot up", status: "Complete" },
  { customer: "Trosvic Seattle", equipment: "52DCI KFD0656", date: "2025-11-27", notes: "Kfd0656\n52dci\nReplaced traverser with Refurbished unit. Too many issues with existing one.\nXyz ballscrews\nCollet\nAxis adjustment.\nNeeds full rotary axis replacement/Rebuild\nNeeds new calibration pins x2\nSend with tools. And 350 parts", status: "Complete" },
  { customer: "Trosvic Seattle", equipment: "52DCI KFD0673", date: "2025-11-26", notes: "Kfd0673\n52dci\nRebuilt existing traverser. Loose and alignments.\nXyz ballscrews\nY axis limit switch\nRotary adjustments.\nRepeatability issues shown by dice.\nAlignment of axis needed\nNeeds full rotary axis replacement/Rebuild", status: "Complete" },
  { customer: "Vhf", equipment: "R5 ID 923345704", date: "2025-11-24", notes: "R5 ID 923345704\nShipped out 2 x e5\nReceived r5.\nMissing some screws from the back\nIonizer faulty.\n2.3vdc output at nozzles\nWent through power supply.\nTested nozzles. Suspect cables.\nReplaced cables with nozzles. 28vdc\nSlight oil residue around nozzles and z axis bellows.\nReassembled with covers. Adjust door.\nInstalled csk screws for back panel.\nArranged pickup/delivery", status: "Complete" },
  { customer: "Aurum Equipment", equipment: "P500 400232", date: "2025-11-19", notes: "P500 400232\nHead not moving. (hinge loose) and switch damaged - adjusted)\nNo Vacuum. Cleaned seal and reseat.", status: "Complete" },
  { customer: "Aurum Equipment", equipment: "Radwell Vacuum Seal Kits (Order)", date: "2025-11-19", notes: "Ordered radwell vacuum seal kits\nArrive mid dec. Mid Jan", status: "Complete" },
  { customer: "Centre St Denture", equipment: "53DC", date: "2025-11-18", notes: "53dc\nEarlier tro assembly\nRigid couplings\nToday z axis BS and touch setter switch\nX axis BS sounds bad.\nCalibration done.\n25nov\nSpace tape side of spindle for alignment", status: "Complete" },
  { customer: "Aurum Equipment", equipment: "P300 200097", date: "2025-11-17", notes: "P300 200097\nNo power,\nPower supply replacement.\nBroken vacuum fitting\nPlatform seal cleanup\nGlue power supply cable", status: "Complete" },
  { customer: "Core3d", equipment: "150No1 – Spindle Swap", date: "2025-11-13", notes: "150no1\nSwapped spindle with no2.\nNew coolant pump", status: "Complete" },
  { customer: "Core3d", equipment: "150N03", date: "2025-11-13", notes: "150n03\nPcb fuses\nAnd coolant pump", status: "Complete" },
  { customer: "FA Machines", equipment: "DWX52D ZDJ0203 – Storage", date: "2025-11-06", notes: "Storage. Swap out ready.\nZdj0203\nXyz balls.\nSwitches\nA/b gears\nWhite fixture clamps.\nRefurbished spindle\nTested with dice and Zr.", status: "Complete" },
  { customer: "Core3d", equipment: "PM7 – DICP Error", date: "2025-11-05", notes: "Pm7 dicp error and lagging.\nMade backup\nReset database\nInput tool info", status: "Complete" },
  { customer: "Core3d", equipment: "Furnace No8", date: "2025-11-03", notes: "Furnace no8\nThermocouple value 0.3\nElements 0.2", status: "Complete" },
  { customer: "Core3d", equipment: "OM2 Left – Spindle", date: "2025-11-03", notes: "Om2 left\nSpindle noisy, failing", status: "Complete" },
  { customer: "Anvarda", equipment: "SN 9105001087", date: "2025-10-29", notes: "9105001087\nNeeds y axis ballscrew\nSuspect z.\nSuspect x", status: "Complete" },
  { customer: "Anvarda", equipment: "SN 910500750", date: "2025-10-29", notes: "910500750\nPm, bad quality.\nZ ballscrew replaced\nY ballscrew replaced\nZ belt replaced.\nCleaned and tensioner all.", status: "Complete" },
  { customer: "Bc Perio", equipment: "350iPlus", date: "2025-10-28", notes: "350iplus service.\nMicro contactors failed needed smacking.\nRelay board didnt work. Need to return with new relays.\nDid service. Good condition. Over heat error. Suspect dirty temp sensor.\nCleaned.", status: "Complete" },
  { customer: "Kh Dental", equipment: "52DCI", date: "2025-10-28", notes: "52dci\nBad quality.\nDamaged y axis cover. Noisy y axis ballscrew.\nReplaced and calibrated", status: "Complete" },
  { customer: "Core3d", equipment: "DWX51 No3 – Spindle", date: "2025-10-20", notes: "Dwx51 no3 spindle fault\nRebuilt.", status: "Complete" },
  { customer: "Aurum Equipment", equipment: "P300 – Vacuum Fitting", date: "2025-10-20", notes: "P300 vacuum fitting", status: "Complete" },
  { customer: "Aurum Equipment", equipment: "Grinder/Plate Sander – Moe", date: "2025-10-20", notes: "Grinder/plate sander for moe\nSwitch fail", status: "Complete" },
  { customer: "Core3d", equipment: "150No4 – Networking", date: "2025-10-20", notes: "150no4 networking issues.\nSetup one drive access for all 150is", status: "Complete" },
  { customer: "Ocean", equipment: "52DCI ZER1510", date: "2025-10-17", notes: "52dci ZER1510\nRebuild.\nNewish spindle supplied earlier.\nXyz BS\nX switch\nZ Switch\nA gear - free (warranty)\nA Twist", status: "Complete" },
  { customer: "Protec Ortho", equipment: "350 No2", date: "2025-10-15", notes: "350no2\nX axis ballscrew from no0\nXyz grey belts", status: "Complete" },
  { customer: "Protec Ortho", equipment: "350 No1 701157", date: "2025-10-15", notes: "350no1 701157\nZ axis pulley flange worn off\nNew pulley. (grey)\nZ grey belt\nX red and black\nY red and black", status: "Complete" },
  { customer: "Protec Ortho", equipment: "350i No0 660555/1", date: "2025-10-15", notes: "350i no0 660555/1\nNew x axis ballscrew (got swapped to no2 due to parts waiting)\nRefurbished spindle (seized)\nNew z belt (grey)\nNew x belt (grey)\nPc shut off half way through job", status: "Complete" },
  { customer: "Core3d", equipment: "Imes 150i No1 – New Spindle", date: "2025-10-14", notes: "Imes 150I number one new spindle.\nNew a axis cable", status: "Complete" },
  { customer: "Core3d", equipment: "PM7 – Disconnect Error", date: "2025-10-14", notes: "Pm7 disconnect error.\nMainboard com board\n48v power supply", status: "Complete" },
];

// ── Archive helper ───────────────────────────────────────────────────────────
function isArchived(job) {
  if (job.status !== 'Complete') return false;
  if (!job.date) return false;
  const completed = new Date(job.date);
  const now = new Date();
  const diffDays = (now - completed) / (1000 * 60 * 60 * 24);
  return diffDays > 30;
}

// ── Priority helpers ─────────────────────────────────────────────────────────
const PRIORITY_CONFIG = {
  Urgent: { color: 'var(--rd)', bg: 'var(--rdd)', border: 'rgba(255,77,106,0.3)', icon: '🔴' },
  High:   { color: 'var(--am)', bg: 'var(--amd)', border: 'rgba(255,176,32,0.3)',  icon: '🟡' },
  Normal: { color: 'var(--txm)', bg: 'transparent', border: 'var(--bdr)',          icon: '⚪' },
  Low:    { color: 'var(--txd)', bg: 'transparent', border: 'var(--bdr)',          icon: '🔵' },
};

function PriorityBadge({ p }) {
  const cfg = PRIORITY_CONFIG[p] || PRIORITY_CONFIG.Normal;
  if (p === 'Normal' || !p) return null;
  return (
    <span style={{
      fontFamily:"'IBM Plex Mono',monospace", fontSize:9, letterSpacing:1,
      padding:'2px 7px', borderRadius:2, fontWeight:500, textTransform:'uppercase',
      display:'inline-block', whiteSpace:'nowrap',
      color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}`
    }}>{cfg.icon} {p}</span>
  );
}

// ── Follow-up helpers ────────────────────────────────────────────────────────
function isFollowupOverdue(job) {
  if (!job.followup || !job.followup_date) return false;
  return new Date(job.followup_date) < new Date();
}

function daysUntilFollowup(job) {
  if (!job.followup || !job.followup_date) return null;
  const diff = new Date(job.followup_date) - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

// ── Styles ───────────────────────────────────────────────────────────────────
const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@300;400;500&display=swap');
  *{margin:0;padding:0;box-sizing:border-box;}
  :root{--bg:#0a0c10;--sur:#0f1218;--sur2:#161b24;--sur3:#1c2230;--bdr:#1e2a3a;--bdr2:#243040;--ac:#00c8ff;--ac2:#0084a8;--acd:rgba(0,200,255,0.08);--am:#ffb020;--amd:rgba(255,176,32,0.10);--gr:#22d47a;--grd:rgba(34,212,122,0.10);--rd:#ff4d6a;--rdd:rgba(255,77,106,0.10);--tx:#d0dae8;--txd:#5a6a80;--txm:#8a9ab0;--sw:200px;}
  html,body{background:var(--bg);font-family:'IBM Plex Sans',sans-serif;color:var(--tx);min-height:100vh;}
  .app{display:flex;flex-direction:column;min-height:100vh;}
  .topbar{height:52px;background:var(--sur);border-bottom:1px solid var(--bdr);display:flex;align-items:center;padding:0 20px;gap:12px;position:sticky;top:0;z-index:5;}
  .logo{font-family:'Rajdhani',sans-serif;font-weight:700;font-size:17px;letter-spacing:2px;color:var(--ac);}
  .logo-sub{font-family:'IBM Plex Mono',monospace;font-size:9px;color:var(--txd);letter-spacing:2px;}
  .btn{display:flex;align-items:center;gap:6px;padding:6px 14px;border-radius:4px;font-size:12px;font-weight:600;letter-spacing:.5px;cursor:pointer;border:1px solid;font-family:'Rajdhani',sans-serif;text-transform:uppercase;white-space:nowrap;}
  .bp{background:var(--ac);color:#000;border-color:var(--ac);}
  .bp:hover{background:#33d4ff;}
  .bg{background:transparent;color:var(--txm);border-color:var(--bdr2);}
  .bg:hover{color:var(--tx);border-color:var(--ac);}
  .bd{background:var(--rdd);color:var(--rd);border-color:rgba(255,77,106,0.3);}
  .bimport{background:rgba(255,176,32,0.15);color:var(--am);border-color:rgba(255,176,32,0.4);}
  .bimport:hover{background:rgba(255,176,32,0.25);}
  .bfollowup{background:rgba(34,212,122,0.12);color:var(--gr);border-color:rgba(34,212,122,0.3);}
  .bfollowup:hover{background:rgba(34,212,122,0.22);}
  .bs{padding:4px 9px;font-size:10px;}
  .body{display:flex;flex:1;}
  .sidebar{width:var(--sw);background:var(--sur);border-right:1px solid var(--bdr);display:flex;flex-direction:column;position:fixed;top:52px;bottom:0;left:0;z-index:4;}
  .nl{font-family:'IBM Plex Mono',monospace;font-size:9px;color:var(--txd);letter-spacing:2px;padding:14px 14px 6px;text-transform:uppercase;}
  .ni{display:flex;align-items:center;gap:10px;padding:8px 14px;font-size:13px;font-weight:500;color:var(--txm);cursor:pointer;transition:all .15s;border-left:2px solid transparent;}
  .ni:hover{background:var(--sur2);color:var(--tx);}
  .ni.active{background:var(--acd);color:var(--ac);border-left-color:var(--ac);}
  .sf{margin-top:auto;padding:14px;border-top:1px solid var(--bdr);}
  .up{display:flex;align-items:center;gap:8px;padding:8px;background:var(--sur2);border-radius:4px;border:1px solid var(--bdr);}
  .ua{width:26px;height:26px;border-radius:50%;background:var(--ac2);font-family:'Rajdhani',sans-serif;font-weight:700;font-size:11px;color:white;display:flex;align-items:center;justify-content:center;}
  .main{margin-left:var(--sw);flex:1;padding:20px;padding-bottom:30px;}
  .kgrid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px;}
  .kc{background:var(--sur);border:1px solid var(--bdr);border-radius:6px;padding:14px 16px;position:relative;overflow:hidden;cursor:pointer;transition:border-color .15s;}
  .kc:hover{border-color:var(--bdr2);}
  .kc.selected{border-color:var(--ac);}
  .kc::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;}
  .kc.bl::before{background:var(--ac);}
  .kc.am::before{background:var(--am);}
  .kc.gr::before{background:var(--gr);}
  .kc.rd::before{background:var(--rd);}
  .kl{font-family:'IBM Plex Mono',monospace;font-size:9px;color:var(--txd);letter-spacing:2px;text-transform:uppercase;margin-bottom:6px;}
  .kv{font-family:'Rajdhani',sans-serif;font-size:30px;font-weight:700;line-height:1;}
  .kc.bl .kv{color:var(--ac);}
  .kc.am .kv{color:var(--am);}
  .kc.gr .kv{color:var(--gr);}
  .kc.rd .kv{color:var(--rd);}
  .ks{font-size:11px;color:var(--txd);margin-top:4px;}
  .panel{background:var(--sur);border:1px solid var(--bdr);border-radius:6px;overflow:hidden;margin-bottom:16px;}
  .ph{padding:12px 16px;border-bottom:1px solid var(--bdr);display:flex;align-items:center;justify-content:space-between;}
  .pt{font-family:'Rajdhani',sans-serif;font-weight:600;font-size:13px;letter-spacing:1px;text-transform:uppercase;}
  .pa{font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--ac);cursor:pointer;}
  .tbl{width:100%;overflow-x:auto;}
  .tr{display:grid;align-items:center;padding:10px 16px;border-bottom:1px solid var(--bdr);transition:background .1s;}
  .tr:not(.hdr){cursor:pointer;}
  .tr:not(.hdr):hover{background:var(--sur2);}
  .tr.hdr{padding:8px 16px;}
  .cl{font-family:'IBM Plex Mono',monospace;font-size:9px;color:var(--txd);letter-spacing:2px;text-transform:uppercase;}
  .ci{font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--ac);}
  .cm{font-size:13px;font-weight:500;}
  .cs{font-size:11px;color:var(--txd);margin-top:1px;}
  .cd{font-size:12px;color:var(--txm);}
  .cn{font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--txm);}
  .cv{font-family:'Rajdhani',sans-serif;font-weight:600;font-size:14px;}
  .st{font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:1px;padding:2px 7px;border-radius:2px;font-weight:500;text-transform:uppercase;display:inline-block;white-space:nowrap;}
  .st.Dispatched{background:var(--acd);color:var(--ac);border:1px solid rgba(0,200,255,0.2);}
  .st.InProgress{background:var(--amd);color:var(--am);border:1px solid rgba(255,176,32,0.2);}
  .st.Complete{background:var(--grd);color:var(--gr);border:1px solid rgba(34,212,122,0.2);}
  .st.Pending{background:rgba(90,106,128,0.15);color:var(--txd);border:1px solid var(--bdr);}
  .st.Available{background:var(--grd);color:var(--gr);border:1px solid rgba(34,212,122,0.2);}
  .st.Busy{background:var(--amd);color:var(--am);border:1px solid rgba(255,176,32,0.2);}
  .st.Offline{background:rgba(90,106,128,0.15);color:var(--txd);border:1px solid var(--bdr);}
  .mbg{position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:50;display:flex;align-items:center;justify-content:center;padding:20px;}
  .modal{background:var(--sur);border:1px solid var(--bdr2);border-radius:8px;width:100%;max-width:500px;max-height:85vh;overflow-y:auto;}
  .mh{padding:14px 18px;border-bottom:1px solid var(--bdr);display:flex;align-items:center;justify-content:space-between;}
  .mt{font-family:'Rajdhani',sans-serif;font-weight:600;font-size:15px;letter-spacing:1px;text-transform:uppercase;}
  .mc{background:none;border:none;color:var(--txd);font-size:20px;cursor:pointer;line-height:1;}
  .mc:hover{color:var(--tx);}
  .mb{padding:18px;}
  .mf{padding:14px 18px;border-top:1px solid var(--bdr);display:flex;gap:10px;justify-content:flex-end;}
  .fg{margin-bottom:14px;}
  .fl{font-family:'IBM Plex Mono',monospace;font-size:9px;color:var(--txd);letter-spacing:1px;text-transform:uppercase;margin-bottom:5px;display:block;}
  .fi,.fsl,.fta{width:100%;background:var(--sur2);border:1px solid var(--bdr);border-radius:4px;padding:8px 10px;color:var(--tx);font-family:'IBM Plex Sans',sans-serif;font-size:13px;}
  .fi:focus,.fsl:focus,.fta:focus{outline:none;border-color:var(--ac);}
  .fsl{cursor:pointer;}
  .fta{resize:vertical;min-height:70px;}
  .fr{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
  .tgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;padding:14px;}
  .tc{background:var(--sur2);border:1px solid var(--bdr);border-radius:6px;padding:14px;}
  .tav{width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:'Rajdhani',sans-serif;font-weight:700;font-size:13px;border:2px solid;flex-shrink:0;}
  .tav.Available{background:var(--grd);color:var(--gr);border-color:rgba(34,212,122,0.3);}
  .tav.Busy{background:var(--amd);color:var(--am);border-color:rgba(255,176,32,0.3);}
  .tav.Offline{background:rgba(90,106,128,0.15);color:var(--txd);border-color:var(--bdr);}
  .cg{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;padding:14px;}
  .cdl{font-family:'IBM Plex Mono',monospace;font-size:9px;color:var(--txd);text-align:center;padding:4px 0;letter-spacing:1px;}
  .cd2{min-height:72px;background:var(--sur2);border:1px solid var(--bdr);border-radius:4px;padding:5px;}
  .cd2.today{border-color:var(--ac);}
  .cdn{font-family:'IBM Plex Mono',monospace;font-size:9px;color:var(--txm);margin-bottom:3px;}
  .cdn.tn{color:var(--ac);font-weight:700;}
  .cj{font-size:8px;padding:1px 4px;border-radius:2px;margin-bottom:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .cj.Dispatched{background:var(--acd);color:var(--ac);}
  .cj.InProgress{background:var(--amd);color:var(--am);}
  .cj.Pending{background:rgba(90,106,128,0.15);color:var(--txd);}
  .cj.Complete{background:var(--grd);color:var(--gr);}
  .empty{padding:40px;text-align:center;color:var(--txd);font-size:13px;}
  .ei{font-size:28px;margin-bottom:10px;}
  .loading{display:flex;align-items:center;justify-content:padding:40px;color:var(--txd);font-family:'IBM Plex Mono',monospace;font-size:12px;gap:10px;}
  .spin{width:14px;height:14px;border:2px solid var(--bdr2);border-top-color:var(--ac);border-radius:50%;animation:spin .7s linear infinite;}
  .toast{position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:var(--sur2);border:1px solid var(--bdr2);border-radius:6px;padding:9px 18px;font-family:'IBM Plex Mono',monospace;font-size:11px;z-index:100;white-space:nowrap;}
  .g2{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
  .job-card{background:var(--sur);border:1px solid var(--bdr);border-radius:8px;padding:16px;margin-bottom:12px;position:relative;overflow:hidden;}
  .job-card::before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;}
  .job-card.InProgress::before{background:var(--am);}
  .job-card.Dispatched::before{background:var(--ac);}
  .job-card.Pending::before{background:var(--txd);}
  .job-card.Complete::before{background:var(--gr);}
  .job-card.Urgent::before{background:var(--rd);}
  .job-card-header{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:10px;}
  .job-card-id{font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--ac);margin-bottom:3px;}
  .job-card-customer{font-size:15px;font-weight:600;}
  .job-card-equip{font-size:12px;color:var(--txd);margin-top:2px;}
  .job-card-meta{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;}
  .job-card-tag{font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--txm);background:var(--sur2);padding:3px 8px;border-radius:3px;border:1px solid var(--bdr);}
  .job-card-actions{display:flex;gap:8px;margin-top:12px;padding-top:10px;border-top:1px solid var(--bdr);}
  .bnav{display:none;position:fixed;bottom:0;left:0;right:0;background:var(--sur);border-top:1px solid var(--bdr);z-index:10;padding:6px 0 8px;}
  .bnav-inner{display:flex;justify-content:space-around;}
  .bnav-item{display:flex;flex-direction:column;align-items:center;gap:3px;padding:4px 10px;cursor:pointer;flex:1;position:relative;}
  .bnav-icon{font-size:18px;color:var(--txd);}
  .bnav-label{font-family:'IBM Plex Mono',monospace;font-size:8px;color:var(--txd);letter-spacing:1px;text-transform:uppercase;}
  .bnav-item.active .bnav-icon,.bnav-item.active .bnav-label{color:var(--ac);}
  .bnav-badge{position:absolute;top:2px;right:8px;background:var(--rd);color:white;font-size:9px;font-weight:700;font-family:'IBM Plex Mono',monospace;padding:1px 5px;border-radius:8px;min-width:16px;text-align:center;}
  .mob-section{display:flex;align-items:center;justify-content:space-between;margin:16px 0 10px;}
  .mob-section-title{font-family:'Rajdhani',sans-serif;font-weight:600;font-size:14px;letter-spacing:1px;text-transform:uppercase;color:var(--txm);}
  .mob-section-count{font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--ac);}
  .mob-kpi-row{display:flex;gap:10px;margin-bottom:16px;overflow-x:auto;padding-bottom:4px;}
  .mob-kpi{background:var(--sur);border:1px solid var(--bdr);border-radius:6px;padding:12px 14px;flex-shrink:0;min-width:90px;position:relative;overflow:hidden;cursor:pointer;transition:border-color .15s;}
  .mob-kpi:hover{border-color:var(--bdr2);}
  .mob-kpi.selected{border-color:var(--ac);box-shadow:0 0 0 1px var(--ac);}
  .mob-kpi::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;}
  .mob-kpi.bl::before{background:var(--ac);}
  .mob-kpi.am::before{background:var(--am);}
  .mob-kpi.rd::before{background:var(--rd);}
  .mob-kpi.gr::before{background:var(--gr);}
  .mob-kpi .kl{font-size:8px;}
  .mob-kpi .kv{font-size:22px;}
  .mob-kpi.bl .kv{color:var(--ac);}
  .mob-kpi.am .kv{color:var(--am);}
  .mob-kpi.rd .kv{color:var(--rd);}
  .mob-kpi.gr .kv{color:var(--gr);}
  .filter-bar{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;padding:8px 12px;background:var(--sur);border:1px solid var(--bdr);border-radius:6px;}
  .filter-label{font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--ac);letter-spacing:1px;}
  .filter-clear{font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--txd);cursor:pointer;padding:2px 8px;border:1px solid var(--bdr);border-radius:3px;}
  .filter-clear:hover{color:var(--tx);border-color:var(--bdr2);}
  .detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;}
  .detail-label{font-family:'IBM Plex Mono',monospace;font-size:9px;color:var(--txd);letter-spacing:2px;text-transform:uppercase;margin-bottom:4px;}
  .detail-value{font-size:13px;color:var(--tx);}
  .st.Archived{background:rgba(90,106,128,0.12);color:#4a5a70;border:1px solid var(--bdr);}
  .import-modal{background:var(--sur);border:1px solid var(--bdr2);border-radius:8px;width:100%;max-width:620px;max-height:85vh;overflow-y:auto;}
  .import-row{display:grid;grid-template-columns:24px 1fr 120px 90px;align-items:center;gap:8px;padding:8px 16px;border-bottom:1px solid var(--bdr);font-size:12px;}
  .import-row:hover{background:var(--sur2);}
  .import-check{width:16px;height:16px;accent-color:var(--ac);cursor:pointer;}

  /* ── Daily Focus Panel ── */
  .focus-panel{background:linear-gradient(135deg,rgba(0,200,255,0.06) 0%,rgba(255,176,32,0.04) 100%);border:1px solid var(--bdr2);border-radius:8px;margin-bottom:20px;overflow:hidden;}
  .focus-header{padding:14px 18px;border-bottom:1px solid var(--bdr);display:flex;align-items:center;justify-content:space-between;}
  .focus-title{font-family:'Rajdhani',sans-serif;font-weight:700;font-size:15px;letter-spacing:2px;text-transform:uppercase;color:var(--ac);}
  .focus-date{font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--txd);}
  .focus-body{display:grid;grid-template-columns:1fr 1fr;gap:0;}
  .focus-col{padding:14px 18px;}
  .focus-col:first-child{border-right:1px solid var(--bdr);}
  .focus-col-title{font-family:'IBM Plex Mono',monospace;font-size:9px;color:var(--txd);letter-spacing:2px;text-transform:uppercase;margin-bottom:10px;}
  .focus-item{display:flex;align-items:flex-start;gap:10px;padding:8px 10px;border-radius:5px;margin-bottom:6px;border:1px solid var(--bdr);background:var(--sur);cursor:pointer;transition:border-color .15s;}
  .focus-item:hover{border-color:var(--bdr2);}
  .focus-item.urgent{border-color:rgba(255,77,106,0.3);background:var(--rdd);}
  .focus-item.high{border-color:rgba(255,176,32,0.25);background:var(--amd);}
  .focus-item.overdue{border-color:rgba(255,77,106,0.4);background:rgba(255,77,106,0.08);}
  .focus-item-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;margin-top:4px;}
  .focus-item-dot.urgent{background:var(--rd);}
  .focus-item-dot.high{background:var(--am);}
  .focus-item-dot.followup{background:var(--gr);}
  .focus-item-dot.overdue{background:var(--rd);}
  .focus-item-info{flex:1;min-width:0;}
  .focus-item-customer{font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .focus-item-sub{font-size:11px;color:var(--txd);margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .focus-item-badge{font-family:'IBM Plex Mono',monospace;font-size:9px;flex-shrink:0;padding:2px 6px;border-radius:3px;align-self:center;}
  .focus-empty{padding:16px;text-align:center;color:var(--txd);font-size:12px;font-family:'IBM Plex Mono',monospace;}

  /* ── Follow-up indicator on job tiles ── */
  .followup-pill{display:inline-flex;align-items:center;gap:4px;font-family:'IBM Plex Mono',monospace;font-size:9px;padding:2px 7px;border-radius:10px;border:1px solid;white-space:nowrap;}
  .followup-pill.due{color:var(--am);border-color:rgba(255,176,32,0.3);background:var(--amd);}
  .followup-pill.overdue{color:var(--rd);border-color:rgba(255,77,106,0.3);background:var(--rdd);}
  .followup-pill.done{color:var(--gr);border-color:rgba(34,212,122,0.3);background:var(--grd);}

  /* ── Follow-ups page ── */
  .followup-card{background:var(--sur);border:1px solid var(--bdr);border-radius:8px;padding:14px 16px;margin-bottom:10px;position:relative;overflow:hidden;}
  .followup-card::before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;}
  .followup-card.overdue::before{background:var(--rd);}
  .followup-card.today::before{background:var(--am);}
  .followup-card.upcoming::before{background:var(--ac);}

  @keyframes spin{to{transform:rotate(360deg);}}
  @media(max-width:900px){.kgrid{grid-template-columns:repeat(2,1fr);}.g2{grid-template-columns:1fr;}.fr{grid-template-columns:1fr;}.focus-body{grid-template-columns:1fr;}.focus-col:first-child{border-right:none;border-bottom:1px solid var(--bdr);}}
  @media(max-width:640px){:root{--sw:0px;}.sidebar{display:none;}.main{margin-left:0;padding:14px;padding-bottom:80px;}.bnav{display:block;}.kgrid{display:none;}.desktop-table{display:none;}.mobile-cards{display:block;}.topbar{padding:0 14px;}.logo-sub{display:none;}}
  @media(min-width:641px){.mobile-cards{display:none;}.mob-kpi-row{display:none;}.mob-section{display:none;}.filter-bar{display:none;}}
`;

// ── Helpers ──────────────────────────────────────────────────────────────────
function StBadge({s}){return <span className={"st "+(s||'Pending').replace(' ','')}>{s||'Pending'}</span>;}
function Toast({msg}){return msg?<div className="toast">{msg}</div>:null;}
function Loading(){return <div className="loading"><div className="spin"/>Loading...</div>;}

function Modal({title,onClose,onSave,saveLabel,children}){
  return(
    <div className="mbg" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal">
        <div className="mh"><div className="mt">{title}</div><button className="mc" onClick={onClose}>×</button></div>
        <div className="mb">{children}</div>
        <div className="mf"><button className="btn bg" onClick={onClose}>Cancel</button><button className="btn bp" onClick={onSave}>{saveLabel||'Save'}</button></div>
      </div>
    </div>
  );
}

// ── Daily Focus Panel ─────────────────────────────────────────────────────────
function DailyFocusPanel({ jobs, onEditJob }) {
  const today = new Date();
  const dateStr = today.toLocaleDateString('en-CA', { weekday:'long', year:'numeric', month:'long', day:'numeric' });

  // Top priority jobs (Urgent first, then High, non-complete, non-archived)
  const priorityJobs = jobs
    .filter(j => !isArchived(j) && j.status !== 'Complete' && (j.priority === 'Urgent' || j.priority === 'High'))
    .sort((a,b) => {
      const order = { Urgent:0, High:1 };
      return (order[a.priority]??2) - (order[b.priority]??2);
    })
    .slice(0, 5);

  // Follow-ups: overdue first, then upcoming
  const followupJobs = jobs
    .filter(j => j.followup && j.status !== 'Complete')
    .sort((a,b) => {
      const da = new Date(a.followup_date||'9999');
      const db2 = new Date(b.followup_date||'9999');
      return da - db2;
    })
    .slice(0, 5);

  const overdueFollowups = followupJobs.filter(isFollowupOverdue);
  const upcomingFollowups = followupJobs.filter(j => !isFollowupOverdue(j));

  return (
    <div className="focus-panel">
      <div className="focus-header">
        <div>
          <div className="focus-title">⚡ Daily Focus</div>
          <div className="focus-date">{dateStr}</div>
        </div>
        <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:'var(--txd)',textAlign:'right'}}>
          <div style={{color: overdueFollowups.length > 0 ? 'var(--rd)' : 'var(--txd)'}}>
            {overdueFollowups.length > 0 ? `⚠ ${overdueFollowups.length} overdue follow-up${overdueFollowups.length>1?'s':''}` : '✓ No overdue follow-ups'}
          </div>
          <div style={{marginTop:2}}>{priorityJobs.length} priority job{priorityJobs.length!==1?'s':''} active</div>
        </div>
      </div>
      <div className="focus-body">
        {/* Priority Jobs column */}
        <div className="focus-col">
          <div className="focus-col-title">🔴 Priority Jobs</div>
          {priorityJobs.length === 0 && (
            <div className="focus-empty">✅ No urgent or high priority jobs</div>
          )}
          {priorityJobs.map(j => {
            const isUrgent = j.priority === 'Urgent';
            return (
              <div key={j.id} className={`focus-item ${isUrgent?'urgent':'high'}`} onClick={() => onEditJob(j)}>
                <div className={`focus-item-dot ${isUrgent?'urgent':'high'}`}/>
                <div className="focus-item-info">
                  <div className="focus-item-customer">{j.customer}</div>
                  <div className="focus-item-sub">{j.equipment || '—'}</div>
                </div>
                <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:4,flexShrink:0}}>
                  <PriorityBadge p={j.priority}/>
                  <StBadge s={j.status}/>
                </div>
              </div>
            );
          })}
        </div>

        {/* Follow-ups column */}
        <div className="focus-col">
          <div className="focus-col-title">📞 Follow-ups Needed</div>
          {followupJobs.length === 0 && (
            <div className="focus-empty">✅ No pending follow-ups</div>
          )}
          {overdueFollowups.map(j => {
            const days = daysUntilFollowup(j);
            return (
              <div key={j.id} className="focus-item overdue" onClick={() => onEditJob(j)}>
                <div className="focus-item-dot overdue"/>
                <div className="focus-item-info">
                  <div className="focus-item-customer">{j.customer}</div>
                  <div className="focus-item-sub">{j.followup_note || j.equipment || '—'}</div>
                </div>
                <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:9,color:'var(--rd)',flexShrink:0,textAlign:'right'}}>
                  {Math.abs(days)}d overdue
                </div>
              </div>
            );
          })}
          {upcomingFollowups.map(j => {
            const days = daysUntilFollowup(j);
            return (
              <div key={j.id} className="focus-item" onClick={() => onEditJob(j)}>
                <div className="focus-item-dot followup"/>
                <div className="focus-item-info">
                  <div className="focus-item-customer">{j.customer}</div>
                  <div className="focus-item-sub">{j.followup_note || j.equipment || '—'}</div>
                </div>
                <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:9,color:days<=1?'var(--am)':'var(--txd)',flexShrink:0,textAlign:'right'}}>
                  {days===0?'Today':days===1?'Tomorrow':`${days}d`}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Follow-up pill for job tiles ─────────────────────────────────────────────
function FollowupPill({ job }) {
  if (!job.followup) return null;
  const overdue = isFollowupOverdue(job);
  const days = daysUntilFollowup(job);
  if (overdue) return <span className="followup-pill overdue">📞 {Math.abs(days)}d overdue</span>;
  if (days === 0) return <span className="followup-pill due">📞 Today</span>;
  if (days === 1) return <span className="followup-pill due">📞 Tomorrow</span>;
  return <span className="followup-pill due">📞 {days}d</span>;
}

// ── PDF Import Modal ─────────────────────────────────────────────────────────
function ImportModal({onClose, onImport, existingJobs}) {
  const [selected, setSelected] = useState(() => new Set(PDF_JOBS.map((_,i)=>i)));
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);

  const existingNotes = new Set(existingJobs.map(j => j.notes));
  const alreadyImported = (job) => existingNotes.has(job.notes);

  const toggleAll = () => {
    const available = PDF_JOBS.map((_,i)=>i).filter(i=>!alreadyImported(PDF_JOBS[i]));
    if(selected.size === available.length) setSelected(new Set());
    else setSelected(new Set(available));
  };

  const toggle = (i) => {
    const next = new Set(selected);
    next.has(i) ? next.delete(i) : next.add(i);
    setSelected(next);
  };

  const doImport = async () => {
    const toImport = [...selected].map(i => PDF_JOBS[i]);
    setImporting(true);
    await onImport(toImport, setProgress);
    setImporting(false);
    onClose();
  };

  const available = PDF_JOBS.filter((_,i)=>!alreadyImported(PDF_JOBS[i]));

  return (
    <div className="mbg" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="import-modal">
        <div className="mh">
          <div>
            <div className="mt">Import PDF Jobs</div>
            <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:'var(--txd)',marginTop:2}}>{PDF_JOBS.length} jobs from March 23, 2026 export</div>
          </div>
          <button className="mc" onClick={onClose}>×</button>
        </div>
        <div style={{padding:'10px 16px',borderBottom:'1px solid var(--bdr)',display:'flex',alignItems:'center',gap:12}}>
          <input type="checkbox" className="import-check" checked={selected.size===available.length&&available.length>0} onChange={toggleAll}/>
          <span style={{fontSize:12,color:'var(--txm)',fontFamily:"'IBM Plex Mono',monospace"}}>{selected.size} of {available.length} selected (grayed = already imported)</span>
        </div>
        <div style={{maxHeight:'50vh',overflowY:'auto'}}>
          <div className="import-row" style={{background:'var(--sur3)',fontFamily:"'IBM Plex Mono',monospace",fontSize:9,color:'var(--txd)',letterSpacing:1}}>
            <div/>
            <div>CUSTOMER / EQUIPMENT</div>
            <div>DATE</div>
            <div>STATUS</div>
          </div>
          {PDF_JOBS.map((job, i) => {
            const done = alreadyImported(job);
            return (
              <div key={i} className="import-row" style={{opacity: done ? 0.4 : 1, pointerEvents: done ? 'none' : 'auto'}} onClick={()=>!done&&toggle(i)}>
                <input type="checkbox" className="import-check" checked={selected.has(i)} onChange={()=>toggle(i)} onClick={e=>e.stopPropagation()} disabled={done}/>
                <div>
                  <div style={{fontWeight:500,color:'var(--tx)'}}>{job.customer}</div>
                  <div style={{color:'var(--txd)',fontSize:11,marginTop:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{job.equipment}</div>
                </div>
                <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:'var(--txm)'}}>{job.date}</div>
                <div>{done ? <span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:9,color:'var(--gr)'}}>✓ Done</span> : <StBadge s={job.status}/>}</div>
              </div>
            );
          })}
        </div>
        {importing && (
          <div style={{padding:'12px 16px',borderTop:'1px solid var(--bdr)'}}>
            <div style={{background:'var(--sur2)',borderRadius:4,overflow:'hidden',height:4,marginBottom:8}}>
              <div style={{width:`${Math.round((progress/selected.size)*100)}%`,background:'var(--ac)',height:'100%',transition:'width .2s'}}/>
            </div>
            <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:'var(--txd)',textAlign:'center'}}>
              Importing {progress}/{selected.size}...
            </div>
          </div>
        )}
        <div className="mf">
          <button className="btn bg" onClick={onClose} disabled={importing}>Cancel</button>
          <button className="btn bp" onClick={doImport} disabled={importing||selected.size===0}>
            {importing ? 'Importing...' : `Import ${selected.size} Jobs`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Job Components ────────────────────────────────────────────────────────────
function JobDetailModal({job,onClose,onEdit}){
  const [photos,setPhotos]=useState([]);
  const [uploading,setUploading]=useState(false);
  const [lightbox,setLightbox]=useState(null);
  const fileRef=useRef(null);

  useEffect(()=>{
    if(job?.id) storage.list(job.id).then(setPhotos).catch(()=>setPhotos([]));
  },[job?.id]);

  const handleUpload=async(e)=>{
    const files=[...e.target.files];
    if(!files.length) return;
    setUploading(true);
    try{
      const urls=await Promise.all(files.map(f=>storage.upload(f,job.id)));
      setPhotos(p=>[...p,...urls]);
    }catch(err){alert('Upload failed. Please try again.');}
    setUploading(false);
    e.target.value='';
  };

  const handleDelete=async(url)=>{
    if(!window.confirm('Delete this photo?')) return;
    await storage.delete(url);
    setPhotos(p=>p.filter(x=>x!==url));
  };

  const days = daysUntilFollowup(job);
  const overdueFollowup = isFollowupOverdue(job);

  return(
    <div className="mbg" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <div className="mh">
          <div>
            <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:11,color:'var(--ac)',marginBottom:3}}>{job.job_id}</div>
            <div className="mt">{job.customer}</div>
          </div>
          <button className="mc" onClick={onClose}>×</button>
        </div>
        <div className="mb">
          <div className="detail-grid">
            <div><div className="detail-label">Equipment</div><div className="detail-value" style={{fontWeight:500}}>{job.equipment||'—'}</div></div>
            <div><div className="detail-label">Status</div><StBadge s={job.status}/></div>
            <div><div className="detail-label">Technician</div><div className="detail-value">{job.technician||'Unassigned'}</div></div>
            <div><div className="detail-label">Date</div><div className="detail-value" style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:11}}>{job.date||'—'}</div></div>
            <div><div className="detail-label">Amount</div><div className="detail-value" style={{fontFamily:"'Rajdhani',sans-serif",fontWeight:700,fontSize:18,color:'var(--ac)'}}>{job.amount?'$'+job.amount:'—'}</div></div>
            <div><div className="detail-label">Priority</div><div className="detail-value">{job.priority ? <PriorityBadge p={job.priority}/> : 'Normal'}</div></div>
            <div><div className="detail-label">Invoice</div><div className="detail-value">{job.invoice_status||'—'}</div></div>
          </div>

          {/* Follow-up section in detail modal */}
          {job.followup && (
            <div style={{borderTop:'1px solid var(--bdr)',paddingTop:14,marginBottom:16}}>
              <div className="detail-label" style={{marginBottom:8}}>Follow-up Required</div>
              <div style={{background: overdueFollowup ? 'var(--rdd)' : 'var(--amd)', border:`1px solid ${overdueFollowup?'rgba(255,77,106,0.3)':'rgba(255,176,32,0.3)'}`,borderRadius:6,padding:'10px 12px'}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}}>
                  <span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:overdueFollowup?'var(--rd)':'var(--am)'}}>
                    📞 {overdueFollowup ? `OVERDUE by ${Math.abs(days)} day${Math.abs(days)!==1?'s':''}` : days===0?'Due Today':days===1?'Due Tomorrow':`Due in ${days} days`}
                  </span>
                  <span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:9,color:'var(--txd)'}}>{job.followup_date}</span>
                </div>
                {job.followup_note && <div style={{fontSize:12,color:'var(--tx)',lineHeight:1.5}}>{job.followup_note}</div>}
              </div>
            </div>
          )}

          <div style={{borderTop:'1px solid var(--bdr)',paddingTop:16,marginBottom:16}}>
            <div className="detail-label" style={{marginBottom:8}}>Notes</div>
            <div style={{fontSize:13,color:job.notes?'var(--tx)':'var(--txd)',lineHeight:1.7,minHeight:60,background:'var(--sur2)',padding:'10px 12px',borderRadius:4,border:'1px solid var(--bdr)',fontStyle:job.notes?'normal':'italic',whiteSpace:'pre-wrap'}}>{job.notes||'No notes for this job.'}</div>
          </div>
          <div style={{borderTop:'1px solid var(--bdr)',paddingTop:16}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
              <div className="detail-label">Photos ({photos.length})</div>
              <button className="btn bp bs" onClick={()=>fileRef.current?.click()} disabled={uploading}>
                {uploading?'Uploading...':'📷 Add Photo'}
              </button>
              <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple style={{display:'none'}} onChange={handleUpload}/>
            </div>
            {photos.length===0&&!uploading&&<div style={{padding:'20px',textAlign:'center',color:'var(--txd)',fontSize:12,background:'var(--sur2)',borderRadius:6,border:'1px solid var(--bdr)'}}>No photos yet — tap Add Photo to upload</div>}
            {uploading&&<div style={{padding:'20px',textAlign:'center',color:'var(--ac)',fontSize:12,background:'var(--sur2)',borderRadius:6,border:'1px solid var(--bdr)'}}>⏳ Uploading...</div>}
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginTop:8}}>
              {photos.map((url,i)=>(
                <div key={i} style={{position:'relative',paddingBottom:'100%',borderRadius:6,overflow:'hidden',border:'1px solid var(--bdr)'}}>
                  <img src={url} alt="" style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'cover',cursor:'pointer'}} onClick={()=>setLightbox(url)}/>
                  <button onClick={()=>handleDelete(url)} style={{position:'absolute',top:4,right:4,background:'rgba(0,0,0,0.7)',border:'none',color:'white',borderRadius:3,width:20,height:20,cursor:'pointer',fontSize:12,display:'flex',alignItems:'center',justifyContent:'center'}}>×</button>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="mf">
          <button className="btn bg" onClick={onClose}>Close</button>
          {onEdit&&<button className="btn bp" onClick={()=>onEdit(job)}>✏️ Edit Job</button>}
        </div>
      </div>
      {lightbox&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.95)',zIndex:100,display:'flex',alignItems:'center',justifyContent:'center',padding:20}} onClick={()=>setLightbox(null)}>
          <img src={lightbox} alt="" style={{maxWidth:'100%',maxHeight:'100%',objectFit:'contain',borderRadius:6}}/>
          <button style={{position:'absolute',top:20,right:20,background:'rgba(255,255,255,0.1)',border:'none',color:'white',fontSize:24,cursor:'pointer',borderRadius:4,padding:'4px 10px'}} onClick={()=>setLightbox(null)}>×</button>
        </div>
      )}
    </div>
  );
}

function JobCard({j,onEdit,onDelete}){
  const statusClass=(j.status||'Pending').replace(' ','');
  return(
    <div className={"job-card "+(j.priority==='Urgent'?'Urgent':statusClass)}>
      <div className="job-card-header">
        <div>
          <div className="job-card-id">{j.job_id}</div>
          <div className="job-card-customer">{j.customer||'—'}</div>
          <div className="job-card-equip">{j.equipment||'—'}</div>
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:4,alignItems:'flex-end'}}>
          <StBadge s={j.status}/>
          {j.priority && j.priority !== 'Normal' && <PriorityBadge p={j.priority}/>}
        </div>
      </div>
      <div className="job-card-meta">
        {j.technician&&<span className="job-card-tag">👤 {j.technician}</span>}
        {j.date&&<span className="job-card-tag">📅 {j.date}</span>}
        {j.amount&&<span className="job-card-tag">💰 ${j.amount}</span>}
        <FollowupPill job={j}/>
      </div>
      {j.notes&&<div style={{fontSize:11,color:'var(--txd)',marginTop:8,fontStyle:'italic',borderLeft:'2px solid var(--bdr)',paddingLeft:8,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{j.notes}</div>}
      {j.followup && j.followup_note && <div style={{fontSize:11,color:'var(--am)',marginTop:6,borderLeft:'2px solid rgba(255,176,32,0.4)',paddingLeft:8}}>📞 {j.followup_note}</div>}
      <div className="job-card-actions">
        <button className="btn bg bs" style={{flex:1}} onClick={()=>onEdit(j)}>✏️ Edit</button>
        <button className="btn bd bs" onClick={()=>onDelete(j.id)}>🗑</button>
      </div>
    </div>
  );
}

function MobileDashboard({jobs,onEditJob,onDeleteJob,onNewJob}){
  const today=new Date().toISOString().split('T')[0];
  const [filter,setFilter]=useState(null);
  const active=jobs.filter(j=>['In Progress','Dispatched'].includes(j.status));
  const todayJobs=jobs.filter(j=>j.date===today);
  const pending=jobs.filter(j=>j.status==='Pending');
  const urgent=jobs.filter(j=>j.priority==='Urgent'&&j.status!=='Complete');
  const toggleFilter=(f)=>setFilter(prev=>prev===f?null:f);
  const filteredJobs=filter==='active'?active:filter==='today'?todayJobs:filter==='pending'?pending:filter==='urgent'?urgent:null;
  const filterLabel=filter==='active'?'In Progress / Dispatched':filter==='today'?'Scheduled Today':filter==='pending'?'Pending Jobs':filter==='urgent'?'Urgent Jobs':null;
  return(<>
    <div className="mob-kpi-row">
      <div className={"mob-kpi am"+(filter==='active'?' selected':'')} onClick={()=>toggleFilter('active')}><div className="kl">Active</div><div className="kv">{active.length}</div></div>
      <div className={"mob-kpi bl"+(filter==='today'?' selected':'')} onClick={()=>toggleFilter('today')}><div className="kl">Today</div><div className="kv">{todayJobs.length}</div></div>
      <div className={"mob-kpi rd"+(filter==='pending'?' selected':'')} onClick={()=>toggleFilter('pending')}><div className="kl">Pending</div><div className="kv">{pending.length}</div></div>
      <div className={"mob-kpi gr"+(filter==='urgent'?' selected':'')} onClick={()=>toggleFilter('urgent')}><div className="kl">Urgent</div><div className="kv">{urgent.length}</div></div>
    </div>
    <button className="btn bp" style={{width:'100%',justifyContent:'center',padding:'12px',fontSize:13,marginBottom:16}} onClick={onNewJob}>+ New Job</button>
    {filter&&filteredJobs&&<>
      <div className="filter-bar">
        <div className="filter-label">▸ {filterLabel} ({filteredJobs.length})</div>
        <div className="filter-clear" onClick={()=>setFilter(null)}>✕ Clear</div>
      </div>
      {filteredJobs.map(j=><JobCard key={j.id} j={j} onEdit={onEditJob} onDelete={onDeleteJob}/>)}
      {!filteredJobs.length&&<div className="empty"><div className="ei">✅</div>No {filterLabel.toLowerCase()}</div>}
    </>}
    {!filter&&<>
      {active.length>0&&<>
        <div className="mob-section"><div className="mob-section-title">In Progress / Dispatched</div><div className="mob-section-count">{active.length} jobs</div></div>
        {active.map(j=><JobCard key={j.id} j={j} onEdit={onEditJob} onDelete={onDeleteJob}/>)}
      </>}
      {todayJobs.length>0&&<>
        <div className="mob-section"><div className="mob-section-title">Scheduled Today</div><div className="mob-section-count">{todayJobs.length} jobs</div></div>
        {todayJobs.filter(j=>!['In Progress','Dispatched'].includes(j.status)).map(j=><JobCard key={j.id} j={j} onEdit={onEditJob} onDelete={onDeleteJob}/>)}
      </>}
      {!active.length&&!todayJobs.length&&<div className="empty" style={{marginTop:20}}><div className="ei">✅</div>No active or scheduled jobs today</div>}
    </>}
  </>);
}

function DashJobTile({j,onClick}){
  const sc=(j.status||'Pending').replace(' ','');
  const border=sc==='InProgress'?'var(--am)':sc==='Dispatched'?'var(--ac)':sc==='Complete'?'var(--gr)':'var(--txd)';
  const priorityCfg = PRIORITY_CONFIG[j.priority] || PRIORITY_CONFIG.Normal;
  return(
    <div onClick={()=>onClick(j)} style={{background:'var(--sur)',border:`1px solid ${j.priority==='Urgent'?'rgba(255,77,106,0.3)':j.priority==='High'?'rgba(255,176,32,0.25)':'var(--bdr)'}`,borderRadius:8,padding:'12px 14px',cursor:'pointer',position:'relative',overflow:'hidden',transition:'border-color .15s'}} onMouseEnter={e=>e.currentTarget.style.borderColor=border} onMouseLeave={e=>e.currentTarget.style.borderColor=j.priority==='Urgent'?'rgba(255,77,106,0.3)':j.priority==='High'?'rgba(255,176,32,0.25)':'var(--bdr)'}>
      <div style={{position:'absolute',left:0,top:0,bottom:0,width:3,background:j.priority==='Urgent'?'var(--rd)':j.priority==='High'?'var(--am)':border}}/>
      <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:9,color:'var(--ac)',letterSpacing:1,marginBottom:4}}>{j.job_id}</div>
      <div style={{fontSize:13,fontWeight:600,marginBottom:2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{j.customer||'—'}</div>
      <div style={{fontSize:11,color:'var(--txd)',marginBottom:8,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{j.equipment||'—'}</div>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:4}}>
        <StBadge s={j.status}/>
        {j.priority && j.priority !== 'Normal' && <PriorityBadge p={j.priority}/>}
      </div>
      {j.technician&&<div style={{marginTop:6,fontSize:10,color:'var(--txm)',fontFamily:"'IBM Plex Mono',monospace"}}>👤 {j.technician}</div>}
      {j.date&&<div style={{fontSize:10,color:'var(--txm)',fontFamily:"'IBM Plex Mono',monospace",marginTop:2}}>📅 {j.date}</div>}
      {j.followup&&<div style={{marginTop:6}}><FollowupPill job={j}/></div>}
    </div>
  );
}

function DashCalendar({jobs}){
  const now=new Date();
  const [vd,setVd]=useState(new Date(now.getFullYear(),now.getMonth(),1));
  const dim=new Date(vd.getFullYear(),vd.getMonth()+1,0).getDate();
  const fd=new Date(vd.getFullYear(),vd.getMonth(),1).getDay();
  const days=['Su','Mo','Tu','We','Th','Fr','Sa'];
  const jobsFor=d=>{
    const s=`${vd.getFullYear()}-${String(vd.getMonth()+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    return jobs.filter(j=>j.date===s);
  };
  const cells=[...Array(fd).fill(null),...Array.from({length:dim},(_,i)=>i+1)];
  return(
    <div style={{background:'var(--sur)',border:'1px solid var(--bdr)',borderRadius:6,overflow:'hidden',display:'flex',flexDirection:'column',height:'100%'}}>
      <div style={{padding:'10px 14px',borderBottom:'1px solid var(--bdr)',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
        <div style={{fontFamily:"'Rajdhani',sans-serif",fontWeight:600,fontSize:12,letterSpacing:1,textTransform:'uppercase',color:'var(--txm)'}}>
          {vd.toLocaleString('default',{month:'long',year:'numeric'})}
        </div>
        <div style={{display:'flex',gap:6}}>
          <button className="btn bg bs" onClick={()=>setVd(new Date(vd.getFullYear(),vd.getMonth()-1,1))}>‹</button>
          <button className="btn bg bs" onClick={()=>setVd(new Date(now.getFullYear(),now.getMonth(),1))}>●</button>
          <button className="btn bg bs" onClick={()=>setVd(new Date(vd.getFullYear(),vd.getMonth()+1,1))}>›</button>
        </div>
      </div>
      <div style={{flex:1,overflow:'auto',padding:'8px'}}>
        <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:2,marginBottom:2}}>
          {days.map(d=><div key={d} style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:8,color:'var(--txd)',textAlign:'center',padding:'2px 0',letterSpacing:1}}>{d}</div>)}
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:2}}>
          {cells.map((d,i)=>{
            if(!d) return <div key={'e'+i}/>;
            const isToday=d===now.getDate()&&vd.getMonth()===now.getMonth()&&vd.getFullYear()===now.getFullYear();
            const dj=jobsFor(d);
            return(
              <div key={d} style={{minHeight:52,background:isToday?'rgba(0,200,255,0.06)':'var(--sur2)',border:`1px solid ${isToday?'var(--ac)':'var(--bdr)'}`,borderRadius:3,padding:'3px 2px'}}>
                <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:8,color:isToday?'var(--ac)':'var(--txm)',fontWeight:isToday?700:400,marginBottom:2,textAlign:'center'}}>{d}</div>
                {dj.slice(0,2).map(j=>(
                  <div key={j.id} style={{fontSize:7,padding:'1px 3px',borderRadius:2,marginBottom:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',
                    background:j.status==='In Progress'?'var(--amd)':j.status==='Dispatched'?'var(--acd)':j.status==='Complete'?'var(--grd)':'rgba(90,106,128,0.15)',
                    color:j.status==='In Progress'?'var(--am)':j.status==='Dispatched'?'var(--ac)':j.status==='Complete'?'var(--gr)':'var(--txd)'
                  }} title={j.customer}>{j.customer}</div>
                ))}
                {dj.length>2&&<div style={{fontSize:7,color:'var(--txd)',textAlign:'center'}}>+{dj.length-2}</div>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Dashboard({jobs,onEditJob}){
  const [viewJob,setViewJob]=useState(null);
  const boardJobs=jobs.filter(j=>!(['Invoiced','Paid'].includes(j.invoice_status)));
  const groups=[
    {label:'Pending',color:'var(--txd)',jobs:boardJobs.filter(j=>j.status==='Pending')},
    {label:'Dispatched',color:'var(--ac)',jobs:boardJobs.filter(j=>j.status==='Dispatched')},
    {label:'In Progress',color:'var(--am)',jobs:boardJobs.filter(j=>j.status==='In Progress')},
    {label:'Complete',color:'var(--gr)',jobs:boardJobs.filter(j=>j.status==='Complete')},
  ];
  return(<>
    <DailyFocusPanel jobs={jobs} onEditJob={(j)=>{setViewJob(null);onEditJob(j);}}/>
    <div style={{display:'flex',gap:16,alignItems:'flex-start'}}>
      {/* Job board — left, takes most of the space */}
      <div style={{flex:1,minWidth:0}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
          <div style={{fontFamily:"'Rajdhani',sans-serif",fontWeight:600,fontSize:13,letterSpacing:1,textTransform:'uppercase',color:'var(--txm)'}}>Job Board <span style={{color:'var(--ac)',marginLeft:8}}>{boardJobs.length} active</span></div>
          <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:'var(--txd)'}}>Invoiced/Paid jobs removed</div>
        </div>
        {groups.map(g=>(
          <div key={g.label} style={{marginBottom:20}}>
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
              <div style={{width:3,height:14,borderRadius:2,background:g.color}}/>
              <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:'var(--txm)',letterSpacing:2,textTransform:'uppercase'}}>{g.label}</div>
              <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:g.color}}>{g.jobs.length}</div>
            </div>
            {g.jobs.length===0&&<div style={{padding:'10px 14px',background:'var(--sur)',border:'1px solid var(--bdr)',borderRadius:6,fontSize:12,color:'var(--txd)'}}>No {g.label.toLowerCase()} jobs</div>}
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',gap:10}}>
              {g.jobs.map(j=><DashJobTile key={j.id} j={j} onClick={setViewJob}/>)}
            </div>
          </div>
        ))}
        {!boardJobs.length&&<div className="empty"><div className="ei">🎉</div>All jobs invoiced!</div>}
      </div>
      {/* Calendar — right side panel, fixed width */}
      <div style={{width:280,flexShrink:0,position:'sticky',top:0,height:'calc(100vh - 140px)'}}>
        <DashCalendar jobs={jobs}/>
      </div>
    </div>
    {viewJob&&<JobDetailModal job={viewJob} onClose={()=>setViewJob(null)} onEdit={(j)=>{setViewJob(null);onEditJob(j);}}/>}
  </>);
}

// ── Job Form Modal (with follow-up fields) ────────────────────────────────────
function JobFormModal({job,customers,technicians,onSave,onClose}){
  const [f,setF]=useState(job?{...job}:{job_id:'JO-'+Date.now().toString().slice(-4),status:'Pending',priority:'Normal',invoice_status:'Not Invoiced',followup:false});
  return(
    <Modal title={job?.id?'Edit Job':'New Job'} onClose={onClose} onSave={()=>onSave(f)} saveLabel={job?.id?'Save Changes':'Create Job'}>
      <div className="fr">
        <div className="fg"><label className="fl">Job ID</label><input className="fi" value={f.job_id||''} onChange={e=>setF({...f,job_id:e.target.value})}/></div>
        <div className="fg"><label className="fl">Status</label><select className="fsl" value={f.status||'Pending'} onChange={e=>setF({...f,status:e.target.value})}><option>Pending</option><option>Dispatched</option><option>In Progress</option><option>Complete</option></select></div>
      </div>
      <div className="fg"><label className="fl">Customer</label>
        <select className="fsl" value={f.customer||''} onChange={e=>setF({...f,customer:e.target.value})}>
          <option value="">Select customer...</option>
          {[...customers].sort((a,b)=>(a.company||'').localeCompare(b.company||'')).map(c=><option key={c.id}>{c.company}</option>)}
        </select>
      </div>
      <div className="fg"><label className="fl">Equipment</label><input className="fi" placeholder="e.g. DWX-52D" value={f.equipment||''} onChange={e=>setF({...f,equipment:e.target.value})}/></div>
      <div className="fr">
        <div className="fg"><label className="fl">Technician</label>
          <select className="fsl" value={f.technician||''} onChange={e=>setF({...f,technician:e.target.value})}>
            <option value="">Unassigned</option>
            {technicians.map(t=><option key={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div className="fg">
          <label className="fl">Priority</label>
          <select className="fsl" value={f.priority||'Normal'} onChange={e=>setF({...f,priority:e.target.value})}
            style={{color:f.priority==='Urgent'?'var(--rd)':f.priority==='High'?'var(--am)':f.priority==='Low'?'var(--txd)':'var(--tx)',borderColor:f.priority==='Urgent'?'rgba(255,77,106,0.4)':f.priority==='High'?'rgba(255,176,32,0.3)':'var(--bdr)'}}>
            <option value="Low">🔵 Low</option>
            <option value="Normal">⚪ Normal</option>
            <option value="High">🟡 High</option>
            <option value="Urgent">🔴 Urgent</option>
          </select>
        </div>
      </div>
      <div className="fr">
        <div className="fg"><label className="fl">Date</label><input className="fi" type="date" value={f.date||''} onChange={e=>setF({...f,date:e.target.value})}/></div>
        <div className="fg"><label className="fl">Amount ($)</label><input className="fi" type="number" value={f.amount||''} onChange={e=>setF({...f,amount:e.target.value})}/></div>
      </div>
      <div className="fg"><label className="fl">Invoice Status</label><select className="fsl" value={f.invoice_status||'Not Invoiced'} onChange={e=>setF({...f,invoice_status:e.target.value})}><option>Not Invoiced</option><option>Invoiced</option><option>Paid</option><option>Overdue</option></select></div>
      <div className="fg"><label className="fl">Notes</label><textarea className="fta" value={f.notes||''} onChange={e=>setF({...f,notes:e.target.value})}/></div>

      {/* ── Follow-up section ── */}
      <div style={{borderTop:'1px solid var(--bdr)',paddingTop:14,marginTop:4}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:f.followup?12:0}}>
          <label className="fl" style={{margin:0,cursor:'pointer',display:'flex',alignItems:'center',gap:8}}>
            <input type="checkbox" checked={!!f.followup} onChange={e=>setF({...f,followup:e.target.checked,followup_date:e.target.checked?(f.followup_date||new Date(Date.now()+86400000*3).toISOString().split('T')[0]):null})}
              style={{width:16,height:16,accentColor:'var(--gr)',cursor:'pointer'}}/>
            <span style={{color:'var(--gr)'}}>📞 Needs Follow-up</span>
          </label>
          {f.followup && <span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:9,color:'var(--txd)'}}>FOLLOW-UP DETAILS</span>}
        </div>
        {f.followup && (
          <div style={{background:'rgba(34,212,122,0.05)',border:'1px solid rgba(34,212,122,0.2)',borderRadius:6,padding:'12px',marginTop:8}}>
            <div className="fr">
              <div className="fg" style={{marginBottom:0}}>
                <label className="fl">Follow-up Date</label>
                <input className="fi" type="date" value={f.followup_date||''} onChange={e=>setF({...f,followup_date:e.target.value})}/>
              </div>
              <div className="fg" style={{marginBottom:0}}>
                <label className="fl">Reason / Action</label>
                <input className="fi" placeholder="e.g. Call re: quote, Part arrived..." value={f.followup_note||''} onChange={e=>setF({...f,followup_note:e.target.value})}/>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ── Follow-ups Page ───────────────────────────────────────────────────────────
function Followups({ jobs, onEdit, loading }) {
  const [viewJob, setViewJob] = useState(null);

  const followupJobs = jobs
    .filter(j => j.followup && j.status !== 'Complete' && !isArchived(j))
    .sort((a,b) => new Date(a.followup_date||'9999') - new Date(b.followup_date||'9999'));

  const overdue = followupJobs.filter(isFollowupOverdue);
  const today = followupJobs.filter(j => !isFollowupOverdue(j) && daysUntilFollowup(j) === 0);
  const upcoming = followupJobs.filter(j => !isFollowupOverdue(j) && daysUntilFollowup(j) > 0);

  const renderGroup = (label, items, cardClass) => {
    if (!items.length) return null;
    return (
      <div style={{marginBottom:20}}>
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
          <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:'var(--txm)',letterSpacing:2,textTransform:'uppercase'}}>{label}</div>
          <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:cardClass==='overdue'?'var(--rd)':cardClass==='today'?'var(--am)':'var(--ac)'}}>{items.length}</div>
        </div>
        {items.map(j => {
          const days = daysUntilFollowup(j);
          return (
            <div key={j.id} className={`followup-card ${cardClass}`} onClick={() => setViewJob(j)} style={{cursor:'pointer'}}>
              <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:10}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:9,color:'var(--ac)',marginBottom:3}}>{j.job_id}</div>
                  <div style={{fontSize:15,fontWeight:600,marginBottom:2}}>{j.customer}</div>
                  <div style={{fontSize:12,color:'var(--txd)',marginBottom:8}}>{j.equipment||'—'}</div>
                  {j.followup_note && <div style={{fontSize:13,color:'var(--tx)',background:'var(--sur2)',padding:'8px 10px',borderRadius:4,border:'1px solid var(--bdr)',lineHeight:1.5}}>📞 {j.followup_note}</div>}
                </div>
                <div style={{textAlign:'right',flexShrink:0}}>
                  <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:11,fontWeight:700,color:cardClass==='overdue'?'var(--rd)':cardClass==='today'?'var(--am)':'var(--ac)',marginBottom:6}}>
                    {cardClass==='overdue'?`${Math.abs(days)}d overdue`:cardClass==='today'?'Today':`${days}d away`}
                  </div>
                  <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:'var(--txd)',marginBottom:6}}>{j.followup_date}</div>
                  <StBadge s={j.status}/>
                </div>
              </div>
              <div style={{display:'flex',gap:8,marginTop:12,paddingTop:10,borderTop:'1px solid var(--bdr)'}}>
                <button className="btn bfollowup bs" style={{flex:1}} onClick={e=>{e.stopPropagation();onEdit(j);}}>✏️ Edit Job</button>
                <button className="btn bg bs" onClick={e=>{e.stopPropagation();onEdit({...j,followup:false,followup_date:null,followup_note:null});}}>✓ Mark Done</button>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (<>
    <div className="panel">
      <div className="ph">
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <div className="pt">Follow-ups</div>
          {overdue.length > 0 && <span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:9,color:'var(--rd)',background:'var(--rdd)',border:'1px solid rgba(255,77,106,0.3)',padding:'2px 7px',borderRadius:3}}>⚠ {overdue.length} OVERDUE</span>}
        </div>
        <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:'var(--txd)'}}>{followupJobs.length} total</div>
      </div>
      <div style={{padding:16}}>
        {loading ? <Loading/> : <>
          {!followupJobs.length && <div className="empty"><div className="ei">✅</div>No follow-ups needed right now.<br/>Flag jobs with "Needs Follow-up" when editing them.</div>}
          {renderGroup('⚠ Overdue', overdue, 'overdue')}
          {renderGroup('📅 Due Today', today, 'today')}
          {renderGroup('📆 Upcoming', upcoming, 'upcoming')}
        </>}
      </div>
    </div>
    {viewJob && <JobDetailModal job={viewJob} onClose={()=>setViewJob(null)} onEdit={(j)=>{setViewJob(null);onEdit(j);}}/>}
  </>);
}

function Jobs({jobs,customers,technicians,onAdd,onEdit,onDelete,loading}){
  const [editJob,setEditJob]=useState(null);
  const [showForm,setShowForm]=useState(false);
  const [viewJob,setViewJob]=useState(null);
  const [search,setSearch]=useState('');
  const [clientFilter,setClientFilter]=useState('');

  const clients=[...new Set(jobs.map(j=>j.customer).filter(Boolean))].sort();
  const filtered=[...jobs].reverse().filter(j=>{
    const q=search.toLowerCase();
    const matchSearch=!q||(j.customer||'').toLowerCase().includes(q)||(j.equipment||'').toLowerCase().includes(q)||(j.notes||'').toLowerCase().includes(q)||(j.job_id||'').toLowerCase().includes(q);
    const matchClient=!clientFilter||j.customer===clientFilter;
    return matchSearch&&matchClient;
  });

  const save=(f)=>{editJob?.id?onEdit({...f}):onAdd({...f});setShowForm(false);setEditJob(null);};
  const openEdit=(j)=>{setEditJob(j);setShowForm(true);};
  const openNew=()=>{setEditJob(null);setShowForm(true);};

  return(<>
    <div className="panel desktop-table">
      <div className="ph">
        <div className="pt">Jobs ({filtered.length}{filtered.length!==jobs.length?` of ${jobs.length}`:''})</div>
        <button className="btn bp bs" onClick={openNew}>+ New Job</button>
      </div>
      <div style={{padding:'10px 16px',borderBottom:'1px solid var(--bdr)',display:'flex',gap:10}}>
        <input className="fi" placeholder="🔍 Search jobs, equipment, notes..." value={search} onChange={e=>setSearch(e.target.value)} style={{marginBottom:0,flex:2}}/>
        <select className="fsl" value={clientFilter} onChange={e=>setClientFilter(e.target.value)} style={{flex:1}}>
          <option value="">All clients</option>
          {clients.map(c=><option key={c}>{c}</option>)}
        </select>
      </div>
      {loading?<Loading/>:<div className="tbl">
        <div className="tr hdr" style={{gridTemplateColumns:'90px 1fr 110px 90px 80px 100px 80px 70px'}}>
          <div className="cl">ID</div><div className="cl">Customer/Equip</div><div className="cl">Technician</div><div className="cl">Date</div><div className="cl">Amount</div><div className="cl">Priority</div><div className="cl">Status</div><div className="cl">Act.</div>
        </div>
        {filtered.map(j=>(
          <div key={j.id} className="tr" style={{gridTemplateColumns:'90px 1fr 110px 90px 80px 100px 80px 70px',borderLeft:j.priority==='Urgent'?'2px solid var(--rd)':j.priority==='High'?'2px solid var(--am)':'2px solid transparent'}} onClick={()=>setViewJob(j)}>
            <div className="ci">{j.job_id}</div>
            <div>
              <div className="cm">{j.customer||'—'}</div>
              <div className="cs">{j.equipment||'—'}</div>
              {j.followup && <FollowupPill job={j}/>}
            </div>
            <div className="cd">{j.technician||'—'}</div>
            <div className="cn">{j.date||'—'}</div>
            <div className="cv">{j.amount?'$'+j.amount:'—'}</div>
            <div><PriorityBadge p={j.priority}/></div>
            <div><StBadge s={j.status}/></div>
            <div style={{display:'flex',gap:4}} onClick={e=>e.stopPropagation()}>
              <button className="btn bg bs" onClick={()=>openEdit(j)}>✏️</button>
              <button className="btn bd bs" onClick={()=>onDelete(j.id)}>🗑</button>
            </div>
          </div>
        ))}
        {!filtered.length&&<div className="empty"><div className="ei">📋</div>{search||clientFilter?'No jobs match your search.':'No jobs yet!'}</div>}
      </div>}
    </div>
    <div className="mobile-cards">
      <button className="btn bp" style={{width:'100%',justifyContent:'center',padding:'12px',fontSize:13,marginBottom:16}} onClick={openNew}>+ New Job</button>
      {loading?<Loading/>:[...jobs].reverse().map(j=><JobCard key={j.id} j={j} onEdit={openEdit} onDelete={onDelete}/>)}
      {!loading&&!jobs.length&&<div className="empty"><div className="ei">📋</div>No jobs yet!</div>}
    </div>
    {showForm&&<JobFormModal job={editJob} customers={customers} technicians={technicians} onSave={save} onClose={()=>{setShowForm(false);setEditJob(null);}}/>}
    {viewJob&&<JobDetailModal job={viewJob} onClose={()=>setViewJob(null)} onEdit={(j)=>{setViewJob(null);openEdit(j);}}/>}
  </>);
}

function Customers({customers,jobs,onAdd,onEdit,onDelete,loading}){
  const [form,setForm]=useState(null);
  const [f,setF]=useState({});
  const [search,setSearch]=useState('');
  const [expanded,setExpanded]=useState(null);
  const [viewJob,setViewJob]=useState(null);
  const filtered=[...customers].sort((a,b)=>(a.company||'').localeCompare(b.company||'')).filter(c=>
    (c.company||'').toLowerCase().includes(search.toLowerCase())||
    (c.contact||'').toLowerCase().includes(search.toLowerCase())||
    (c.email||'').toLowerCase().includes(search.toLowerCase())||
    (c.phone||'').toLowerCase().includes(search.toLowerCase())
  );
  const open=(c)=>{setF(c?{...c}:{});setForm(c||{});};
  const save=()=>{form?.id?onEdit({...f}):onAdd({...f});setForm(null);};
  return(<>
    <div className="panel">
      <div className="ph"><div className="pt">Customers ({customers.length})</div><button className="btn bp bs" onClick={()=>open(null)}>+ New Customer</button></div>
      <div style={{padding:'10px 16px',borderBottom:'1px solid var(--bdr)'}}>
        <input className="fi" placeholder="🔍 Search customers..." value={search} onChange={e=>setSearch(e.target.value)} style={{marginBottom:0}}/>
      </div>
      {loading?<Loading/>:<div className="tbl">
        <div className="tr hdr" style={{gridTemplateColumns:'1fr 130px 60px 70px'}}>
          <div className="cl">Company/Contact</div><div className="cl">Phone</div><div className="cl">Jobs</div><div className="cl">Act.</div>
        </div>
        {filtered.map(c=>{
          const cJobs=jobs.filter(j=>j.customer===c.company);
          const isOpen=expanded===c.id;
          return(<>
            <div key={c.id} className="tr" style={{gridTemplateColumns:'1fr 130px 60px 70px',background:isOpen?'var(--sur2)':''}} onClick={()=>setExpanded(isOpen?null:c.id)}>
              <div><div className="cm">{c.company||'—'}</div><div className="cs">{c.contact||''}</div></div>
              <div className="cn">{c.phone||'—'}</div>
              <div style={{fontFamily:"'Rajdhani',sans-serif",fontWeight:600,color:'var(--ac)'}}>{cJobs.length}</div>
              <div style={{display:'flex',gap:4}} onClick={e=>e.stopPropagation()}>
                <button className="btn bg bs" onClick={()=>open(c)}>✏️</button>
                <button className="btn bd bs" onClick={()=>onDelete(c.id)}>🗑</button>
              </div>
            </div>
            {isOpen&&<div key={c.id+'-jobs'} style={{background:'var(--sur3)',borderBottom:'1px solid var(--bdr)',padding:'0 0 8px 0'}}>
              <div style={{padding:'8px 16px 4px',fontFamily:"'IBM Plex Mono',monospace",fontSize:9,color:'var(--txd)',letterSpacing:2,textTransform:'uppercase'}}>Job History — {c.company}</div>
              {cJobs.length===0&&<div style={{padding:'10px 16px',fontSize:12,color:'var(--txd)'}}>No jobs found for this customer.</div>}
              {cJobs.map(j=>(
                <div key={j.id} style={{display:'grid',gridTemplateColumns:'90px 1fr 100px 90px 80px',alignItems:'center',padding:'8px 16px',borderTop:'1px solid var(--bdr)',cursor:'pointer',transition:'background .1s'}} onClick={()=>setViewJob(j)} onMouseEnter={e=>e.currentTarget.style.background='var(--sur2)'} onMouseLeave={e=>e.currentTarget.style.background=''}>
                  <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:11,color:'var(--ac)'}}>{j.job_id}</div>
                  <div><div style={{fontSize:12,fontWeight:500}}>{j.equipment||'—'}</div><div style={{fontSize:11,color:'var(--txd)'}}>{j.technician||'Unassigned'}</div></div>
                  <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:'var(--txm)'}}>{j.date||'—'}</div>
                  <div style={{fontFamily:"'Rajdhani',sans-serif",fontWeight:600,fontSize:13}}>{j.amount?'$'+j.amount:'—'}</div>
                  <div><span className={"st "+(j.status||'Pending').replace(' ','')}>{j.status||'Pending'}</span></div>
                </div>
              ))}
            </div>}
          </>);
        })}
        {!customers.length&&<div className="empty"><div className="ei">🏢</div>No customers yet.</div>}
      </div>}
    </div>
    {viewJob&&<JobDetailModal job={viewJob} onClose={()=>setViewJob(null)}/>}
    {form!==null&&(
      <Modal title={form?.id?'Edit Customer':'New Customer'} onClose={()=>setForm(null)} onSave={save} saveLabel={form?.id?'Save Changes':'Add Customer'}>
        <div className="fg"><label className="fl">Company Name</label><input className="fi" value={f.company||''} onChange={e=>setF({...f,company:e.target.value})}/></div>
        <div className="fr">
          <div className="fg"><label className="fl">Contact Name</label><input className="fi" value={f.contact||''} onChange={e=>setF({...f,contact:e.target.value})}/></div>
          <div className="fg"><label className="fl">Phone</label><input className="fi" value={f.phone||''} onChange={e=>setF({...f,phone:e.target.value})}/></div>
        </div>
        <div className="fg"><label className="fl">Email</label><input className="fi" type="email" value={f.email||''} onChange={e=>setF({...f,email:e.target.value})}/></div>
        <div className="fg"><label className="fl">Address</label><textarea className="fta" style={{minHeight:55}} value={f.address||''} onChange={e=>setF({...f,address:e.target.value})}/></div>
        <div className="fg"><label className="fl">Notes</label><textarea className="fta" value={f.notes||''} onChange={e=>setF({...f,notes:e.target.value})}/></div>
      </Modal>
    )}
  </>);
}

function Technicians({technicians,onAdd,onEdit,onDelete,loading}){
  const [form,setForm]=useState(null);
  const [f,setF]=useState({});
  const open=(t)=>{setF(t?{...t}:{status:'Available'});setForm(t||{});};
  const save=()=>{const ini=(f.name||'').split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);form?.id?onEdit({...f,initials:ini}):onAdd({...f,initials:ini});setForm(null);};
  return(<>
    <div className="panel">
      <div className="ph"><div className="pt">Technicians ({technicians.length})</div><button className="btn bp bs" onClick={()=>open(null)}>+ Add Technician</button></div>
      {loading?<Loading/>:<div className="tgrid">
        {technicians.map(t=>(
          <div key={t.id} className="tc">
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
              <div className={"tav "+(t.status||'Offline')}>{(t.initials||(t.name||'?').substring(0,2)).toUpperCase()}</div>
              <div><div style={{fontSize:13,fontWeight:500}}>{t.name}</div><StBadge s={t.status}/></div>
            </div>
            <div style={{fontSize:11,color:'var(--txd)',marginBottom:3,fontFamily:"'IBM Plex Mono',monospace"}}>📧 {t.email||'—'}</div>
            <div style={{fontSize:11,color:'var(--txd)',marginBottom:3,fontFamily:"'IBM Plex Mono',monospace"}}>📞 {t.phone||'—'}</div>
            <div style={{fontSize:11,color:'var(--txd)',fontFamily:"'IBM Plex Mono',monospace"}}>🔧 {t.current_job||'No active job'}</div>
            <div style={{display:'flex',gap:6,marginTop:10}}>
              <button className="btn bg bs" style={{flex:1}} onClick={()=>open(t)}>✏️ Edit</button>
              <button className="btn bd bs" onClick={()=>onDelete(t.id)}>🗑</button>
            </div>
          </div>
        ))}
        {!technicians.length&&<div className="empty" style={{gridColumn:'1/-1'}}><div className="ei">👷</div>No technicians yet.</div>}
      </div>}
    </div>
    {form!==null&&(
      <Modal title={form?.id?'Edit Technician':'New Technician'} onClose={()=>setForm(null)} onSave={save} saveLabel={form?.id?'Save Changes':'Add Technician'}>
        <div className="fr">
          <div className="fg"><label className="fl">Full Name</label><input className="fi" value={f.name||''} onChange={e=>setF({...f,name:e.target.value})}/></div>
          <div className="fg"><label className="fl">Status</label><select className="fsl" value={f.status||'Available'} onChange={e=>setF({...f,status:e.target.value})}><option>Available</option><option>Busy</option><option>Offline</option></select></div>
        </div>
        <div className="fr">
          <div className="fg"><label className="fl">Email</label><input className="fi" type="email" value={f.email||''} onChange={e=>setF({...f,email:e.target.value})}/></div>
          <div className="fg"><label className="fl">Phone</label><input className="fi" value={f.phone||''} onChange={e=>setF({...f,phone:e.target.value})}/></div>
        </div>
        <div className="fg"><label className="fl">Current Job</label><input className="fi" value={f.current_job||''} onChange={e=>setF({...f,current_job:e.target.value})}/></div>
      </Modal>
    )}
  </>);
}

function Schedule({jobs}){
  const now=new Date();
  const [vd,setVd]=useState(new Date(now.getFullYear(),now.getMonth(),1));
  const dim=new Date(vd.getFullYear(),vd.getMonth()+1,0).getDate();
  const fd=new Date(vd.getFullYear(),vd.getMonth(),1).getDay();
  const days=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const jobsFor=d=>{const s=`${vd.getFullYear()}-${String(vd.getMonth()+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;return jobs.filter(j=>j.date===s);};
  const cells=[...Array(fd).fill(null),...Array.from({length:dim},(_,i)=>i+1)];
  return(
    <div className="panel">
      <div className="ph">
        <div className="pt">Schedule — {vd.toLocaleString('default',{month:'long',year:'numeric'})}</div>
        <div style={{display:'flex',gap:8}}>
          <button className="btn bg bs" onClick={()=>setVd(new Date(vd.getFullYear(),vd.getMonth()-1,1))}>‹</button>
          <button className="btn bg bs" onClick={()=>setVd(new Date(vd.getFullYear(),vd.getMonth()+1,1))}>›</button>
        </div>
      </div>
      <div className="cg">
        {days.map(d=><div key={d} className="cdl">{d}</div>)}
        {cells.map((d,i)=>{
          if(!d)return<div key={"e"+i}/>;
          const isToday=d===now.getDate()&&vd.getMonth()===now.getMonth()&&vd.getFullYear()===now.getFullYear();
          const dj=jobsFor(d);
          return(<div key={d} className={"cd2 "+(isToday?'today':'')}>
            <div className={"cdn "+(isToday?'tn':'')}>{d}</div>
            {dj.map(j=><div key={j.id} className={"cj "+(j.status||'Pending').replace(' ','')} title={j.job_id}>{j.customer||j.job_id}</div>)}
          </div>);
        })}
      </div>
    </div>
  );
}

function Files({files, onUpload, onDelete, uploading}) {
  const [viewing, setViewing] = useState(null);
  const [search, setSearch] = useState('');
  const fileRef = useRef(null);

  const filtered = files.filter(f =>
    (f.name||'').toLowerCase().includes(search.toLowerCase()) ||
    (f.tag||'').toLowerCase().includes(search.toLowerCase())
  );

  const fmt = (bytes) => {
    if (!bytes) return '—';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024*1024) return Math.round(bytes/1024) + ' KB';
    return (bytes/(1024*1024)).toFixed(1) + ' MB';
  };

  const fmtDate = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-CA');
  };

  return (<>
    <div className="panel">
      <div className="ph">
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <div className="pt">Files</div>
          <span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:9,color:'var(--txd)',letterSpacing:1,background:'var(--sur2)',border:'1px solid var(--bdr)',padding:'2px 7px',borderRadius:3}}>REFERENCE DOCS</span>
        </div>
        <button className="btn bimport" onClick={()=>fileRef.current?.click()} disabled={uploading} style={{fontSize:11}}>
          {uploading ? '⏳ Uploading...' : '⬆ Upload PDF'}
        </button>
        <input ref={fileRef} type="file" accept="application/pdf" multiple style={{display:'none'}} onChange={e=>onUpload([...e.target.files]).then(()=>e.target.value='')}/>
      </div>
      <div style={{padding:'10px 16px',borderBottom:'1px solid var(--bdr)'}}>
        <input className="fi" placeholder="🔍 Search files..." value={search} onChange={e=>setSearch(e.target.value)} style={{marginBottom:0}}/>
      </div>
      <div className="tbl">
        <div className="tr hdr" style={{gridTemplateColumns:'28px 1fr 80px 90px 70px'}}>
          <div className="cl"/>
          <div className="cl">File Name</div>
          <div className="cl">Size</div>
          <div className="cl">Uploaded</div>
          <div className="cl">Act.</div>
        </div>
        {filtered.map(f=>(
          <div key={f.id} className="tr" style={{gridTemplateColumns:'28px 1fr 80px 90px 70px'}} onClick={()=>setViewing(f)}>
            <div style={{fontSize:18,lineHeight:1}}>📄</div>
            <div>
              <div className="cm" style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{f.name||'Unnamed'}</div>
              {f.tag&&<div className="cs">{f.tag}</div>}
            </div>
            <div className="cn">{fmt(f.size)}</div>
            <div className="cn">{fmtDate(f.created_at)}</div>
            <div style={{display:'flex',gap:4}} onClick={e=>e.stopPropagation()}>
              <button className="btn bg bs" onClick={()=>setViewing(f)} title="View">👁</button>
              <button className="btn bd bs" onClick={()=>onDelete(f)}>🗑</button>
            </div>
          </div>
        ))}
        {!filtered.length&&!uploading&&(
          <div className="empty">
            <div className="ei">📁</div>
            {search ? 'No files match your search.' : 'No files yet — upload a PDF to get started.'}
          </div>
        )}
        {uploading&&<div className="loading"><div className="spin"/>Uploading...</div>}
      </div>
    </div>
    {viewing&&(
      <div className="mbg" onClick={()=>setViewing(null)}>
        <div style={{background:'var(--sur)',border:'1px solid var(--bdr2)',borderRadius:8,width:'100%',maxWidth:860,height:'88vh',display:'flex',flexDirection:'column'}} onClick={e=>e.stopPropagation()}>
          <div className="mh">
            <div>
              <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:9,color:'var(--txd)',letterSpacing:2,marginBottom:3}}>REFERENCE FILE</div>
              <div className="mt" style={{fontSize:13}}>{viewing.name}</div>
            </div>
            <div style={{display:'flex',gap:8,alignItems:'center'}}>
              <a href={viewing.url} target="_blank" rel="noreferrer" className="btn bg bs" style={{textDecoration:'none',fontSize:11}} onClick={e=>e.stopPropagation()}>⬇ Download</a>
              <button className="mc" onClick={()=>setViewing(null)}>×</button>
            </div>
          </div>
          <div style={{flex:1,overflow:'hidden',borderRadius:'0 0 8px 8px'}}>
            <iframe src={viewing.url + '#toolbar=1&navpanes=0'} style={{width:'100%',height:'100%',border:'none',borderRadius:'0 0 8px 8px'}} title={viewing.name}/>
          </div>
        </div>
      </div>
    )}
  </>);
}

function Archive({jobs,onEdit,onDelete,loading}){
  const [viewJob,setViewJob]=useState(null);
  const [search,setSearch]=useState('');
  const [clientFilter,setClientFilter]=useState('');
  const archived=jobs.filter(isArchived);
  const clients=[...new Set(archived.map(j=>j.customer).filter(Boolean))].sort();
  const filtered=[...archived].sort((a,b)=>new Date(b.date)-new Date(a.date)).filter(j=>{
    const q=search.toLowerCase();
    const matchSearch=!q||(j.customer||'').toLowerCase().includes(q)||(j.equipment||'').toLowerCase().includes(q)||(j.notes||'').toLowerCase().includes(q)||(j.job_id||'').toLowerCase().includes(q);
    const matchClient=!clientFilter||j.customer===clientFilter;
    return matchSearch&&matchClient;
  });
  return(<>
    <div className="panel desktop-table">
      <div className="ph">
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <div className="pt">Archive</div>
          <span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:9,color:'var(--txd)',letterSpacing:1,background:'var(--sur2)',border:'1px solid var(--bdr)',padding:'2px 7px',borderRadius:3}}>COMPLETE &gt; 30 DAYS</span>
        </div>
        <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:'var(--txd)'}}>{filtered.length} jobs</div>
      </div>
      <div style={{padding:'10px 16px',borderBottom:'1px solid var(--bdr)',display:'flex',gap:10}}>
        <input className="fi" placeholder="🔍 Search archived jobs..." value={search} onChange={e=>setSearch(e.target.value)} style={{marginBottom:0,flex:2}}/>
        <select className="fsl" value={clientFilter} onChange={e=>setClientFilter(e.target.value)} style={{flex:1}}>
          <option value="">All clients</option>
          {clients.map(c=><option key={c}>{c}</option>)}
        </select>
      </div>
      {loading?<Loading/>:<div className="tbl">
        <div className="tr hdr" style={{gridTemplateColumns:'90px 1fr 110px 90px 80px 70px'}}>
          <div className="cl">ID</div><div className="cl">Customer/Equip</div><div className="cl">Technician</div><div className="cl">Date</div><div className="cl">Amount</div><div className="cl">Act.</div>
        </div>
        {filtered.map(j=>(
          <div key={j.id} className="tr" style={{gridTemplateColumns:'90px 1fr 110px 90px 80px 70px',opacity:.8}} onClick={()=>setViewJob(j)}>
            <div className="ci" style={{color:'var(--txd)'}}>{j.job_id}</div>
            <div><div className="cm" style={{color:'var(--txm)'}}>{j.customer||'—'}</div><div className="cs">{j.equipment||'—'}</div></div>
            <div className="cd">{j.technician||'—'}</div>
            <div className="cn">{j.date||'—'}</div>
            <div className="cv" style={{color:'var(--txm)'}}>{j.amount?'$'+j.amount:'—'}</div>
            <div style={{display:'flex',gap:4}} onClick={e=>e.stopPropagation()}>
              <button className="btn bg bs" onClick={()=>onEdit(j)}>✏️</button>
              <button className="btn bd bs" onClick={()=>onDelete(j.id)}>🗑</button>
            </div>
          </div>
        ))}
        {!filtered.length&&<div className="empty"><div className="ei">🗄</div>{search||clientFilter?'No archived jobs match.':'No archived jobs yet — completed jobs older than 30 days appear here.'}</div>}
      </div>}
    </div>
    {viewJob&&<JobDetailModal job={viewJob} onClose={()=>setViewJob(null)} onEdit={onEdit}/>}
  </>);
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App(){
  const [page,setPage]=useState('Dashboard');
  const [jobs,setJobs]=useState([]);
  const [customers,setCustomers]=useState([]);
  const [technicians,setTechnicians]=useState([]);
  const [files,setFiles]=useState([]);
  const [loading,setLoading]=useState({jobs:true,customers:true,technicians:true});
  const [filesLoading,setFilesLoading]=useState(false);
  const [fileUploading,setFileUploading]=useState(false);
  const [toast,setToast]=useState('');
  const [jobForm,setJobForm]=useState(null);
  const [showJobForm,setShowJobForm]=useState(false);
  const [showImport,setShowImport]=useState(false);

  const msg=useCallback((m)=>{setToast(m);setTimeout(()=>setToast(''),2500);},[]);

  const load=useCallback(async()=>{
    try{
      const [j,c,t,f]=await Promise.all([db.get('jobs'),db.get('customers'),db.get('technicians'),db.get('ref_files')]);
      setJobs(j||[]);setCustomers(c||[]);setTechnicians(t||[]);setFiles(f||[]);
    }catch(e){msg('⚠️ Could not connect to database.');}
    setLoading({jobs:false,customers:false,technicians:false});
  },[msg]);

  useEffect(()=>{load();},[load]);

  const addJob=async(f)=>{
    try{
      const r=await db.insert('jobs',{job_id:f.job_id,customer:f.customer,equipment:f.equipment,technician:f.technician,status:f.status,priority:f.priority,date:f.date,amount:f.amount,invoice_status:f.invoice_status,notes:f.notes,followup:f.followup||false,followup_date:f.followup_date||null,followup_note:f.followup_note||null});
      setJobs(p=>[...p,...(Array.isArray(r)?r:[r])]);msg('✅ Job saved!');
    }catch{msg('⚠️ Save failed.');}
  };

  const editJob=async(f)=>{
    try{
      await db.update('jobs',f.id,{job_id:f.job_id,customer:f.customer,equipment:f.equipment,technician:f.technician,status:f.status,priority:f.priority,date:f.date,amount:f.amount,invoice_status:f.invoice_status,notes:f.notes,followup:f.followup||false,followup_date:f.followup_date||null,followup_note:f.followup_note||null});
      setJobs(p=>p.map(x=>x.id===f.id?{...x,...f}:x));msg('✅ Updated!');
    }catch{msg('⚠️ Update failed.');}
  };

  const delJob=async(id)=>{if(!window.confirm('Delete this job?'))return;try{await db.delete('jobs',id);setJobs(p=>p.filter(x=>x.id!==id));msg('🗑 Deleted.');}catch{msg('⚠️ Delete failed.');}};

  const addCust=async(f)=>{try{const r=await db.insert('customers',{company:f.company,contact:f.contact,phone:f.phone,email:f.email,address:f.address,notes:f.notes});setCustomers(p=>[...p,...(Array.isArray(r)?r:[r])]);msg('✅ Customer saved!');}catch{msg('⚠️ Save failed.');}};
  const editCust=async(f)=>{try{await db.update('customers',f.id,{company:f.company,contact:f.contact,phone:f.phone,email:f.email,address:f.address,notes:f.notes});setCustomers(p=>p.map(x=>x.id===f.id?{...x,...f}:x));msg('✅ Updated!');}catch{msg('⚠️ Update failed.');}};
  const delCust=async(id)=>{if(!window.confirm('Delete?'))return;try{await db.delete('customers',id);setCustomers(p=>p.filter(x=>x.id!==id));msg('🗑 Deleted.');}catch{msg('⚠️ Delete failed.');}};

  const addTech=async(f)=>{try{const r=await db.insert('technicians',{name:f.name,initials:f.initials,email:f.email,phone:f.phone,status:f.status,current_job:f.current_job});setTechnicians(p=>[...p,...(Array.isArray(r)?r:[r])]);msg('✅ Technician saved!');}catch{msg('⚠️ Save failed.');}};
  const editTech=async(f)=>{try{await db.update('technicians',f.id,{name:f.name,initials:f.initials,email:f.email,phone:f.phone,status:f.status,current_job:f.current_job});setTechnicians(p=>p.map(x=>x.id===f.id?{...x,...f}:x));msg('✅ Updated!');}catch{msg('⚠️ Update failed.');}};
  const delTech=async(id)=>{if(!window.confirm('Delete?'))return;try{await db.delete('technicians',id);setTechnicians(p=>p.filter(x=>x.id!==id));msg('🗑 Deleted.');}catch{msg('⚠️ Delete failed.');}};

  const handleImport = async (toImport, setProgress) => {
    let count = 0;
    const newJobs = [];
    for (const job of toImport) {
      try {
        const jobId = 'PDF-' + Date.now().toString().slice(-5) + '-' + Math.floor(Math.random()*100);
        const r = await db.insert('jobs', {job_id:jobId,customer:job.customer,equipment:job.equipment,technician:'',status:job.status||'Complete',priority:'Normal',date:job.date,amount:null,invoice_status:'Not Invoiced',notes:job.notes,followup:false,followup_date:null,followup_note:null});
        if (Array.isArray(r)) newJobs.push(...r); else if (r?.id) newJobs.push(r);
        count++;
        setProgress(count);
        await new Promise(res => setTimeout(res, 80));
      } catch(e) {}
    }
    setJobs(p => [...p, ...newJobs]);
    msg(`✅ Imported ${count} jobs from PDF!`);
  };

  const uploadFiles = async (fileList) => {
    setFileUploading(true);
    try {
      for (const file of fileList) {
        const {url, name, size, path} = await storage.uploadFile(file);
        const r = await db.insert('ref_files', {name, url, size, storage_path: path});
        const rec = Array.isArray(r) ? r[0] : r;
        if (rec?.id) setFiles(p=>[...p, rec]);
      }
      msg(`✅ ${fileList.length} file${fileList.length>1?'s':''} uploaded!`);
    } catch(e) { msg('⚠️ Upload failed. Check storage bucket.'); }
    setFileUploading(false);
  };

  const deleteFile = async (f) => {
    if (!window.confirm(`Delete "${f.name}"?`)) return;
    try {
      if (f.storage_path) await storage.deleteFile(f.storage_path);
      await db.delete('ref_files', f.id);
      setFiles(p=>p.filter(x=>x.id!==f.id));
      msg('🗑 File deleted.');
    } catch(e) { msg('⚠️ Delete failed.'); }
  };

  // Follow-up counts for nav badge
  const followupCount = jobs.filter(j => j.followup && j.status !== 'Complete' && !isArchived(j)).length;
  const overdueFollowupCount = jobs.filter(j => j.followup && j.status !== 'Complete' && !isArchived(j) && isFollowupOverdue(j)).length;

  const pages=['Dashboard','Jobs','Follow-ups','Schedule','Customers','Technicians','Files','Archive'];
  const icons=['▣','◈','📞','◎','◻','◑','◫','◧'];
  const activeCount=jobs.filter(j=>['In Progress','Dispatched'].includes(j.status)).length;
  const archiveCount=jobs.filter(isArchived).length;
  const openMobileJobEdit=(j)=>{setJobForm(j);setShowJobForm(true);};
  const openMobileJobNew=()=>{setJobForm(null);setShowJobForm(true);};
  const saveMobileJob=(f)=>{jobForm?.id?editJob({...f}):addJob({...f});setShowJobForm(false);setJobForm(null);};

  return(<>
    <style>{styles}</style>
    <div className="app">
      <div className="topbar">
        <div><div className="logo">⊞ AXISCRM</div><div className="logo-sub">CAD·CAM FIELD OPS</div></div>
        <div style={{flex:1}}/>
        {overdueFollowupCount > 0 && (
          <div onClick={()=>setPage('Follow-ups')} style={{display:'flex',alignItems:'center',gap:6,padding:'5px 12px',background:'var(--rdd)',border:'1px solid rgba(255,77,106,0.3)',borderRadius:4,cursor:'pointer',fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:'var(--rd)'}}>
            ⚠ {overdueFollowupCount} overdue follow-up{overdueFollowupCount!==1?'s':''}
          </div>
        )}
        <button className="btn bimport" onClick={()=>setShowImport(true)} style={{fontSize:11}}>⬇ Import PDF</button>
        {page==='Jobs'&&<button className="btn bp" onClick={openMobileJobNew}>+ New Job</button>}
      </div>
      <div className="body">
        <div className="sidebar">
          <div className="nl">Operations</div>
          {['Dashboard','Jobs'].map((p,i)=><div key={p} className={"ni "+(page===p?'active':'')} onClick={()=>setPage(p)}>{icons[i]} {p}</div>)}
          <div className={"ni "+(page==='Follow-ups'?'active':'')} onClick={()=>setPage('Follow-ups')} style={{position:'relative'}}>
            📞 Follow-ups
            {followupCount>0&&<span style={{marginLeft:'auto',fontFamily:"'IBM Plex Mono',monospace",fontSize:9,background:overdueFollowupCount?'var(--rdd)':'var(--sur2)',border:`1px solid ${overdueFollowupCount?'rgba(255,77,106,0.3)':'var(--bdr)'}`,padding:'1px 5px',borderRadius:3,color:overdueFollowupCount?'var(--rd)':'var(--txd)'}}>{followupCount}</span>}
          </div>
          <div className={"ni "+(page==='Schedule'?'active':'')} onClick={()=>setPage('Schedule')}>◎ Schedule</div>
          <div className="nl">Resources</div>
          <div className={"ni "+(page==='Customers'?'active':'')} onClick={()=>setPage('Customers')}>◻ Customers</div>
          <div className={"ni "+(page==='Technicians'?'active':'')} onClick={()=>setPage('Technicians')}>◑ Technicians</div>
          <div className={"ni "+(page==='Files'?'active':'')} onClick={()=>setPage('Files')}>◫ Files</div>
          <div className="nl">History</div>
          <div className={"ni "+(page==='Archive'?'active':'')} onClick={()=>setPage('Archive')}>
            ◧ Archive
            {archiveCount>0&&<span style={{marginLeft:'auto',fontFamily:"'IBM Plex Mono',monospace",fontSize:9,background:'var(--sur2)',border:'1px solid var(--bdr)',padding:'1px 5px',borderRadius:3,color:'var(--txd)'}}>{archiveCount}</span>}
          </div>
          <div className="sf"><div className="up"><div className="ua">AD</div><div><div style={{fontSize:12,fontWeight:500}}>Admin</div><div style={{fontSize:10,color:'var(--txd)',fontFamily:"'IBM Plex Mono',monospace"}}>DISPATCH MGR</div></div></div></div>
        </div>
        <div className="main">
          {page==='Dashboard'&&<>
            <Dashboard jobs={jobs.filter(j=>!isArchived(j))} onEditJob={openMobileJobEdit}/>
            <MobileDashboard jobs={jobs.filter(j=>!isArchived(j))} onEditJob={openMobileJobEdit} onDeleteJob={delJob} onNewJob={openMobileJobNew}/>
          </>}
          {page==='Jobs'&&<Jobs jobs={jobs.filter(j=>!isArchived(j))} customers={customers} technicians={technicians} loading={loading.jobs} onAdd={addJob} onEdit={editJob} onDelete={delJob}/>}
          {page==='Follow-ups'&&<Followups jobs={jobs} onEdit={editJob} loading={loading.jobs}/>}
          {page==='Schedule'&&<Schedule jobs={jobs.filter(j=>!isArchived(j))}/>}
          {page==='Customers'&&<Customers customers={customers} jobs={jobs} loading={loading.customers} onAdd={addCust} onEdit={editCust} onDelete={delCust}/>}
          {page==='Technicians'&&<Technicians technicians={technicians} loading={loading.technicians} onAdd={addTech} onEdit={editTech} onDelete={delTech}/>}
          {page==='Files'&&<Files files={files} onUpload={uploadFiles} onDelete={deleteFile} uploading={fileUploading}/>}
          {page==='Archive'&&<Archive jobs={jobs} onEdit={editJob} onDelete={delJob} loading={loading.jobs}/>}
        </div>
      </div>
      <nav className="bnav">
        <div className="bnav-inner">
          {['Dashboard','Jobs','Follow-ups','Schedule','Customers'].map((p,i)=>(
            <div key={p} className={"bnav-item "+(page===p?'active':'')} onClick={()=>setPage(p)}>
              <div className="bnav-icon">{icons[i]}</div>
              {p==='Jobs'&&activeCount>0&&<span className="bnav-badge">{activeCount}</span>}
              {p==='Follow-ups'&&followupCount>0&&<span className="bnav-badge" style={{background:overdueFollowupCount?'var(--rd)':'var(--am)'}}>{followupCount}</span>}
              <div className="bnav-label">{p==='Follow-ups'?'Follow':p==='Customers'?'Clients':p==='Dashboard'?'Home':p}</div>
            </div>
          ))}
        </div>
      </nav>
      {showJobForm&&<JobFormModal job={jobForm} customers={customers} technicians={technicians} onSave={saveMobileJob} onClose={()=>{setShowJobForm(false);setJobForm(null);}}/>}
      {showImport&&<ImportModal onClose={()=>setShowImport(false)} onImport={handleImport} existingJobs={jobs}/>}
      <Toast msg={toast}/>
    </div>
  </>);
}
