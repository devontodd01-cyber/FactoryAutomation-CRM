import { useState, useEffect, useCallback, useRef } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from "recharts";

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
  },
  async getWhere(table, col, val) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${col}=eq.${encodeURIComponent(val)}`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
    });
    return r.json();
  },
  async upsert(table, data, onConflict) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=${onConflict}`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", Prefer: "return=representation,resolution=merge-duplicates" },
      body: JSON.stringify(data)
    });
    return r.json();
  },
  // Fetch a single column across a table, deduped and sorted. Selecting only
  // the one column keeps the payload small even with many saved reports.
  async distinctColumn(table, col) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=${col}`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
    });
    const rows = await r.json();
    if (!Array.isArray(rows)) return [];
    const vals = rows.map(x => x && x[col]).filter(v => v != null && String(v).trim() !== '');
    return [...new Set(vals)].sort((a, b) => String(a).localeCompare(String(b)));
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

function isArchived(job) {
  if (job.status !== 'Complete') return false;
  if (!job.date) return false;
  const completed = new Date(job.date);
  const now = new Date();
  const diffDays = (now - completed) / (1000 * 60 * 60 * 24);
  return diffDays > 30;
}

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

function isFollowupOverdue(job) {
  if (!job.followup || !job.followup_date) return false;
  return new Date(job.followup_date) < new Date();
}

function daysUntilFollowup(job) {
  if (!job.followup || !job.followup_date) return null;
  const diff = new Date(job.followup_date) - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@300;400;500&display=swap');
  *{margin:0;padding:0;box-sizing:border-box;}
  :root{
    --bg:#0a0c10;--sur:#0f1218;--sur2:#161b24;--sur3:#1c2230;
    --bdr:#1e2a3a;--bdr2:#243040;
    --ac:#00c8ff;--ac2:#0084a8;--acd:rgba(0,200,255,0.08);
    --am:#ffb020;--amd:rgba(255,176,32,0.10);
    --gr:#22d47a;--grd:rgba(34,212,122,0.10);
    --rd:#ff4d6a;--rdd:rgba(255,77,106,0.10);
    --tx:#d0dae8;--txd:#5a6a80;--txm:#8a9ab0;
    --sw:200px;
    --bnav-h:62px;
  }
  html,body{background:var(--bg);font-family:'IBM Plex Sans',sans-serif;color:var(--tx);min-height:100vh;-webkit-text-size-adjust:100%;overflow-x:hidden;max-width:100vw;}
  .app{display:flex;flex-direction:column;min-height:100vh;min-height:100dvh;overflow-x:hidden;max-width:100vw;}
  .topbar{height:52px;background:var(--sur);border-bottom:1px solid var(--bdr);display:flex;align-items:center;padding:0 16px;gap:8px;position:sticky;top:0;z-index:20;}
  .logo{font-family:'Rajdhani',sans-serif;font-weight:700;font-size:17px;letter-spacing:2px;color:var(--ac);white-space:nowrap;}
  .logo-sub{font-family:'IBM Plex Mono',monospace;font-size:9px;color:var(--txd);letter-spacing:2px;}
  .topbar-spacer{flex:1;}
  .btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:0 14px;height:36px;border-radius:4px;font-size:12px;font-weight:600;letter-spacing:.5px;cursor:pointer;border:1px solid;font-family:'Rajdhani',sans-serif;text-transform:uppercase;white-space:nowrap;-webkit-tap-highlight-color:transparent;touch-action:manipulation;}
  .bp{background:var(--ac);color:#000;border-color:var(--ac);}
  .bp:hover{background:#33d4ff;}
  .bg{background:transparent;color:var(--txm);border-color:var(--bdr2);}
  .bg:hover{color:var(--tx);border-color:var(--ac);}
  .bd{background:var(--rdd);color:var(--rd);border-color:rgba(255,77,106,0.3);}
  .bimport{background:rgba(255,176,32,0.15);color:var(--am);border-color:rgba(255,176,32,0.4);}
  .bimport:hover{background:rgba(255,176,32,0.25);}
  .bfollowup{background:rgba(34,212,122,0.12);color:var(--gr);border-color:rgba(34,212,122,0.3);}
  .bfollowup:hover{background:rgba(34,212,122,0.22);}
  .bs{height:30px;padding:0 9px;font-size:10px;}
  .body{display:flex;flex:1;}
  .sidebar{width:var(--sw);background:var(--sur);border-right:1px solid var(--bdr);display:flex;flex-direction:column;position:fixed;top:52px;bottom:0;left:0;z-index:4;overflow-y:auto;}
  .nl{font-family:'IBM Plex Mono',monospace;font-size:9px;color:var(--txd);letter-spacing:2px;padding:14px 14px 6px;text-transform:uppercase;}
  .ni{display:flex;align-items:center;gap:10px;padding:10px 14px;font-size:13px;font-weight:500;color:var(--txm);cursor:pointer;transition:all .15s;border-left:2px solid transparent;min-height:44px;}
  .ni:hover{background:var(--sur2);color:var(--tx);}
  .ni.active{background:var(--acd);color:var(--ac);border-left-color:var(--ac);}
  .sf{margin-top:auto;padding:14px;border-top:1px solid var(--bdr);}
  .up{display:flex;align-items:center;gap:8px;padding:8px;background:var(--sur2);border-radius:4px;border:1px solid var(--bdr);}
  .ua{width:26px;height:26px;border-radius:50%;background:var(--ac2);font-family:'Rajdhani',sans-serif;font-weight:700;font-size:11px;color:white;display:flex;align-items:center;justify-content:center;}
  .main{margin-left:var(--sw);flex:1;padding:20px;padding-bottom:30px;min-width:0;}
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
  .ph{padding:12px 16px;border-bottom:1px solid var(--bdr);display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;}
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
  .st.Archived{background:rgba(90,106,128,0.12);color:#4a5a70;border:1px solid var(--bdr);}
  .mbg{position:fixed;inset:0;width:100vw;background:rgba(0,0,0,0.80);z-index:50;display:flex;align-items:center;justify-content:center;padding:16px;-webkit-overflow-scrolling:touch;overflow:hidden;}
  .modal{background:var(--sur);border:1px solid var(--bdr2);border-radius:8px;width:100%;max-width:500px;max-height:90vh;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;box-sizing:border-box;}
  .mh{padding:14px 18px;border-bottom:1px solid var(--bdr);display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;background:var(--sur);z-index:1;}
  .mt{font-family:'Rajdhani',sans-serif;font-weight:600;font-size:15px;letter-spacing:1px;text-transform:uppercase;}
  .mc{background:none;border:none;color:var(--txd);font-size:24px;cursor:pointer;line-height:1;width:44px;height:44px;display:flex;align-items:center;justify-content:center;-webkit-tap-highlight-color:transparent;}
  .mc:hover{color:var(--tx);}
  .mb{padding:16px;}
  .mf{padding:12px 16px;border-top:1px solid var(--bdr);display:flex;gap:10px;justify-content:flex-end;position:sticky;bottom:0;background:var(--sur);}
  .fg{margin-bottom:14px;}
  .fl{font-family:'IBM Plex Mono',monospace;font-size:9px;color:var(--txd);letter-spacing:1px;text-transform:uppercase;margin-bottom:5px;display:block;}
  .fi,.fsl,.fta{width:100%;background:var(--sur2);border:1px solid var(--bdr);border-radius:4px;padding:10px 12px;color:var(--tx);font-family:'IBM Plex Sans',sans-serif;font-size:16px;-webkit-appearance:none;appearance:none;}
  .fi:focus,.fsl:focus,.fta:focus{outline:none;border-color:var(--ac);}
  .fsl{cursor:pointer;}
  .fta{resize:vertical;min-height:70px;font-size:16px;}
  .fr{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
  .tgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;padding:14px;}
  .tc{background:var(--sur2);border:1px solid var(--bdr);border-radius:6px;padding:14px;}
  .tav{width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:'Rajdhani',sans-serif;font-weight:700;font-size:13px;border:2px solid;flex-shrink:0;}
  .tav.Available{background:var(--grd);color:var(--gr);border-color:rgba(34,212,122,0.3);}
  .tav.Busy{background:var(--amd);color:var(--am);border-color:rgba(255,176,32,0.3);}
  .tav.Offline{background:rgba(90,106,128,0.15);color:var(--txd);border-color:var(--bdr);}
  .cg{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;padding:14px;}
  .cdl{font-family:'IBM Plex Mono',monospace;font-size:9px;color:var(--txd);text-align:center;padding:4px 0;letter-spacing:1px;}
  .cd2{min-height:72px;background:var(--sur2);border:1px solid var(--bdr);border-radius:4px;padding:5px;cursor:pointer;transition:border-color .15s;}
  .cd2:hover{border-color:var(--bdr2);}
  .cd2.today{border-color:var(--ac);}
  .cd2.has-note{border-color:rgba(255,176,32,0.4);}
  .cdn{font-family:'IBM Plex Mono',monospace;font-size:9px;color:var(--txm);margin-bottom:3px;}
  .cdn.tn{color:var(--ac);font-weight:700;}
  .cj{font-size:8px;padding:1px 4px;border-radius:2px;margin-bottom:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .cj.Dispatched{background:var(--acd);color:var(--ac);}
  .cj.InProgress{background:var(--amd);color:var(--am);}
  .cj.Pending{background:rgba(90,106,128,0.15);color:var(--txd);}
  .cj.Complete{background:var(--grd);color:var(--gr);}
  .note-dot{width:5px;height:5px;border-radius:50%;background:var(--am);display:inline-block;margin-left:3px;vertical-align:middle;flex-shrink:0;}
  .empty{padding:40px;text-align:center;color:var(--txd);font-size:13px;}
  .ei{font-size:28px;margin-bottom:10px;}
  .loading{display:flex;align-items:center;justify-content:center;padding:40px;color:var(--txd);font-family:'IBM Plex Mono',monospace;font-size:12px;gap:10px;}
  .spin{width:14px;height:14px;border:2px solid var(--bdr2);border-top-color:var(--ac);border-radius:50%;animation:spin .7s linear infinite;flex-shrink:0;}
  .toast{position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:var(--sur2);border:1px solid var(--bdr2);border-radius:6px;padding:9px 18px;font-family:'IBM Plex Mono',monospace;font-size:11px;z-index:200;white-space:nowrap;pointer-events:none;}
  .g2{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
  .job-card{background:var(--sur);border:1px solid var(--bdr);border-radius:8px;padding:14px;margin-bottom:10px;position:relative;overflow:hidden;}
  .job-card::before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;}
  .job-card.InProgress::before{background:var(--am);}
  .job-card.Dispatched::before{background:var(--ac);}
  .job-card.Pending::before{background:var(--txd);}
  .job-card.Complete::before{background:var(--gr);}
  .job-card.Urgent::before{background:var(--rd);}
  .job-card-header{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:8px;gap:8px;}
  .job-card-id{font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--ac);margin-bottom:3px;}
  .job-card-customer{font-size:15px;font-weight:600;line-height:1.3;}
  .job-card-equip{font-size:12px;color:var(--txd);margin-top:2px;}
  .job-card-meta{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;}
  .job-card-tag{font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--txm);background:var(--sur2);padding:3px 8px;border-radius:3px;border:1px solid var(--bdr);}
  .job-card-actions{display:flex;gap:8px;margin-top:10px;padding-top:10px;border-top:1px solid var(--bdr);}
  .bnav{display:none;position:fixed;bottom:0;left:0;right:0;background:var(--sur);border-top:1px solid var(--bdr);z-index:30;padding-bottom:env(safe-area-inset-bottom,8px);}
  .bnav-inner{display:flex;justify-content:space-around;}
  .bnav-item{display:flex;flex-direction:column;align-items:center;gap:2px;padding:8px 4px 4px;cursor:pointer;flex:1;position:relative;min-height:52px;-webkit-tap-highlight-color:transparent;}
  .bnav-icon{font-size:20px;line-height:1;}
  .bnav-label{font-family:'IBM Plex Mono',monospace;font-size:8px;color:var(--txd);letter-spacing:.5px;text-transform:uppercase;}
  .bnav-item.active .bnav-icon{filter:drop-shadow(0 0 4px var(--ac));}
  .bnav-item.active .bnav-label{color:var(--ac);}
  .bnav-badge{position:absolute;top:4px;right:6px;background:var(--rd);color:white;font-size:9px;font-weight:700;font-family:'IBM Plex Mono',monospace;padding:1px 5px;border-radius:8px;min-width:16px;text-align:center;}
  .mob-section{display:flex;align-items:center;justify-content:space-between;margin:14px 0 8px;}
  .mob-section-title{font-family:'Rajdhani',sans-serif;font-weight:600;font-size:13px;letter-spacing:1px;text-transform:uppercase;color:var(--txm);}
  .mob-section-count{font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--ac);}
  .mob-kpi-row{display:flex;gap:8px;margin-bottom:14px;overflow-x:auto;padding-bottom:2px;-webkit-overflow-scrolling:touch;}
  .mob-kpi-row::-webkit-scrollbar{display:none;}
  .mob-kpi{background:var(--sur);border:1px solid var(--bdr);border-radius:6px;padding:10px 12px;flex-shrink:0;min-width:80px;position:relative;overflow:hidden;cursor:pointer;transition:border-color .15s;-webkit-tap-highlight-color:transparent;}
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
  .filter-bar{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;padding:8px 12px;background:var(--sur);border:1px solid var(--bdr);border-radius:6px;}
  .filter-label{font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--ac);letter-spacing:1px;}
  .filter-clear{font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--txd);cursor:pointer;padding:4px 10px;border:1px solid var(--bdr);border-radius:3px;min-height:32px;-webkit-tap-highlight-color:transparent;}
  .detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:16px;}
  .detail-label{font-family:'IBM Plex Mono',monospace;font-size:9px;color:var(--txd);letter-spacing:2px;text-transform:uppercase;margin-bottom:4px;}
  .detail-value{font-size:13px;color:var(--tx);}
  .import-modal{background:var(--sur);border:1px solid var(--bdr2);border-radius:8px;width:100%;max-width:620px;max-height:90vh;overflow-y:auto;}
  .import-row{display:grid;grid-template-columns:24px 1fr 100px 80px;align-items:center;gap:8px;padding:8px 14px;border-bottom:1px solid var(--bdr);font-size:12px;}
  .import-row:hover{background:var(--sur2);}
  .import-check{width:18px;height:18px;accent-color:var(--ac);cursor:pointer;}
  .cal-note-panel{background:var(--sur);border:1px solid var(--bdr2);border-radius:8px;padding:16px;margin-top:12px;}
  .cal-note-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;}
  .cal-note-date{font-family:'Rajdhani',sans-serif;font-weight:700;font-size:14px;letter-spacing:1px;color:var(--ac);}
  .cal-note-close{background:none;border:none;color:var(--txd);font-size:22px;cursor:pointer;line-height:1;padding:0;width:44px;height:44px;display:flex;align-items:center;justify-content:center;-webkit-tap-highlight-color:transparent;}
  .cal-note-ta{width:100%;background:var(--sur2);border:1px solid var(--bdr);border-radius:4px;padding:10px 12px;color:var(--tx);font-family:'IBM Plex Sans',sans-serif;font-size:16px;resize:vertical;min-height:100px;line-height:1.6;}
  .cal-note-ta:focus{outline:none;border-color:var(--ac);}
  .cal-note-actions{display:flex;gap:8px;margin-top:10px;justify-content:flex-end;flex-wrap:wrap;}
  .cal-note-saved{font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--gr);align-self:center;margin-right:auto;}
  .focus-panel{background:linear-gradient(135deg,rgba(0,200,255,0.06) 0%,rgba(255,176,32,0.04) 100%);border:1px solid var(--bdr2);border-radius:8px;margin-bottom:16px;overflow:hidden;}
  .focus-header{padding:12px 16px;border-bottom:1px solid var(--bdr);display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;}
  .focus-title{font-family:'Rajdhani',sans-serif;font-weight:700;font-size:14px;letter-spacing:2px;text-transform:uppercase;color:var(--ac);}
  .focus-date{font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--txd);}
  .focus-body{display:grid;grid-template-columns:1fr 1fr;}
  .focus-col{padding:12px 14px;}
  .focus-col:first-child{border-right:1px solid var(--bdr);}
  .focus-col-title{font-family:'IBM Plex Mono',monospace;font-size:9px;color:var(--txd);letter-spacing:2px;text-transform:uppercase;margin-bottom:8px;}
  .focus-item{display:flex;align-items:flex-start;gap:8px;padding:8px;border-radius:5px;margin-bottom:6px;border:1px solid var(--bdr);background:var(--sur);cursor:pointer;transition:border-color .15s;-webkit-tap-highlight-color:transparent;}
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
  .focus-item-customer{font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .focus-item-sub{font-size:10px;color:var(--txd);margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .focus-empty{padding:14px;text-align:center;color:var(--txd);font-size:11px;font-family:'IBM Plex Mono',monospace;}
  .followup-pill{display:inline-flex;align-items:center;gap:4px;font-family:'IBM Plex Mono',monospace;font-size:9px;padding:2px 7px;border-radius:10px;border:1px solid;white-space:nowrap;}
  .followup-pill.due{color:var(--am);border-color:rgba(255,176,32,0.3);background:var(--amd);}
  .followup-pill.overdue{color:var(--rd);border-color:rgba(255,77,106,0.3);background:var(--rdd);}
  .followup-pill.done{color:var(--gr);border-color:rgba(34,212,122,0.3);background:var(--grd);}
  .followup-card{background:var(--sur);border:1px solid var(--bdr);border-radius:8px;padding:14px;margin-bottom:10px;position:relative;overflow:hidden;}
  .followup-card::before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;}
  .followup-card.overdue::before{background:var(--rd);}
  .followup-card.today::before{background:var(--am);}
  .followup-card.upcoming::before{background:var(--ac);}
  @keyframes spin{to{transform:rotate(360deg);}}

  /* ── Voice Log Panel ── */
  .vl-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.87);z-index:60;display:flex;align-items:flex-end;justify-content:center;}
  .vl-panel{background:var(--sur);border:1px solid var(--bdr2);border-radius:16px 16px 0 0;width:100%;max-width:600px;max-height:92vh;overflow-y:auto;padding-bottom:env(safe-area-inset-bottom,16px);}
  .vl-header{padding:16px 18px;border-bottom:1px solid var(--bdr);display:flex;align-items:center;justify-content:space-between;}
  .vl-title{font-family:'Rajdhani',sans-serif;font-weight:700;font-size:17px;letter-spacing:2px;text-transform:uppercase;color:var(--ac);}
  .vl-body{padding:18px;}
  .vl-mic-wrap{display:flex;flex-direction:column;align-items:center;gap:14px;padding:16px 0;}
  .vl-mic-btn{width:80px;height:80px;border-radius:50%;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:34px;transition:all .2s;-webkit-tap-highlight-color:transparent;touch-action:manipulation;}
  .vl-mic-btn.idle{background:rgba(0,200,255,0.12);border:2px solid rgba(0,200,255,0.3);}
  .vl-mic-btn.idle:hover,.vl-mic-btn.idle:active{background:rgba(0,200,255,0.22);}
  .vl-mic-btn.recording{background:var(--rdd);border:2px solid var(--rd);animation:vl-pulse 1.5s ease-in-out infinite;}
  .vl-mic-btn.processing{background:rgba(255,176,32,0.12);border:2px solid rgba(255,176,32,0.3);cursor:not-allowed;}
  @keyframes vl-pulse{0%,100%{box-shadow:0 0 0 0 rgba(255,77,106,0.5);}50%{box-shadow:0 0 0 18px rgba(255,77,106,0);}}
  .vl-status{font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--txd);letter-spacing:2px;text-transform:uppercase;text-align:center;}
  .vl-status.recording{color:var(--rd);}
  .vl-status.processing{color:var(--am);}
  .vl-transcript{width:100%;background:var(--sur2);border:1px solid var(--bdr);border-radius:6px;padding:12px;color:var(--tx);font-family:'IBM Plex Sans',sans-serif;font-size:15px;resize:vertical;min-height:100px;line-height:1.6;margin-bottom:12px;box-sizing:border-box;}
  .vl-transcript:focus{outline:none;border-color:var(--ac);}
  .vl-tips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px;}
  .vl-tip{font-family:'IBM Plex Mono',monospace;font-size:9px;color:var(--txd);background:var(--sur2);border:1px solid var(--bdr);border-radius:4px;padding:5px 9px;letter-spacing:.5px;cursor:pointer;-webkit-tap-highlight-color:transparent;transition:all .15s;}
  .vl-tip:active,.vl-tip:hover{border-color:var(--ac);color:var(--ac);}
  .vl-result{background:linear-gradient(135deg,rgba(0,200,255,0.06),rgba(34,212,122,0.04));border:1px solid var(--bdr2);border-radius:8px;padding:14px;margin-bottom:14px;}
  .vl-result-row{display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--bdr);gap:10px;}
  .vl-result-row:last-child{border-bottom:none;}
  .vl-result-label{font-family:'IBM Plex Mono',monospace;font-size:9px;color:var(--txd);letter-spacing:2px;text-transform:uppercase;flex-shrink:0;}
  .vl-result-value{font-size:13px;color:var(--tx);text-align:right;font-weight:500;}
  .vl-actions{display:flex;gap:10px;}
  .vl-actions .btn{flex:1;height:50px;font-size:13px;}
  .vl-divider{display:flex;align-items:center;gap:10px;margin:12px 0;color:var(--txd);font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:2px;}
  .vl-divider::before,.vl-divider::after{content:'';flex:1;height:1px;background:var(--bdr);}

  /* ── Diagnostics Panel ── */
  .diag-report-card{background:var(--sur2);border:1px solid var(--bdr);border-radius:6px;padding:12px;margin-bottom:10px;}
  .diag-report-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;}
  .diag-ta{width:100%;background:var(--sur3);border:1px solid var(--bdr);border-radius:4px;padding:10px 12px;color:var(--tx);font-family:'IBM Plex Mono',monospace;font-size:11px;resize:vertical;min-height:120px;line-height:1.5;}
  .diag-ta:focus{outline:none;border-color:var(--ac);}
  .diag-meta{display:flex;gap:10px;flex-wrap:wrap;margin-top:8px;font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--txd);}
  .diag-flag{border-radius:6px;padding:10px 12px;margin-bottom:8px;border:1px solid;}
  .diag-flag.bad{background:var(--rdd);border-color:rgba(255,77,106,0.35);}
  .diag-flag.ok{background:var(--grd);border-color:rgba(34,212,122,0.3);}
  .diag-flag.info{background:var(--sur2);border-color:var(--bdr);}
  .diag-flag-title{font-family:'Rajdhani',sans-serif;font-weight:700;font-size:13px;letter-spacing:.5px;margin-bottom:3px;}
  .diag-flag.bad .diag-flag-title{color:var(--rd);}
  .diag-flag.ok .diag-flag-title{color:var(--gr);}
  .diag-flag-desc{font-size:12px;color:var(--tx);line-height:1.5;margin-bottom:4px;}
  .diag-flag-action{font-size:11px;color:var(--txm);font-style:italic;}
  .diag-dice-grid{display:grid;grid-template-columns:100px repeat(2,1fr);gap:8px;align-items:center;}

  /* ── RESPONSIVE ── */
  @media(max-width:900px){
    .kgrid{grid-template-columns:repeat(2,1fr);}
    .g2{grid-template-columns:1fr;}
    .focus-body{grid-template-columns:1fr;}
    .focus-col:first-child{border-right:none;border-bottom:1px solid var(--bdr);}
    .fr{grid-template-columns:1fr;}
  }
  @media(max-width:640px){
    :root{--sw:0px;}
    .sidebar{display:none;}
    .main{margin-left:0;padding:12px;padding-bottom:calc(var(--bnav-h) + env(safe-area-inset-bottom,8px) + 8px);}
    .bnav{display:block;}
    .topbar{padding:0 12px;gap:6px;}
    .logo-sub{display:none;}
    .topbar-overdue{font-size:9px;padding:4px 8px;}
    .kgrid{display:none;}
    .desktop-table{display:none;}
    .mobile-cards{display:block;}
    .mbg{padding:0;align-items:flex-end;}
    .modal{max-width:100%;max-height:92vh;border-radius:16px 16px 0 0;border-left:none;border-right:none;border-bottom:none;}
    .import-modal{max-width:100%;max-height:92vh;border-radius:16px 16px 0 0;border-left:none;border-right:none;border-bottom:none;}
    .mh{padding:14px 16px;}
    .mb{padding:14px;}
    .mf{padding:12px 14px;gap:8px;}
    .mf .btn{flex:1;height:44px;font-size:13px;}
    .detail-grid{grid-template-columns:1fr;}
    .fr{grid-template-columns:1fr;}
    .btn{min-height:40px;}
    .ni{min-height:48px;}
    .focus-body{grid-template-columns:1fr;}
    .focus-col:first-child{border-right:none;border-bottom:1px solid var(--bdr);}
  }
  @media(min-width:641px){
    .mobile-cards{display:none;}
    .mob-kpi-row{display:none;}
    .mob-section{display:none;}
    .filter-bar{display:none;}
    .mobile-only{display:none;}
  }
  @media(max-width:640px){
    .desktop-only{display:none !important;}
  }
`;

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

