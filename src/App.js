import { useState, useEffect, useCallback } from "react";

const CONFIG = {
  clientId: "689b65eb-4cdd-42b4-8cf5-516e79a4c42a",
  tenantId: "f01629f2-ba7f-494e-bf73-80225ec1095e",
  scopes: "https://graph.microsoft.com/Sites.ReadWrite.All https://graph.microsoft.com/Lists.ReadWrite.All https://graph.microsoft.com/User.Read",
};

const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@300;400;500&display=swap');
  *{margin:0;padding:0;box-sizing:border-box;}
  :root{
    --bg:#0a0c10;--surface:#0f1218;--surface2:#161b24;--surface3:#1c2230;
    --border:#1e2a3a;--border2:#243040;
    --accent:#00c8ff;--accent2:#0084a8;--accent-dim:rgba(0,200,255,0.08);
    --amber:#ffb020;--amber-dim:rgba(255,176,32,0.10);
    --green:#22d47a;--green-dim:rgba(34,212,122,0.10);
    --red:#ff4d6a;--red-dim:rgba(255,77,106,0.10);
    --text:#d0dae8;--text-dim:#5a6a80;--text-mid:#8a9ab0;
    --sw:220px;
  }
  html,body{background:var(--bg);font-family:'IBM Plex Sans',sans-serif;color:var(--text);min-height:100vh;}
  .app{display:flex;min-height:100vh;}
  .ov{display:none;position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:19;backdrop-filter:blur(2px);}
  .ov.open{display:block;}
  .sidebar{width:var(--sw);min-height:100vh;background:var(--surface);border-right:1px solid var(--border);display:flex;flex-direction:column;position:fixed;top:0;left:0;bottom:0;z-index:20;transition:transform .25s cubic-bezier(.4,0,.2,1);}
  .logo{padding:20px 20px 16px;border-bottom:1px solid var(--border);}
  .logo-mark{font-family:'Rajdhani',sans-serif;font-weight:700;font-size:18px;letter-spacing:2px;text-transform:uppercase;color:var(--accent);display:flex;align-items:center;gap:8px;}
  .logo-sub{font-family:'IBM Plex Mono',monospace;font-size:9px;color:var(--text-dim);letter-spacing:2px;margin-top:2px;}
  .nav{padding:12px 0;flex:1;overflow-y:auto;}
  .ns{padding:0 12px;margin-bottom:4px;}
  .nl{font-family:'IBM Plex Mono',monospace;font-size:9px;color:var(--text-dim);letter-spacing:2px;padding:10px 8px 6px;text-transform:uppercase;}
  .ni{display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:4px;font-size:13px;font-weight:500;color:var(--text-mid);cursor:pointer;transition:all .15s;margin-bottom:1px;border:1px solid transparent;}
  .ni:hover{background:var(--surface2);color:var(--text);}
  .ni.active{background:var(--accent-dim);color:var(--accent);border-color:rgba(0,200,255,0.15);}
  .sf{padding:16px;border-top:1px solid var(--border);}
  .up{display:flex;align-items:center;gap:10px;padding:8px;background:var(--surface2);border-radius:6px;border:1px solid var(--border);}
  .ua{width:28px;height:28px;border-radius:50%;background:var(--accent2);font-family:'Rajdhani',sans-serif;font-weight:700;font-size:12px;color:white;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
  .un{font-size:12px;font-weight:500;}
  .ur{font-size:10px;color:var(--text-dim);font-family:'IBM Plex Mono',monospace;}
  .main{margin-left:var(--sw);flex:1;display:flex;flex-direction:column;min-width:0;}
  .topbar{height:56px;background:var(--surface);border-bottom:1px solid var(--border);display:flex;align-items:center;padding:0 20px;gap:12px;position:sticky;top:0;z-index:5;}
  .mb{display:none;background:none;border:1px solid var(--border);color:var(--text-mid);padding:6px 9px;border-radius:4px;cursor:pointer;font-size:16px;line-height:1;transition:all .15s;flex-shrink:0;}
  .mb:hover{border-color:var(--accent);color:var(--accent);}
  .tt{font-family:'Rajdhani',sans-serif;font-size:17px;font-weight:600;letter-spacing:1px;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .tm{font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--text-dim);white-space:nowrap;}
  .btn{display:flex;align-items:center;gap:6px;padding:7px 14px;border-radius:4px;font-size:12px;font-weight:600;letter-spacing:.5px;cursor:pointer;border:1px solid;transition:all .15s;font-family:'Rajdhani',sans-serif;text-transform:uppercase;white-space:nowrap;flex-shrink:0;}
  .bp{background:var(--accent);color:#000;border-color:var(--accent);}
  .bp:hover{background:#33d4ff;}
  .bg{background:transparent;color:var(--text-mid);border-color:var(--border2);}
  .bg:hover{color:var(--text);border-color:var(--accent);}
  .bd{background:var(--red-dim);color:var(--red);border-color:rgba(255,77,106,0.3);}
  .bs{padding:5px 10px;font-size:11px;}
  .content{padding:20px;padding-bottom:80px;}
  .kg{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px;}
  .kc{background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:16px 18px;position:relative;overflow:hidden;transition:border-color .2s;}
  .kc:hover{border-color:var(--border2);}
  .kc::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;}
  .kc.bl::before{background:var(--accent);}
  .kc.am::before{background:var(--amber);}
  .kc.gr::before{background:var(--green);}
  .kc.re::before{background:var(--red);}
  .kl{font-family:'IBM Plex Mono',monospace;font-size:9px;color:var(--text-dim);letter-spacing:2px;text-transform:uppercase;margin-bottom:8px;}
  .kv{font-family:'Rajdhani',sans-serif;font-size:34px;font-weight:700;line-height:1;margin-bottom:6px;}
  .kc.bl .kv{color:var(--accent);}
  .kc.am .kv{color:var(--amber);}
  .kc.gr .kv{color:var(--green);}
  .kc.re .kv{color:var(--red);}
  .ks{font-size:11px;color:var(--text-dim);}
  .panel{background:var(--surface);border:1px solid var(--border);border-radius:6px;overflow:hidden;margin-bottom:16px;}
  .ph{padding:13px 18px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;}
  .pt{font-family:'Rajdhani',sans-serif;font-weight:600;font-size:14px;letter-spacing:1px;text-transform:uppercase;}
  .pa{font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--accent);cursor:pointer;letter-spacing:1px;}
  .tw{overflow-x:auto;}
  .tbl{width:100%;min-width:480px;}
  .tr{display:grid;align-items:center;padding:11px 18px;border-bottom:1px solid var(--border);transition:background .1s;cursor:pointer;}
  .tr:hover{background:var(--surface2);}
  .tr.hdr{cursor:default;padding:9px 18px;}
  .tr.hdr:hover{background:transparent;}
  .cl{font-family:'IBM Plex Mono',monospace;font-size:9px;color:var(--text-dim);letter-spacing:2px;text-transform:uppercase;}
  .ci{font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--accent);}
  .cm{font-size:13px;font-weight:500;}
  .cs{font-size:11px;color:var(--text-dim);margin-top:1px;}
  .cd{font-size:12px;color:var(--text-mid);}
  .cn{font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--text-mid);}
  .cv{font-family:'Rajdhani',sans-serif;font-weight:600;font-size:15px;}
  .st{font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:1px;padding:3px 7px;border-radius:2px;font-weight:500;text-transform:uppercase;display:inline-block;white-space:nowrap;}
  .st.Dispatched,.st.dispatched{background:var(--accent-dim);color:var(--accent);border:1px solid rgba(0,200,255,0.2);}
  .st.InProgress{background:var(--amber-dim);color:var(--amber);border:1px solid rgba(255,176,32,0.2);}
  .st.Complete,.st.complete{background:var(--green-dim);color:var(--green);border:1px solid rgba(34,212,122,0.2);}
  .st.Pending,.st.pending{background:rgba(90,106,128,0.15);color:var(--text-dim);border:1px solid var(--border);}
  .st.Available,.st.available{background:var(--green-dim);color:var(--green);border:1px solid rgba(34,212,122,0.2);}
  .st.Busy,.st.busy{background:var(--amber-dim);color:var(--amber);border:1px solid rgba(255,176,32,0.2);}
  .st.Offline,.st.offline{background:rgba(90,106,128,0.15);color:var(--text-dim);border:1px solid var(--border);}
  .mbg{position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:50;display:flex;align-items:center;justify-content:center;padding:20px;}
  .modal{background:var(--surface);border:1px solid var(--border2);border-radius:8px;width:100%;max-width:520px;max-height:90vh;overflow-y:auto;}
  .mh{padding:16px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;}
  .mti{font-family:'Rajdhani',sans-serif;font-weight:600;font-size:16px;letter-spacing:1px;text-transform:uppercase;}
  .mc{background:none;border:none;color:var(--text-dim);font-size:22px;cursor:pointer;padding:0 4px;line-height:1;}
  .mc:hover{color:var(--text);}
  .mbody{padding:20px;}
  .mf{padding:16px 20px;border-top:1px solid var(--border);display:flex;gap:10px;justify-content:flex-end;}
  .fg{margin-bottom:16px;}
  .fl{font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--text-dim);letter-spacing:1px;text-transform:uppercase;margin-bottom:6px;display:block;}
  .fi,.fsl,.fta{width:100%;background:var(--surface2);border:1px solid var(--border);border-radius:4px;padding:9px 12px;color:var(--text);font-family:'IBM Plex Sans',sans-serif;font-size:13px;transition:border-color .15s;}
  .fi:focus,.fsl:focus,.fta:focus{outline:none;border-color:var(--accent);}
  .fsl{cursor:pointer;}
  .fta{resize:vertical;min-height:80px;}
  .fr{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
  .tgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px;padding:16px;}
  .tc{background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:16px;transition:border-color .2s;}
  .tc:hover{border-color:var(--border2);}
  .tct{display:flex;align-items:center;gap:12px;margin-bottom:12px;}
  .tav{width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:'Rajdhani',sans-serif;font-weight:700;font-size:14px;flex-shrink:0;border:2px solid;}
  .tav.Available{background:var(--green-dim);color:var(--green);border-color:rgba(34,212,122,0.3);}
  .tav.Busy{background:var(--amber-dim);color:var(--amber);border-color:rgba(255,176,32,0.3);}
  .tav.Offline{background:rgba(90,106,128,0.15);color:var(--text-dim);border-color:var(--border);}
  .tname{font-size:14px;font-weight:500;}
  .tdet{font-size:11px;color:var(--text-dim);margin-bottom:4px;font-family:'IBM Plex Mono',monospace;}
  .tact{display:flex;gap:8px;margin-top:12px;}
  .cg{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;padding:16px;}
  .cdl{font-family:'IBM Plex Mono',monospace;font-size:9px;color:var(--text-dim);text-align:center;padding:6px 0;letter-spacing:1px;}
  .cd2{min-height:78px;background:var(--surface2);border:1px solid var(--border);border-radius:4px;padding:6px;cursor:pointer;transition:border-color .15s;}
  .cd2:hover{border-color:var(--border2);}
  .cd2.today{border-color:var(--accent);}
  .cdn{font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--text-mid);margin-bottom:4px;}
  .cdn.tn{color:var(--accent);font-weight:700;}
  .cj{font-size:9px;padding:2px 5px;border-radius:2px;margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .cj.Dispatched{background:var(--accent-dim);color:var(--accent);}
  .cj.InProgress{background:var(--amber-dim);color:var(--amber);}
  .cj.Pending{background:rgba(90,106,128,0.15);color:var(--text-dim);}
  .cj.Complete{background:var(--green-dim);color:var(--green);}
  .loading{display:flex;align-items:center;justify-content:center;padding:48px;color:var(--text-dim);font-family:'IBM Plex Mono',monospace;font-size:12px;gap:10px;}
  .spin{width:16px;height:16px;border:2px solid var(--border2);border-top-color:var(--accent);border-radius:50%;animation:spin .7s linear infinite;}
  .empty{padding:48px;text-align:center;color:var(--text-dim);font-size:13px;}
  .ei{font-size:32px;margin-bottom:12px;}
  .auth-screen{display:flex;align-items:center;justify-content:center;min-height:100vh;background:var(--bg);}
  .auth-card{background:var(--surface);border:1px solid var(--border2);border-radius:8px;padding:40px;text-align:center;max-width:400px;width:100%;margin:20px;}
  .alo{font-family:'Rajdhani',sans-serif;font-weight:700;font-size:28px;letter-spacing:3px;color:var(--accent);margin-bottom:4px;}
  .als{font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--text-dim);letter-spacing:2px;margin-bottom:32px;}
  .ald{font-size:13px;color:var(--text-mid);margin-bottom:24px;line-height:1.6;}
  .alb{width:100%;padding:12px;background:var(--accent);color:#000;border:none;border-radius:4px;font-family:'Rajdhani',sans-serif;font-weight:700;font-size:14px;letter-spacing:1px;text-transform:uppercase;cursor:pointer;transition:background .15s;}
  .alb:hover{background:#33d4ff;}
  .alb:disabled{opacity:.6;cursor:not-allowed;}
  .ale{background:var(--red-dim);border:1px solid rgba(255,77,106,0.3);border-radius:4px;padding:10px;font-size:12px;color:var(--red);margin-top:16px;}
  .bnav{display:none;position:fixed;bottom:0;left:0;right:0;background:var(--surface);border-top:1px solid var(--border);z-index:15;padding:6px 0 8px;}
  .bni2{display:flex;justify-content:space-around;}
  .bni{display:flex;flex-direction:column;align-items:center;gap:3px;padding:4px 10px;cursor:pointer;flex:1;}
  .bic{font-size:17px;line-height:1;color:var(--text-dim);}
  .blb{font-family:'IBM Plex Mono',monospace;font-size:8px;letter-spacing:1px;color:var(--text-dim);text-transform:uppercase;}
  .bni.active .blb,.bni.active .bic{color:var(--accent);}
  .g2{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
  .toast{position:fixed;bottom:90px;left:50%;transform:translateX(-50%);background:var(--surface2);border:1px solid var(--border2);border-radius:6px;padding:10px 20px;font-family:'IBM Plex Mono',monospace;font-size:12px;z-index:100;white-space:nowrap;pointer-events:none;}
  @keyframes pulse{0%,100%{opacity:1;}50%{opacity:.3;}}
  @keyframes spin{to{transform:rotate(360deg);}}
  @media(max-width:900px){.kg{grid-template-columns:repeat(2,1fr);}.g2{grid-template-columns:1fr;}.tm{display:none;}.fr{grid-template-columns:1fr;}}
  @media(max-width:680px){:root{--sw:0px;}.sidebar{transform:translateX(-220px);width:220px;}.sidebar.open{transform:translateX(0);}.main{margin-left:0;}.mb{display:flex;}.bg{display:none;}.bnav{display:block;}.sf{display:none;}.content{padding:14px;padding-bottom:90px;}.kg{gap:10px;}.kv{font-size:26px;}.cg{padding:8px;}.cd2{min-height:56px;}}
`;

async function getStoredToken() {
  try {
    const s = sessionStorage.getItem("axis_tok");
    if (!s) return null;
    const { token, exp } = JSON.parse(s);
    return Date.now() < exp ? token : null;
  } catch { return null; }
}

async function gFetch(token, path, opts = {}) {
  const r = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  if (!r.ok) throw new Error(`${r.status}`);
  if (r.status === 204) return {};
  return r.json();
}

function AuthScreen({ onAuth }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getStoredToken().then(t => { if (t) onAuth(t); });
    const hash = window.location.hash;
    if (hash.includes("access_token")) {
      const p = new URLSearchParams(hash.slice(1));
      const token = p.get("access_token");
      const exp = Date.now() + parseInt(p.get("expires_in") || "3600") * 1000;
      sessionStorage.setItem("axis_tok", JSON.stringify({ token, exp }));
      window.location.hash = "";
      onAuth(token);
    } else if (hash.includes("error")) {
      setError("Sign-in failed. Make sure you're using your Microsoft 365 account.");
      setLoading(false);
    }
  }, []);

const login = () => {
    setLoading(true); setError("");
    const p = new URLSearchParams({
      client_id: CONFIG.clientId, response_type: "code",
      redirect_uri: window.location.href.split("#")[0],
      scope: CONFIG.scopes,
      response_mode: "fragment",
      code_challenge_method: "plain",
      code_challenge: "challenge",
      nonce: Date.now(),
    });
    window.location.href = `https://login.microsoftonline.com/${CONFIG.tenantId}/oauth2/v2.0/authorize?${p}`;
  };
  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="alo">AXISCRM</div>
        <div className="als">CAD · CAM FIELD OPS</div>
        <div className="ald">Sign in with your Microsoft 365 account to manage jobs, customers, technicians and scheduling — all stored securely in your SharePoint.</div>
        <button className="alb" onClick={login} disabled={loading}>{loading ? "Redirecting to Microsoft..." : "Sign in with Microsoft 365"}</button>
        {error && <div className="ale">{error}</div>}
      </div>
    </div>
  );
}

