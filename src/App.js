import { useState, useEffect, useCallback } from "react";

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
  .loading{display:flex;align-items:center;justify-content:center;padding:40px;color:var(--txd);font-family:'IBM Plex Mono',monospace;font-size:12px;gap:10px;}
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
  @keyframes spin{to{transform:rotate(360deg);}}
  @media(max-width:900px){.kgrid{grid-template-columns:repeat(2,1fr);}.g2{grid-template-columns:1fr;}.fr{grid-template-columns:1fr;}}
  @media(max-width:640px){:root{--sw:0px;}.sidebar{display:none;}.main{margin-left:0;padding:14px;padding-bottom:80px;}.bnav{display:block;}.kgrid{display:none;}.desktop-table{display:none;}.mobile-cards{display:block;}.topbar{padding:0 14px;}.logo-sub{display:none;}}
  @media(min-width:641px){.mobile-cards{display:none;}.mob-kpi-row{display:none;}.mob-section{display:none;}.filter-bar{display:none;}}
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

function JobDetailModal({job,onClose}){
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
            <div><div className="detail-label">Priority</div><div className="detail-value">{job.priority||'Normal'}</div></div>
            <div><div className="detail-label">Invoice</div><div className="detail-value">{job.invoice_status||'—'}</div></div>
          </div>
          <div style={{borderTop:'1px solid var(--bdr)',paddingTop:16}}>
            <div className="detail-label" style={{marginBottom:8}}>Notes</div>
            <div style={{fontSize:13,color:job.notes?'var(--tx)':'var(--txd)',lineHeight:1.7,minHeight:60,background:'var(--sur2)',padding:'10px 12px',borderRadius:4,border:'1px solid var(--bdr)',fontStyle:job.notes?'normal':'italic'}}>{job.notes||'No notes for this job.'}</div>
          </div>
        </div>
        <div className="mf"><button className="btn bg" onClick={onClose}>Close</button></div>
      </div>
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
        <StBadge s={j.status}/>
      </div>
      <div className="job-card-meta">
        {j.technician&&<span className="job-card-tag">👤 {j.technician}</span>}
        {j.date&&<span className="job-card-tag">📅 {j.date}</span>}
        {j.priority&&j.priority!=='Normal'&&<span className="job-card-tag" style={{color:j.priority==='Urgent'?'var(--rd)':j.priority==='High'?'var(--am)':'var(--txm)',borderColor:j.priority==='Urgent'?'rgba(255,77,106,0.3)':j.priority==='High'?'rgba(255,176,32,0.3)':'var(--bdr)'}}>⚡ {j.priority}</span>}
        {j.amount&&<span className="job-card-tag">💰 ${j.amount}</span>}
      </div>
      {j.notes&&<div style={{fontSize:11,color:'var(--txd)',marginTop:8,fontStyle:'italic',borderLeft:'2px solid var(--bdr)',paddingLeft:8}}>{j.notes}</div>}
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

function Dashboard({jobs,technicians,onFilterJobs}){
  const active=jobs.filter(j=>['In Progress','Dispatched'].includes(j.status)).length;
  const pending=jobs.filter(j=>j.status==='Pending').length;
  const rev=jobs.filter(j=>j.invoice_status==='Paid').reduce((s,j)=>s+(parseFloat(j.amount)||0),0);
  const sla=jobs.filter(j=>j.priority==='Urgent'&&j.status!=='Complete').length;
  const [selected,setSelected]=useState(null);
  const toggle=(f,filtered)=>{const n=selected===f?null:f;setSelected(n);onFilterJobs(n?filtered:null,n?f:null);};
  return(<>
    <div className="kgrid">
      <div className={"kc bl"+(selected==='active'?' selected':'')} onClick={()=>toggle('active',jobs.filter(j=>['In Progress','Dispatched'].includes(j.status)))}><div className="kl">Active Jobs</div><div className="kv">{active}</div><div className="ks">Click to filter ↓</div></div>
      <div className={"kc am"+(selected==='pending'?' selected':'')} onClick={()=>toggle('pending',jobs.filter(j=>j.status==='Pending'))}><div className="kl">Pending</div><div className="kv">{pending}</div><div className="ks">Click to filter ↓</div></div>
      <div className={"kc gr"+(selected==='paid'?' selected':'')} onClick={()=>toggle('paid',jobs.filter(j=>j.invoice_status==='Paid'))}><div className="kl">Revenue Paid</div><div className="kv">${rev.toLocaleString()}</div><div className="ks">Click to filter ↓</div></div>
      <div className={"kc rd"+(selected==='urgent'?' selected':'')} onClick={()=>toggle('urgent',jobs.filter(j=>j.priority==='Urgent'&&j.status!=='Complete'))}><div className="kl">SLA At Risk</div><div className="kv">{sla}</div><div className="ks">Click to filter ↓</div></div>
    </div>
    <div className="g2">
      <div className="panel">
        <div className="ph"><div className="pt">Recent Jobs</div></div>
        {[...jobs].reverse().slice(0,6).map(j=>(
          <div key={j.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 16px',borderBottom:'1px solid var(--bdr)'}}>
            <div><div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:'var(--ac)',marginBottom:1}}>{j.job_id}</div><div style={{fontSize:13,fontWeight:500}}>{j.customer||'—'}</div><div style={{fontSize:11,color:'var(--txd)'}}>{j.equipment||'—'}</div></div>
            <StBadge s={j.status}/>
          </div>
        ))}
        {!jobs.length&&<div className="empty"><div className="ei">📋</div>No jobs yet</div>}
      </div>
      <div className="panel">
        <div className="ph"><div className="pt">Technicians</div></div>
        {technicians.map(t=>(
          <div key={t.id} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 16px',borderBottom:'1px solid var(--bdr)'}}>
            <div className={"tav "+(t.status||'Offline')}>{(t.initials||(t.name||'?').substring(0,2)).toUpperCase()}</div>
            <div style={{flex:1,minWidth:0}}><div style={{fontSize:13,fontWeight:500}}>{t.name}</div><div style={{fontSize:11,color:'var(--txd)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t.current_job||'No active job'}</div></div>
            <StBadge s={t.status}/>
          </div>
        ))}
        {!technicians.length&&<div className="empty"><div className="ei">👷</div>No technicians yet</div>}
      </div>
    </div>
  </>);
}

function FilteredJobsPanel({jobs,label,onClear,onEdit,onDelete}){
  const [viewJob,setViewJob]=useState(null);
  return(<>
    <div className="panel" style={{marginTop:0}}>
      <div className="ph">
        <div className="pt">{label} ({jobs.length})</div>
        <div className="pa" onClick={onClear}>✕ Clear filter</div>
      </div>
      <div className="tbl">
        <div className="tr hdr" style={{gridTemplateColumns:'90px 1fr 110px 90px 90px 70px'}}>
          <div className="cl">ID</div><div className="cl">Customer/Equip</div><div className="cl">Technician</div><div className="cl">Date</div><div className="cl">Status</div><div className="cl">Act.</div>
        </div>
        {jobs.map(j=>(
          <div key={j.id} className="tr" style={{gridTemplateColumns:'90px 1fr 110px 90px 90px 70px'}} onClick={()=>setViewJob(j)}>
            <div className="ci">{j.job_id}</div>
            <div><div className="cm">{j.customer||'—'}</div><div className="cs">{j.equipment||'—'}</div></div>
            <div className="cd">{j.technician||'—'}</div>
            <div className="cn">{j.date||'—'}</div>
            <div><StBadge s={j.status}/></div>
            <div style={{display:'flex',gap:4}} onClick={e=>e.stopPropagation()}>
              <button className="btn bg bs" onClick={()=>onEdit(j)}>✏️</button>
              <button className="btn bd bs" onClick={()=>onDelete(j.id)}>🗑</button>
            </div>
          </div>
        ))}
        {!jobs.length&&<div className="empty"><div className="ei">✅</div>No jobs in this category</div>}
      </div>
    </div>
    {viewJob&&<JobDetailModal job={viewJob} onClose={()=>setViewJob(null)}/>}
  </>);
}

function JobFormModal({job,customers,technicians,onSave,onClose}){
  const [f,setF]=useState(job?{...job}:{job_id:'JO-'+Date.now().toString().slice(-4),status:'Pending',priority:'Normal',invoice_status:'Not Invoiced'});
  return(
    <Modal title={job?.id?'Edit Job':'New Job'} onClose={onClose} onSave={()=>onSave(f)} saveLabel={job?.id?'Save Changes':'Create Job'}>
      <div className="fr">
        <div className="fg"><label className="fl">Job ID</label><input className="fi" value={f.job_id||''} onChange={e=>setF({...f,job_id:e.target.value})}/></div>
        <div className="fg"><label className="fl">Status</label><select className="fsl" value={f.status||'Pending'} onChange={e=>setF({...f,status:e.target.value})}><option>Pending</option><option>Dispatched</option><option>In Progress</option><option>Complete</option></select></div>
      </div>
      <div className="fg"><label className="fl">Customer</label>
        <select className="fsl" value={f.customer||''} onChange={e=>setF({...f,customer:e.target.value})}>
          <option value="">Select customer...</option>
          {customers.map(c=><option key={c.id}>{c.company}</option>)}
        </select>
      </div>
      <div className="fg"><label className="fl">Equipment</label><input className="fi" placeholder="e.g. Fanuc Robodrill" value={f.equipment||''} onChange={e=>setF({...f,equipment:e.target.value})}/></div>
      <div className="fr">
        <div className="fg"><label className="fl">Technician</label>
          <select className="fsl" value={f.technician||''} onChange={e=>setF({...f,technician:e.target.value})}>
            <option value="">Unassigned</option>
            {technicians.map(t=><option key={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div className="fg"><label className="fl">Priority</label><select className="fsl" value={f.priority||'Normal'} onChange={e=>setF({...f,priority:e.target.value})}><option>Low</option><option>Normal</option><option>High</option><option>Urgent</option></select></div>
      </div>
      <div className="fr">
        <div className="fg"><label className="fl">Date</label><input className="fi" type="date" value={f.date||''} onChange={e=>setF({...f,date:e.target.value})}/></div>
        <div className="fg"><label className="fl">Amount ($)</label><input className="fi" type="number" value={f.amount||''} onChange={e=>setF({...f,amount:e.target.value})}/></div>
      </div>
      <div className="fg"><label className="fl">Invoice Status</label><select className="fsl" value={f.invoice_status||'Not Invoiced'} onChange={e=>setF({...f,invoice_status:e.target.value})}><option>Not Invoiced</option><option>Invoiced</option><option>Paid</option><option>Overdue</option></select></div>
      <div className="fg"><label className="fl">Notes</label><textarea className="fta" value={f.notes||''} onChange={e=>setF({...f,notes:e.target.value})}/></div>
    </Modal>
  );
}

function Jobs({jobs,customers,technicians,onAdd,onEdit,onDelete,loading}){
  const [editJob,setEditJob]=useState(null);
  const [showForm,setShowForm]=useState(false);
  const [viewJob,setViewJob]=useState(null);
  const save=(f)=>{editJob?.id?onEdit({...f}):onAdd({...f});setShowForm(false);setEditJob(null);};
  const openEdit=(j)=>{setEditJob(j);setShowForm(true);};
  const openNew=()=>{setEditJob(null);setShowForm(true);};
  return(<>
    <div className="panel desktop-table">
      <div className="ph"><div className="pt">Jobs ({jobs.length})</div><button className="btn bp bs" onClick={openNew}>+ New Job</button></div>
      {loading?<Loading/>:<div className="tbl">
        <div className="tr hdr" style={{gridTemplateColumns:'90px 1fr 110px 90px 80px 90px 70px'}}>
          <div className="cl">ID</div><div className="cl">Customer/Equip</div><div className="cl">Technician</div><div className="cl">Date</div><div className="cl">Amount</div><div className="cl">Status</div><div className="cl">Act.</div>
        </div>
        {[...jobs].reverse().map(j=>(
          <div key={j.id} className="tr" style={{gridTemplateColumns:'90px 1fr 110px 90px 80px 90px 70px'}} onClick={()=>setViewJob(j)}>
            <div className="ci">{j.job_id}</div>
            <div><div className="cm">{j.customer||'—'}</div><div className="cs">{j.equipment||'—'}</div></div>
            <div className="cd">{j.technician||'—'}</div>
            <div className="cn">{j.date||'—'}</div>
            <div className="cv">{j.amount?'$'+j.amount:'—'}</div>
            <div><StBadge s={j.status}/></div>
            <div style={{display:'flex',gap:4}} onClick={e=>e.stopPropagation()}>
              <button className="btn bg bs" onClick={()=>openEdit(j)}>✏️</button>
              <button className="btn bd bs" onClick={()=>onDelete(j.id)}>🗑</button>
            </div>
          </div>
        ))}
        {!jobs.length&&<div className="empty"><div className="ei">📋</div>No jobs yet!</div>}
      </div>}
    </div>
    <div className="mobile-cards">
      <button className="btn bp" style={{width:'100%',justifyContent:'center',padding:'12px',fontSize:13,marginBottom:16}} onClick={openNew}>+ New Job</button>
      {loading?<Loading/>:[...jobs].reverse().map(j=><JobCard key={j.id} j={j} onEdit={openEdit} onDelete={onDelete}/>)}
      {!loading&&!jobs.length&&<div className="empty"><div className="ei">📋</div>No jobs yet!</div>}
    </div>
    {showForm&&<JobFormModal job={editJob} customers={customers} technicians={technicians} onSave={save} onClose={()=>{setShowForm(false);setEditJob(null);}}/>}
    {viewJob&&<JobDetailModal job={viewJob} onClose={()=>setViewJob(null)}/>}
  </>);
}

function Customers({customers,jobs,onAdd,onEdit,onDelete,loading}){
  const [form,setForm]=useState(null);
  const [f,setF]=useState({});
  const [search,setSearch]=useState('');
  const [expanded,setExpanded]=useState(null);
  const [viewJob,setViewJob]=useState(null);
  const filtered=customers.filter(c=>
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
        {[...filtered].reverse().map(c=>{
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
            {dj.map(j=><div key={j.id} className={"cj "+(j.status||'Pending').replace(' ','')}>{j.job_id}</div>)}
          </div>);
        })}
      </div>
    </div>
  );
}

export default function App(){
  const [page,setPage]=useState('Dashboard');
  const [jobs,setJobs]=useState([]);
  const [customers,setCustomers]=useState([]);
  const [technicians,setTechnicians]=useState([]);
  const [loading,setLoading]=useState({jobs:true,customers:true,technicians:true});
  const [toast,setToast]=useState('');
  const [jobForm,setJobForm]=useState(null);
  const [showJobForm,setShowJobForm]=useState(false);
  const [filteredJobs,setFilteredJobs]=useState(null);
  const [filterLabel,setFilterLabel]=useState('');

  const msg=useCallback((m)=>{setToast(m);setTimeout(()=>setToast(''),2500);},[]);

  const load=useCallback(async()=>{
    try{
      const [j,c,t]=await Promise.all([db.get('jobs'),db.get('customers'),db.get('technicians')]);
      setJobs(j||[]);setCustomers(c||[]);setTechnicians(t||[]);
    }catch(e){msg('⚠️ Could not connect to database.');}
    setLoading({jobs:false,customers:false,technicians:false});
  },[msg]);

  useEffect(()=>{load();},[load]);

  const addJob=async(f)=>{try{const r=await db.insert('jobs',{job_id:f.job_id,customer:f.customer,equipment:f.equipment,technician:f.technician,status:f.status,priority:f.priority,date:f.date,amount:f.amount,invoice_status:f.invoice_status,notes:f.notes});setJobs(p=>[...p,...(Array.isArray(r)?r:[r])]);msg('✅ Job saved!');}catch{msg('⚠️ Save failed.');}};
  const editJob=async(f)=>{try{await db.update('jobs',f.id,{job_id:f.job_id,customer:f.customer,equipment:f.equipment,technician:f.technician,status:f.status,priority:f.priority,date:f.date,amount:f.amount,invoice_status:f.invoice_status,notes:f.notes});setJobs(p=>p.map(x=>x.id===f.id?{...x,...f}:x));msg('✅ Updated!');}catch{msg('⚠️ Update failed.');}};
  const delJob=async(id)=>{if(!window.confirm('Delete this job?'))return;try{await db.delete('jobs',id);setJobs(p=>p.filter(x=>x.id!==id));msg('🗑 Deleted.');}catch{msg('⚠️ Delete failed.');}};

  const addCust=async(f)=>{try{const r=await db.insert('customers',{company:f.company,contact:f.contact,phone:f.phone,email:f.email,address:f.address,notes:f.notes});setCustomers(p=>[...p,...(Array.isArray(r)?r:[r])]);msg('✅ Customer saved!');}catch{msg('⚠️ Save failed.');}};
  const editCust=async(f)=>{try{await db.update('customers',f.id,{company:f.company,contact:f.contact,phone:f.phone,email:f.email,address:f.address,notes:f.notes});setCustomers(p=>p.map(x=>x.id===f.id?{...x,...f}:x));msg('✅ Updated!');}catch{msg('⚠️ Update failed.');}};
  const delCust=async(id)=>{if(!window.confirm('Delete?'))return;try{await db.delete('customers',id);setCustomers(p=>p.filter(x=>x.id!==id));msg('🗑 Deleted.');}catch{msg('⚠️ Delete failed.');}};

  const addTech=async(f)=>{try{const r=await db.insert('technicians',{name:f.name,initials:f.initials,email:f.email,phone:f.phone,status:f.status,current_job:f.current_job});setTechnicians(p=>[...p,...(Array.isArray(r)?r:[r])]);msg('✅ Technician saved!');}catch{msg('⚠️ Save failed.');}};
  const editTech=async(f)=>{try{await db.update('technicians',f.id,{name:f.name,initials:f.initials,email:f.email,phone:f.phone,status:f.status,current_job:f.current_job});setTechnicians(p=>p.map(x=>x.id===f.id?{...x,...f}:x));msg('✅ Updated!');}catch{msg('⚠️ Update failed.');}};
  const delTech=async(id)=>{if(!window.confirm('Delete?'))return;try{await db.delete('technicians',id);setTechnicians(p=>p.filter(x=>x.id!==id));msg('🗑 Deleted.');}catch{msg('⚠️ Delete failed.');}};

  const pages=['Dashboard','Jobs','Schedule','Customers','Technicians'];
  const icons=['▣','◈','◎','◻','◑'];
  const activeCount=jobs.filter(j=>['In Progress','Dispatched'].includes(j.status)).length;
  const openMobileJobEdit=(j)=>{setJobForm(j);setShowJobForm(true);};
  const openMobileJobNew=()=>{setJobForm(null);setShowJobForm(true);};
  const saveMobileJob=(f)=>{jobForm?.id?editJob({...f}):addJob({...f});setShowJobForm(false);setJobForm(null);};

  return(<>
    <style>{styles}</style>
    <div className="app">
      <div className="topbar">
        <div><div className="logo">⊞ AXISCRM</div><div className="logo-sub">CAD·CAM FIELD OPS</div></div>
        <div style={{flex:1}}/>
        {page==='Jobs'&&<button className="btn bp" onClick={openMobileJobNew}>+ New Job</button>}
        {page==='Customers'&&<button className="btn bp" onClick={()=>document.dispatchEvent(new CustomEvent('openCust'))}>+ New Customer</button>}
        {page==='Technicians'&&<button className="btn bp" onClick={()=>document.dispatchEvent(new CustomEvent('openTech'))}>+ Add Technician</button>}
      </div>
      <div className="body">
        <div className="sidebar">
          <div className="nl">Operations</div>
          {pages.slice(0,4).map((p,i)=><div key={p} className={"ni "+(page===p?'active':'')} onClick={()=>{setPage(p);setFilteredJobs(null);}}>{icons[i]} {p}</div>)}
          <div className="nl">Resources</div>
          <div className={"ni "+(page==='Technicians'?'active':'')} onClick={()=>setPage('Technicians')}>◑ Technicians</div>
          <div className="sf"><div className="up"><div className="ua">AD</div><div><div style={{fontSize:12,fontWeight:500}}>Admin</div><div style={{fontSize:10,color:'var(--txd)',fontFamily:"'IBM Plex Mono',monospace"}}>DISPATCH MGR</div></div></div></div>
        </div>
        <div className="main">
          {page==='Dashboard'&&<>
            <Dashboard jobs={jobs} technicians={technicians} onFilterJobs={(filtered,label)=>{setFilteredJobs(filtered);setFilterLabel(label);}}/>
            {filteredJobs&&<FilteredJobsPanel jobs={filteredJobs} label={filterLabel==='active'?'Active Jobs':filterLabel==='pending'?'Pending Jobs':filterLabel==='paid'?'Paid Jobs':'Urgent Jobs'} onClear={()=>setFilteredJobs(null)} onEdit={openMobileJobEdit} onDelete={delJob}/>}
            <MobileDashboard jobs={jobs} onEditJob={openMobileJobEdit} onDeleteJob={delJob} onNewJob={openMobileJobNew}/>
          </>}
          {page==='Jobs'&&<Jobs jobs={jobs} customers={customers} technicians={technicians} loading={loading.jobs} onAdd={addJob} onEdit={editJob} onDelete={delJob}/>}
          {page==='Schedule'&&<Schedule jobs={jobs}/>}
          {page==='Customers'&&<Customers customers={customers} jobs={jobs} loading={loading.customers} onAdd={addCust} onEdit={editCust} onDelete={delCust}/>}
          {page==='Technicians'&&<Technicians technicians={technicians} loading={loading.technicians} onAdd={addTech} onEdit={editTech} onDelete={delTech}/>}
        </div>
      </div>
      <nav className="bnav">
        <div className="bnav-inner">
          {pages.map((p,i)=>(
            <div key={p} className={"bnav-item "+(page===p?'active':'')} onClick={()=>setPage(p)}>
              <div className="bnav-icon">{icons[i]}</div>
              {p==='Jobs'&&activeCount>0&&<span className="bnav-badge">{activeCount}</span>}
              <div className="bnav-label">{p==='Technicians'?'Techs':p}</div>
            </div>
          ))}
        </div>
      </nav>
      {showJobForm&&<JobFormModal job={jobForm} customers={customers} technicians={technicians} onSave={saveMobileJob} onClose={()=>{setShowJobForm(false);setJobForm(null);}}/>}
      <Toast msg={toast}/>
    </div>
  </>);
}