// ── Voice Log Component ───────────────────────────────────────────────────────
function VoiceLog({ onClose, onJobCreated }) {
  const [mode, setMode] = useState('idle');
  const [transcript, setTranscript] = useState('');
  const [parsed, setParsed] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const recognitionRef = useRef(null);

  const WEBHOOK = 'https://axis-plaud-webhook.vercel.app/api/plaud-webhook';
  const SECRET = 'axisdevon2026';
  const tips = ['New job, ','Reminder, ','Quote for ','Parts needed: ','Follow up ','Edit job, '];

  const startRecording = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    setMode('recording');
    setTranscript('');
    if (!SR) return;
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-CA';
    let final = '';
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript + ' ';
        else interim = e.results[i][0].transcript;
      }
      setTranscript(final + interim);
    };
    rec.onerror = () => { setMode('idle'); setTranscript(final); };
    rec.onend = () => { setTranscript(t => t || final); };
    rec.start();
    recognitionRef.current = rec;
  };

  const stopRecording = () => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setMode('idle');
  };

  const processTranscript = async () => {
    const text = transcript.trim();
    if (!text) return;
    setMode('processing');
    setErrorMsg('');
    try {
      const res = await fetch(WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-webhook-secret': SECRET },
        body: JSON.stringify({ transcript: text })
      });
      const data = await res.json();
      if (data.success) {
        setParsed({ job_id: data.job_id, customer: data.customer || 'Unknown', machine: data.machine || '—', status: data.status || 'Pending', transcript: text });
        setMode('result');
        onJobCreated && onJobCreated();
      } else {
        throw new Error(data.error || 'Processing failed');
      }
    } catch (err) {
      setErrorMsg(err.message);
      setMode('error');
    }
  };

  const reset = () => { setMode('idle'); setTranscript(''); setParsed(null); setErrorMsg(''); };

  return (
    <div className="vl-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="vl-panel">
        <div className="vl-header">
          <div>
            <div className="vl-title">🎙 Voice Log</div>
            <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:9,color:'var(--txd)',letterSpacing:2,marginTop:2}}>SPEAK → AXIS CRM</div>
          </div>
          <button className="mc" onClick={onClose}>×</button>
        </div>
        <div className="vl-body">

          {mode === 'result' && parsed && (<>
            <div style={{textAlign:'center',marginBottom:16}}>
              <div style={{fontSize:40,marginBottom:8}}>✅</div>
              <div style={{fontFamily:"'Rajdhani',sans-serif",fontWeight:700,fontSize:16,color:'var(--gr)',letterSpacing:1}}>JOB CREATED IN AXIS</div>
            </div>
            <div className="vl-result">
              <div className="vl-result-row"><div className="vl-result-label">Customer</div><div className="vl-result-value">{parsed.customer}</div></div>
              <div className="vl-result-row"><div className="vl-result-label">Machine</div><div className="vl-result-value" style={{color:'var(--ac)'}}>{parsed.machine}</div></div>
              <div className="vl-result-row"><div className="vl-result-label">Status</div><div className="vl-result-value"><StBadge s={parsed.status}/></div></div>
              <div className="vl-result-row"><div className="vl-result-label">Job ID</div><div className="vl-result-value" style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:11,color:'var(--txd)'}}>{parsed.job_id}</div></div>
            </div>
            <div style={{fontSize:12,color:'var(--txd)',lineHeight:1.6,background:'var(--sur2)',padding:'10px 12px',borderRadius:6,border:'1px solid var(--bdr)',marginBottom:14,fontStyle:'italic'}}>
              "{parsed.transcript}"
            </div>
            <div className="vl-actions">
              <button className="btn bg" onClick={reset}>+ Another</button>
              <button className="btn bp" onClick={onClose}>Done ✓</button>
            </div>
          </>)}

          {mode === 'error' && (<>
            <div style={{textAlign:'center',padding:'20px 0'}}>
              <div style={{fontSize:36,marginBottom:10}}>⚠️</div>
              <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:11,color:'var(--rd)',letterSpacing:1,marginBottom:16,lineHeight:1.5}}>{errorMsg}</div>
            </div>
            <div className="vl-actions">
              <button className="btn bg" onClick={reset}>Try Again</button>
              <button className="btn bg" onClick={onClose}>Close</button>
            </div>
          </>)}

          {(mode === 'idle' || mode === 'recording' || mode === 'processing') && (<>
            <div className="vl-mic-wrap">
              <button
                className={`vl-mic-btn ${mode === 'recording' ? 'recording' : mode === 'processing' ? 'processing' : 'idle'}`}
                onClick={mode === 'recording' ? stopRecording : mode === 'idle' ? startRecording : undefined}
                disabled={mode === 'processing'}
              >
                {mode === 'recording' ? '⏹' : mode === 'processing' ? '⏳' : '🎙'}
              </button>
              <div className={`vl-status ${mode}`}>
                {mode === 'recording' ? '● RECORDING — TAP TO STOP' : mode === 'processing' ? 'PROCESSING WITH AI...' : 'TAP MIC TO SPEAK'}
              </div>
            </div>

            <div className="vl-divider">OR TYPE YOUR COMMAND</div>

            <div className="vl-tips">
              {tips.map(t => <div key={t} className="vl-tip" onClick={() => setTranscript(p => p + t)}>{t.trim()}</div>)}
            </div>

            <textarea
              className="vl-transcript"
              placeholder={'Say or type your command...\n\n"New job, Astro Dental Lab, Roland DWX-51, poor milling quality"\n"Reminder, quote Centre St Denture on DWX-53DC"\n"Replaced spindle bearing, follow up Thursday"'}
              value={transcript}
              onChange={e => setTranscript(e.target.value)}
            />

            <div className="vl-actions">
              <button className="btn bg" onClick={onClose}>Cancel</button>
              <button className="btn bp" onClick={processTranscript} disabled={!transcript.trim() || mode === 'processing'}>
                {mode === 'processing' ? '⏳ Processing...' : '⚡ Log to Axis'}
              </button>
            </div>
          </>)}

        </div>
      </div>
    </div>
  );
}

// ── Daily Focus Panel ─────────────────────────────────────────────────────────
function DailyFocusPanel({ jobs, onEditJob, calNotes, onSaveNote }) {
  const today = new Date();
  const todayKey = today.toISOString().split('T')[0];
  const dateStr = today.toLocaleDateString('en-CA', { weekday:'long', month:'short', day:'numeric' });
  const [editingNote, setEditingNote] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const taRef = useRef(null);

  useEffect(() => { setNoteText(calNotes[todayKey]?.note_text || ''); }, [calNotes, todayKey]);

  const openNote = () => { setNoteText(calNotes[todayKey]?.note_text || ''); setEditingNote(true); setSaved(false); setTimeout(() => taRef.current?.focus(), 50); };
  const handleSave = async () => { setSaving(true); await onSaveNote(todayKey, noteText); setSaving(false); setSaved(true); setTimeout(() => { setSaved(false); setEditingNote(false); }, 1200); };

  const priorityJobs = jobs.filter(j => !isArchived(j) && j.status !== 'Complete' && (j.priority === 'Urgent' || j.priority === 'High')).sort((a,b) => { const order = { Urgent:0, High:1 }; return (order[a.priority]??2) - (order[b.priority]??2); }).slice(0, 5);
  const followupJobs = jobs.filter(j => j.followup && j.status !== 'Complete').sort((a,b) => new Date(a.followup_date||'9999') - new Date(b.followup_date||'9999')).slice(0, 5);
  const overdueFollowups = followupJobs.filter(isFollowupOverdue);
  const upcomingFollowups = followupJobs.filter(j => !isFollowupOverdue(j));
  const existingNote = calNotes[todayKey]?.note_text?.trim();

  return (
    <div className="focus-panel">
      <div className="focus-header">
        <div><div className="focus-title">⚡ Daily Focus</div><div className="focus-date">{dateStr}</div></div>
        <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:'var(--txd)',textAlign:'right'}}>
          <div style={{color: overdueFollowups.length > 0 ? 'var(--rd)' : 'var(--txd)'}}>{overdueFollowups.length > 0 ? `⚠ ${overdueFollowups.length} overdue` : '✓ No overdue'}</div>
          <div style={{marginTop:2}}>{priorityJobs.length} priority</div>
        </div>
      </div>
      <div style={{borderBottom:'1px solid var(--bdr)',padding:'10px 14px'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:editingNote?8:existingNote?6:0}}>
          <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:9,color:'var(--txd)',letterSpacing:2,textTransform:'uppercase'}}>📝 Today's Note</div>
          {!editingNote && <button className="btn bg bs" style={{height:26,fontSize:10}} onClick={openNote}>{existingNote ? '✏️ Edit' : '+ Add Note'}</button>}
        </div>
        {editingNote ? (
          <div>
            <textarea ref={taRef} style={{width:'100%',background:'var(--sur2)',border:'1px solid var(--ac)',borderRadius:4,padding:'8px 10px',color:'var(--tx)',fontFamily:"'IBM Plex Sans',sans-serif",fontSize:14,resize:'vertical',minHeight:70,lineHeight:1.6,boxSizing:'border-box'}}
              value={noteText} onChange={e => { setNoteText(e.target.value); setSaved(false); }}
              onKeyDown={e => { if((e.ctrlKey||e.metaKey)&&e.key==='Enter') handleSave(); if(e.key==='Escape'){setEditingNote(false);} }}
              placeholder="What's on for today..."/>
            <div style={{display:'flex',gap:8,marginTop:6,alignItems:'center'}}>
              {saved && <span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:'var(--gr)'}}>✓ Saved</span>}
              <div style={{flex:1}}/>
              {noteText && <button className="btn bd bs" style={{height:30}} onClick={()=>{setNoteText('');onSaveNote(todayKey,'');}}>Clear</button>}
              <button className="btn bg bs" style={{height:30}} onClick={()=>setEditingNote(false)}>Cancel</button>
              <button className="btn bp bs" style={{height:30}} onClick={handleSave} disabled={saving}>{saving?'Saving...':'Save'}</button>
            </div>
          </div>
        ) : existingNote ? (
          <div onClick={openNote} style={{fontSize:13,color:'var(--tx)',lineHeight:1.6,whiteSpace:'pre-wrap',cursor:'pointer',padding:'6px 8px',borderRadius:4,border:'1px solid var(--bdr)',background:'var(--sur2)',transition:'border-color .15s'}}
            onMouseEnter={e=>e.currentTarget.style.borderColor='var(--ac)'} onMouseLeave={e=>e.currentTarget.style.borderColor='var(--bdr)'}>{existingNote}</div>
        ) : null}
      </div>
      <div className="focus-body">
        <div className="focus-col">
          <div className="focus-col-title">🔴 Priority Jobs</div>
          {priorityJobs.length === 0 && <div className="focus-empty">✅ Clear</div>}
          {priorityJobs.map(j => (
            <div key={j.id} className={`focus-item ${j.priority==='Urgent'?'urgent':'high'}`} onClick={() => onEditJob(j)}>
              <div className={`focus-item-dot ${j.priority==='Urgent'?'urgent':'high'}`}/>
              <div className="focus-item-info"><div className="focus-item-customer">{j.customer}</div><div className="focus-item-sub">{j.equipment || '—'}</div></div>
              <PriorityBadge p={j.priority}/>
            </div>
          ))}
        </div>
        <div className="focus-col">
          <div className="focus-col-title">📞 Follow-ups</div>
          {followupJobs.length === 0 && <div className="focus-empty">✅ Clear</div>}
          {overdueFollowups.map(j => (
            <div key={j.id} className="focus-item overdue" onClick={() => onEditJob(j)}>
              <div className="focus-item-dot overdue"/>
              <div className="focus-item-info"><div className="focus-item-customer">{j.customer}</div><div className="focus-item-sub">{j.followup_note || j.equipment || '—'}</div></div>
              <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:9,color:'var(--rd)',flexShrink:0}}>{Math.abs(daysUntilFollowup(j))}d over</div>
            </div>
          ))}
          {upcomingFollowups.map(j => {
            const days = daysUntilFollowup(j);
            return (
              <div key={j.id} className="focus-item" onClick={() => onEditJob(j)}>
                <div className="focus-item-dot followup"/>
                <div className="focus-item-info"><div className="focus-item-customer">{j.customer}</div><div className="focus-item-sub">{j.followup_note || j.equipment || '—'}</div></div>
                <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:9,color:days<=1?'var(--am)':'var(--txd)',flexShrink:0}}>{days===0?'Today':days===1?'Tmrw':`${days}d`}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function FollowupPill({ job }) {
  if (!job.followup) return null;
  const overdue = isFollowupOverdue(job);
  const days = daysUntilFollowup(job);
  if (overdue) return <span className="followup-pill overdue">📞 {Math.abs(days)}d overdue</span>;
  if (days === 0) return <span className="followup-pill due">📞 Today</span>;
  if (days === 1) return <span className="followup-pill due">📞 Tomorrow</span>;
  return <span className="followup-pill due">📞 {days}d</span>;
}

function ImportModal({onClose, onImport, existingJobs}) {
  const [selected, setSelected] = useState(() => new Set(PDF_JOBS.map((_,i)=>i)));
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const existingNotes = new Set(existingJobs.map(j => j.notes));
  const alreadyImported = (job) => existingNotes.has(job.notes);
  const available = PDF_JOBS.filter((_,i)=>!alreadyImported(PDF_JOBS[i]));
  const toggleAll = () => { const avail = PDF_JOBS.map((_,i)=>i).filter(i=>!alreadyImported(PDF_JOBS[i])); if(selected.size === avail.length) setSelected(new Set()); else setSelected(new Set(avail)); };
  const toggle = (i) => { const next = new Set(selected); next.has(i) ? next.delete(i) : next.add(i); setSelected(next); };
  const doImport = async () => { const toImport = [...selected].map(i => PDF_JOBS[i]); setImporting(true); await onImport(toImport, setProgress); setImporting(false); onClose(); };
  return (
    <div className="mbg" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="import-modal">
        <div className="mh"><div><div className="mt">Import PDF Jobs</div><div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:'var(--txd)',marginTop:2}}>{PDF_JOBS.length} jobs from export</div></div><button className="mc" onClick={onClose}>×</button></div>
        <div style={{padding:'10px 14px',borderBottom:'1px solid var(--bdr)',display:'flex',alignItems:'center',gap:12}}>
          <input type="checkbox" className="import-check" checked={selected.size===available.length&&available.length>0} onChange={toggleAll}/>
          <span style={{fontSize:12,color:'var(--txm)',fontFamily:"'IBM Plex Mono',monospace"}}>{selected.size} of {available.length} selected</span>
        </div>
        <div style={{maxHeight:'50vh',overflowY:'auto'}}>
          <div className="import-row" style={{background:'var(--sur3)',fontFamily:"'IBM Plex Mono',monospace",fontSize:9,color:'var(--txd)',letterSpacing:1}}><div/><div>CUSTOMER / EQUIP</div><div>DATE</div><div>STATUS</div></div>
          {PDF_JOBS.map((job, i) => {
            const done = alreadyImported(job);
            return (
              <div key={i} className="import-row" style={{opacity: done ? 0.4 : 1, pointerEvents: done ? 'none' : 'auto'}} onClick={()=>!done&&toggle(i)}>
                <input type="checkbox" className="import-check" checked={selected.has(i)} onChange={()=>toggle(i)} onClick={e=>e.stopPropagation()} disabled={done}/>
                <div><div style={{fontWeight:500,color:'var(--tx)'}}>{job.customer}</div><div style={{color:'var(--txd)',fontSize:11,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{job.equipment}</div></div>
                <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:'var(--txm)'}}>{job.date}</div>
                <div>{done ? <span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:9,color:'var(--gr)'}}>✓</span> : <StBadge s={job.status}/>}</div>
              </div>
            );
          })}
        </div>
        {importing && (<div style={{padding:'12px 14px',borderTop:'1px solid var(--bdr)'}}><div style={{background:'var(--sur2)',borderRadius:4,overflow:'hidden',height:4,marginBottom:8}}><div style={{width:`${Math.round((progress/selected.size)*100)}%`,background:'var(--ac)',height:'100%',transition:'width .2s'}}/></div><div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:'var(--txd)',textAlign:'center'}}>Importing {progress}/{selected.size}...</div></div>)}
        <div className="mf"><button className="btn bg" onClick={onClose} disabled={importing}>Cancel</button><button className="btn bp" onClick={doImport} disabled={importing||selected.size===0}>{importing ? 'Importing...' : `Import ${selected.size}`}</button></div>
      </div>
    </div>
  );
}