function Dashboard({ jobs, customers, technicians }) {
  const active = jobs.filter(j => ["In Progress","Dispatched"].includes(j.Status)).length;
  const pending = jobs.filter(j => j.Status === "Pending").length;
  const sla = jobs.filter(j => j.Priority === "Urgent" && j.Status !== "Complete").length;
  const rev = jobs.filter(j => j.InvoiceStatus === "Paid").reduce((s, j) => s + (parseFloat(j.Amount) || 0), 0);
  return (
    <>
      <div className="kg">
        <div className="kc bl"><div className="kl">Active Jobs</div><div className="kv">{active}</div><div className="ks">In progress / dispatched</div></div>
        <div className="kc am"><div className="kl">Pending Dispatch</div><div className="kv">{pending}</div><div className="ks">Awaiting assignment</div></div>
        <div className="kc gr"><div className="kl">Revenue (Paid)</div><div className="kv">${rev.toLocaleString()}</div><div className="ks">From paid invoices</div></div>
        <div className="kc re"><div className="kl">SLA At Risk</div><div className="kv">{sla}</div><div className="ks">Urgent & open</div></div>
      </div>
      <div className="g2">
        <div className="panel">
          <div className="ph"><div className="pt">Recent Jobs</div><div className="pa">{jobs.length} total</div></div>
          {jobs.slice(0,6).map(j => (
            <div key={j.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"11px 18px",borderBottom:"1px solid var(--border)"}}>
              <div>
                <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:11,color:"var(--accent)",marginBottom:2}}>{j.JobID}</div>
                <div style={{fontSize:13,fontWeight:500}}>{j.Customer}</div>
                <div style={{fontSize:11,color:"var(--text-dim)"}}>{j.Equipment}</div>
              </div>
              <span className={`st ${(j.Status||"Pending").replace(" ","")}`}>{j.Status||"Pending"}</span>
            </div>
          ))}
          {!jobs.length && <div className="empty"><div className="ei">📋</div>No jobs yet</div>}
        </div>
        <div className="panel">
          <div className="ph"><div className="pt">Technicians</div><div className="pa">{technicians.length} total</div></div>
          {technicians.map(t => (
            <div key={t.id} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 18px",borderBottom:"1px solid var(--border)"}}>
              <div className={`tav ${t.Status||"Offline"}`}>{(t.Initials||(t.Title||"?").substring(0,2)).toUpperCase()}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:500}}>{t.Title}</div>
                <div style={{fontSize:11,color:"var(--text-dim)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.CurrentJob||"No active job"}</div>
              </div>
              <span className={`st ${t.Status||"Offline"}`}>{t.Status||"Offline"}</span>
            </div>
          ))}
          {!technicians.length && <div className="empty"><div className="ei">👷</div>No technicians yet</div>}
        </div>
      </div>
    </>
  );
}

