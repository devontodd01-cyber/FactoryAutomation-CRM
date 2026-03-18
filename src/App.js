import { useState, useEffect, useCallback } from "react";

const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@300;400;500&display=swap');
  *{margin:0;padding:0;box-sizing:border-box;}
  :root{--bg:#0a0c10;--sur:#0f1218;--sur2:#161b24;--bdr:#1e2a3a;--bdr2:#243040;--ac:#00c8ff;--ac2:#0084a8;--acd:rgba(0,200,255,0.08);--am:#ffb020;--amd:rgba(255,176,32,0.10);--gr:#22d47a;--grd:rgba(34,212,122,0.10);--rd:#ff4d6a;--rdd:rgba(255,77,106,0.10);--tx:#d0dae8;--txd:#5a6a80;--txm:#8a9ab0;--sw:200px;}
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
  .main{margin-left:var(--sw);flex:1;padding:20px;}
  .kgrid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px;}
  .kc{background:var(--sur);border:1px solid var(--bdr);border-radius:6px;padding:14px 16px;position:relative;overflow:hidden;}
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
  .toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:var(--sur2);border:1px solid var(--bdr2);border-radius:6px;padding:9px 18px;font-family:'IBM Plex Mono',monospace;font-size:11px;z-index:100;white-space:nowrap;}
  .g2{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
  @media(max-width:900px){.kgrid{grid-template-columns:repeat(2,1fr);}.g2{grid-template-columns:1fr;}}
`;

const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,5);
const LS={get:(k)=>{try{return JSON.parse(localStorage.getItem(k)||'[]');}catch{return[];}},set:(k,v)=>localStorage.setItem(k,JSON.stringify(v))};

function StBadge({s}){return <span className={"st "+(s||'Pending').replace(' ','')}>{s||'Pending'}</span>;}
function Toast({msg}){return msg?<div className="toast">{msg}</div>:null;}

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

function Dashboard({jobs,technicians}){
  const active=jobs.filter(j=>['In Progress','Dispatched'].includes(j.status)).length;
  const pending=jobs.filter(j=>j.status==='Pending').length;
  const rev=jobs.filter(j=>j.invoiceStatus==='Paid').reduce((s,j)=>s+(parseFloat(j.amount)||0),0);
  const sla=jobs.filter(j=>j.priority==='Urgent'&&j.status!=='Complete').length;
  return(<>
    <div className="kgrid">
      <div className="kc bl"><div className="kl">Active Jobs</div><div className="kv">{active}</div><div className="ks">In progress / dispatched</div></div>
      <div className="kc am"><div className="kl">Pending</div><div className="kv">{pending}</div><div className="ks">Awaiting assignment</div></div>
      <div className="kc gr"><div className="kl">Revenue Paid</div><div className="kv">${rev.toLocaleString()}</div><div className="ks">From paid invoices</div></div>
      <div className="kc rd"><div className="kl">SLA At Risk</div><div className="kv">{sla}</div><div className="ks">Urgent & open</div></div>
    </div>
    <div className="g2">
      <div className="panel">
        <div className="ph"><div className="pt">Recent Jobs</div></div>
        {[...jobs].reverse().slice(0,6).map(j=>(
          <div key={j.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 16px',borderBottom:'1px solid var(--bdr)'}}>
            <div><div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:'var(--ac)',marginBottom:1}}>{j.jobId}</div><div style={{fontSize:13,fontWeight:500}}>{j.customer||'—'}</div><div style={{fontSize:11,color:'var(--txd)'}}>{j.equipment||'—'}</div></div>
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
            <div style={{flex:1,minWidth:0}}><div style={{fontSize:13,fontWeight:500}}>{t.name}</div><div style={{fontSize:11,color:'var(--txd)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t.currentJob||'No active job'}</div></div>
            <StBadge s={t.status}/>
          </div>
        ))}
        {!technicians.length&&<div className="empty"><div className="ei">👷</div>No technicians yet</div>}
      </div>
    </div>
  </>);
}

function Jobs({jobs,customers,technicians,onAdd,onEdit,onDelete}){
  const [form,setForm]=useState(null);
  const [f,setF]=useState({});
  const open=(j)=>{setF(j?{...j}:{jobId:'JO-'+Date.now().toString().slice(-4),status:'Pending',priority:'Normal',invoiceStatus:'Not Invoiced'});setForm(j||{});};
  const save=()=>{form?.id?onEdit({...f}):onAdd({...f,id:uid()});setForm(null);};
  return(<>
    <div className="panel">
      <div className="ph"><div className="pt">Jobs ({jobs.length})</div><button className="btn bp bs" onClick={()=>open(null)}>+ New Job</button></div>
      <div className="tbl">
        <div className="tr hdr" style={{gridTemplateColumns:'90px 1fr 110px 90px 80px 90px 70px'}}>
          <div className="cl">ID</div><div className="cl">Customer/Equip</div><div className="cl">Technician</div><div className="cl">Date</div><div className="cl">Amount</div><div className="cl">Status</div><div className="cl">Act.</div>
        </div>
        {[...jobs].reverse().map(j=>(
          <div key={j.id} className="tr" style={{gridTemplateColumns:'90px 1fr 110px 90px 80px 90px 70px'}}>
            <div className="ci">{j.jobId}</div>
            <div><div className="cm">{j.customer||'—'}</div><div className="cs">{j.equipment||'—'}</div></div>
            <div className="cd">{j.technician||'—'}</div>
            <div className="cn">{j.date||'—'}</div>
            <div className="cv">{j.amount?'$'+j.amount:'—'}</div>
            <div><StBadge s={j.status}/></div>
            <div style={{display:'flex',gap:4}}>
              <button className="btn bg bs" onClick={()=>open(j)}>✏️</button>
              <button className="btn bd bs" onClick={()=>onDelete(j.id)}>🗑</button>
            </div>
          </div>
        ))}
        {!jobs.length&&<div className="empty"><div className="ei">📋</div>No jobs yet!</div>}
      </div>
    </div>
    {form!==null&&(
      <Modal title={form?.id?'Edit Job':'New Job'} onClose={()=>setForm(null)} onSave={save} saveLabel={form?.id?'Save Changes':'Create Job'}>
        <div className="fr">
          <div className="fg"><label className="fl">Job ID</label><input className="fi" value={f.jobId||''} onChange={e=>setF({...f,jobId:e.target.value})}/></div>
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
        <div className="fg"><label className="fl">Invoice Status</label><select className="fsl" value={f.invoiceStatus||'Not Invoiced'} onChange={e=>setF({...f,invoiceStatus:e.target.value})}><option>Not Invoiced</option><option>Invoiced</option><option>Paid</option><option>Overdue</option></select></div>
        <div className="fg"><label className="fl">Notes</label><textarea className="fta" value={f.notes||''} onChange={e=>setF({...f,notes:e.target.value})}/></div>
      </Modal>
    )}
  </>);
}

function Customers({customers,jobs,onAdd,onEdit,onDelete}){
  const [form,setForm]=useState(null);
  const [f,setF]=useState({});
  const open=(c)=>{setF(c?{...c}:{});setForm(c||{});};
  const save=()=>{form?.id?onEdit({...f}):onAdd({...f,id:uid()});setForm(null);};
  return(<>
    <div className="panel">
      <div className="ph"><div className="pt">Customers ({customers.length})</div><button className="btn bp bs" onClick={()=>open(null)}>+ New Customer</button></div>
      <div className="tbl">
        <div className="tr hdr" style={{gridTemplateColumns:'1fr 130px 160px 60px 70px'}}>
          <div className="cl">Company/Contact</div><div className="cl">Phone</div><div className="cl">Email</div><div className="cl">Jobs</div><div className="cl">Act.</div>
        </div>
        {[...customers].reverse().map(c=>(
          <div key={c.id} className="tr" style={{gridTemplateColumns:'1fr 130px 160px 60px 70px'}}>
            <div><div className="cm">{c.company||'—'}</div><div className="cs">{c.contact||''}</div></div>
            <div className="cn">{c.phone||'—'}</div>
            <div className="cn" style={{fontSize:10}}>{c.email||'—'}</div>
            <div style={{fontFamily:"'Rajdhani',sans-serif",fontWeight:600,color:'var(--ac)'}}>{jobs.filter(j=>j.customer===c.company).length}</div>
            <div style={{display:'flex',gap:4}}>
              <button className="btn bg bs" onClick={()=>open(c)}>✏️</button>
              <button className="btn bd bs" onClick={()=>onDelete(c.id)}>🗑</button>
            </div>
          </div>
        ))}
        {!customers.length&&<div className="empty"><div className="ei">🏢</div>No customers yet.</div>}
      </div>
    </div>
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

function Technicians({technicians,onAdd,onEdit,onDelete}){
  const [form,setForm]=useState(null);
  const [f,setF]=useState({});
  const open=(t)=>{setF(t?{...t}:{status:'Available'});setForm(t||{});};
  const save=()=>{const ini=(f.name||'').split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);form?.id?onEdit({...f,initials:ini}):onAdd({...f,id:uid(),initials:ini});setForm(null);};
  return(<>
    <div className="panel">
      <div className="ph"><div className="pt">Technicians ({technicians.length})</div><button className="btn bp bs" onClick={()=>open(null)}>+ Add Technician</button></div>
      <div className="tgrid">
        {technicians.map(t=>(
          <div key={t.id} className="tc">
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
              <div className={"tav "+(t.status||'Offline')}>{(t.initials||(t.name||'?').substring(0,2)).toUpperCase()}</div>
              <div><div style={{fontSize:13,fontWeight:500}}>{t.name}</div><StBadge s={t.status}/></div>
            </div>
            <div style={{fontSize:11,color:'var(--txd)',marginBottom:3,fontFamily:"'IBM Plex Mono',monospace"}}>📧 {t.email||'—'}</div>
            <div style={{fontSize:11,color:'var(--txd)',marginBottom:3,fontFamily:"'IBM Plex Mono',monospace"}}>📞 {t.phone||'—'}</div>
            <div style={{fontSize:11,color:'var(--txd)',fontFamily:"'IBM Plex Mono',monospace"}}>🔧 {t.currentJob||'No active job'}</div>
            <div style={{display:'flex',gap:6,marginTop:10}}>
              <button className="btn bg bs" style={{flex:1}} onClick={()=>open(t)}>✏️ Edit</button>
              <button className="btn bd bs" onClick={()=>onDelete(t.id)}>🗑</button>
            </div>
          </div>
        ))}
        {!technicians.length&&<div className="empty" style={{gridColumn:'1/-1'}}><div className="ei">👷</div>No technicians yet.</div>}
      </div>
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
        <div className="fg"><label className="fl">Current Job</label><input className="fi" value={f.currentJob||''} onChange={e=>setF({...f,currentJob:e.target.value})}/></div>
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
          <button className="btn bg bs" onClick={()=>setVd(new Date(vd.getFullYear(),vd.getMonth()-1,1))}>‹ Prev</button>
          <button className="btn bg bs" onClick={()=>setVd(new Date(vd.getFullYear(),vd.getMonth()+1,1))}>Next ›</button>
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
            {dj.map(j=><div key={j.id} className={"cj "+(j.status||'Pending').replace(' ','')}>{j.jobId}</div>)}
          </div>);
        })}
      </div>
    </div>
  );
}

export default function App(){
  const [page,setPage]=useState('Dashboard');
  const [jobs,setJobs]=useState(()=>LS.get('axis_jobs'));
  const [customers,setCustomers]=useState(()=>LS.get('axis_customers'));
  const [technicians,setTechnicians]=useState(()=>LS.get('axis_technicians'));
  const [toast,setToast]=useState('');

  useEffect(()=>{LS.set('axis_jobs',jobs);},[jobs]);
  useEffect(()=>{LS.set('axis_customers',customers);},[customers]);
  useEffect(()=>{LS.set('axis_technicians',technicians);},[technicians]);

  const msg=useCallback((m)=>{setToast(m);setTimeout(()=>setToast(''),2500);},[]);

  const addJob=(j)=>{setJobs(p=>[...p,j]);msg('✅ Job saved!');};
  const editJob=(j)=>{setJobs(p=>p.map(x=>x.id===j.id?j:x));msg('✅ Updated!');};
  const delJob=(id)=>{if(window.confirm('Delete this job?')){setJobs(p=>p.filter(x=>x.id!==id));msg('🗑 Deleted.');}};
  const addCust=(c)=>{setCustomers(p=>[...p,c]);msg('✅ Customer saved!');};
  const editCust=(c)=>{setCustomers(p=>p.map(x=>x.id===c.id?c:x));msg('✅ Updated!');};
  const delCust=(id)=>{if(window.confirm('Delete?')){setCustomers(p=>p.filter(x=>x.id!==id));msg('🗑 Deleted.');}};
  const addTech=(t)=>{setTechnicians(p=>[...p,t]);msg('✅ Technician saved!');};
  const editTech=(t)=>{setTechnicians(p=>p.map(x=>x.id===t.id?t:x));msg('✅ Updated!');};
  const delTech=(id)=>{if(window.confirm('Delete?')){setTechnicians(p=>p.filter(x=>x.id!==id));msg('🗑 Deleted.');}};

  const pages=['Dashboard','Jobs','Schedule','Customers','Technicians'];
  const icons=['▣','◈','◎','◻','◑'];

  return(<>
    <style>{styles}</style>
    <div className="app">
      <div className="topbar">
        <div><div className="logo">⊞ AXISCRM</div><div className="logo-sub">CAD·CAM FIELD OPS</div></div>
        <div style={{flex:1}}/>
        {page==='Jobs'&&<button className="btn bp" onClick={()=>document.dispatchEvent(new CustomEvent('openJob'))}>+ New Job</button>}
        {page==='Customers'&&<button className="btn bp" onClick={()=>document.dispatchEvent(new CustomEvent('openCust'))}>+ New Customer</button>}
        {page==='Technicians'&&<button className="btn bp" onClick={()=>document.dispatchEvent(new CustomEvent('openTech'))}>+ Add Technician</button>}
      </div>
      <div className="body">
        <div className="sidebar">
          <div className="nl">Operations</div>
          {pages.slice(0,4).map((p,i)=><div key={p} className={"ni "+(page===p?'active':'')} onClick={()=>setPage(p)}>{icons[i]} {p}</div>)}
          <div className="nl">Resources</div>
          <div className={"ni "+(page==='Technicians'?'active':'')} onClick={()=>setPage('Technicians')}>◑ Technicians</div>
          <div className="sf"><div className="up"><div className="ua">AD</div><div><div style={{fontSize:12,fontWeight:500}}>Admin</div><div style={{fontSize:10,color:'var(--txd)',fontFamily:"'IBM Plex Mono',monospace"}}>DISPATCH MGR</div></div></div></div>
        </div>
        <div className="main">
          {page==='Dashboard'&&<Dashboard jobs={jobs} technicians={technicians}/>}
          {page==='Jobs'&&<Jobs jobs={jobs} customers={customers} technicians={technicians} onAdd={addJob} onEdit={editJob} onDelete={delJob}/>}
          {page==='Schedule'&&<Schedule jobs={jobs}/>}
          {page==='Customers'&&<Customers customers={customers} jobs={jobs} onAdd={addCust} onEdit={editCust} onDelete={delCust}/>}
          {page==='Technicians'&&<Technicians technicians={technicians} onAdd={addTech} onEdit={editTech} onDelete={delTech}/>}
        </div>
      </div>
      <Toast msg={toast}/>
    </div>
  </>);
}