function JobDetailModal({job,onClose,onEdit}){
  const [photos,setPhotos]=useState([]);
  const [uploading,setUploading]=useState(false);
  const [lightbox,setLightbox]=useState(null);
  const fileRef=useRef(null);
  useEffect(()=>{ if(job?.id) storage.list(job.id).then(setPhotos).catch(()=>setPhotos([])); },[job?.id]);
  const handleUpload=async(e)=>{ const files=[...e.target.files]; if(!files.length) return; setUploading(true); try{ const urls=await Promise.all(files.map(f=>storage.upload(f,job.id))); setPhotos(p=>[...p,...urls]); }catch{ alert('Upload failed.'); } setUploading(false); e.target.value=''; };
  const handleDelete=async(url)=>{ if(!window.confirm('Delete photo?')) return; await storage.delete(url); setPhotos(p=>p.filter(x=>x!==url)); };
  const days = daysUntilFollowup(job);
  const overdueFollowup = isFollowupOverdue(job);
  return(
    <div className="mbg" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <div className="mh"><div><div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:11,color:'var(--ac)',marginBottom:3}}>{job.job_id}</div><div className="mt">{job.customer}</div></div><button className="mc" onClick={onClose}>×</button></div>
        <div className="mb">
          <div className="detail-grid">
            <div><div className="detail-label">Equipment</div><div className="detail-value" style={{fontWeight:500}}>{job.equipment||'—'}</div></div>
            <div><div className="detail-label">Status</div><StBadge s={job.status}/></div>
            <div><div className="detail-label">Technician</div><div className="detail-value">{job.technician||'Unassigned'}</div></div>
            <div><div className="detail-label">Date</div><div className="detail-value" style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:11}}>{job.date||'—'}</div></div>
            <div><div className="detail-label">Amount</div><div className="detail-value" style={{fontFamily:"'Rajdhani',sans-serif",fontWeight:700,fontSize:18,color:'var(--ac)'}}>{job.amount?'$'+job.amount:'—'}</div></div>
            <div><div className="detail-label">Priority</div><div className="detail-value">{job.priority ? <PriorityBadge p={job.priority}/> : 'Normal'}</div></div>
          </div>
          {job.followup && (<div style={{borderTop:'1px solid var(--bdr)',paddingTop:14,marginBottom:14}}><div className="detail-label" style={{marginBottom:8}}>Follow-up</div><div style={{background:overdueFollowup?'var(--rdd)':'var(--amd)',border:`1px solid ${overdueFollowup?'rgba(255,77,106,0.3)':'rgba(255,176,32,0.3)'}`,borderRadius:6,padding:'10px 12px'}}><div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4}}><span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:overdueFollowup?'var(--rd)':'var(--am)'}}>📞 {overdueFollowup ? `OVERDUE ${Math.abs(days)}d` : days===0?'Due Today':days===1?'Due Tomorrow':`Due ${days}d`}</span><span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:9,color:'var(--txd)'}}>{job.followup_date}</span></div>{job.followup_note && <div style={{fontSize:12,color:'var(--tx)',lineHeight:1.5}}>{job.followup_note}</div>}</div></div>)}
          <div style={{borderTop:'1px solid var(--bdr)',paddingTop:14,marginBottom:14}}><div className="detail-label" style={{marginBottom:8}}>Notes</div><div style={{fontSize:13,color:job.notes?'var(--tx)':'var(--txd)',lineHeight:1.7,minHeight:50,background:'var(--sur2)',padding:'10px 12px',borderRadius:4,border:'1px solid var(--bdr)',whiteSpace:'pre-wrap'}}>{job.notes||'No notes.'}</div></div>
          <div style={{borderTop:'1px solid var(--bdr)',paddingTop:14}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}><div className="detail-label">Photos ({photos.length})</div><button className="btn bp bs" onClick={()=>fileRef.current?.click()} disabled={uploading}>{uploading?'Uploading...':'📷 Add'}</button><input ref={fileRef} type="file" accept="image/*" capture="environment" multiple style={{display:'none'}} onChange={handleUpload}/></div>
            {photos.length===0&&!uploading&&<div style={{padding:'16px',textAlign:'center',color:'var(--txd)',fontSize:12,background:'var(--sur2)',borderRadius:6,border:'1px solid var(--bdr)'}}>No photos yet</div>}
            {uploading&&<div style={{padding:'16px',textAlign:'center',color:'var(--ac)',fontSize:12}}>⏳ Uploading...</div>}
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:6}}>
              {photos.map((url,i)=>(<div key={i} style={{position:'relative',paddingBottom:'100%',borderRadius:6,overflow:'hidden',border:'1px solid var(--bdr)'}}><img src={url} alt="" style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'cover',cursor:'pointer'}} onClick={()=>setLightbox(url)}/><button onClick={()=>handleDelete(url)} style={{position:'absolute',top:4,right:4,background:'rgba(0,0,0,0.7)',border:'none',color:'white',borderRadius:3,width:24,height:24,cursor:'pointer',fontSize:14,display:'flex',alignItems:'center',justifyContent:'center'}}>×</button></div>))}
            </div>
          </div>
        </div>
        <div className="mf"><button className="btn bg" onClick={onClose}>Close</button>{onEdit&&<button className="btn bp" onClick={()=>onEdit(job)}>✏️ Edit</button>}</div>
      </div>
      {lightbox&&(<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.95)',zIndex:100,display:'flex',alignItems:'center',justifyContent:'center',padding:20}} onClick={()=>setLightbox(null)}><img src={lightbox} alt="" style={{maxWidth:'100%',maxHeight:'100%',objectFit:'contain',borderRadius:6}}/><button style={{position:'absolute',top:20,right:20,background:'rgba(255,255,255,0.1)',border:'none',color:'white',fontSize:24,cursor:'pointer',borderRadius:4,width:44,height:44,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={()=>setLightbox(null)}>×</button></div>)}
    </div>
  );
}