function JobForm({ job, technicians, customers, onSave, onClose }) {
  const [f, setF] = useState({
    JobID: job?.JobID || `JO-${Date.now().toString().slice(-4)}`,
    Customer: job?.Customer || "", Equipment: job?.Equipment || "",
    Technician: job?.Technician || "", Status: job?.Status || "Pending",
    ScheduledDate: job?.ScheduledDate?.split("T")[0] || "",
    Amount: job?.Amount || "", Priority: job?.Priority || "Normal",
    Notes: job?.Notes || "", InvoiceStatus: job?.InvoiceStatus || "Not Invoiced",
  });
  return (
    <div className="mbg" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="mh"><div className="mti">{job ? "Edit Job" : "New Job"}</div><button className="mc" onClick={onClose}>×</button></div>
        <div className="mbody">
          <div className="fr">
            <div className="fg"><label className="fl">Job ID</label><input className="fi" value={f.JobID} onChange={e => setF({...f,JobID:e.target.value})} /></div>
            <div className="fg"><label className="fl">Status</label><select className="fsl" value={f.Status} onChange={e => setF({...f,Status:e.target.value})}><option>Pending</option><option>Dispatched</option><option>In Progress</option><option>Complete</option></select></div>
          </div>
          <div className="fg"><label className="fl">Customer</label>
            <select className="fsl" value={f.Customer} onChange={e => setF({...f,Customer:e.target.value})}>
              <option value="">Select customer...</option>
              {customers.map(c => <option key={c.id}>{c.Title}</option>)}
            </select>
          </div>
          <div className="fg"><label className="fl">Equipment</label><input className="fi" placeholder="e.g. Fanuc Robodrill α-D21MiA" value={f.Equipment} onChange={e => setF({...f,Equipment:e.target.value})} /></div>
          <div className="fr">
            <div className="fg"><label className="fl">Technician</label>
              <select className="fsl" value={f.Technician} onChange={e => setF({...f,Technician:e.target.value})}>
                <option value="">Unassigned</option>
                {technicians.map(t => <option key={t.id}>{t.Title}</option>)}
              </select>
            </div>
            <div className="fg"><label className="fl">Priority</label><select className="fsl" value={f.Priority} onChange={e => setF({...f,Priority:e.target.value})}><option>Low</option><option>Normal</option><option>High</option><option>Urgent</option></select></div>
          </div>
          <div className="fr">
            <div className="fg"><label className="fl">Scheduled Date</label><input className="fi" type="date" value={f.ScheduledDate} onChange={e => setF({...f,ScheduledDate:e.target.value})} /></div>
            <div className="fg"><label className="fl">Amount ($)</label><input className="fi" type="number" value={f.Amount} onChange={e => setF({...f,Amount:e.target.value})} /></div>
          </div>
          <div className="fg"><label className="fl">Invoice Status</label><select className="fsl" value={f.InvoiceStatus} onChange={e => setF({...f,InvoiceStatus:e.target.value})}><option>Not Invoiced</option><option>Invoiced</option><option>Paid</option><option>Overdue</option></select></div>
          <div className="fg"><label className="fl">Notes</label><textarea className="fta" value={f.Notes} onChange={e => setF({...f,Notes:e.target.value})} /></div>
        </div>
        <div className="mf"><button className="btn bg" onClick={onClose}>Cancel</button><button className="btn bp" onClick={() => onSave(f)}>{job ? "Save Changes" : "Create Job"}</button></div>
      </div>
    </div>
  );
}

function Jobs({ jobs, technicians, customers, onAdd, onEdit, onDelete, loading }) {
  const [form, setForm] = useState(null);
  return (
    <>
      <div className="panel">
        <div className="ph"><div className="pt">Jobs ({jobs.length})</div><button className="btn bp bs" onClick={() => setForm({})}>+ New Job</button></div>
        {loading ? <div className="loading"><div className="spin"/>Loading...</div> : (
          <div className="tw"><div className="tbl">
            <div className="tr hdr" style={{gridTemplateColumns:"76px 1fr 110px 90px 85px 88px 56px"}}>
              <div className="cl">ID</div><div className="cl">Customer/Equipment</div><div className="cl">Technician</div><div className="cl">Date</div><div className="cl">Amount</div><div className="cl">Status</div><div className="cl"></div>
            </div>
            {jobs.map(j => (
              <div key={j.id} className="tr" style={{gridTemplateColumns:"76px 1fr 110px 90px 85px 88px 56px"}}>
                <div className="ci">{j.JobID}</div>
                <div><div className="cm">{j.Customer}</div><div className="cs">{j.Equipment}</div></div>
                <div className="cd">{j.Technician||"—"}</div>
                <div className="cn">{j.ScheduledDate?.split("T")[0]||"—"}</div>
                <div className="cv">{j.Amount?`$${j.Amount}`:"—"}</div>
                <div><span className={`st ${(j.Status||"Pending").replace(" ","")}`}>{j.Status||"Pending"}</span></div>
                <div style={{display:"flex",gap:4}}>
                  <button className="btn bg bs" onClick={()=>setForm(j)}>✏️</button>
                  <button className="btn bd bs" onClick={()=>onDelete(j.id)}>🗑</button>
                </div>
              </div>
            ))}
            {!jobs.length && <div className="empty"><div className="ei">📋</div>No jobs yet. Create your first job!</div>}
          </div></div>
        )}
      </div>
      {form && <JobForm job={form?.id ? form : null} technicians={technicians} customers={customers} onClose={() => setForm(null)} onSave={f => { form?.id ? onEdit(form.id, f) : onAdd(f); setForm(null); }} />}
    </>
  );
}