function JobCard({j,onEdit,onDelete}){
  const statusClass=(j.status||'Pending').replace(' ','');
  return(
    <div className={"job-card "+(j.priority==='Urgent'?'Urgent':statusClass)}>
      <div className="job-card-header">
        <div style={{flex:1,minWidth:0}}><div className="job-card-id">{j.job_id}</div><div className="job-card-customer">{j.customer||'—'}</div><div className="job-card-equip">{j.equipment||'—'}</div></div>
        <div style={{display:'flex',flexDirection:'column',gap:4,alignItems:'flex-end',flexShrink:0}}><StBadge s={j.status}/>{j.priority && j.priority !== 'Normal' && <PriorityBadge p={j.priority}/>}</div>
      </div>
      <div className="job-card-meta">{j.technician&&<span className="job-card-tag">👤 {j.technician}</span>}{j.date&&<span className="job-card-tag">📅 {j.date}</span>}{j.amount&&<span className="job-card-tag">💰 ${j.amount}</span>}<FollowupPill job={j}/></div>
      {j.notes&&<div style={{fontSize:11,color:'var(--txd)',marginTop:8,fontStyle:'italic',borderLeft:'2px solid var(--bdr)',paddingLeft:8,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{j.notes}</div>}
      <div className="job-card-actions"><button className="btn bg bs" style={{flex:1,height:40}} onClick={()=>onEdit(j)}>✏️ Edit</button><button className="btn bd bs" style={{height:40,width:44}} onClick={()=>onDelete(j.id)}>🗑</button></div>
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
  const filterLabel=filter==='active'?'Active':filter==='today'?'Today':filter==='pending'?'Pending':filter==='urgent'?'Urgent':null;
  return(<>
    <div className="mob-kpi-row">
      <div className={"mob-kpi am"+(filter==='active'?' selected':'')} onClick={()=>toggleFilter('active')}><div className="kl">Active</div><div className="kv">{active.length}</div></div>
      <div className={"mob-kpi bl"+(filter==='today'?' selected':'')} onClick={()=>toggleFilter('today')}><div className="kl">Today</div><div className="kv">{todayJobs.length}</div></div>
      <div className={"mob-kpi rd"+(filter==='pending'?' selected':'')} onClick={()=>toggleFilter('pending')}><div className="kl">Pending</div><div className="kv">{pending.length}</div></div>
      <div className={"mob-kpi gr"+(filter==='urgent'?' selected':'')} onClick={()=>toggleFilter('urgent')}><div className="kl">Urgent</div><div className="kv">{urgent.length}</div></div>
    </div>
    <button className="btn bp" style={{width:'100%',justifyContent:'center',height:48,fontSize:14,marginBottom:14}} onClick={onNewJob}>+ New Job</button>
    {filter&&filteredJobs&&<><div className="filter-bar"><div className="filter-label">▸ {filterLabel} ({filteredJobs.length})</div><div className="filter-clear" onClick={()=>setFilter(null)}>✕ Clear</div></div>{filteredJobs.map(j=><JobCard key={j.id} j={j} onEdit={onEditJob} onDelete={onDeleteJob}/>)}{!filteredJobs.length&&<div className="empty"><div className="ei">✅</div>No {filterLabel.toLowerCase()} jobs</div>}</>}
    {!filter&&<>{active.length>0&&<><div className="mob-section"><div className="mob-section-title">Active</div><div className="mob-section-count">{active.length}</div></div>{active.map(j=><JobCard key={j.id} j={j} onEdit={onEditJob} onDelete={onDeleteJob}/>)}</>}{todayJobs.filter(j=>!active.includes(j)).length>0&&<><div className="mob-section"><div className="mob-section-title">Scheduled Today</div><div className="mob-section-count">{todayJobs.length}</div></div>{todayJobs.filter(j=>!['In Progress','Dispatched'].includes(j.status)).map(j=><JobCard key={j.id} j={j} onEdit={onEditJob} onDelete={onDeleteJob}/>)}</>}{!active.length&&!todayJobs.length&&<div className="empty" style={{marginTop:20}}><div className="ei">✅</div>No active jobs today</div>}</>}
  </>);
}

function DashJobTile({j,onClick}){
  const sc=(j.status||'Pending').replace(' ','');
  const border=sc==='InProgress'?'var(--am)':sc==='Dispatched'?'var(--ac)':sc==='Complete'?'var(--gr)':'var(--txd)';
  return(
    <div onClick={()=>onClick(j)} style={{background:'var(--sur)',border:`1px solid ${j.priority==='Urgent'?'rgba(255,77,106,0.3)':j.priority==='High'?'rgba(255,176,32,0.25)':'var(--bdr)'}`,borderRadius:8,padding:'12px 14px',cursor:'pointer',position:'relative',overflow:'hidden',transition:'border-color .15s'}}
      onMouseEnter={e=>e.currentTarget.style.borderColor=border} onMouseLeave={e=>e.currentTarget.style.borderColor=j.priority==='Urgent'?'rgba(255,77,106,0.3)':j.priority==='High'?'rgba(255,176,32,0.25)':'var(--bdr)'}>
      <div style={{position:'absolute',left:0,top:0,bottom:0,width:3,background:j.priority==='Urgent'?'var(--rd)':j.priority==='High'?'var(--am)':border}}/>
      <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:9,color:'var(--ac)',letterSpacing:1,marginBottom:4}}>{j.job_id}</div>
      <div style={{fontSize:13,fontWeight:600,marginBottom:2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{j.customer||'—'}</div>
      <div style={{fontSize:11,color:'var(--txd)',marginBottom:8,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{j.equipment||'—'}</div>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:4}}><StBadge s={j.status}/>{j.priority && j.priority !== 'Normal' && <PriorityBadge p={j.priority}/>}</div>
      {j.date&&<div style={{fontSize:10,color:'var(--txm)',fontFamily:"'IBM Plex Mono',monospace",marginTop:4}}>📅 {j.date}</div>}
      {j.followup&&<div style={{marginTop:6}}><FollowupPill job={j}/></div>}
    </div>
  );
}

function useDragResize(defaultWidth=280, min=180, max=520){
  const [width, setWidth] = useState(defaultWidth);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startW = useRef(defaultWidth);
  const onMouseDown = useCallback((e) => { dragging.current = true; startX.current = e.clientX; startW.current = width; document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none'; }, [width]);
  useEffect(() => {
    const onMove = (e) => { if (!dragging.current) return; const delta = startX.current - e.clientX; setWidth(Math.min(max, Math.max(min, startW.current + delta))); };
    const onUp = () => { dragging.current = false; document.body.style.cursor = ''; document.body.style.userSelect = ''; };
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [min, max]);
  return { width, onMouseDown };
}

function CalendarNotePanel({ dateStr, note, onSave, onClose }) {
  const [text, setText] = useState(note?.note_text || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const taRef = useRef(null);
  useEffect(() => { setText(note?.note_text || ''); setSaved(false); setTimeout(() => taRef.current?.focus(), 50); }, [dateStr, note]);
  const fmt = (ds) => { const [y, m, d] = ds.split('-').map(Number); return new Date(y, m-1, d).toLocaleDateString('en-CA', { weekday:'long', month:'long', day:'numeric' }); };
  const handleSave = async () => { setSaving(true); await onSave(dateStr, text); setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000); };
  return (
    <div className="cal-note-panel">
      <div className="cal-note-header"><div><div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:9,color:'var(--txd)',letterSpacing:2,textTransform:'uppercase',marginBottom:3}}>📝 Day Note</div><div className="cal-note-date">{fmt(dateStr)}</div></div><button className="cal-note-close" onClick={onClose}>×</button></div>
      <textarea ref={taRef} className="cal-note-ta" placeholder="Note for this day... (Ctrl+Enter to save)" value={text} onChange={e=>{setText(e.target.value);setSaved(false);}} onKeyDown={e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter')handleSave();if(e.key==='Escape')onClose();}}/>
      <div className="cal-note-actions">{saved && <span className="cal-note-saved">✓ Saved</span>}{text && <button className="btn bd bs" onClick={()=>{setText('');onSave(dateStr,'');}}>Clear</button>}<button className="btn bg bs" onClick={onClose}>Close</button><button className="btn bp bs" onClick={handleSave} disabled={saving}>{saving?'Saving...':'Save'}</button></div>
    </div>
  );
}

function DashCalendar({ jobs, calNotes }) {
  const now = new Date();
  const [vd, setVd] = useState(new Date(now.getFullYear(), now.getMonth(), 1));
  const dim = new Date(vd.getFullYear(), vd.getMonth()+1, 0).getDate();
  const fd = new Date(vd.getFullYear(), vd.getMonth(), 1).getDay();
  const days = ['Su','Mo','Tu','We','Th','Fr','Sa'];
  const dateKey = (d) => `${vd.getFullYear()}-${String(vd.getMonth()+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  const jobsFor = d => jobs.filter(j => j.date === dateKey(d));
  const hasNote = d => calNotes[dateKey(d)]?.note_text?.trim();
  const cells = [...Array(fd).fill(null), ...Array.from({length:dim}, (_,i) => i+1)];
  return (
    <div style={{background:'var(--sur)',border:'1px solid var(--bdr)',borderRadius:6,overflow:'hidden',display:'flex',flexDirection:'column',height:'100%'}}>
      <div style={{padding:'10px 14px',borderBottom:'1px solid var(--bdr)',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
        <div style={{fontFamily:"'Rajdhani',sans-serif",fontWeight:600,fontSize:12,letterSpacing:1,textTransform:'uppercase',color:'var(--txm)'}}>{vd.toLocaleString('default',{month:'long',year:'numeric'})}</div>
        <div style={{display:'flex',gap:4}}><button className="btn bg bs" onClick={()=>setVd(new Date(vd.getFullYear(),vd.getMonth()-1,1))}>‹</button><button className="btn bg bs" onClick={()=>setVd(new Date(now.getFullYear(),now.getMonth(),1))}>●</button><button className="btn bg bs" onClick={()=>setVd(new Date(vd.getFullYear(),vd.getMonth()+1,1))}>›</button></div>
      </div>
      <div style={{flex:1,overflow:'auto',padding:'6px'}}>
        <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:2,marginBottom:2}}>{days.map(d=><div key={d} style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:8,color:'var(--txd)',textAlign:'center',padding:'2px 0'}}>{d}</div>)}</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:2}}>
          {cells.map((d,i) => {
            if (!d) return <div key={'e'+i}/>;
            const isToday = d===now.getDate()&&vd.getMonth()===now.getMonth()&&vd.getFullYear()===now.getFullYear();
            const dj = jobsFor(d); const note = hasNote(d);
            return (<div key={d} style={{minHeight:48,background:isToday?'rgba(0,200,255,0.06)':'var(--sur2)',border:`1px solid ${isToday?'var(--ac)':note?'rgba(255,176,32,0.35)':'var(--bdr)'}`,borderRadius:3,padding:'3px 2px'}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:2}}><div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:8,color:isToday?'var(--ac)':'var(--txm)',fontWeight:isToday?700:400}}>{d}</div>{note && <div style={{width:4,height:4,borderRadius:'50%',background:'var(--am)',flexShrink:0}}/>}</div>
              {dj.slice(0,2).map(j=>(<div key={j.id} style={{fontSize:7,padding:'1px 2px',borderRadius:2,marginBottom:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',background:j.status==='In Progress'?'var(--amd)':j.status==='Dispatched'?'var(--acd)':j.status==='Complete'?'var(--grd)':'rgba(90,106,128,0.15)',color:j.status==='In Progress'?'var(--am)':j.status==='Dispatched'?'var(--ac)':j.status==='Complete'?'var(--gr)':'var(--txd)'}}>{j.customer}</div>))}
              {dj.length>2&&<div style={{fontSize:7,color:'var(--txd)',textAlign:'center'}}>+{dj.length-2}</div>}
            </div>);
          })}
        </div>
      </div>
    </div>
  );
}

function Dashboard({jobs, onEditJob, calNotes, onSaveNote}){
  const [viewJob,setViewJob]=useState(null);
  const boardJobs=jobs.filter(j=>!(['Invoiced','Paid'].includes(j.invoice_status)));
  const groups=[
    {label:'Pending',color:'var(--txd)',jobs:boardJobs.filter(j=>j.status==='Pending')},
    {label:'Dispatched',color:'var(--ac)',jobs:boardJobs.filter(j=>j.status==='Dispatched')},
    {label:'In Progress',color:'var(--am)',jobs:boardJobs.filter(j=>j.status==='In Progress')},
    {label:'Complete',color:'var(--gr)',jobs:boardJobs.filter(j=>j.status==='Complete')},
  ];
  const {width: calWidth, onMouseDown: onDragStart} = useDragResize(260, 180, 480);
  return(<>
    <DailyFocusPanel jobs={jobs} onEditJob={(j)=>{setViewJob(null);onEditJob(j);}} calNotes={calNotes} onSaveNote={onSaveNote}/>
    <div style={{display:'flex',gap:0,alignItems:'flex-start'}}>
      <div style={{flex:1,minWidth:0,paddingRight:10}}>
        {groups.map(g=>(
          <div key={g.label} style={{marginBottom:18}}>
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}><div style={{width:3,height:14,borderRadius:2,background:g.color}}/><div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:'var(--txm)',letterSpacing:2,textTransform:'uppercase'}}>{g.label}</div><div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:g.color}}>{g.jobs.length}</div></div>
            {g.jobs.length===0&&<div style={{padding:'10px 14px',background:'var(--sur)',border:'1px solid var(--bdr)',borderRadius:6,fontSize:12,color:'var(--txd)'}}>No {g.label.toLowerCase()} jobs</div>}
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(190px,1fr))',gap:8}}>{g.jobs.map(j=><DashJobTile key={j.id} j={j} onClick={setViewJob}/>)}</div>
          </div>
        ))}
      </div>
      <div className="desktop-only" style={{display:'flex',alignItems:'stretch'}}>
        <div onMouseDown={onDragStart} style={{width:8,flexShrink:0,cursor:'col-resize',display:'flex',alignItems:'center',justifyContent:'center',alignSelf:'stretch',marginRight:4}} title="Drag to resize">
          <div style={{width:3,height:60,borderRadius:3,background:'var(--bdr2)',transition:'background 0.15s'}} onMouseEnter={e=>e.currentTarget.style.background='var(--ac)'} onMouseLeave={e=>e.currentTarget.style.background='var(--bdr2)'}/>
        </div>
        <div style={{width:calWidth,flexShrink:0,position:'sticky',top:0,height:'calc(100vh - 120px)'}}><DashCalendar jobs={jobs} calNotes={calNotes}/></div>
      </div>
    </div>
    {viewJob&&<JobDetailModal job={viewJob} onClose={()=>setViewJob(null)} onEdit={(j)=>{setViewJob(null);onEditJob(j);}}/>}
  </>);
}

function JobFormModal({job,customers,technicians,onSave,onClose}){
  const [f,setF]=useState(job?{...job}:{job_id:'JO-'+Date.now().toString().slice(-4),status:'Pending',priority:'Normal',invoice_status:'Not Invoiced',followup:false});
  return(
    <Modal title={job?.id?'Edit Job':'New Job'} onClose={onClose} onSave={()=>onSave(f)} saveLabel={job?.id?'Save':'Create Job'}>
      <div className="fr"><div className="fg"><label className="fl">Job ID</label><input className="fi" value={f.job_id||''} onChange={e=>setF({...f,job_id:e.target.value})}/></div><div className="fg"><label className="fl">Status</label><select className="fsl" value={f.status||'Pending'} onChange={e=>setF({...f,status:e.target.value})}><option>Pending</option><option>Dispatched</option><option>In Progress</option><option>Complete</option></select></div></div>
      <div className="fg"><label className="fl">Customer</label><select className="fsl" value={f.customer||''} onChange={e=>setF({...f,customer:e.target.value})}><option value="">Select customer...</option>{[...customers].sort((a,b)=>(a.company||'').localeCompare(b.company||'')).map(c=><option key={c.id}>{c.company}</option>)}</select></div>
      <div className="fg"><label className="fl">Equipment</label><input className="fi" placeholder="e.g. DWX-52D" value={f.equipment||''} onChange={e=>setF({...f,equipment:e.target.value})}/></div>
      <div className="fr"><div className="fg"><label className="fl">Technician</label><select className="fsl" value={f.technician||''} onChange={e=>setF({...f,technician:e.target.value})}><option value="">Unassigned</option>{technicians.map(t=><option key={t.id}>{t.name}</option>)}</select></div><div className="fg"><label className="fl">Priority</label><select className="fsl" value={f.priority||'Normal'} onChange={e=>setF({...f,priority:e.target.value})} style={{color:f.priority==='Urgent'?'var(--rd)':f.priority==='High'?'var(--am)':f.priority==='Low'?'var(--txd)':'var(--tx)',borderColor:f.priority==='Urgent'?'rgba(255,77,106,0.4)':f.priority==='High'?'rgba(255,176,32,0.3)':'var(--bdr)'}}><option value="Low">🔵 Low</option><option value="Normal">⚪ Normal</option><option value="High">🟡 High</option><option value="Urgent">🔴 Urgent</option></select></div></div>
      <div className="fr"><div className="fg"><label className="fl">Date</label><input className="fi" type="date" value={f.date||''} onChange={e=>setF({...f,date:e.target.value})}/></div><div className="fg"><label className="fl">Amount ($)</label><input className="fi" type="number" value={f.amount||''} onChange={e=>setF({...f,amount:e.target.value})}/></div></div>
      <div className="fg"><label className="fl">Invoice Status</label><select className="fsl" value={f.invoice_status||'Not Invoiced'} onChange={e=>setF({...f,invoice_status:e.target.value})}><option>Not Invoiced</option><option>Invoiced</option><option>Paid</option><option>Overdue</option></select></div>
      <div className="fg"><label className="fl">Notes</label><textarea className="fta" value={f.notes||''} onChange={e=>setF({...f,notes:e.target.value})}/></div>
      <div style={{borderTop:'1px solid var(--bdr)',paddingTop:14,marginTop:4}}>
        <label style={{display:'flex',alignItems:'center',gap:10,cursor:'pointer',marginBottom:f.followup?12:0,minHeight:44}}><input type="checkbox" checked={!!f.followup} onChange={e=>setF({...f,followup:e.target.checked,followup_date:e.target.checked?(f.followup_date||new Date(Date.now()+86400000*3).toISOString().split('T')[0]):null})} style={{width:20,height:20,accentColor:'var(--gr)',cursor:'pointer'}}/><span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:11,color:'var(--gr)',letterSpacing:.5}}>📞 NEEDS FOLLOW-UP</span></label>
        {f.followup && (<div style={{background:'rgba(34,212,122,0.05)',border:'1px solid rgba(34,212,122,0.2)',borderRadius:6,padding:12,marginTop:4}}><div className="fr"><div className="fg" style={{marginBottom:0}}><label className="fl">Follow-up Date</label><input className="fi" type="date" value={f.followup_date||''} onChange={e=>setF({...f,followup_date:e.target.value})}/></div><div className="fg" style={{marginBottom:0}}><label className="fl">Reason</label><input className="fi" placeholder="e.g. Call re: quote..." value={f.followup_note||''} onChange={e=>setF({...f,followup_note:e.target.value})}/></div></div></div>)}
      </div>
    </Modal>
  );
}

function Followups({ jobs, onEdit, loading }) {
  const [viewJob, setViewJob] = useState(null);
  const followupJobs = jobs.filter(j => j.followup && j.status !== 'Complete' && !isArchived(j)).sort((a,b) => new Date(a.followup_date||'9999') - new Date(b.followup_date||'9999'));
  const overdue = followupJobs.filter(isFollowupOverdue);
  const today = followupJobs.filter(j => !isFollowupOverdue(j) && daysUntilFollowup(j) === 0);
  const upcoming = followupJobs.filter(j => !isFollowupOverdue(j) && daysUntilFollowup(j) > 0);
  const renderGroup = (label, items, cardClass) => {
    if (!items.length) return null;
    return (<div style={{marginBottom:20}}>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}><div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:'var(--txm)',letterSpacing:2,textTransform:'uppercase'}}>{label}</div><div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:cardClass==='overdue'?'var(--rd)':cardClass==='today'?'var(--am)':'var(--ac)'}}>{items.length}</div></div>
      {items.map(j => { const days = daysUntilFollowup(j); return (
        <div key={j.id} className={`followup-card ${cardClass}`} onClick={() => setViewJob(j)} style={{cursor:'pointer'}}>
          <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:10}}>
            <div style={{flex:1,minWidth:0}}><div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:9,color:'var(--ac)',marginBottom:3}}>{j.job_id}</div><div style={{fontSize:15,fontWeight:600,marginBottom:2}}>{j.customer}</div><div style={{fontSize:12,color:'var(--txd)',marginBottom:8}}>{j.equipment||'—'}</div>{j.followup_note && <div style={{fontSize:13,color:'var(--tx)',background:'var(--sur2)',padding:'8px 10px',borderRadius:4,border:'1px solid var(--bdr)',lineHeight:1.5}}>📞 {j.followup_note}</div>}</div>
            <div style={{textAlign:'right',flexShrink:0}}><div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:11,fontWeight:700,color:cardClass==='overdue'?'var(--rd)':cardClass==='today'?'var(--am)':'var(--ac)',marginBottom:6}}>{cardClass==='overdue'?`${Math.abs(days)}d over`:cardClass==='today'?'Today':`${days}d`}</div><div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:'var(--txd)',marginBottom:6}}>{j.followup_date}</div><StBadge s={j.status}/></div>
          </div>
          <div style={{display:'flex',gap:8,marginTop:12,paddingTop:10,borderTop:'1px solid var(--bdr)'}}><button className="btn bfollowup bs" style={{flex:1,height:40}} onClick={e=>{e.stopPropagation();onEdit(j);}}>✏️ Edit Job</button><button className="btn bg bs" style={{height:40}} onClick={e=>{e.stopPropagation();onEdit({...j,followup:false,followup_date:null,followup_note:null});}}>✓ Done</button></div>
        </div>
      ); })}
    </div>);
  };
  return (<>
    <div className="panel"><div className="ph"><div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}><div className="pt">Follow-ups</div>{overdue.length > 0 && <span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:9,color:'var(--rd)',background:'var(--rdd)',border:'1px solid rgba(255,77,106,0.3)',padding:'2px 7px',borderRadius:3}}>⚠ {overdue.length} OVERDUE</span>}</div><div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:'var(--txd)'}}>{followupJobs.length} total</div></div>
      <div style={{padding:14}}>{loading ? <Loading/> : <>{!followupJobs.length && <div className="empty"><div className="ei">✅</div>No follow-ups needed.</div>}{renderGroup('⚠ Overdue', overdue, 'overdue')}{renderGroup('📅 Due Today', today, 'today')}{renderGroup('📆 Upcoming', upcoming, 'upcoming')}</>}</div>
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
  const filtered=[...jobs].reverse().filter(j=>{ const q=search.toLowerCase(); const ms=!q||(j.customer||'').toLowerCase().includes(q)||(j.equipment||'').toLowerCase().includes(q)||(j.notes||'').toLowerCase().includes(q)||(j.job_id||'').toLowerCase().includes(q); const mc=!clientFilter||j.customer===clientFilter; return ms&&mc; });
  const save=(f)=>{editJob?.id?onEdit({...f}):onAdd({...f});setShowForm(false);setEditJob(null);};
  const openEdit=(j)=>{setEditJob(j);setShowForm(true);};
  const openNew=()=>{setEditJob(null);setShowForm(true);};
  return(<>
    <div className="panel desktop-table">
      <div className="ph"><div className="pt">Jobs ({filtered.length}{filtered.length!==jobs.length?` of ${jobs.length}`:''})</div><button className="btn bp bs" onClick={openNew}>+ New Job</button></div>
      <div style={{padding:'10px 14px',borderBottom:'1px solid var(--bdr)',display:'flex',gap:8,flexWrap:'wrap'}}><input className="fi" placeholder="🔍 Search jobs, equipment, notes..." value={search} onChange={e=>setSearch(e.target.value)} style={{marginBottom:0,flex:2,minWidth:160}}/><select className="fsl" value={clientFilter} onChange={e=>setClientFilter(e.target.value)} style={{flex:1,minWidth:120,marginBottom:0}}><option value="">All clients</option>{clients.map(c=><option key={c}>{c}</option>)}</select></div>
      {loading?<Loading/>:<div className="tbl">
        <div className="tr hdr" style={{gridTemplateColumns:'90px 1fr 110px 90px 80px 100px 80px 70px'}}><div className="cl">ID</div><div className="cl">Customer/Equip</div><div className="cl">Tech</div><div className="cl">Date</div><div className="cl">Amount</div><div className="cl">Priority</div><div className="cl">Status</div><div className="cl">Act.</div></div>
        {filtered.map(j=>(<div key={j.id} className="tr" style={{gridTemplateColumns:'90px 1fr 110px 90px 80px 100px 80px 70px',borderLeft:j.priority==='Urgent'?'2px solid var(--rd)':j.priority==='High'?'2px solid var(--am)':'2px solid transparent'}} onClick={()=>setViewJob(j)}><div className="ci">{j.job_id}</div><div><div className="cm">{j.customer||'—'}</div><div className="cs">{j.equipment||'—'}</div>{j.followup&&<FollowupPill job={j}/>}</div><div className="cd">{j.technician||'—'}</div><div className="cn">{j.date||'—'}</div><div className="cv">{j.amount?'$'+j.amount:'—'}</div><div><PriorityBadge p={j.priority}/></div><div><StBadge s={j.status}/></div><div style={{display:'flex',gap:4}} onClick={e=>e.stopPropagation()}><button className="btn bg bs" onClick={()=>openEdit(j)}>✏️</button><button className="btn bd bs" onClick={()=>onDelete(j.id)}>🗑</button></div></div>))}
        {!filtered.length&&<div className="empty"><div className="ei">📋</div>{search||clientFilter?'No jobs match.':'No jobs yet!'}</div>}
      </div>}
    </div>
    <div className="mobile-cards">
      <div style={{display:'flex',gap:8,marginBottom:12}}><input className="fi" placeholder="🔍 Search..." value={search} onChange={e=>setSearch(e.target.value)} style={{marginBottom:0,flex:1}}/></div>
      <button className="btn bp" style={{width:'100%',height:48,fontSize:14,justifyContent:'center',marginBottom:14}} onClick={openNew}>+ New Job</button>
      {loading?<Loading/>:filtered.map(j=><JobCard key={j.id} j={j} onEdit={openEdit} onDelete={onDelete}/>)}
      {!loading&&!filtered.length&&<div className="empty"><div className="ei">📋</div>{search?'No match.':'No jobs yet!'}</div>}
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
  const filtered=[...customers].sort((a,b)=>(a.company||'').localeCompare(b.company||'')).filter(c=>(c.company||'').toLowerCase().includes(search.toLowerCase())||(c.contact||'').toLowerCase().includes(search.toLowerCase()));
  const open=(c)=>{setF(c?{...c}:{});setForm(c||{});};
  const save=()=>{form?.id?onEdit({...f}):onAdd({...f});setForm(null);};
  return(<>
    <div className="panel">
      <div className="ph"><div className="pt">Customers ({customers.length})</div><button className="btn bp bs" onClick={()=>open(null)}>+ New</button></div>
      <div style={{padding:'10px 14px',borderBottom:'1px solid var(--bdr)'}}><input className="fi" placeholder="🔍 Search customers..." value={search} onChange={e=>setSearch(e.target.value)} style={{marginBottom:0}}/></div>
      {loading?<Loading/>:<>
        <div className="desktop-table tbl">
          <div className="tr hdr" style={{gridTemplateColumns:'1fr 130px 60px 70px'}}><div className="cl">Company/Contact</div><div className="cl">Phone</div><div className="cl">Jobs</div><div className="cl">Act.</div></div>
          {filtered.map(c=>{ const cJobs=jobs.filter(j=>j.customer===c.company); const isOpen=expanded===c.id; return(<>
            <div key={c.id} className="tr" style={{gridTemplateColumns:'1fr 130px 60px 70px',background:isOpen?'var(--sur2)':''}} onClick={()=>setExpanded(isOpen?null:c.id)}><div><div className="cm">{c.company||'—'}</div><div className="cs">{c.contact||''}</div></div><div className="cn">{c.phone||'—'}</div><div style={{fontFamily:"'Rajdhani',sans-serif",fontWeight:600,color:'var(--ac)'}}>{cJobs.length}</div><div style={{display:'flex',gap:4}} onClick={e=>e.stopPropagation()}><button className="btn bg bs" onClick={()=>open(c)}>✏️</button><button className="btn bd bs" onClick={()=>onDelete(c.id)}>🗑</button></div></div>
            {isOpen&&<div key={c.id+'-jobs'} style={{background:'var(--sur3)',borderBottom:'1px solid var(--bdr)',padding:'0 0 8px 0'}}><div style={{padding:'8px 14px 4px',fontFamily:"'IBM Plex Mono',monospace",fontSize:9,color:'var(--txd)',letterSpacing:2,textTransform:'uppercase'}}>Job History — {c.company}</div>{cJobs.length===0&&<div style={{padding:'10px 14px',fontSize:12,color:'var(--txd)'}}>No jobs.</div>}{cJobs.map(j=>(<div key={j.id} style={{display:'grid',gridTemplateColumns:'90px 1fr 90px 80px',alignItems:'center',padding:'8px 14px',borderTop:'1px solid var(--bdr)',cursor:'pointer',transition:'background .1s'}} onClick={()=>setViewJob(j)} onMouseEnter={e=>e.currentTarget.style.background='var(--sur2)'} onMouseLeave={e=>e.currentTarget.style.background=''}><div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:11,color:'var(--ac)'}}>{j.job_id}</div><div><div style={{fontSize:12,fontWeight:500}}>{j.equipment||'—'}</div></div><div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:'var(--txm)'}}>{j.date||'—'}</div><StBadge s={j.status}/></div>))}</div>}
          </>);})}
          {!customers.length&&<div className="empty"><div className="ei">🏢</div>No customers yet.</div>}
        </div>
        <div className="mobile-cards" style={{padding:12}}>
          {filtered.map(c=>{ const cJobs=jobs.filter(j=>j.customer===c.company); const isOpen=expanded===c.id; return(
            <div key={c.id} style={{background:'var(--sur2)',border:'1px solid var(--bdr)',borderRadius:8,marginBottom:10,overflow:'hidden'}}>
              <div style={{padding:'12px 14px',display:'flex',alignItems:'center',justifyContent:'space-between'}} onClick={()=>setExpanded(isOpen?null:c.id)}><div><div style={{fontSize:15,fontWeight:600}}>{c.company||'—'}</div>{c.contact&&<div style={{fontSize:12,color:'var(--txd)',marginTop:2}}>{c.contact}</div>}{c.phone&&<div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:11,color:'var(--txm)',marginTop:2}}>📞 {c.phone}</div>}</div><div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:8}}><div style={{fontFamily:"'Rajdhani',sans-serif",fontWeight:700,fontSize:18,color:'var(--ac)'}}>{cJobs.length} jobs</div><div style={{display:'flex',gap:6}}><button className="btn bg bs" onClick={e=>{e.stopPropagation();open(c);}}>✏️</button><button className="btn bd bs" onClick={e=>{e.stopPropagation();onDelete(c.id);}}>🗑</button></div></div></div>
              {isOpen&&cJobs.map(j=>(<div key={j.id} style={{padding:'10px 14px',borderTop:'1px solid var(--bdr)',background:'var(--sur3)',display:'flex',alignItems:'center',justifyContent:'space-between',gap:8}} onClick={()=>setViewJob(j)}><div style={{flex:1,minWidth:0}}><div style={{fontSize:12,fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{j.equipment||j.job_id}</div><div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:'var(--txd)',marginTop:2}}>{j.date||'—'}</div></div><StBadge s={j.status}/></div>))}
            </div>
          );})}
          {!customers.length&&<div className="empty"><div className="ei">🏢</div>No customers yet.</div>}
        </div>
      </>}
    </div>
    {viewJob&&<JobDetailModal job={viewJob} onClose={()=>setViewJob(null)}/>}
    {form!==null&&(<Modal title={form?.id?'Edit Customer':'New Customer'} onClose={()=>setForm(null)} onSave={save} saveLabel={form?.id?'Save':'Add Customer'}>
      <div className="fg"><label className="fl">Company Name</label><input className="fi" value={f.company||''} onChange={e=>setF({...f,company:e.target.value})}/></div>
      <div className="fr"><div className="fg"><label className="fl">Contact Name</label><input className="fi" value={f.contact||''} onChange={e=>setF({...f,contact:e.target.value})}/></div><div className="fg"><label className="fl">Phone</label><input className="fi" value={f.phone||''} onChange={e=>setF({...f,phone:e.target.value})}/></div></div>
      <div className="fg"><label className="fl">Email</label><input className="fi" type="email" value={f.email||''} onChange={e=>setF({...f,email:e.target.value})}/></div>
      <div className="fg"><label className="fl">Address</label><textarea className="fta" style={{minHeight:55}} value={f.address||''} onChange={e=>setF({...f,address:e.target.value})}/></div>
      <div className="fg"><label className="fl">Notes</label><textarea className="fta" value={f.notes||''} onChange={e=>setF({...f,notes:e.target.value})}/></div>
    </Modal>)}
  </>);
}

function Technicians({technicians,onAdd,onEdit,onDelete,loading}){
  const [form,setForm]=useState(null);
  const [f,setF]=useState({});
  const open=(t)=>{setF(t?{...t}:{status:'Available'});setForm(t||{});};
  const save=()=>{const ini=(f.name||'').split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);form?.id?onEdit({...f,initials:ini}):onAdd({...f,initials:ini});setForm(null);};
  return(<>
    <div className="panel"><div className="ph"><div className="pt">Technicians ({technicians.length})</div><button className="btn bp bs" onClick={()=>open(null)}>+ Add</button></div>
      {loading?<Loading/>:<div className="tgrid">{technicians.map(t=>(<div key={t.id} className="tc"><div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}><div className={"tav "+(t.status||'Offline')}>{(t.initials||(t.name||'?').substring(0,2)).toUpperCase()}</div><div><div style={{fontSize:13,fontWeight:500}}>{t.name}</div><StBadge s={t.status}/></div></div><div style={{fontSize:11,color:'var(--txd)',marginBottom:3,fontFamily:"'IBM Plex Mono',monospace"}}>📧 {t.email||'—'}</div><div style={{fontSize:11,color:'var(--txd)',marginBottom:3,fontFamily:"'IBM Plex Mono',monospace"}}>📞 {t.phone||'—'}</div><div style={{display:'flex',gap:6,marginTop:10}}><button className="btn bg bs" style={{flex:1,height:40}} onClick={()=>open(t)}>✏️ Edit</button><button className="btn bd bs" style={{height:40}} onClick={()=>onDelete(t.id)}>🗑</button></div></div>))}{!technicians.length&&<div className="empty" style={{gridColumn:'1/-1'}}><div className="ei">👷</div>No technicians yet.</div>}</div>}
    </div>
    {form!==null&&(<Modal title={form?.id?'Edit Technician':'New Technician'} onClose={()=>setForm(null)} onSave={save} saveLabel={form?.id?'Save':'Add'}>
      <div className="fr"><div className="fg"><label className="fl">Full Name</label><input className="fi" value={f.name||''} onChange={e=>setF({...f,name:e.target.value})}/></div><div className="fg"><label className="fl">Status</label><select className="fsl" value={f.status||'Available'} onChange={e=>setF({...f,status:e.target.value})}><option>Available</option><option>Busy</option><option>Offline</option></select></div></div>
      <div className="fr"><div className="fg"><label className="fl">Email</label><input className="fi" type="email" value={f.email||''} onChange={e=>setF({...f,email:e.target.value})}/></div><div className="fg"><label className="fl">Phone</label><input className="fi" value={f.phone||''} onChange={e=>setF({...f,phone:e.target.value})}/></div></div>
      <div className="fg"><label className="fl">Current Job</label><input className="fi" value={f.current_job||''} onChange={e=>setF({...f,current_job:e.target.value})}/></div>
    </Modal>)}
  </>);
}

function Schedule({ jobs, calNotes, onSaveNote }) {
  const now = new Date();
  const [vd, setVd] = useState(new Date(now.getFullYear(), now.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(null);
  const [search, setSearch] = useState('');
  const searchRef = useRef(null);
  const dim = new Date(vd.getFullYear(), vd.getMonth()+1, 0).getDate();
  const fd = new Date(vd.getFullYear(), vd.getMonth(), 1).getDay();
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const dateKey = (d) => `${vd.getFullYear()}-${String(vd.getMonth()+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  const jobsFor = d => jobs.filter(j => j.date === dateKey(d));
  const noteFor = (key) => calNotes[key];
  const hasNote = d => calNotes[dateKey(d)]?.note_text?.trim();
  const cells = [...Array(fd).fill(null), ...Array.from({length:dim}, (_,i) => i+1)];
  const handleDayClick = (d) => { const key = dateKey(d); setSelectedDate(prev => prev === key ? null : key); setSearch(''); };
  const q = search.trim().toLowerCase();
  const searchResults = q ? (() => {
    const matched = [];
    jobs.forEach(j => { if((j.customer||'').toLowerCase().includes(q)||(j.equipment||'').toLowerCase().includes(q)||(j.notes||'').toLowerCase().includes(q)||(j.job_id||'').toLowerCase().includes(q)) matched.push({ date: j.date, job: j, noteText: null }); });
    Object.entries(calNotes).forEach(([date, note]) => { if((note.note_text||'').toLowerCase().includes(q)){ if(!matched.find(m=>m.date===date&&!m.noteText)) matched.push({date,job:null,noteText:note.note_text}); else matched.filter(m=>m.date===date).forEach(m=>{m.noteText=note.note_text;}); } });
    return matched.filter(m=>m.date).sort((a,b)=>b.date.localeCompare(a.date));
  })() : [];
  const highlight = (text, q) => { if(!q||!text) return text; const idx=text.toLowerCase().indexOf(q); if(idx===-1) return text; return <>{text.slice(0,idx)}<mark style={{background:'rgba(0,200,255,0.25)',color:'var(--ac)',borderRadius:2,padding:'0 2px'}}>{text.slice(idx,idx+q.length)}</mark>{text.slice(idx+q.length)}</>; };
  const groupedResults = searchResults.reduce((acc,m)=>{ if(!acc[m.date]) acc[m.date]={jobs:[],noteText:null}; if(m.job) acc[m.date].jobs.push(m.job); if(m.noteText) acc[m.date].noteText=m.noteText; return acc; },{});
  const fmtDate = (ds) => { const [y,mo,d]=ds.split('-').map(Number); return new Date(y,mo-1,d).toLocaleDateString('en-CA',{weekday:'short',month:'short',day:'numeric'}); };
  return (
    <div className="panel">
      <div className="ph"><div className="pt">{vd.toLocaleString('default',{month:'long',year:'numeric'})}</div><div style={{display:'flex',gap:6,alignItems:'center'}}><button className="btn bg bs" onClick={()=>setVd(new Date(vd.getFullYear(),vd.getMonth()-1,1))}>‹</button><button className="btn bg bs" onClick={()=>setVd(new Date(now.getFullYear(),now.getMonth(),1))}>●</button><button className="btn bg bs" onClick={()=>setVd(new Date(vd.getFullYear(),vd.getMonth()+1,1))}>›</button></div></div>
      <div style={{padding:'10px 12px',borderBottom:'1px solid var(--bdr)',display:'flex',gap:8}}><input ref={searchRef} className="fi" placeholder="🔍 Search all dates..." value={search} onChange={e=>{setSearch(e.target.value);setSelectedDate(null);}} style={{marginBottom:0,flex:1}}/>{search&&<button className="btn bg bs" onClick={()=>{setSearch('');searchRef.current?.focus();}}>✕</button>}</div>
      {q ? (
        <div style={{padding:12}}>
          {Object.keys(groupedResults).length===0 ? <div className="empty"><div className="ei">🔍</div>No matches for "{search}"</div> : (<>
            <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:9,color:'var(--txd)',letterSpacing:2,marginBottom:10}}>{Object.keys(groupedResults).length} date{Object.keys(groupedResults).length!==1?'s':''} matched</div>
            {Object.entries(groupedResults).map(([date,{jobs:mj,noteText}])=>(<div key={date} style={{background:'var(--sur2)',border:'1px solid var(--bdr)',borderRadius:6,marginBottom:8,overflow:'hidden'}}><div style={{padding:'8px 12px',borderBottom:(mj.length||noteText)?'1px solid var(--bdr)':'none',display:'flex',alignItems:'center',justifyContent:'space-between',cursor:'pointer',background:'var(--sur3)'}} onClick={()=>{setSearch('');setSelectedDate(date);setVd(new Date(date.slice(0,7)+'-01'));}}><div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:11,color:'var(--ac)',fontWeight:700}}>{fmtDate(date)}</div><div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:9,color:'var(--txd)'}}>open ›</div></div>{mj.map(j=>(<div key={j.id} style={{padding:'8px 12px',borderBottom:'1px solid var(--bdr)',display:'flex',justifyContent:'space-between',gap:8,alignItems:'center'}}><div style={{flex:1,minWidth:0}}><div style={{fontSize:13,fontWeight:600}}>{highlight(j.customer||'—',q)}</div><div style={{fontSize:11,color:'var(--txd)',marginTop:1}}>{highlight(j.equipment||'',q)}</div></div><StBadge s={j.status}/></div>))}{noteText&&<div style={{padding:'8px 12px',fontSize:12,color:'var(--txm)',display:'flex',gap:6}}><span style={{color:'var(--am)',flexShrink:0}}>📝</span><span style={{lineHeight:1.5}}>{highlight(noteText.slice(0,160),q)}</span></div>}</div>))}
          </>)}
        </div>
      ) : (<>
        <div className="cg">
          {days.map(d=><div key={d} className="cdl">{d.slice(0,2)}</div>)}
          {cells.map((d,i) => {
            if (!d) return <div key={"e"+i}/>;
            const isToday=d===now.getDate()&&vd.getMonth()===now.getMonth()&&vd.getFullYear()===now.getFullYear();
            const key=dateKey(d); const isSelected=selectedDate===key; const dj=jobsFor(d); const note=hasNote(d);
            return (<div key={d} className={"cd2 "+(isToday?'today ':'')+(note?'has-note ':'')} style={{border:isSelected?'1px solid var(--ac)':isToday?'1px solid var(--ac)':note?'1px solid rgba(255,176,32,0.4)':'1px solid var(--bdr)',background:isSelected?'rgba(0,200,255,0.08)':isToday?'rgba(0,200,255,0.04)':'var(--sur2)',cursor:'pointer'}} onClick={()=>handleDayClick(d)}>
              <div style={{display:'flex',alignItems:'center',gap:2,marginBottom:2}}><div className={"cdn "+(isToday?'tn':'')}>{d}</div>{note&&<div style={{width:5,height:5,borderRadius:'50%',background:'var(--am)',flexShrink:0}}/>}</div>
              {dj.map(j=><div key={j.id} className={"cj "+(j.status||'Pending').replace(' ','')} title={j.customer}>{j.customer||j.job_id}</div>)}
            </div>);
          })}
        </div>
        {selectedDate && (<div style={{padding:'0 12px 12px'}}><CalendarNotePanel dateStr={selectedDate} note={noteFor(selectedDate)} onSave={onSaveNote} onClose={()=>setSelectedDate(null)}/></div>)}
      </>)}
    </div>
  );
}

function Files({files, onUpload, onDelete, uploading}) {
  const [viewing, setViewing] = useState(null);
  const [search, setSearch] = useState('');
  const fileRef = useRef(null);
  const filtered = files.filter(f=>(f.name||'').toLowerCase().includes(search.toLowerCase()));
  const fmt = (bytes) => { if(!bytes) return '—'; if(bytes<1024) return bytes+' B'; if(bytes<1024*1024) return Math.round(bytes/1024)+' KB'; return (bytes/(1024*1024)).toFixed(1)+' MB'; };
  return (<>
    <div className="panel">
      <div className="ph"><div className="pt">Files</div><button className="btn bimport" onClick={()=>fileRef.current?.click()} disabled={uploading}>{uploading?'⏳ Uploading...':'⬆ Upload PDF'}</button><input ref={fileRef} type="file" accept="application/pdf" multiple style={{display:'none'}} onChange={e=>onUpload([...e.target.files]).then(()=>e.target.value='')}/></div>
      <div style={{padding:'10px 12px',borderBottom:'1px solid var(--bdr)'}}><input className="fi" placeholder="🔍 Search files..." value={search} onChange={e=>setSearch(e.target.value)} style={{marginBottom:0}}/></div>
      <div className="desktop-table tbl">
        <div className="tr hdr" style={{gridTemplateColumns:'28px 1fr 80px 90px 70px'}}><div className="cl"/><div className="cl">File Name</div><div className="cl">Size</div><div className="cl">Uploaded</div><div className="cl">Act.</div></div>
        {filtered.map(f=>(<div key={f.id} className="tr" style={{gridTemplateColumns:'28px 1fr 80px 90px 70px'}} onClick={()=>setViewing(f)}><div style={{fontSize:18}}>📄</div><div><div className="cm" style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{f.name||'Unnamed'}</div></div><div className="cn">{fmt(f.size)}</div><div className="cn">{f.created_at?new Date(f.created_at).toLocaleDateString('en-CA'):'—'}</div><div style={{display:'flex',gap:4}} onClick={e=>e.stopPropagation()}><button className="btn bg bs" onClick={()=>setViewing(f)}>👁</button><button className="btn bd bs" onClick={()=>onDelete(f)}>🗑</button></div></div>))}
        {!filtered.length&&!uploading&&<div className="empty"><div className="ei">📁</div>{search?'No match.':'No files yet.'}</div>}
        {uploading&&<Loading/>}
      </div>
      <div className="mobile-cards" style={{padding:12}}>
        {filtered.map(f=>(<div key={f.id} style={{background:'var(--sur2)',border:'1px solid var(--bdr)',borderRadius:8,padding:'12px 14px',marginBottom:10,display:'flex',alignItems:'center',gap:12}}><div style={{fontSize:28,flexShrink:0}}>📄</div><div style={{flex:1,minWidth:0}}><div style={{fontSize:13,fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{f.name||'Unnamed'}</div><div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:'var(--txd)',marginTop:3}}>{fmt(f.size)}</div></div><div style={{display:'flex',gap:6,flexShrink:0}}><button className="btn bg bs" style={{height:40}} onClick={()=>setViewing(f)}>👁</button><button className="btn bd bs" style={{height:40}} onClick={()=>onDelete(f)}>🗑</button></div></div>))}
        {!filtered.length&&!uploading&&<div className="empty"><div className="ei">📁</div>No files yet.</div>}
        {uploading&&<Loading/>}
      </div>
    </div>
    {viewing&&(<div className="mbg" onClick={()=>setViewing(null)}><div style={{background:'var(--sur)',border:'1px solid var(--bdr2)',borderRadius:8,width:'100%',maxWidth:860,height:'88vh',display:'flex',flexDirection:'column'}} onClick={e=>e.stopPropagation()}><div className="mh"><div className="mt" style={{fontSize:13}}>{viewing.name}</div><div style={{display:'flex',gap:8}}><a href={viewing.url} target="_blank" rel="noreferrer" className="btn bg bs" style={{textDecoration:'none'}}>⬇</a><button className="mc" onClick={()=>setViewing(null)}>×</button></div></div><div style={{flex:1,overflow:'hidden'}}><iframe src={viewing.url+'#toolbar=1&navpanes=0'} style={{width:'100%',height:'100%',border:'none'}} title={viewing.name}/></div></div></div>)}
  </>);
}

function Archive({jobs,onEdit,onDelete,loading}){
  const [viewJob,setViewJob]=useState(null);
  const [search,setSearch]=useState('');
  const [clientFilter,setClientFilter]=useState('');
  const archived=jobs.filter(isArchived);
  const clients=[...new Set(archived.map(j=>j.customer).filter(Boolean))].sort();
  const filtered=[...archived].sort((a,b)=>new Date(b.date)-new Date(a.date)).filter(j=>{ const q=search.toLowerCase(); const ms=!q||(j.customer||'').toLowerCase().includes(q)||(j.equipment||'').toLowerCase().includes(q)||(j.job_id||'').toLowerCase().includes(q); const mc=!clientFilter||j.customer===clientFilter; return ms&&mc; });
  return(<>
    <div className="panel">
      <div className="ph"><div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}><div className="pt">Archive</div><span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:9,color:'var(--txd)',background:'var(--sur2)',border:'1px solid var(--bdr)',padding:'2px 7px',borderRadius:3}}>30+ DAYS</span></div><div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:'var(--txd)'}}>{filtered.length} jobs</div></div>
      <div style={{padding:'10px 12px',borderBottom:'1px solid var(--bdr)',display:'flex',gap:8,flexWrap:'wrap'}}><input className="fi" placeholder="🔍 Search archive..." value={search} onChange={e=>setSearch(e.target.value)} style={{marginBottom:0,flex:2,minWidth:140}}/><select className="fsl" value={clientFilter} onChange={e=>setClientFilter(e.target.value)} style={{flex:1,minWidth:120,marginBottom:0}}><option value="">All clients</option>{clients.map(c=><option key={c}>{c}</option>)}</select></div>
      <div className="desktop-table tbl">
        <div className="tr hdr" style={{gridTemplateColumns:'90px 1fr 110px 90px 80px 70px'}}><div className="cl">ID</div><div className="cl">Customer/Equip</div><div className="cl">Tech</div><div className="cl">Date</div><div className="cl">Amount</div><div className="cl">Act.</div></div>
        {loading?<Loading/>:filtered.map(j=>(<div key={j.id} className="tr" style={{gridTemplateColumns:'90px 1fr 110px 90px 80px 70px',opacity:.8}} onClick={()=>setViewJob(j)}><div className="ci" style={{color:'var(--txd)'}}>{j.job_id}</div><div><div className="cm" style={{color:'var(--txm)'}}>{j.customer||'—'}</div><div className="cs">{j.equipment||'—'}</div></div><div className="cd">{j.technician||'—'}</div><div className="cn">{j.date||'—'}</div><div className="cv" style={{color:'var(--txm)'}}>{j.amount?'$'+j.amount:'—'}</div><div style={{display:'flex',gap:4}} onClick={e=>e.stopPropagation()}><button className="btn bg bs" onClick={()=>onEdit(j)}>✏️</button><button className="btn bd bs" onClick={()=>onDelete(j.id)}>🗑</button></div></div>))}
        {!filtered.length&&!loading&&<div className="empty"><div className="ei">🗄</div>{search||clientFilter?'No match.':'No archived jobs yet.'}</div>}
      </div>
      <div className="mobile-cards" style={{padding:12}}>
        {loading?<Loading/>:filtered.map(j=>(<div key={j.id} style={{background:'var(--sur2)',border:'1px solid var(--bdr)',borderRadius:8,padding:'12px 14px',marginBottom:10,opacity:.85,cursor:'pointer'}} onClick={()=>setViewJob(j)}><div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8}}><div style={{flex:1,minWidth:0}}><div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:'var(--txd)',marginBottom:3}}>{j.job_id}</div><div style={{fontSize:14,fontWeight:600,color:'var(--txm)'}}>{j.customer||'—'}</div><div style={{fontSize:11,color:'var(--txd)',marginTop:2}}>{j.equipment||'—'}</div></div><div style={{textAlign:'right',flexShrink:0}}><div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:'var(--txd)',marginBottom:4}}>{j.date||'—'}</div>{j.amount&&<div style={{fontFamily:"'Rajdhani',sans-serif",fontWeight:700,fontSize:16,color:'var(--txm)'}}>${j.amount}</div>}</div></div></div>))}
        {!loading&&!filtered.length&&<div className="empty"><div className="ei">🗄</div>No archived jobs.</div>}
      </div>
    </div>
    {viewJob&&<JobDetailModal job={viewJob} onClose={()=>setViewJob(null)} onEdit={onEdit}/>}
  </>);
}

// ════════════════════════════════════════════════════════════════════════════
// VPanel Report Parser — matches the REAL raw report format (confirmed
// against actual exports from DWX-51D/52D/52DCi). This is NOT YAML:
// section headers have no colon, leaf fields do ("KEY: value"), and values
// are bare comma-separated numbers for coordinate triplets / offset tables.
// ════════════════════════════════════════════════════════════════════════════

function extractSystemReportBlock(rawText) {
  const startTok = "<< SYSTEM REPORT >>";
  const s = rawText.indexOf(startTok);
  if (s === -1) throw new Error('No "<< SYSTEM REPORT >>" marker found in this text.');
  const afterStart = s + startTok.length;
  const endTok = "<< END >>";
  const e = rawText.indexOf(endTok, afterStart);
  return rawText.slice(afterStart, e === -1 ? undefined : e);
}

// Splits a pasted blob that may contain several concatenated reports (and/or
// trailing "<< SERVICE TOOL INFORMATION >>" blocks) into one chunk per
// "<< SYSTEM REPORT >> ... << END >>". Used to auto-split multi-report pastes.
function splitReports(rawText) {
  const startTok = "<< SYSTEM REPORT >>";
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

// Indentation-tree parser for a single extracted report body. Section
// headers (no colon, or "KEY:" with nothing after it) become nested
// objects; "KEY: value" lines become leaves. Continuation lines with an
// empty key (FATAL ERROR LOG's "     : 102E, 0000" rows) get folded into
// an array under the most recently-set key at that indent level.
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

const DWX_THRESHOLDS = {
  priorityOrder: [
    "spindle_gradient_x_collet_wear",
    "spindle_gradient_y_sign_flip",
    "magazine_offset_base_tool_length_drift",
    "a_axis_angle_offset_curve",
    "a_axis_p1_p2_gap",
    "b_axis_p1_p2_gap",
  ],
  aAxisP1P2YGapMax: 40,
  bAxisP1P2XGapMax: 40,
  magazineBallscrewDriftMax: 40,
  spindleGradientXColletWearMax: 0.001,
};

const MACHINE_PROFILES = {
  "DWX-52DCi": { thresholds: DWX_THRESHOLDS, thresholdsValidated: true },
  "DWX-52D":   { thresholds: DWX_THRESHOLDS, thresholdsValidated: true },
  "DWX-53DC":  { thresholds: DWX_THRESHOLDS, thresholdsValidated: false },
  "DWX-51D":   { thresholds: DWX_THRESHOLDS, thresholdsValidated: false },
};
const DEFAULT_PROFILE = { thresholds: DWX_THRESHOLDS, thresholdsValidated: false };
function getProfile(model) { return MACHINE_PROFILES[model] || DEFAULT_PROFILE; }

function parseVPanelReport(rawText) {
  const text = (rawText || "").trim();
  if (!text) throw new Error("Empty report text");
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

function diagnoseAAxisGap(r) {
  const a = r.rac["A-AXIS"];
  if (!a) return null;
  const gap = yGap(a);
  if (gap == null) return null;
  const threshold = r.profile.thresholds.aAxisP1P2YGapMax;
  return { check: "a_axis_p1_p2_gap", gap, threshold, flagged: gap > threshold, thresholdsValidatedForModel: r.profile.thresholdsValidated };
}

function diagnoseBAxisGap(r) {
  const b = r.rac["B-AXIS"];
  if (!b) return null;
  const gap = xGap(b);
  if (gap == null) return null;
  const threshold = r.profile.thresholds.bAxisP1P2XGapMax;
  return { check: "b_axis_p1_p2_gap", gap, threshold, flagged: gap > threshold, thresholdsValidatedForModel: r.profile.thresholdsValidated };
}

function diagnoseSpindleGradientY(r, previousGradientY) {
  const grad = r.rac["SPINDLE GRADIENT"];
  if (!grad || typeof grad.Y !== "number") return null;
  const y = grad.Y;
  const result = { check: "spindle_gradient_y_sign_flip", currentY: y, previousY: previousGradientY ?? null, flagged: false, thresholdsValidatedForModel: r.profile.thresholdsValidated };
  if (previousGradientY != null) result.flagged = (y > 0) !== (previousGradientY > 0);
  return result;
}

function diagnoseSpindleGradientX(r) {
  const grad = r.rac["SPINDLE GRADIENT"];
  if (!grad || typeof grad.X !== "number") return null;
  const x = grad.X;
  const threshold = r.profile.thresholds.spindleGradientXColletWearMax;
  return { check: "spindle_gradient_x_collet_wear", currentX: x, threshold, flagged: Math.abs(x) > threshold, thresholdsValidatedForModel: r.profile.thresholdsValidated };
}

function diagnoseMagazineBallscrewDrift(r, previousMagazineOffset, previousBaseToolLength) {
  const currentBaseToolLength = r.rac["BASE TOOL LENGTH"];
  const currentMagazineOffset = r.atc["MAGAZINE POSITION OFFSET"];
  if (typeof currentBaseToolLength !== "number" || !Array.isArray(currentMagazineOffset)) return null;
  const threshold = r.profile.thresholds.magazineBallscrewDriftMax;
  const result = {
    check: "magazine_offset_base_tool_length_drift",
    currentBaseToolLength, currentMagazineOffset,
    previousBaseToolLength: previousBaseToolLength ?? null,
    previousMagazineOffset: previousMagazineOffset ?? null,
    threshold, flagged: false,
    thresholdsValidatedForModel: r.profile.thresholdsValidated,
  };
  if (previousBaseToolLength == null || previousMagazineOffset == null) return result;
  const baseToolLengthDelta = currentBaseToolLength - previousBaseToolLength;
  const axisNames = ["x", "y", "z"];
  const magazineOffsetDelta = {};
  currentMagazineOffset.forEach((v, i) => { magazineOffsetDelta[axisNames[i] || i] = v - (previousMagazineOffset[i] ?? v); });
  result.baseToolLengthDelta = baseToolLengthDelta;
  result.magazineOffsetDelta = magazineOffsetDelta;
  if (Math.abs(baseToolLengthDelta) > threshold) {
    const btSign = baseToolLengthDelta > 0;
    for (const [axis, delta] of Object.entries(magazineOffsetDelta)) {
      if (Math.abs(delta) > threshold && (delta > 0) === btSign) { result.flagged = true; result.flaggedAxis = axis; break; }
    }
  }
  return result;
}

function diagnoseAAxisAngleOffsetCurve(r) {
  const a = r.rac["A-AXIS"];
  const curve = a && a["ANGLE OFFSET (BASE)"];
  if (!Array.isArray(curve) || curve.length < 3) return null;
  let reversals = 0, lastSign = null;
  for (let i = 1; i < curve.length; i++) {
    const d = curve[i] - curve[i - 1];
    if (d === 0) continue;
    const sign = d > 0;
    if (lastSign !== null && sign !== lastSign) reversals++;
    lastSign = sign;
  }
  return { check: "a_axis_angle_offset_curve", curve, reversals, flagged: reversals >= 2, thresholdsValidatedForModel: r.profile.thresholdsValidated };
}

const DIAGNOSTIC_CHECKS = {
  spindle_gradient_x_collet_wear: (r) => diagnoseSpindleGradientX(r),
  spindle_gradient_y_sign_flip: (r, prev) => diagnoseSpindleGradientY(r, prev.gradientY),
  magazine_offset_base_tool_length_drift: (r, prev) => diagnoseMagazineBallscrewDrift(r, prev.magazineOffset, prev.baseToolLength),
  a_axis_angle_offset_curve: (r) => diagnoseAAxisAngleOffsetCurve(r),
  a_axis_p1_p2_gap: (r) => diagnoseAAxisGap(r),
  b_axis_p1_p2_gap: (r) => diagnoseBAxisGap(r),
};

function diagnoseReport(r, prev = {}) {
  const order = r.profile.thresholds.priorityOrder;
  const results = [];
  for (const name of order) {
    const fn = DIAGNOSTIC_CHECKS[name];
    if (!fn) continue;
    const out = fn(r, prev);
    if (out) results.push(out);
  }
  return results;
}

function diagnoseDice3B9B(diceEntry) {
  const b3 = diceEntry?.bottomWidth?.[1];
  const b9 = diceEntry?.bottomWidth?.[3];
  if (b3 == null || b3 === "" || b9 == null || b9 === "") return null;
  const v3 = parseFloat(b3), v9 = parseFloat(b9);
  if (Number.isNaN(v3) || Number.isNaN(v9)) return null;
  const gap = Math.abs(v3 - v9);
  const threshold = 0.05;
  return { check: "dice_3b_9b_bottom_width", v3, v9, gap, threshold, flagged: gap > threshold, thresholdNotValidated: true };
}

const CHECK_INFO = {
  spindle_gradient_x_collet_wear: { label: "Spindle Gradient X", cause: "Magnitude above 0.001 indicates collet wear.", action: "Swap the collet." },
  spindle_gradient_y_sign_flip: { label: "Spindle Gradient Y Sign-Flip", cause: "Sign alternates vs. the previous report — inconsistent calibration-pin seating (collet wear or spindle bore issue, not progressive drift).", action: "Clean/hone the spindle bore, or swap the collet." },
  magazine_offset_base_tool_length_drift: { label: "Magazine Offset / Base Tool Length Drift", cause: "ATC magazine offset and base tool length are moving together past threshold — possible ballscrew fault/backlash.", action: "Inspect the ballscrew for backlash or wear." },
  a_axis_angle_offset_curve: { label: "A-Axis Angle Offset Curve", cause: "Erratic, non-monotonic offset curve — possible A-axis gear backlash/looseness (heuristic — confirm visually and with DICE).", action: "Physically inspect the A-axis gear assembly for feelable loose points." },
  a_axis_p1_p2_gap: { label: "A-Axis P1/P2 Y-Gap", cause: "Not a reliable standalone indicator on its own — cross-reference with DICE 3B/9B Bottom Width before acting.", action: "Confirm with a DICE measurement before doing any repair." },
  b_axis_p1_p2_gap: { label: "B-Axis P1/P2 X-Gap", cause: "Elevated off-axis deviation on the B-axis (mirrors A-axis's Y-gap check — B's designed travel is Y, so its deviation check is on X).", action: "Inspect the B-axis for backlash." },
  dice_3b_9b_bottom_width: { label: "DICE 3B/9B Bottom Width Y-Pair", cause: "Most reliable physical signal for A-axis/Y-axis origin mismatch — the error is only fully expressed at full-depth engagement.", action: "If elevated alongside a flagged A-axis gap, proceed toward an A-axis rebuild." },
};

const DICE_COLS = {
  height: ['Pos 1  B', 'Pos 3  A', 'Pos 6  B', 'Pos 9  A'],
  topWidth: ['1T X', '3T Y', '6T X', '9T Y'],
  bottomWidth: ['1B X', '3B Y', '6B X', '9B Y'],
};

function emptyDiceEntry(label) {
  return { id: Date.now() + Math.random(), label: label || '', height: ['', '', '', ''], topWidth: ['', '', '', ''], bottomWidth: ['', '', '', ''] };
}

function DiceRunGrid({ label, cols, values, onChange }) {
  return (
    <div style={{marginBottom:12}}>
      <div className="cl" style={{marginBottom:5}}>{label}</div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:6}}>
        {cols.map((c, i) => (
          <div key={c}>
            <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:9,color:'var(--txd)',marginBottom:3,textAlign:'center'}}>{c}</div>
            <input className="fi" style={{marginBottom:0,textAlign:'center'}} inputMode="decimal" placeholder="—" value={values[i]} onChange={e => onChange(i, e.target.value)}/>
          </div>
        ))}
      </div>
    </div>
  );
}