function Customers({ customers, jobs, onAdd, onEdit, onDelete, loading }) {
  const [form, setForm] = useState(null);
  const [f, setF] = useState({ Title:"", ContactName:"", Email:"", Phone:"", Address:"", Notes:"" });
  const open = (c) => { setF(c ? {Title:c.Title||"",ContactName:c.ContactName||"",Email:c.Email||"",Phone:c.Phone||"",Address:c.Address||"",Notes:c.Notes||""} : {Title:"",ContactName:"",Email:"",Phone:"",Address:"",Notes:""}); setForm(c||{}); };
  return (
    <>
      <div className="panel">
        <div className="ph"><div className="pt">Customers ({customers.length})</div><button className="btn bp bs" onClick={() => open(null)}>+ New Customer</button></div>
        {loading ? <div className="loading"><div className="spin"/>Loading...</div> : (
          <div className="tw"><div className="tbl">
            <div className="tr hdr" style={{gridTemplateColumns:"1fr 130px 150px 70px 56px"}}>
              <div className="cl">Company / Contact</div><div className="cl">Phone</div><div className="cl">Email</div><div className="cl">Jobs</div><div className="cl"></div>
            </div>
            {customers.map(c => (
              <div key={c.id} className="tr" style={{gridTemplateColumns:"1fr 130px 150px 70px 56px"}}>
                <div><div className="cm">{c.Title}</div><div className="cs">{c.ContactName}</div></div>
                <div className="cn">{c.Phone||"—"}</div>
                <div className="cn" style={{fontSize:10}}>{c.Email||"—"}</div>
                <div style={{fontFamily:"'Rajdhani',sans-serif",fontWeight:600,color:"var(--accent)"}}>{jobs.filter(j=>j.Customer===c.Title).length}</div>
                <div style={{display:"flex",gap:4}}>
                  <button className="btn bg bs" onClick={()=>open(c)}>✏️</button>
                  <button className="btn bd bs" onClick={()=>onDelete(c.id)}>🗑</button>
                </div>
              </div>
            ))}
            {!customers.length && <div className="empty"><div className="ei">🏢</div>No customers yet.</div>}
          </div></div>
        )}
      </div>
      {form !== null && (
        <div className="mbg" onClick={() => setForm(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="mh"><div className="mti">{form?.id ? "Edit Customer" : "New Customer"}</div><button className="mc" onClick={() => setForm(null)}>×</button></div>
            <div className="mbody">
              <div className="fg"><label className="fl">Company Name</label><input className="fi" value={f.Title} onChange={e => setF({...f,Title:e.target.value})} /></div>
              <div className="fr">
                <div className="fg"><label className="fl">Contact Name</label><input className="fi" value={f.ContactName} onChange={e => setF({...f,ContactName:e.target.value})} /></div>
                <div className="fg"><label className="fl">Phone</label><input className="fi" value={f.Phone} onChange={e => setF({...f,Phone:e.target.value})} /></div>
              </div>
              <div className="fg"><label className="fl">Email</label><input className="fi" type="email" value={f.Email} onChange={e => setF({...f,Email:e.target.value})} /></div>
              <div className="fg"><label className="fl">Address</label><textarea className="fta" style={{minHeight:60}} value={f.Address} onChange={e => setF({...f,Address:e.target.value})} /></div>
              <div className="fg"><label className="fl">Notes</label><textarea className="fta" value={f.Notes} onChange={e => setF({...f,Notes:e.target.value})} /></div>
            </div>
            <div className="mf"><button className="btn bg" onClick={() => setForm(null)}>Cancel</button><button className="btn bp" onClick={() => { form?.id ? onEdit(form.id, f) : onAdd(f); setForm(null); }}>{form?.id ? "Save" : "Add Customer"}</button></div>
          </div>
        </div>
      )}
    </>
  );
}

function Technicians({ technicians, onAdd, onEdit, onDelete, loading }) {
  const [form, setForm] = useState(null);
  const [f, setF] = useState({ Title:"", Email:"", Phone:"", Status:"Available", CurrentJob:"", Initials:"" });
  const open = (t) => { setF(t ? {Title:t.Title||"",Email:t.Email||"",Phone:t.Phone||"",Status:t.Status||"Available",CurrentJob:t.CurrentJob||"",Initials:t.Initials||""} : {Title:"",Email:"",Phone:"",Status:"Available",CurrentJob:"",Initials:""}); setForm(t||{}); };
  const save = () => { const ini = f.Initials || f.Title.split(" ").map(w=>w[0]).join("").toUpperCase().slice(0,2); const data = {...f,Initials:ini}; form?.id ? onEdit(form.id, data) : onAdd(data); setForm(null); };
  return (
    <>
      <div className="panel">
        <div className="ph"><div className="pt">Technicians ({technicians.length})</div><button className="btn bp bs" onClick={() => open(null)}>+ Add Technician</button></div>
        {loading ? <div className="loading"><div className="spin"/>Loading...</div> : (
          <div className="tgrid">
            {technicians.map(t => (
              <div key={t.id} className="tc">
                <div className="tct"><div className={`tav ${t.Status||"Offline"}`}>{(t.Initials||(t.Title||"?").substring(0,2)).toUpperCase()}</div><div><div className="tname">{t.Title}</div><span className={`st ${t.Status||"Offline"}`}>{t.Status||"Offline"}</span></div></div>
                <div className="tdet">📧 {t.Email||"—"}</div>
                <div className="tdet">📞 {t.Phone||"—"}</div>
                <div className="tdet">🔧 {t.CurrentJob||"No active job"}</div>
                <div className="tact"><button className="btn bg bs" onClick={()=>open(t)}>✏️ Edit</button><button className="btn bd bs" onClick={()=>onDelete(t.id)}>🗑 Delete</button></div>
              </div>
            ))}
            {!technicians.length && <div className="empty" style={{gridColumn:"1/-1"}}><div className="ei">👷</div>No technicians yet.</div>}
          </div>
        )}
      </div>
      {form !== null && (
        <div className="mbg" onClick={() => setForm(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="mh"><div className="mti">{form?.id ? "Edit Technician" : "New Technician"}</div><button className="mc" onClick={() => setForm(null)}>×</button></div>
            <div className="mbody">
              <div className="fr">
                <div className="fg"><label className="fl">Full Name</label><input className="fi" value={f.Title} onChange={e => setF({...f,Title:e.target.value})} /></div>
                <div className="fg"><label className="fl">Status</label><select className="fsl" value={f.Status} onChange={e => setF({...f,Status:e.target.value})}><option>Available</option><option>Busy</option><option>Offline</option></select></div>
              </div>
              <div className="fr">
                <div className="fg"><label className="fl">Email</label><input className="fi" type="email" value={f.Email} onChange={e => setF({...f,Email:e.target.value})} /></div>
                <div className="fg"><label className="fl">Phone</label><input className="fi" value={f.Phone} onChange={e => setF({...f,Phone:e.target.value})} /></div>
              </div>
              <div className="fg"><label className="fl">Current Job</label><input className="fi" placeholder="e.g. JO-2841 — Precision Aerospace" value={f.CurrentJob} onChange={e => setF({...f,CurrentJob:e.target.value})} /></div>
            </div>
            <div className="mf"><button className="btn bg" onClick={() => setForm(null)}>Cancel</button><button className="btn bp" onClick={save}>{form?.id ? "Save" : "Add Technician"}</button></div>
          </div>
        </div>
      )}
    </>
  );
}

function Schedule({ jobs }) {
  const now = new Date();
  const [vd, setVd] = useState(new Date(now.getFullYear(), now.getMonth(), 1));
  const dim = new Date(vd.getFullYear(), vd.getMonth()+1, 0).getDate();
  const fd = new Date(vd.getFullYear(), vd.getMonth(), 1).getDay();
  const days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const jobsFor = d => { const s = `${vd.getFullYear()}-${String(vd.getMonth()+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`; return jobs.filter(j => j.ScheduledDate?.startsWith(s)); };
  const cells = [...Array(fd).fill(null), ...Array.from({length:dim},(_,i)=>i+1)];
  return (
    <div className="panel">
      <div className="ph">
        <div className="pt">Schedule — {vd.toLocaleString("default",{month:"long",year:"numeric"})}</div>
        <div style={{display:"flex",gap:8}}>
          <button className="btn bg bs" onClick={()=>setVd(new Date(vd.getFullYear(),vd.getMonth()-1,1))}>‹ Prev</button>
          <button className="btn bg bs" onClick={()=>setVd(new Date(vd.getFullYear(),vd.getMonth()+1,1))}>Next ›</button>
        </div>
      </div>
      <div className="cg">
        {days.map(d => <div key={d} className="cdl">{d}</div>)}
        {cells.map((d,i) => {
          if (!d) return <div key={`e${i}`}/>;
          const isToday = d===now.getDate() && vd.getMonth()===now.getMonth() && vd.getFullYear()===now.getFullYear();
          const dj = jobsFor(d);
          return (
            <div key={d} className={`cd2 ${isToday?"today":""}`}>
              <div className={`cdn ${isToday?"tn":""}`}>{d}</div>
              {dj.map(j => <div key={j.id} className={`cj ${(j.Status||"Pending").replace(" ","")}`} title={`${j.JobID} — ${j.Customer}`}>{j.JobID}</div>)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function App() {
  const [token, setToken] = useState(null);
  const [page, setPage] = useState("Dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [loading, setLoading] = useState({});
  const [siteId, setSiteId] = useState(null);
  const [lids, setLids] = useState({});
  const [toast, setToast] = useState("");

  const msg = (m) => { setToast(m); setTimeout(() => setToast(""), 3000); };

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const site = await gFetch(token, "/sites/deventodd.sharepoint.com:/");
        const sid = site.id; setSiteId(sid);
        const lists = await gFetch(token, `/sites/${sid}/lists?$select=id,displayName`);
        const lmap = {};
        lists.value.forEach(l => {
          if (l.displayName === "CRM_Jobs") lmap.jobs = l.id;
          if (l.displayName === "CRM_Customers") lmap.customers = l.id;
          if (l.displayName === "CRM_Technicians") lmap.technicians = l.id;
        });
        setLids(lmap);
        setLoading({jobs:true,customers:true,technicians:true});
        const [j,c,t] = await Promise.all([
          gFetch(token, `/sites/${sid}/lists/${lmap.jobs}/items?$expand=fields&$top=200`),
          gFetch(token, `/sites/${sid}/lists/${lmap.customers}/items?$expand=fields&$top=200`),
          gFetch(token, `/sites/${sid}/lists/${lmap.technicians}/items?$expand=fields&$top=200`),
        ]);
        setJobs(j.value.map(i=>({id:i.id,...i.fields})));
        setCustomers(c.value.map(i=>({id:i.id,...i.fields})));
        setTechnicians(t.value.map(i=>({id:i.id,...i.fields})));
        setLoading({});
      } catch(e) { msg("⚠️ Could not connect to SharePoint. Check permissions."); setLoading({}); }
    })();
  }, [token]);

  const reload = async (key, lid) => {
    const d = await gFetch(token, `/sites/${siteId}/lists/${lid}/items?$expand=fields&$top=200`);
    const items = d.value.map(i=>({id:i.id,...i.fields}));
    if (key==="jobs") setJobs(items);
    if (key==="customers") setCustomers(items);
    if (key==="technicians") setTechnicians(items);
  };

  const add = async (key, fields) => {
    try { await gFetch(token, `/sites/${siteId}/lists/${lids[key]}/items`, {method:"POST",body:JSON.stringify({fields})}); await reload(key, lids[key]); msg("✅ Saved to SharePoint!"); }
    catch { msg("⚠️ Save failed. Please try again."); }
  };
  const edit = async (key, id, fields) => {
    try { await gFetch(token, `/sites/${siteId}/lists/${lids[key]}/items/${id}/fields`, {method:"PATCH",body:JSON.stringify(fields)}); await reload(key, lids[key]); msg("✅ Updated!"); }
    catch { msg("⚠️ Update failed."); }
  };
  const del = async (key, id) => {
    if (!window.confirm("Delete this item?")) return;
    try { await gFetch(token, `/sites/${siteId}/lists/${lids[key]}/items/${id}`, {method:"DELETE"}); await reload(key, lids[key]); msg("🗑 Deleted."); }
    catch { msg("⚠️ Delete failed."); }
  };

  if (!token) return <><style>{styles}</style><AuthScreen onAuth={setToken} /></>;

  const pages = ["Dashboard","Jobs","Schedule","Customers","Technicians"];
  const icons = ["▣","◈","◎","◻","◑"];

  return (
    <>
      <style>{styles}</style>
      {toast && <div className="toast">{toast}</div>}
      <div className="app">
        <div className={`ov ${sidebarOpen?"open":""}`} onClick={() => setSidebarOpen(false)} />
        <aside className={`sidebar ${sidebarOpen?"open":""}`}>
          <div className="logo">
            <div className="logo-mark">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <rect x="1" y="1" width="7" height="7" stroke="#00c8ff" strokeWidth="1.5"/>
                <rect x="10" y="1" width="7" height="7" stroke="#00c8ff" strokeWidth="1.5" opacity="0.4"/>
                <rect x="1" y="10" width="7" height="7" stroke="#00c8ff" strokeWidth="1.5" opacity="0.4"/>
                <rect x="10" y="10" width="7" height="7" stroke="#00c8ff" strokeWidth="1.5"/>
              </svg>AXISCRM
            </div>
            <div className="logo-sub">CAD·CAM FIELD OPS</div>
          </div>
          <nav className="nav">
            <div className="ns"><div className="nl">Operations</div>
              {pages.slice(0,4).map((p,i) => <div key={p} className={`ni ${page===p?"active":""}`} onClick={()=>{setPage(p);setSidebarOpen(false);}}><span style={{fontSize:14,opacity:.7}}>{icons[i]}</span>{p}</div>)}
            </div>
            <div className="ns"><div className="nl">Resources</div>
              <div className={`ni ${page==="Technicians"?"active":""}`} onClick={()=>{setPage("Technicians");setSidebarOpen(false);}}><span style={{fontSize:14,opacity:.7}}>◑</span>Technicians</div>
            </div>
          </nav>
          <div className="sf"><div className="up"><div className="ua">AD</div><div><div className="un">Admin</div><div className="ur">DISPATCH MGR</div></div></div></div>
        </aside>

        <main className="main">
          <div className="topbar">
            <button className="mb" onClick={()=>setSidebarOpen(o=>!o)}>☰</button>
            <div className="tt">{page === "Dashboard" ? "Operations Dashboard" : page}</div>
            <div className="tm">{new Date().toLocaleDateString("en-CA",{weekday:"short",year:"numeric",month:"short",day:"numeric"}).toUpperCase()}</div>
            <button className="btn bg" onClick={()=>{sessionStorage.clear();setToken(null);}}>Sign Out</button>
          </div>
          <div className="content">
            {page==="Dashboard" && <Dashboard jobs={jobs} customers={customers} technicians={technicians} />}
            {page==="Jobs" && <Jobs jobs={jobs} technicians={technicians} customers={customers} loading={loading.jobs} onAdd={f=>add("jobs",f)} onEdit={(id,f)=>edit("jobs",id,f)} onDelete={id=>del("jobs",id)} />}
            {page==="Schedule" && <Schedule jobs={jobs} />}
            {page==="Customers" && <Customers customers={customers} jobs={jobs} loading={loading.customers} onAdd={f=>add("customers",f)} onEdit={(id,f)=>edit("customers",id,f)} onDelete={id=>del("customers",id)} />}
            {page==="Technicians" && <Technicians technicians={technicians} loading={loading.technicians} onAdd={f=>add("technicians",f)} onEdit={(id,f)=>edit("technicians",id,f)} onDelete={id=>del("technicians",id)} />}
          </div>
        </main>

        <nav className="bnav"><div className="bni2">
          {pages.map((p,i) => <div key={p} className={`bni ${page===p?"active":""}`} onClick={()=>setPage(p)}><div className="bic">{icons[i]}</div><div className="blb">{p}</div></div>)}
        </div></nav>
      </div>
    </>
  );
}