function DiceEntryCard({ entry, onChangeLabel, onChangeCell, onRemove, removable }) {
  return (
    <div className="diag-report-card">
      <div className="diag-report-head">
        <input className="fi" style={{marginBottom:0,maxWidth:260}} placeholder="Label (optional — e.g. before repair, after repair)" value={entry.label} onChange={e => onChangeLabel(e.target.value)}/>
        {removable && <button className="btn bd bs" onClick={onRemove}>🗑</button>}
      </div>
      <DiceRunGrid label="Height (mm)" cols={DICE_COLS.height} values={entry.height} onChange={(i, v) => onChangeCell('height', i, v)}/>
      <DiceRunGrid label="Top Width (mm)" cols={DICE_COLS.topWidth} values={entry.topWidth} onChange={(i, v) => onChangeCell('topWidth', i, v)}/>
      <DiceRunGrid label="Bottom Width (mm)" cols={DICE_COLS.bottomWidth} values={entry.bottomWidth} onChange={(i, v) => onChangeCell('bottomWidth', i, v)}/>
    </div>
  );
}

function DiagFlagCard({ checkKey, data }) {
  const info = CHECK_INFO[checkKey] || { label: checkKey, cause: '', action: '' };
  const cls = data.flagged ? 'bad' : 'ok';
  return (
    <div className={`diag-flag ${cls}`}>
      <div className="diag-flag-title">{data.flagged ? '⚠ ' : '✓ '}{info.label}{!data.thresholdsValidatedForModel && <span style={{color:'var(--txd)',fontWeight:400,fontSize:10,marginLeft:6}}>(unvalidated for this model)</span>}</div>
      <div className="diag-flag-desc">{info.cause}</div>
      {data.flagged && info.action && <div className="diag-flag-action">→ {info.action}</div>}
      <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:'var(--txd)',marginTop:6}}>
        {checkKey === 'spindle_gradient_x_collet_wear' && <>X: {data.currentX} (threshold ±{data.threshold})</>}
        {checkKey === 'spindle_gradient_y_sign_flip' && <>current Y: {data.currentY}{data.previousY!=null && <>, previous Y: {data.previousY}</>}</>}
        {checkKey === 'magazine_offset_base_tool_length_drift' && <>BaseToolLength Δ: {data.baseToolLengthDelta ?? '—'} {data.flaggedAxis && <>· offset axis "{data.flaggedAxis}" moved together</>}</>}
        {checkKey === 'a_axis_angle_offset_curve' && <>curve: [{(data.curve||[]).join(', ')}] · {data.reversals} direction reversal{data.reversals===1?'':'s'}</>}
        {checkKey === 'a_axis_p1_p2_gap' && <>gap: {data.gap} (threshold {data.threshold})</>}
        {checkKey === 'b_axis_p1_p2_gap' && <>gap: {data.gap} (threshold {data.threshold})</>}
        {checkKey === 'dice_3b_9b_bottom_width' && <>3B: {data.v3}mm · 9B: {data.v9}mm · gap: {data.gap.toFixed(3)}mm (threshold {data.threshold}mm{data.thresholdNotValidated?', not validated':''})</>}
      </div>
    </div>
  );
}

function DiagnosticReportCard({ raw, report, diagnostics, diceCheck, index, onChangeRaw, onRemove }) {
  const [showRaw, setShowRaw] = useState(false);
  const flaggedCount = diagnostics.filter(d=>d.flagged).length + (diceCheck?.flagged ? 1 : 0);
  return (
    <div className="diag-report-card">
      <div className="diag-report-head">
        <div>
          <div style={{fontFamily:"'Rajdhani',sans-serif",fontWeight:700,fontSize:14}}>{report.model || 'Unknown model'} · {report.serial || 'Unknown serial'}</div>
          <div className="diag-meta">
            <span>Correction Count: {report.correctionCount ?? '—'}</span>
            {flaggedCount > 0 ? <span style={{color:'var(--rd)'}}>⚠ {flaggedCount} flagged</span> : <span style={{color:'var(--gr)'}}>✓ clean</span>}
          </div>
        </div>
        <div style={{display:'flex',gap:6}}>
          <button className="btn bg bs" onClick={()=>setShowRaw(s=>!s)}>{showRaw?'Hide raw':'View raw'}</button>
          {onRemove && <button className="btn bd bs" onClick={onRemove}>🗑</button>}
        </div>
      </div>
      {showRaw && (
        index === -1
          ? <textarea className="diag-ta" value={raw} readOnly placeholder="" style={{opacity:0.7}}/>
          : <textarea className="diag-ta" value={raw} onChange={e=>onChangeRaw(index, e.target.value)} placeholder="Paste raw VPanel SystemReport text here..."/>
      )}
      {showRaw && index === -1 && <div style={{fontSize:10,color:'var(--txd)',fontFamily:"'IBM Plex Mono',monospace",marginTop:4}}>Read-only — this report was auto-split out of a box with multiple concatenated reports.</div>}
      <div style={{marginTop:10}}>
        {diagnostics.length === 0 && <div style={{fontSize:11,color:'var(--txd)',fontFamily:"'IBM Plex Mono',monospace"}}>No applicable checks found for this report/model.</div>}
        {diagnostics.map(d => <DiagFlagCard key={d.check} checkKey={d.check} data={d}/>)}
        {diceCheck && <DiagFlagCard checkKey="dice_3b_9b_bottom_width" data={diceCheck}/>}
      </div>
    </div>
  );
}

function extractCheck(diagArr, checkKey) {
  return (diagArr || []).find(d => d.check === checkKey) || null;
}

// ── Raw-metric extractors for trending ────────────────────────────────────────
// These read from a saved report's `parsed` sections (the full section tree
// stored at save time), so we can trend raw values over correction count —
// not just the pass/fail diagnostic flags. All are defensive: they return null
// when a field is absent (e.g. DWX-51D reports that lack certain tables), so a
// missing value shows as a gap in the line rather than crashing the chart.

function num(v) { return typeof v === 'number' && !Number.isNaN(v) ? v : null; }
function triplet(v) { return Array.isArray(v) && v.length >= 3 ? [num(v[0]), num(v[1]), num(v[2])] : [null, null, null]; }

// The XYZ origin / base point can appear under a few different header names
// depending on model/firmware. Look for whichever exists and return its triplet.
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
    // Some formats nest X/Y/Z as leaf fields under an object header
    if (c && typeof c === 'object' && ('X' in c || 'Y' in c || 'Z' in c)) {
      return [num(c.X), num(c.Y), num(c.Z)];
    }
  }
  return [null, null, null];
}

// Range (max - min) of an axis's ANGLE OFFSET (BASE) curve — a single scalar
// proxy for how much the offset table is spread/drifting this cycle. Works for
// either axis; returns null if that axis has no offset table (e.g. DWX-51D, or
// a B-axis that doesn't publish one).
function axisOffsetRange(rac, axisKey) {
  const ax = rac && rac[axisKey];
  const curve = ax && ax["ANGLE OFFSET (BASE)"];
  if (!Array.isArray(curve) || curve.length < 2) return null;
  const nums = curve.filter(v => typeof v === 'number' && !Number.isNaN(v));
  if (nums.length < 2) return null;
  return Math.max(...nums) - Math.min(...nums);
}
function angleOffsetRange(rac) { return axisOffsetRange(rac, "A-AXIS"); }
function bAxisOffsetRange(rac) { return axisOffsetRange(rac, "B-AXIS"); }

function trendPointsFromHistory(history) {
  return history
    .filter(row => row.correction_count != null)
    .map(row => {
      const diag = row.diagnostics || [];
      const gx = extractCheck(diag, 'spindle_gradient_x_collet_wear');
      const gy = extractCheck(diag, 'spindle_gradient_y_sign_flip');
      const ag = extractCheck(diag, 'a_axis_p1_p2_gap');
      const bg = extractCheck(diag, 'b_axis_p1_p2_gap');

      // Raw sections: prefer explicitly-saved raw_metrics (new saves), fall
      // back to reconstructing from the stored `parsed` section tree (older
      // saves that stored `parsed` but not `raw_metrics`).
      const sections = row.parsed || {};
      const rac = sections["ROTARY AXIS CORRECTION"] || {};
      const atc = sections["AUTOMATIC TOOL CHANGER"] || {};
      const rm = row.raw_metrics || null;

      const origin = rm && rm.origin ? rm.origin : extractOrigin(sections, rac);
      const mag = rm && rm.magOffset ? rm.magOffset : triplet(atc["MAGAZINE POSITION OFFSET"]);
      const baseTL = rm && rm.baseToolLength != null ? rm.baseToolLength : num(rac["BASE TOOL LENGTH"]);
      const aOffRange = rm && rm.angleOffsetRange != null ? rm.angleOffsetRange : angleOffsetRange(rac);
      const bOffRange = rm && rm.bAxisOffsetRange != null ? rm.bAxisOffsetRange : bAxisOffsetRange(rac);

      return {
        corr: row.correction_count,
        gradientX: gx ? gx.currentX : null,
        gradientY: gy ? gy.currentY : null,
        aGap: ag ? ag.gap : null,
        bGap: bg ? bg.gap : null,
        originX: origin[0], originY: origin[1], originZ: origin[2],
        magX: mag[0], magY: mag[1], magZ: mag[2],
        baseToolLength: baseTL,
        angleOffsetRange: aOffRange,
        bAxisOffsetRange: bOffRange,
      };
    })
    .sort((a, b) => a.corr - b.corr);
}

// Build the raw_metrics object saved alongside each report so future trends
// don't depend on re-deriving from the full section tree.
function buildRawMetrics(report) {
  const rac = report.rac || {};
  const atc = report.atc || {};
  return {
    origin: extractOrigin(report.sections || {}, rac),
    magOffset: triplet(atc["MAGAZINE POSITION OFFSET"]),
    baseToolLength: num(rac["BASE TOOL LENGTH"]),
    angleOffsetRange: angleOffsetRange(rac),
    bAxisOffsetRange: bAxisOffsetRange(rac),
  };
}

function TrendChart({ title, data, lines, refLines, yFormat }) {
  return (
    <div style={{background:'var(--sur2)',border:'1px solid var(--bdr)',borderRadius:6,padding:'12px 14px',marginBottom:14}}>
      <div className="cl" style={{marginBottom:8}}>{title}</div>
      <div style={{width:'100%',height:190}}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{top:5,right:14,left:0,bottom:5}}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e2a3a"/>
            <XAxis dataKey="corr" stroke="#5a6a80" tick={{fontSize:10,fontFamily:"IBM Plex Mono, monospace"}} label={{value:'Correction Count',position:'insideBottom',offset:-3,fontSize:9,fill:'#5a6a80'}}/>
            <YAxis stroke="#5a6a80" tick={{fontSize:10,fontFamily:"IBM Plex Mono, monospace"}} tickFormatter={yFormat}/>
            <Tooltip contentStyle={{background:'#161b24',border:'1px solid #243040',fontSize:11,fontFamily:"IBM Plex Mono, monospace"}} labelFormatter={v=>`Corr ${v}`}/>
            <Legend wrapperStyle={{fontSize:10,fontFamily:"IBM Plex Mono, monospace"}}/>
            {(refLines||[]).map((rl,i) => <ReferenceLine key={i} y={rl.y} stroke="#ff4d6a" strokeDasharray="4 4" label={{value:rl.label,fontSize:9,fill:'#ff4d6a',position:'right'}}/>)}
            {lines.map(l => <Line key={l.key} type="monotone" dataKey={l.key} name={l.name} stroke={l.color} dot={{r:3}} connectNulls/>)}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function TrendCharts({ history }) {
  const points = trendPointsFromHistory(history);
  if (points.length < 2) {
    return <div style={{fontSize:11,color:'var(--txd)',fontFamily:"'IBM Plex Mono',monospace",padding:'6px 2px 14px'}}>Need at least 2 saved reports for this serial to plot a trend.</div>;
  }
  // Which optional metrics actually have data across the loaded history?
  // Hide a chart entirely if every point is null (e.g. a metric the model's
  // report format doesn't include) rather than showing an empty axis.
  const has = (keys) => points.some(p => keys.some(k => p[k] != null));

  return (
    <div style={{marginBottom:4}}>
      <TrendChart
        title="Spindle Gradient X / Y"
        data={points}
        lines={[{key:'gradientX',color:'#00c8ff',name:'Gradient X'},{key:'gradientY',color:'#ffb020',name:'Gradient Y'}]}
        refLines={[{y:0.001,label:'X threshold ±0.001'},{y:-0.001}]}
        yFormat={v=>v.toFixed(4)}
      />
      <TrendChart
        title="A-Axis P1/P2 Y-Gap"
        data={points}
        lines={[{key:'aGap',color:'#22d47a',name:'A-axis Y-gap'}]}
        refLines={[{y:40,label:'threshold 40'}]}
      />
      <TrendChart
        title="B-Axis P1/P2 X-Gap"
        data={points}
        lines={[{key:'bGap',color:'#ff4d6a',name:'B-axis X-gap'}]}
        refLines={[{y:40,label:'threshold 40'}]}
      />
      {has(['originX','originY','originZ']) && (
        <TrendChart
          title="XYZ Origin / Base Point Drift"
          data={points}
          lines={[
            {key:'originX',color:'#00c8ff',name:'Origin X'},
            {key:'originY',color:'#22d47a',name:'Origin Y'},
            {key:'originZ',color:'#ffb020',name:'Origin Z'},
          ]}
        />
      )}
      {has(['magX','magY','magZ']) && (
        <TrendChart
          title="Magazine Position Offset (X / Y / Z)"
          data={points}
          lines={[
            {key:'magX',color:'#00c8ff',name:'Mag X'},
            {key:'magY',color:'#22d47a',name:'Mag Y'},
            {key:'magZ',color:'#ffb020',name:'Mag Z'},
          ]}
        />
      )}
      {has(['baseToolLength']) && (
        <TrendChart
          title="Base Tool Length"
          data={points}
          lines={[{key:'baseToolLength',color:'#a78bfa',name:'Base Tool Length'}]}
          yFormat={v=>v.toFixed(3)}
        />
      )}
      {has(['angleOffsetRange']) && (
        <TrendChart
          title="A-Axis Angle Offset Range (max − min of BASE curve)"
          data={points}
          lines={[{key:'angleOffsetRange',color:'#ff4d6a',name:'A-axis offset range'}]}
        />
      )}
      {has(['bAxisOffsetRange']) && (
        <TrendChart
          title="B-Axis Angle Offset Range (max − min of BASE curve)"
          data={points}
          lines={[{key:'bAxisOffsetRange',color:'#f472b6',name:'B-axis offset range'}]}
        />
      )}
    </div>
  );
}

function Diagnostics({ msg }) {
  const [reportTexts, setReportTexts] = useState(['']);
  const [diceEntries, setDiceEntries] = useState([emptyDiceEntry('')]);
  const [results, setResults] = useState(null);
  const [saving, setSaving] = useState(false);
  const [historySerial, setHistorySerial] = useState('');
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [serialList, setSerialList] = useState([]);

  const loadSerialList = useCallback(async () => {
    try {
      const serials = await db.distinctColumn('diagnostic_reports', 'serial');
      setSerialList(serials);
    } catch { /* non-fatal — dropdown just stays empty */ }
  }, []);

  useEffect(() => { loadSerialList(); }, [loadSerialList]);

  const addReportBox = () => setReportTexts(t => [...t, '']);
  const removeReportBox = (i) => setReportTexts(t => t.length > 1 ? t.filter((_, idx) => idx !== i) : t);
  const updateReportBox = (i, val) => setReportTexts(t => t.map((x, idx) => idx === i ? val : x));

  const addDiceEntry = () => setDiceEntries(d => [...d, emptyDiceEntry('')]);
  const removeDiceEntry = (id) => setDiceEntries(d => d.length > 1 ? d.filter(x => x.id !== id) : d);
  const updateDiceLabel = (id, label) => setDiceEntries(d => d.map(x => x.id === id ? { ...x, label } : x));
  const updateDiceCell = (id, group, i, val) => setDiceEntries(d => d.map(x => {
    if (x.id !== id) return x;
    const arr = [...x[group]]; arr[i] = val;
    return { ...x, [group]: arr };
  }));

  const runDiagnosis = () => {
    const errors = [];
    const pairs = [];
    reportTexts.forEach((raw, idx) => {
      if (!raw.trim()) return;
      const chunks = splitReports(raw);
      chunks.forEach((chunk, ci) => {
        try { pairs.push({ raw: chunk, parsed: parseVPanelReport(chunk) }); }
        catch (e) { errors.push({ index: idx, error: chunks.length > 1 ? `(report ${ci + 1} in box ${idx + 1}) ${e.message}` : e.message }); }
      });
    });
    if (!pairs.length) {
      msg && msg('⚠️ No valid reports to parse.');
      setResults({ perReport: [], errors });
      return;
    }
    pairs.sort((a, b) => (a.parsed.correctionCount ?? Infinity) - (b.parsed.correctionCount ?? Infinity));
    let prevGradientY = null, prevMagOffset = null, prevBaseToolLength = null;
    const lastDiceEntry = diceEntries[diceEntries.length - 1];
    const perReport = pairs.map(({ raw, parsed: r }, i) => {
      const diag = diagnoseReport(r, { gradientY: prevGradientY, magazineOffset: prevMagOffset, baseToolLength: prevBaseToolLength });
      const grad = r.rac["SPINDLE GRADIENT"];
      if (grad && typeof grad.Y === "number") prevGradientY = grad.Y;
      const mo = r.atc["MAGAZINE POSITION OFFSET"];
      if (Array.isArray(mo)) prevMagOffset = mo;
      if (typeof r.rac["BASE TOOL LENGTH"] === "number") prevBaseToolLength = r.rac["BASE TOOL LENGTH"];
      const isLast = i === pairs.length - 1;
      const diceCheck = isLast ? diagnoseDice3B9B(lastDiceEntry) : null;
      return { raw, report: r, diagnostics: diag, diceCheck };
    });
    setResults({ perReport, errors });
    if (errors.length) msg && msg(`⚠️ ${errors.length} report(s) failed to parse — see console/edit raw.`);
  };

  const saveAll = async () => {
    if (!results?.perReport?.length) return;
    setSaving(true);
    let ok = 0, fail = 0;
    for (const { raw, report, diagnostics, diceCheck } of results.perReport) {
      try {
        await db.upsert('diagnostic_reports', {
          model: report.model,
          serial: report.serial,
          correction_count: report.correctionCount,
          raw_text: raw,
          parsed: report.sections,
          diagnostics,
          raw_metrics: buildRawMetrics(report),
          dice: diceCheck ? diceEntries : null,
        }, 'serial,correction_count');
        ok++;
      } catch { fail++; }
    }
    setSaving(false);
    msg && msg(`✅ Saved ${ok}${fail ? `, ${fail} failed` : ''}`);
    if (ok) loadSerialList();
  };

  const loadHistory = async (serialArg) => {
    const serial = (typeof serialArg === 'string' ? serialArg : historySerial).trim();
    if (!serial) return;
    setHistoryLoading(true);
    setHistoryLoaded(true);
    try {
      const rows = await db.getWhere('diagnostic_reports', 'serial', serial);
      const sorted = Array.isArray(rows) ? [...rows].sort((a, b) => (a.correction_count ?? 0) - (b.correction_count ?? 0)) : [];
      setHistory(sorted);
    } catch {
      msg && msg('⚠️ History fetch failed.');
      setHistory([]);
    }
    setHistoryLoading(false);
  };

  const loadFromHistory = (row) => {
    setReportTexts(t => {
      const emptyIdx = t.findIndex(x => !x.trim());
      if (emptyIdx !== -1) return t.map((x, i) => i === emptyIdx ? (row.raw_text || '') : x);
      return [...t, row.raw_text || ''];
    });
    msg && msg('📥 Loaded into report boxes — hit Run Diagnosis.');
  };

  return (
    <>
      <div className="panel">
        <div className="ph">
          <div className="pt">🩺 Report Diagnostics</div>
          <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:'var(--txd)'}}>paste VPanel reports · DICE cross-check · flagged findings</div>
        </div>
        <div style={{padding:14}}>
          {reportTexts.map((raw, i) => (
            <div key={i} className="diag-report-card">
              <div className="diag-report-head">
                <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:'var(--txd)',letterSpacing:1,textTransform:'uppercase'}}>Report {i+1}</div>
                {reportTexts.length > 1 && <button className="btn bd bs" onClick={()=>removeReportBox(i)}>🗑</button>}
              </div>
              <textarea
                className="diag-ta"
                placeholder="Paste one raw VPanel report here — or several concatenated (each starting with << SYSTEM REPORT >>), they'll be auto-split on Run Diagnosis."
                value={raw}
                onChange={e => updateReportBox(i, e.target.value)}
              />
            </div>
          ))}
          <div style={{display:'flex',gap:8,marginBottom:16}}>
            <button className="btn bg bs" onClick={addReportBox}>+ Add Another Report</button>
          </div>

          <div style={{borderTop:'1px solid var(--bdr)',paddingTop:16,marginBottom:16}}>
            <div className="detail-label" style={{marginBottom:10}}>DICE Measurement (last run applies to the most recent report by Correction Count)</div>
            {diceEntries.map(entry => (
              <DiceEntryCard
                key={entry.id}
                entry={entry}
                onChangeLabel={(label) => updateDiceLabel(entry.id, label)}
                onChangeCell={(group, i, val) => updateDiceCell(entry.id, group, i, val)}
                onRemove={() => removeDiceEntry(entry.id)}
                removable={diceEntries.length > 1}
              />
            ))}
            <button className="btn bg bs" onClick={addDiceEntry}>+ Add DICE Run</button>
            <div style={{fontSize:10,color:'var(--txd)',marginTop:8,fontFamily:"'IBM Plex Mono',monospace",lineHeight:1.5}}>
              Bottom Width Y 3B/9B pair is the most reliable physical signal for A-axis/Y-axis origin mismatch — flagged when the gap exceeds 0.05mm (not independently validated; adjust based on your own data).
            </div>
          </div>

          <div style={{display:'flex',gap:8}}>
            <button className="btn bp" style={{flex:1}} onClick={runDiagnosis}>▶ Run Diagnosis</button>
            {results?.perReport?.length > 0 && <button className="btn bimport" onClick={saveAll} disabled={saving}>{saving ? '⏳ Saving...' : '☁ Save All'}</button>}
          </div>
        </div>
      </div>

      {results && (
        <div className="panel">
          <div className="ph"><div className="pt">Results</div><div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:'var(--txd)'}}>{results.perReport.length} report{results.perReport.length!==1?'s':''} parsed{results.errors.length?`, ${results.errors.length} failed`:''}</div></div>
          <div style={{padding:14}}>
            {results.errors.map(e => (
              <div key={e.index} className="diag-flag bad"><div className="diag-flag-title">⚠ Report {e.index+1} failed to parse</div><div className="diag-flag-desc">{e.error}</div></div>
            ))}
            {results.perReport.length === 0 && !results.errors.length && <div className="empty"><div className="ei">📋</div>Paste a report above and run diagnosis.</div>}
            {results.perReport.map((pr, i) => (
              <DiagnosticReportCard
                key={i}
                index={reportTexts.indexOf(pr.raw)}
                raw={pr.raw}
                report={pr.report}
                diagnostics={pr.diagnostics}
                diceCheck={pr.diceCheck}
                onChangeRaw={updateReportBox}
              />
            ))}
          </div>
        </div>
      )}

      <div className="panel">
        <div className="ph"><div className="pt">History</div></div>
        <div style={{padding:14}}>
          <div style={{display:'flex',gap:8,marginBottom:historyLoaded?14:0,flexWrap:'wrap'}}>
            <input className="fi" style={{marginBottom:0,flex:1,minWidth:140}} placeholder="Serial number, e.g. ZDU0527" value={historySerial} onChange={e=>setHistorySerial(e.target.value)} onKeyDown={e=>e.key==='Enter'&&loadHistory()}/>
            {serialList.length > 0 && (
              <select
                className="fsl"
                style={{marginBottom:0,flex:'0 1 170px',minWidth:130}}
                value={serialList.includes(historySerial) ? historySerial : ''}
                onChange={e => { const s = e.target.value; if (s) { setHistorySerial(s); loadHistory(s); } }}
              >
                <option value="">Saved serials ({serialList.length})…</option>
                {serialList.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            )}
            <button className="btn bg" onClick={()=>loadHistory()} disabled={!historySerial.trim()}>Fetch</button>
          </div>
          {historyLoading && <Loading/>}
          {!historyLoading && historyLoaded && history.length === 0 && <div className="empty"><div className="ei">📭</div>No saved reports for this serial yet.</div>}
          {!historyLoading && history.length > 0 && <TrendCharts history={history}/>}
          {!historyLoading && history.map(row => {
            const flaggedCount = (row.diagnostics||[]).filter(d=>d.flagged).length + (Array.isArray(row.dice) && row.dice.length ? (diagnoseDice3B9B(row.dice[row.dice.length-1])?.flagged?1:0) : 0);
            return (
              <div key={row.id} className="diag-report-card" style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10}}>
                <div>
                  <div style={{fontFamily:"'Rajdhani',sans-serif",fontWeight:700,fontSize:13}}>{row.model} · corr {row.correction_count ?? '—'}</div>
                  <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:flaggedCount?'var(--rd)':'var(--gr)',marginTop:2}}>{flaggedCount ? `⚠ ${flaggedCount} flagged` : '✓ clean'} · saved {row.created_at ? new Date(row.created_at).toLocaleDateString('en-CA') : '—'}</div>
                </div>
                <button className="btn bg bs" onClick={()=>loadFromHistory(row)}>Load →</button>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App(){
  const [page,setPage]=useState('Dashboard');
  const [jobs,setJobs]=useState([]);
  const [customers,setCustomers]=useState([]);
  const [technicians,setTechnicians]=useState([]);
  const [files,setFiles]=useState([]);
  const [calNotes,setCalNotes]=useState({});
  const [loading,setLoading]=useState({jobs:true,customers:true,technicians:true});
  const [fileUploading,setFileUploading]=useState(false);
  const [toast,setToast]=useState('');
  const [jobForm,setJobForm]=useState(null);
  const [showJobForm,setShowJobForm]=useState(false);
  const [showImport,setShowImport]=useState(false);
  const [showVoiceLog,setShowVoiceLog]=useState(false);

  const msg=useCallback((m)=>{setToast(m);setTimeout(()=>setToast(''),2500);},[]);

  const load=useCallback(async()=>{
    try{ const [j,c,t,f]=await Promise.all([db.get('jobs'),db.get('customers'),db.get('technicians'),db.get('ref_files')]); setJobs(j||[]);setCustomers(c||[]);setTechnicians(t||[]);setFiles(f||[]); }catch{msg('⚠️ Could not connect.');}
    setLoading({jobs:false,customers:false,technicians:false});
  },[msg]);

  const loadCalNotes=useCallback(async()=>{ try{ const notes=await db.get('calendar_notes'); if(Array.isArray(notes)){const map={};notes.forEach(n=>{map[n.date]=n;});setCalNotes(map);} }catch{} },[]);

  useEffect(()=>{load();loadCalNotes();},[load,loadCalNotes]);

  const saveCalNote=useCallback(async(dateStr,text)=>{ try{ const existing=calNotes[dateStr]; if(existing?.id){ await db.update('calendar_notes',existing.id,{note_text:text}); setCalNotes(prev=>({...prev,[dateStr]:{...existing,note_text:text}})); }else{ const r=await db.insert('calendar_notes',{date:dateStr,note_text:text}); const rec=Array.isArray(r)?r[0]:r; if(rec?.id) setCalNotes(prev=>({...prev,[dateStr]:rec})); } }catch{msg('⚠️ Note save failed.');} },[calNotes,msg]);

  const addJob=async(f)=>{try{const r=await db.insert('jobs',{job_id:f.job_id,customer:f.customer,equipment:f.equipment,technician:f.technician,status:f.status,priority:f.priority,date:f.date,amount:f.amount,invoice_status:f.invoice_status,notes:f.notes,followup:f.followup||false,followup_date:f.followup_date||null,followup_note:f.followup_note||null});setJobs(p=>[...p,...(Array.isArray(r)?r:[r])]);msg('✅ Job saved!');}catch{msg('⚠️ Save failed.');}};
  const editJob=async(f)=>{try{await db.update('jobs',f.id,{job_id:f.job_id,customer:f.customer,equipment:f.equipment,technician:f.technician,status:f.status,priority:f.priority,date:f.date,amount:f.amount,invoice_status:f.invoice_status,notes:f.notes,followup:f.followup||false,followup_date:f.followup_date||null,followup_note:f.followup_note||null});setJobs(p=>p.map(x=>x.id===f.id?{...x,...f}:x));msg('✅ Updated!');}catch{msg('⚠️ Update failed.');}};
  const delJob=async(id)=>{if(!window.confirm('Delete this job?'))return;try{await db.delete('jobs',id);setJobs(p=>p.filter(x=>x.id!==id));msg('🗑 Deleted.');}catch{msg('⚠️ Delete failed.');}};

  const addCust=async(f)=>{try{const r=await db.insert('customers',{company:f.company,contact:f.contact,phone:f.phone,email:f.email,address:f.address,notes:f.notes});setCustomers(p=>[...p,...(Array.isArray(r)?r:[r])]);msg('✅ Customer saved!');}catch{msg('⚠️ Save failed.');}};
  const editCust=async(f)=>{try{await db.update('customers',f.id,{company:f.company,contact:f.contact,phone:f.phone,email:f.email,address:f.address,notes:f.notes});setCustomers(p=>p.map(x=>x.id===f.id?{...x,...f}:x));msg('✅ Updated!');}catch{msg('⚠️ Update failed.');}};
  const delCust=async(id)=>{if(!window.confirm('Delete?'))return;try{await db.delete('customers',id);setCustomers(p=>p.filter(x=>x.id!==id));msg('🗑 Deleted.');}catch{msg('⚠️ Delete failed.');}};

  const addTech=async(f)=>{try{const r=await db.insert('technicians',{name:f.name,initials:f.initials,email:f.email,phone:f.phone,status:f.status,current_job:f.current_job});setTechnicians(p=>[...p,...(Array.isArray(r)?r:[r])]);msg('✅ Saved!');}catch{msg('⚠️ Save failed.');}};
  const editTech=async(f)=>{try{await db.update('technicians',f.id,{name:f.name,initials:f.initials,email:f.email,phone:f.phone,status:f.status,current_job:f.current_job});setTechnicians(p=>p.map(x=>x.id===f.id?{...x,...f}:x));msg('✅ Updated!');}catch{msg('⚠️ Update failed.');}};
  const delTech=async(id)=>{if(!window.confirm('Delete?'))return;try{await db.delete('technicians',id);setTechnicians(p=>p.filter(x=>x.id!==id));msg('🗑 Deleted.');}catch{msg('⚠️ Delete failed.');}};

  const handleImport=async(toImport,setProgress)=>{ let count=0;const newJobs=[]; for(const job of toImport){ try{ const jobId='PDF-'+Date.now().toString().slice(-5)+'-'+Math.floor(Math.random()*100); const r=await db.insert('jobs',{job_id:jobId,customer:job.customer,equipment:job.equipment,technician:'',status:job.status||'Complete',priority:'Normal',date:job.date,amount:null,invoice_status:'Not Invoiced',notes:job.notes,followup:false,followup_date:null,followup_note:null}); if(Array.isArray(r))newJobs.push(...r);else if(r?.id)newJobs.push(r); count++;setProgress(count);await new Promise(res=>setTimeout(res,80)); }catch{} } setJobs(p=>[...p,...newJobs]);msg(`✅ Imported ${count} jobs!`); };

  const uploadFiles=async(fileList)=>{ setFileUploading(true); try{ for(const file of fileList){ const {url,name,size,path}=await storage.uploadFile(file); const r=await db.insert('ref_files',{name,url,size,storage_path:path}); const rec=Array.isArray(r)?r[0]:r; if(rec?.id) setFiles(p=>[...p,rec]); } msg(`✅ ${fileList.length} file${fileList.length>1?'s':''} uploaded!`); }catch{msg('⚠️ Upload failed.');} setFileUploading(false); };
  const deleteFile=async(f)=>{ if(!window.confirm(`Delete "${f.name}"?`))return; try{ if(f.storage_path)await storage.deleteFile(f.storage_path); await db.delete('ref_files',f.id); setFiles(p=>p.filter(x=>x.id!==f.id));msg('🗑 Deleted.'); }catch{msg('⚠️ Delete failed.');} };

  const followupCount=jobs.filter(j=>j.followup&&j.status!=='Complete'&&!isArchived(j)).length;
  const overdueFollowupCount=jobs.filter(j=>j.followup&&j.status!=='Complete'&&!isArchived(j)&&isFollowupOverdue(j)).length;
  const activeCount=jobs.filter(j=>['In Progress','Dispatched'].includes(j.status)).length;
  const archiveCount=jobs.filter(isArchived).length;

  const openMobileJobEdit=(j)=>{setJobForm(j);setShowJobForm(true);};
  const openMobileJobNew=()=>{setJobForm(null);setShowJobForm(true);};
  const saveMobileJob=(f)=>{jobForm?.id?editJob({...f}):addJob({...f});setShowJobForm(false);setJobForm(null);};

  const handleVoiceJobCreated = useCallback(() => {
    setTimeout(() => load(), 1500);
    msg('🎙 Voice log processed!');
  }, [load, msg]);

  const bnavItems = [
    { page:'Dashboard', icon:'▣', label:'Home' },
    { page:'Jobs',      icon:'◈', label:'Jobs', badge: activeCount },
    { page:'Follow-ups',icon:'📞',label:'Follow', badge: followupCount, badgeColor: overdueFollowupCount?'var(--rd)':'var(--am)' },
    { page:'Schedule',  icon:'◎', label:'Schedule' },
    { page:'Diagnostics', icon:'🩺', label:'Diag' },
  ];

  return(<>
    <style>{styles}</style>
    <div className="app">
      <div className="topbar">
        <div><div className="logo">⊞ AXISCRM</div><div className="logo-sub">CAD·CAM FIELD OPS</div></div>
        <div className="topbar-spacer"/>
        {overdueFollowupCount > 0 && (
          <div onClick={()=>setPage('Follow-ups')} className="topbar-overdue" style={{display:'flex',alignItems:'center',gap:6,padding:'5px 10px',background:'var(--rdd)',border:'1px solid rgba(255,77,106,0.3)',borderRadius:4,cursor:'pointer',fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:'var(--rd)',whiteSpace:'nowrap'}}>
            ⚠ {overdueFollowupCount} overdue
          </div>
        )}
        <button
          onClick={()=>setShowVoiceLog(true)}
          title="Voice Log"
          style={{background:'none',border:'1px solid rgba(0,200,255,0.3)',borderRadius:6,color:'var(--ac)',fontSize:18,width:38,height:36,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',transition:'all .15s',flexShrink:0,WebkitTapHighlightColor:'transparent'}}
          onMouseEnter={e=>{e.currentTarget.style.background='rgba(0,200,255,0.12)';e.currentTarget.style.borderColor='var(--ac)';}}
          onMouseLeave={e=>{e.currentTarget.style.background='none';e.currentTarget.style.borderColor='rgba(0,200,255,0.3)';}}
        >🎙</button>
        <button className="btn bimport desktop-only" onClick={()=>setShowImport(true)} style={{fontSize:11}}>⬇ Import PDF</button>
        {page==='Jobs'&&<button className="btn bp desktop-only" onClick={openMobileJobNew}>+ New Job</button>}
      </div>

      <div className="body">
        <div className="sidebar">
          <div className="nl">Operations</div>
          <div className={"ni "+(page==='Dashboard'?'active':'')} onClick={()=>setPage('Dashboard')}>▣ Dashboard</div>
          <div className={"ni "+(page==='Jobs'?'active':'')} onClick={()=>setPage('Jobs')}>◈ Jobs</div>
          <div className={"ni "+(page==='Follow-ups'?'active':'')} onClick={()=>setPage('Follow-ups')} style={{position:'relative'}}>📞 Follow-ups{followupCount>0&&<span style={{marginLeft:'auto',fontFamily:"'IBM Plex Mono',monospace",fontSize:9,background:overdueFollowupCount?'var(--rdd)':'var(--sur2)',border:`1px solid ${overdueFollowupCount?'rgba(255,77,106,0.3)':'var(--bdr)'}`,padding:'1px 6px',borderRadius:3,color:overdueFollowupCount?'var(--rd)':'var(--txd)'}}>{followupCount}</span>}</div>
          <div className={"ni "+(page==='Schedule'?'active':'')} onClick={()=>setPage('Schedule')}>◎ Schedule</div>
          <div className="nl">Resources</div>
          <div className={"ni "+(page==='Customers'?'active':'')} onClick={()=>setPage('Customers')}>◻ Customers</div>
          <div className={"ni "+(page==='Technicians'?'active':'')} onClick={()=>setPage('Technicians')}>◑ Technicians</div>
          <div className={"ni "+(page==='Files'?'active':'')} onClick={()=>setPage('Files')}>◫ Files</div>
          <div className="nl">Diagnostics</div>
          <div className={"ni "+(page==='Diagnostics'?'active':'')} onClick={()=>setPage('Diagnostics')} style={{color:page==='Diagnostics'?undefined:'var(--ac)'}}>🩺 Mill Diagnostics</div>
          <div className="nl">History</div>
          <div className={"ni "+(page==='Archive'?'active':'')} onClick={()=>setPage('Archive')}>◧ Archive{archiveCount>0&&<span style={{marginLeft:'auto',fontFamily:"'IBM Plex Mono',monospace",fontSize:9,background:'var(--sur2)',border:'1px solid var(--bdr)',padding:'1px 6px',borderRadius:3,color:'var(--txd)'}}>{archiveCount}</span>}</div>
          <div className="ni" onClick={()=>setShowVoiceLog(true)} style={{color:'var(--ac)',borderLeft:'2px solid rgba(0,200,255,0.3)',marginTop:8}}>🎙 Voice Log</div>
          <div className="sf"><div className="up"><div className="ua">AD</div><div><div style={{fontSize:12,fontWeight:500}}>Admin</div><div style={{fontSize:10,color:'var(--txd)',fontFamily:"'IBM Plex Mono',monospace"}}>DISPATCH MGR</div></div></div></div>
        </div>

        <div className="main">
          <div className="mobile-only" style={{display:'flex',gap:8,marginBottom:12}}>
            <button className="btn bimport" style={{flex:1,height:44,fontSize:12}} onClick={()=>setShowImport(true)}>⬇ Import</button>
            <button className="btn bp" style={{flex:1,height:44,fontSize:12}} onClick={openMobileJobNew}>+ New Job</button>
          </div>

          {page==='Dashboard'&&<><Dashboard jobs={jobs.filter(j=>!isArchived(j))} onEditJob={openMobileJobEdit} calNotes={calNotes} onSaveNote={saveCalNote}/><MobileDashboard jobs={jobs.filter(j=>!isArchived(j))} onEditJob={openMobileJobEdit} onDeleteJob={delJob} onNewJob={openMobileJobNew}/></>}
          {page==='Jobs'&&<Jobs jobs={jobs.filter(j=>!isArchived(j))} customers={customers} technicians={technicians} loading={loading.jobs} onAdd={addJob} onEdit={editJob} onDelete={delJob}/>}
          {page==='Follow-ups'&&<Followups jobs={jobs} onEdit={editJob} loading={loading.jobs}/>}
          {page==='Schedule'&&<Schedule jobs={jobs.filter(j=>!isArchived(j))} calNotes={calNotes} onSaveNote={saveCalNote}/>}
          {page==='Customers'&&<Customers customers={customers} jobs={jobs} loading={loading.customers} onAdd={addCust} onEdit={editCust} onDelete={delCust}/>}
          {page==='Technicians'&&<Technicians technicians={technicians} loading={loading.technicians} onAdd={addTech} onEdit={editTech} onDelete={delTech}/>}
          {page==='Files'&&<Files files={files} onUpload={uploadFiles} onDelete={deleteFile} uploading={fileUploading}/>}
          {page==='Diagnostics'&&<Diagnostics msg={msg}/>}
          {page==='Archive'&&<Archive jobs={jobs} onEdit={editJob} onDelete={delJob} loading={loading.jobs}/>}
        </div>
      </div>

      <nav className="bnav">
        <div className="bnav-inner">
          {bnavItems.map(item=>(
            <div key={item.page} className={"bnav-item "+(page===item.page?'active':'')} onClick={()=>setPage(item.page)}>
              <div className="bnav-icon">{item.icon}</div>
              {item.badge>0&&<span className="bnav-badge" style={item.badgeColor?{background:item.badgeColor}:{}}>{item.badge}</span>}
              <div className="bnav-label">{item.label}</div>
            </div>
          ))}
          <div className="bnav-item" onClick={()=>setShowVoiceLog(true)}>
            <div className="bnav-icon" style={{filter:'drop-shadow(0 0 4px rgba(0,200,255,0.5))'}}>🎙</div>
            <div className="bnav-label" style={{color:'var(--ac)'}}>Voice</div>
          </div>
        </div>
      </nav>

      {showJobForm&&<JobFormModal job={jobForm} customers={customers} technicians={technicians} onSave={saveMobileJob} onClose={()=>{setShowJobForm(false);setJobForm(null);}}/>}
      {showImport&&<ImportModal onClose={()=>setShowImport(false)} onImport={handleImport} existingJobs={jobs}/>}

      {showVoiceLog&&<VoiceLog onClose={()=>setShowVoiceLog(false)} onJobCreated={handleVoiceJobCreated}/>}

      <Toast msg={toast}/>
    </div>
  </>);
}
