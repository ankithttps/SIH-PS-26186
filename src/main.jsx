import React,{useEffect,useMemo,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Shield,LayoutDashboard,ClipboardCheck,Users,LockKeyhole,AlertTriangle,HeartPulse,CalendarDays,Activity,ChevronRight,CheckCircle2,Clock3,Brain,Menu,X,LogOut,TrendingUp,UserRound,BarChart3,Info,MessageCircle,SlidersHorizontal,FolderOpen,FileText,Settings2,ArrowUpRight,ArrowDownRight} from 'lucide-react';
import './styles.css';

const initialPersonnel=[
 {id:'CR-1042',name:'A. Sharma',unit:'Alpha Unit',deployment:'High-intensity',leave:2,duty:9,wellness:62,risk:'Elevated',last:'Today',trend:[70,68,66,64,62],checkins:8,history:[{date:'Sep 26',wellness:70,risk:'Low'},{date:'Sep 27',wellness:68,risk:'Low'},{date:'Sep 28',wellness:66,risk:'Elevated'},{date:'Sep 29',wellness:64,risk:'Elevated'},{date:'Sep 30',wellness:62,risk:'Elevated'}]},
 {id:'CR-1187',name:'R. Singh',unit:'Bravo Unit',deployment:'Routine',leave:5,duty:7,wellness:81,risk:'Low',last:'Yesterday',trend:[76,78,79,80,81],checkins:11,history:[{date:'Sep 26',wellness:76,risk:'Low'},{date:'Sep 27',wellness:78,risk:'Low'},{date:'Sep 28',wellness:79,risk:'Low'},{date:'Sep 29',wellness:80,risk:'Low'},{date:'Sep 30',wellness:81,risk:'Low'}]},
 {id:'CR-1214',name:'V. Kumar',unit:'Charlie Unit',deployment:'Extended',leave:1,duty:11,wellness:48,risk:'High',last:'Today',trend:[67,61,58,52,48],checkins:7,history:[{date:'Sep 26',wellness:67,risk:'Elevated'},{date:'Sep 27',wellness:61,risk:'Elevated'},{date:'Sep 28',wellness:58,risk:'Elevated'},{date:'Sep 29',wellness:52,risk:'High'},{date:'Sep 30',wellness:48,risk:'High'}]},
 {id:'CR-1321',name:'P. Verma',unit:'Delta Unit',deployment:'Routine',leave:4,duty:8,wellness:76,risk:'Low',last:'2 days ago',trend:[71,72,74,75,76],checkins:10,history:[{date:'Sep 26',wellness:71,risk:'Low'},{date:'Sep 27',wellness:72,risk:'Low'},{date:'Sep 28',wellness:74,risk:'Low'},{date:'Sep 29',wellness:75,risk:'Low'},{date:'Sep 30',wellness:76,risk:'Low'}]}
];

function riskFromScore(wellness){if(wellness<=40)return ['High','high'];if(wellness<=65)return ['Elevated','medium'];return ['Low','low'];}
function getPattern(history){const h=(history||[]).slice(-5).map(x=>x.wellness);if(h.length<3)return {type:'Insufficient history',key:'neutral',text:'Collect more check-ins to establish a trend.'};const recent=h[h.length-1]-h[h.length-3],full=h[h.length-1]-h[0];if(recent<=-8&&full<=-10)return {type:'Rising risk pattern',key:'rising',text:'Wellness has declined across recent check-ins.'};if(h.filter(v=>v<=50).length>=3)return {type:'Persistent high attention',key:'persistent',text:'Low wellness has persisted across multiple check-ins.'};if(full>=8)return {type:'Improving pattern',key:'improving',text:'Recent wellness indicators are improving.'};return {type:'Stable pattern',key:'stable',text:'Recent wellness indicators are relatively stable.'};}
function calculateRisk({sleep,mood,energy,workload,duty,leave,deployment}){
 const factors=[
  {label:'Sleep quality',value:6-sleep,weight:22},
  {label:'Mood & emotional balance',value:6-mood,weight:22},
  {label:'Energy level',value:6-energy,weight:16},
  {label:'Perceived workload',value:workload,weight:18},
  {label:'Duty hours',value:Math.max(0,duty-8),weight:12},
  {label:'Leave frequency',value:Math.max(0,3-leave),weight:6},
  {label:'Deployment intensity',value:deployment==='Extended'?2:deployment==='High-intensity'?1:0,weight:4}
 ];
 const points=factors.reduce((s,f)=>s+(f.value/5)*f.weight,0);
 const wellness=Math.round(Math.max(0,Math.min(100,100-points)));
 const [risk]=riskFromScore(wellness);
 return {wellness,risk,factors:factors.filter(f=>f.value>0).sort((a,b)=>(b.value*b.weight)-(a.value*a.weight)).slice(0,3)};
}
class AppErrorBoundary extends React.Component{
 constructor(props){super(props);this.state={error:null};}
 static getDerivedStateFromError(error){return {error};}
 componentDidCatch(error,info){console.error('RakshakWell render error:',error,info);}
 render(){
  if(this.state.error){
   return <div style={{fontFamily:'system-ui',padding:'32px',maxWidth:'900px',margin:'40px auto',background:'#fff',color:'#172033'}}>
    <h1>RakshakWell — frontend error</h1>
    <p>The app loaded, but a component crashed while rendering.</p>
    <pre style={{whiteSpace:'pre-wrap',background:'#f4f6f8',padding:'16px',borderRadius:'10px',overflow:'auto'}}>{this.state.error?.stack||String(this.state.error)}</pre>
    <button onClick={()=>this.setState({error:null})} style={{padding:'10px 16px',cursor:'pointer'}}>Try again</button>
   </div>;
  }
  return this.props.children;
 }
}

const API_BASE='http://127.0.0.1:8000';
function getDemoRole(){return localStorage.getItem('rakshakwell_role')||'Welfare Officer';}
function getToken(){return localStorage.getItem('rakshakwell_token')||'';}
async function fetchJson(path,options={}){
 const headers={...(options.headers||{}),'X-Demo-Role':getDemoRole()};
 if(getToken())headers.Authorization=`Bearer ${getToken()}`;
 const r=await fetch(`${API_BASE}${path}`,{...options,headers});
 if(!r.ok)throw new Error(`API ${r.status}`);
 return r.json();
}
function mapServerPersonnel(x,previous={}){const history=x.history||previous.history||[];return {...previous,...x,history,pattern:getPattern(history)};}
const mapAlert=a=>({id:a.id,personId:a.person_id,name:a.name,risk:a.risk,reason:a.reason,time:a.created_at,status:a.status,reviewedBy:a.reviewed_by,reviewedAt:a.reviewed_at});
const mapIntervention=x=>({id:x.id,personId:x.person_id,name:x.name,action:x.action,status:x.status,time:x.created_at});
const mapFollowup=x=>({id:x.id,personId:x.person_id,name:x.name,action:x.action,status:x.status,outcome:x.outcome,time:x.created_at});

function App(){
 const [page,setPage]=useState('dashboard');
 const [demoMode,setDemoMode]=useState(false);
 const [signedIn,setSignedIn]=useState(()=>Boolean(localStorage.getItem('rakshakwell_token')));
 const [loginRole,setLoginRole]=useState(()=>localStorage.getItem('rakshakwell_role')||'Welfare Officer');
 const [loginPassword,setLoginPassword]=useState('');
 const [loginError,setLoginError]=useState('');
 const [mobile,setMobile]=useState(false);
 const [securityEvents,setSecurityEvents]=useState([]);
 const [sessionMinutes,setSessionMinutes]=useState(30);
 const [mfaDemo,setMfaDemo]=useState(false);
 const [role,setRole]=useState(()=>localStorage.getItem('rakshakwell_role')||'Welfare Officer');
 const [personnel,setPersonnel]=useState(initialPersonnel.map(x=>({...x,pattern:getPattern(x.history)})));
 const [backendStatus,setBackendStatus]=useState('checking');
 useEffect(()=>{if(!signedIn)return;let active=true;(async()=>{try{await fetchJson('/health');if(active)setBackendStatus('connected');}catch(error){if(active)setBackendStatus('offline');return;}try{const [people,aa,ii,ff,ae]=await Promise.all([fetchJson('/api/personnel'),fetchJson('/api/alerts'),fetchJson('/api/interventions'),fetchJson('/api/followups'),fetchJson('/api/audit-events')]);if(!active)return;setPersonnel(people.map(x=>mapServerPersonnel(x,initialPersonnel.find(p=>p.id===x.id))));setAlerts(aa.map(mapAlert));setInterventions(ii.map(mapIntervention));setFollowups(ff.map(mapFollowup));setSecurityEvents(ae.map(x=>({id:x.id,text:x.action,time:new Date(x.created_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})})));}catch(error){console.warn('RakshakWell API data load failed:',error);}})();return()=>{active=false;};},[]);
 const [submitted,setSubmitted]=useState(false);
 const [selected,setSelected]=useState(null); const [alerts,setAlerts]=useState([]); const [interventions,setInterventions]=useState([]); const [followups,setFollowups]=useState([]); const [activity,setActivity]=useState([]);
 const [form,setForm]=useState({sleep:3,mood:3,energy:3,workload:3,concern:''});
 const visiblePersonnel=role==='Personnel'?[personnel[0]]:personnel;
 const stats=useMemo(()=>({total:visiblePersonnel.length,elevated:visiblePersonnel.filter(x=>x.risk==='Elevated').length,high:visiblePersonnel.filter(x=>x.risk==='High').length,avg:Math.round(visiblePersonnel.reduce((a,b)=>a+b.wellness,0)/visiblePersonnel.length),checkins:Math.round(visiblePersonnel.reduce((a,b)=>a+b.checkins,0)/visiblePersonnel.length)}),[visiblePersonnel]);
 const nav=role==='Personnel'?[['dashboard','Dashboard',LayoutDashboard],['assessment','Wellness Check-in',ClipboardCheck],['workspace','Workspace',FolderOpen],['security','Security Center',Shield],['privacy','Privacy & Access',LockKeyhole]]:role==='Commander'?[['dashboard','Command Dashboard',LayoutDashboard],['workspace','Unit Welfare',BarChart3],['privacy','Privacy & Access',LockKeyhole],['security','Security Center',Shield]]:[['dashboard','Dashboard',LayoutDashboard],['assessment','Wellness Check-in',ClipboardCheck],['personnel','Personnel',Users],['workspace','Workspace',FolderOpen],['privacy','Privacy & Access',LockKeyhole],['security','Security Center',Shield]];
 function logSecurity(text){setSecurityEvents(v=>[{id:Date.now(),text,time:'Just now'},...v].slice(0,10));fetchJson('/api/audit-events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({role,action:text})}).then(()=>setBackendStatus('connected')).catch(()=>setBackendStatus('offline'));}
 async function handleSignOut(){
   try{await fetchJson('/api/auth/logout',{method:'POST'});}catch{}
   localStorage.removeItem('rakshakwell_token');
   localStorage.setItem('rakshakwell_signed_in','false');
   setSignedIn(false);setMobile(false);setSelected(null);
 }
 async function handleSignIn(){
   try{
     setLoginError('');
     const data=await fetchJson('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:loginRole==='Welfare Officer'?'welfare.demo':loginRole==='Commander'?'commander.demo':'personnel.demo',password:loginPassword})});
     localStorage.setItem('rakshakwell_token',data.token);
     localStorage.setItem('rakshakwell_role',data.role);
     localStorage.setItem('rakshakwell_signed_in','true');
     setRole(data.role);setSignedIn(true);setPage('dashboard');setLoginPassword('');
   }catch(error){setLoginError('Invalid demo credentials');}
 }
 async function resetWorkspace(){try{const data=await fetchJson('/api/demo/reset',{method:'POST'});setBackendStatus('connected');setPage('dashboard');setMobile(false);setSubmitted(false);setSelected(null);setForm({sleep:3,mood:3,energy:3,workload:3,concern:''});setAlerts((data.alerts||[]).map(mapAlert));setInterventions((data.interventions||[]).map(mapIntervention));setFollowups((data.followups||[]).map(mapFollowup));setActivity([]);setPersonnel((data.personnel||[]).map(x=>mapServerPersonnel(x,initialPersonnel.find(p=>p.id===x.id))));}catch(error){console.error('Demo reset failed:',error);setBackendStatus('offline');}}
 async function submit(){const current=personnel[0];try{await fetchJson('/api/checkins',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({person_id:current.id,sleep:form.sleep,mood:form.mood,energy:form.energy,workload:form.workload,concern:form.concern})});setBackendStatus('connected');setSubmitted(true);const [people,aa]=await Promise.all([fetchJson('/api/personnel'),fetchJson('/api/alerts')]);setPersonnel(people.map(x=>mapServerPersonnel(x,personnel.find(p=>p.id===x.id))));setAlerts(aa.map(mapAlert));setActivity(v=>[{id:Date.now(),type:'checkin',text:current.name+' completed a confidential wellness check-in',time:'Just now'},...v].slice(0,8));}catch{setBackendStatus('offline');setSubmitted(false);}}
 if(!signedIn) return <div className="authscreen"><div className="authglow authglow-a"></div><div className="authglow authglow-b"></div><div className="authlayout"><section className="authintro"><div className="brand authbrand"><div className="brandmark"><Shield size={22}/></div><div><b>RakshakWell</b><span>Personnel Welfare Intelligence</span></div></div><div className="authintro-copy"><div className="auth-eyebrow"><span></span> SECURE WELFARE OPERATIONS</div><h1>Protect the people<br/><em>who protect others.</em></h1><p>AI-assisted welfare intelligence for early stress signals, human-led intervention and confidential support.</p><div className="authpoints"><div><Shield size={17}/><span><b>Privacy first</b><small>Welfare data stays role-scoped.</small></span></div><div><Brain size={17}/><span><b>Explainable signals</b><small>Observable factors, not diagnosis.</small></span></div><div><HeartPulse size={17}/><span><b>Human-led support</b><small>Alerts guide review, not punishment.</small></span></div></div></div><div className="authfooter">SIH PS 26186 · Prototype environment</div></section><section className="authpanel"><div className="authpanel-head"><div className="authsecure"><LockKeyhole size={17}/></div><div><b>Secure sign in</b><span>Authorized demo access</span></div><span className="authstatus"><i></i> Protected</span></div><div className="authdivider"></div><label className="fieldlabel">Access role</label><div className="rolecards"><button className={loginRole==='Welfare Officer'?'rolecard active':''} onClick={()=>{setLoginRole('Welfare Officer');setLoginPassword('')}}><Shield size={18}/><span><b>Welfare Officer</b><small>Review & support</small></span></button><button className={loginRole==='Commander'?'rolecard active':''} onClick={()=>{setLoginRole('Commander');setLoginPassword('')}}><BarChart3 size={18}/><span><b>Commander</b><small>Unit welfare view</small></span></button><button className={loginRole==='Personnel'?'rolecard active':''} onClick={()=>{setLoginRole('Personnel');setLoginPassword('')}}><UserRound size={18}/><span><b>Personnel</b><small>My wellness</small></span></button></div><label className="fieldlabel">Demo password</label><div className="authinput"><LockKeyhole size={16}/><input type="password" value={loginPassword} onChange={e=>setLoginPassword(e.target.value)} placeholder="Enter your demo password" onKeyDown={e=>{if(e.key==='Enter')handleSignIn()}}/><button type="button" onClick={()=>setLoginPassword(loginRole==='Welfare Officer'?'welfare123':loginRole==='Commander'?'command123':'personnel123')}>Use demo</button></div>{loginError&&<div className="autherror"><AlertTriangle size={14}/>{loginError}</div>}<button className="primary wide authsubmit" onClick={handleSignIn}><LockKeyhole size={17}/> Sign in securely <ChevronRight size={16}/></button><div className="authnote"><Shield size={14}/><span>Demo authentication only. Production deployment would use real identity, MFA and secure credential storage.</span></div><div className="authsession"><span>SESSION SECURITY</span><b>Role-scoped · Server verified</b></div></section></div></div>; return <div className="app">
  <header className="topbar">
   <button className="iconbtn menu" onClick={()=>setMobile(!mobile)}>{mobile?<X/>:<Menu/>}</button>
   <div className="brand"><div className="brandmark"><Shield size={21}/></div><div><b>RakshakWell</b><span>Personnel Welfare Intelligence</span></div></div>
   <div className="topright"><span className={`backendbadge ${backendStatus}`}>API {backendStatus}</span><select value={role} disabled title="Role is fixed by the authenticated session"><option>Welfare Officer</option><option>Commander</option><option>Personnel</option></select><div className="avatar">{role==='Welfare Officer'?'WO':role==='Commander'?'CO':'ME'}</div></div>
  </header>
  <div className="layout">
   <aside className={mobile?'sidebar open':'sidebar'}><div className="side-label">WORKSPACE</div>{nav.map(([key,label,Icon])=><button key={key} className={page===key?'nav active':'nav'} onClick={()=>{setPage(key);setSubmitted(false);setMobile(false)}}><Icon size={18}/>{label}</button>)}<div className="side-bottom"><div className="privacy-mini"><LockKeyhole size={16}/><div><b>Privacy first</b><small>Welfare use only</small></div></div><button className="logout" onClick={handleSignOut}><LogOut size={16}/> Sign out</button></div></aside>
   <main className="main">
    {page==='dashboard'&&(role==='Commander'?<CommanderDashboard stats={stats} personnel={personnel} alerts={alerts} onAssessment={()=>setPage('assessment')} onWorkspace={()=>setPage('workspace')}/>:<Dashboard stats={stats} personnel={visiblePersonnel} role={role} onAssessment={()=>setPage('assessment')} onSelect={setSelected} onPersonnel={()=>setPage('personnel')} onDashboard={()=>setPage('dashboard')} demoMode={demoMode} setDemoMode={setDemoMode} alerts={alerts} onReviewAlert={reviewAlert} interventions={interventions} followups={followups} activity={activity} onIntervention={planIntervention} onOutcome={recordOutcome}/>)}
    {page==='assessment'&&<Assessment form={form} setForm={setForm} submit={submit} submitted={submitted}/>}
    {page==='personnel'&&<Personnel personnel={personnel} onSelect={setSelected}/>}
    {page==='privacy'&&<Privacy role={role} onReset={resetWorkspace}/>}    {page==='security'&&<Security role={role} events={securityEvents} sessionMinutes={sessionMinutes} setSessionMinutes={setSessionMinutes} mfaDemo={mfaDemo} setMfaDemo={setMfaDemo}/>}
    {page==='workspace'&&<Workspace stats={stats} alerts={alerts} activity={activity} personnel={visiblePersonnel} onPersonnel={()=>setPage('personnel')} onDashboard={()=>setPage('dashboard')} onPrivacy={()=>setPage('privacy')} onAssessment={()=>setPage('assessment')}/>}
   </main>
  </div>
  {selected&&<PersonnelModal p={selected} alerts={alerts} interventions={interventions} followups={followups} activity={activity} onClose={()=>setSelected(null)}/>}
 </div>
}


function Security({role,events,sessionMinutes,setSessionMinutes,mfaDemo,setMfaDemo}){
 const controls=[
  {label:'Role-based access',status:'Active',text:'Current demo role controls the visible welfare workspace.'},
  {label:'Audit trail',status:'Active',text:'Sensitive welfare actions are recorded in this session timeline.'},
  {label:'Human review',status:'Required',text:'AI signals remain review prompts; welfare action stays human-led.'},
  {label:'Session protection',status:'Demo',text:'Session timeout setting is simulated for the prototype.'},
  {label:'MFA',status:mfaDemo?'Demo enabled':'Planned',text:mfaDemo?'Second-step verification is simulated in this demo.':'Production should use an approved MFA provider.'},
  {label:'Encryption',status:'Planned',text:'Production must protect data in transit and at rest.'}
 ];
 return <div className="page security-page">
  <div className="pagehead"><div><div className="eyebrow">SECURITY & COMPLIANCE</div><h1>Security Center</h1><p>Defense-in-depth controls for a privacy-sensitive welfare system.</p></div></div>
  <div className="security-banner"><Shield size={22}/><div><b>Security-first welfare platform</b><span>Prototype controls are separated from production requirements. Current controls are demo safeguards, not a claim of production cybersecurity.</span></div></div>
  <div className="securitygrid">{controls.map((x,i)=><div className="card securitycard" key={x.label}><div className="securityicon">{i<3?<CheckCircle2 size={18}/>:<LockKeyhole size={18}/>}</div><div className="securitycopy"><div><b>{x.label}</b><span className={x.status==='Active'||x.status==='Demo'?'securitystatus active':'securitystatus planned'}>{x.status}</span></div><p>{x.text}</p></div></div>)}</div>
  <div className="securitycols">
   <div className="card"><div className="cardhead"><div><h2>Session & MFA demo</h2><p>Presentation-ready simulation of stronger authentication controls</p></div></div>
    <div className="securitysettings"><label>Session timeout <select value={sessionMinutes} onChange={e=>setSessionMinutes(Number(e.target.value))}><option value="15">15 minutes</option><option value="30">30 minutes</option><option value="60">60 minutes</option></select></label><div className="settingrow"><div><b>MFA second step</b><span>Demo-only toggle; no real OTP or identity provider is connected.</span></div><button className={mfaDemo?'toggle on':'toggle'} onClick={()=>{setMfaDemo(v=>!v);}}>{mfaDemo?'Enabled':'Off'}</button></div></div>
   </div>
   <div className="card"><div className="cardhead"><div><h2>Security posture</h2><p>Current prototype session</p></div></div><div className="securitymetrics"><div><span>Open security events</span><b>0</b></div><div><span>Audit events</span><b>{events.length}</b></div><div><span>Demo MFA</span><b>{mfaDemo?'ON':'OFF'}</b></div></div></div>
  </div>
  <div className="card securityarchitecture"><div className="cardhead"><div><h2>Security event timeline</h2><p>Recent sensitive actions in this demo session</p></div></div><div className="securityevents">{events.length===0?<div className="emptyactivity">No security events yet. Sign in, review an alert, or record a welfare action to populate the timeline.</div>:events.map(e=><div className="securityevent" key={e.id}><Shield size={14}/><div><b>{e.text}</b><span>{e.time}</span></div></div>)}</div></div>
  <div className="card securityarchitecture"><div className="cardhead"><div><h2>Production security architecture</h2><p>Recommended enforcement path for the real deployment</p></div></div><div className="securityflow"><span>Secure login + MFA</span><ChevronRight/><span>Server-side RBAC</span><ChevronRight/><span>Validated API</span><ChevronRight/><span>Encrypted storage</span><ChevronRight/><span>Audit + monitoring</span></div></div>
 </div>
}


function DemoPresentationFlow({demoMode,setDemoMode,onAssessment,onPersonnel,onDashboard,onSelect,personnel}){
 const steps=[
  {n:'01',title:'Voluntary check-in',text:'Open the wellness assessment and capture self-reported signals.',action:onAssessment,label:'Open check-in'},
  {n:'02',title:'Explainable signal',text:'Show the current personnel risk context and observable contributors.',action:()=>document.getElementById('risk-intelligence')?.scrollIntoView({behavior:'smooth',block:'center'}),label:'View risk intelligence'},
  {n:'03',title:'Welfare case file',text:'Open a personnel record with history, alerts, interventions and follow-up.',action:()=>{const p=personnel[0];if(p)onSelect(p);},label:'Open case file'},
  {n:'04',title:'Human-led support',text:'Review an alert and choose a welfare-oriented support action.',action:()=>document.getElementById('early-welfare-alerts')?.scrollIntoView({behavior:'smooth',block:'center'}),label:'Go to alerts'}
 ];
 return <section className="card demopresentation">
  <div className="cardhead"><div><div className="eyebrow">SIH DEMO CONTROL</div><h2>Presentation Walkthrough</h2><p>Use this guided path to demonstrate the complete welfare workflow to judges.</p></div><button className={demoMode?'toggle on':'toggle'} onClick={()=>setDemoMode(v=>!v)}>{demoMode?'Demo mode ON':'Demo mode OFF'}</button></div>
  {demoMode&&<div className="demosteps">{steps.map(s=><div className="demostep" key={s.n}><div className="demonum">{s.n}</div><div className="democopy"><b>{s.title}</b><span>{s.text}</span></div><button className="softbtn" onClick={s.action}>{s.label}<ChevronRight size={14}/></button></div>)}</div>}
  <div className="demonote"><Info size={14}/><span>Suggested order: check-in → explainable signal → case file → human review → support → follow-up. This control only guides the demo; it does not change personnel data.</span></div>
 </section>;
}

function WhatIfSimulator({personnel}){
 const eligible=personnel;
 const [selectedId,setSelectedId]=useState(eligible[0]?.id||'');
 const selected=eligible.find(p=>p.id===selectedId)||eligible[0];
 const baseline=useMemo(()=>{
  if(!selected)return {sleep:3,workload:3,duty:8,leave:3};
  return {
   sleep:selected.wellness<=55?2:selected.wellness<=70?3:4,
   workload:selected.risk==='High'?5:selected.risk==='Elevated'?4:2,
   duty:selected.duty,
   leave:selected.leave
  };
 },[selected]);
 const [scenario,setScenario]=useState(baseline);
 React.useEffect(()=>setScenario(baseline),[selectedId,baseline.sleep,baseline.workload,baseline.duty,baseline.leave]);
 if(!selected)return null;
 const delta=(scenario.sleep-baseline.sleep)*8+(baseline.workload-scenario.workload)*5+(baseline.duty-scenario.duty)*3+(scenario.leave-baseline.leave)*2;
 const simulated=Math.round(Math.max(0,Math.min(100,selected.wellness+delta)));
 const [risk]=riskFromScore(simulated);
 const diff=simulated-selected.wellness;
 const drivers=[
  {label:'Sleep quality',delta:(scenario.sleep-baseline.sleep)*8},
  {label:'Workload',delta:(baseline.workload-scenario.workload)*5},
  {label:'Duty hours',delta:(baseline.duty-scenario.duty)*3},
  {label:'Leave opportunity',delta:(scenario.leave-baseline.leave)*2}
 ].filter(x=>x.delta!==0).sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta)).slice(0,3);
 const update=(key,value)=>setScenario(v=>({...v,[key]:Number(value)}));
 return <section className="card whatifcard" id="what-if-simulator">
  <div className="cardhead"><div><h2>Explainable Risk & What-if Simulator</h2><p>Explore how welfare conditions could change a demo risk signal before planning support.</p></div><span className="simpill"><SlidersHorizontal size={13}/> Scenario mode</span></div>
  <div className="simgrid">
   <div className="simcontrols">
    <label className="simselect"><span>Personnel</span><select value={selected.id} onChange={e=>setSelectedId(e.target.value)}>{eligible.map(p=><option key={p.id} value={p.id}>{p.name} • {p.unit}</option>)}</select></label>
    <div className="simnote"><Info size={14}/><span>Current record stays unchanged. This is an illustrative scenario simulation using the prototype's demo score logic.</span></div>
    {[['sleep','Sleep quality',1,5],['workload','Perceived workload',1,5],['duty','Duty hours / day',6,14],['leave','Leave days / recent period',0,7]].map(([key,label,min,max])=><label className="simrange" key={key}><div><b>{label}</b><strong>{scenario[key]}{key==='duty'?'h':''}</strong></div><input type="range" min={min} max={max} value={scenario[key]} onChange={e=>update(key,e.target.value)}/><div className="simticks"><span>{min}{key==='duty'?'h':''}</span><span>{max}{key==='duty'?'h':''}</span></div></label>)}
   </div>
   <div className="simresult">
    <div className="simscorehead"><div><span>Current welfare</span><b>{selected.wellness}%</b></div><ArrowUpRight size={19}/><div><span>Scenario estimate</span><b>{simulated}%</b></div></div>
    <div className="simmeter"><i style={{width:simulated+'%'}}/></div>
    <div className="simchange">{diff>0?<ArrowUpRight size={15}/>:diff<0?<ArrowDownRight size={15}/>:<Activity size={15}/>}<b>{diff>0?'+':''}{diff} points</b><span>{risk} attention level</span></div>
    <div className="simdrivers"><b>What changed the signal?</b>{drivers.length?drivers.map(d=><div key={d.label}><span>{d.label}</span><strong className={d.delta>0?'positive':'negative'}>{d.delta>0?'+':''}{d.delta}</strong></div>):<div className="simempty">Move a scenario control to see the contributing change.</div>}</div>
    <div className="simwarning"><Shield size={14}/><span>Scenario output is decision support only. It is not a diagnosis, validated clinical prediction, or automatic personnel action.</span></div>
   </div>
  </div>
 </section>;
}

function UnitWelfareAnalytics({personnel}){
 const units=[...new Set(personnel.map(p=>p.unit))].map(unit=>{
  const rows=personnel.filter(p=>p.unit===unit);
  const avg=Math.round(rows.reduce((s,p)=>s+p.wellness,0)/rows.length);
  const attention=rows.filter(p=>p.risk!=='Low').length;
  const duty=Math.round(rows.reduce((s,p)=>s+p.duty,0)/rows.length*10)/10;
  return {unit,avg,attention,duty};
 });
 return <section className="card unitanalytics"><div className="cardhead"><div><h2>Unit Welfare Analytics</h2><p>Compare workload and welfare signals to support resource planning.</p></div><span className="simpill"><BarChart3 size={13}/> Unit view</span></div><div className="unitgrid">{units.map(u=><div className="unititem" key={u.unit}><div className="unithead"><b>{u.unit}</b><span>{u.attention} attention</span></div><div className="unitmetric"><div><span>Avg. wellness</span><strong>{u.avg}%</strong></div><div><span>Avg. duty</span><strong>{u.duty}h</strong></div></div><div className="unitbar"><i style={{width:u.avg+'%'}}/></div><div className="unitnote">{u.attention>0?'Review workload and leave context for attention signals.':'Continue routine welfare monitoring.'}</div></div>)}</div><div className="unitfoot"><Info size={14}/><span>Unit comparisons are illustrative demo analytics; they support welfare planning and do not rank personnel or units.</span></div></section>;
}

function RiskIntelligence({personnel}){
 const [selectedId,setSelectedId]=useState(personnel[0]?.id||'');
 const selected=personnel.find(p=>p.id===selectedId)||personnel[0];
 if(!selected)return null;
 const pattern=selected.pattern||getPattern(selected.history);
 const drivers=[
  {label:'Wellness trajectory',value:selected.trend[selected.trend.length-1]-selected.trend[0],note:'Recent check-in direction'},
  {label:'Duty load',value:selected.duty-8,note:'Hours above an 8h reference'},
  {label:'Leave opportunity',value:3-selected.leave,note:'Lower leave opportunity increases attention'},
  {label:'Deployment context',value:selected.deployment==='Extended'?2:selected.deployment==='High-intensity'?1:0,note:'Operational context signal'}
 ].filter(x=>x.value!==0).sort((a,b)=>Math.abs(b.value)-Math.abs(a.value)).slice(0,3);
 return <section id="risk-intelligence" className="card riskintel"><div className="cardhead"><div><h2>Explainable Risk Intelligence</h2><p>Trace the demo signal back to observable welfare indicators and recent history.</p></div><span className="simpill"><Brain size={13}/> Explainable</span></div><div className="riskintelgrid"><div className="riskprofile"><label className="simselect"><span>Personnel</span><select value={selected.id} onChange={e=>setSelectedId(e.target.value)}>{personnel.map(p=><option key={p.id} value={p.id}>{p.name} • {p.unit}</option>)}</select></label><div className="riskheadline"><div><span>Current signal</span><b className={'badge '+selected.risk.toLowerCase()}>{selected.risk}</b></div><div><span>Wellness</span><strong>{selected.wellness}%</strong></div></div><div className="patternbox"><TrendingUp size={17}/><div><b>{pattern.type}</b><span>{pattern.text}</span></div></div></div><div className="riskhistory"><b>Recent wellness history</b><div className="historyline">{selected.history.map((h,i)=><div className="historypoint" key={h.date}><i className={h.wellness<=50?'high':h.wellness<=65?'medium':'low'}/><strong>{h.wellness}%</strong><span>{h.date}</span>{i<selected.history.length-1&&<em/>}</div>)}</div><div className="driverlist"><b>Key observable contributors</b>{drivers.length?drivers.map(d=><div className="driveritem" key={d.label}><span>{d.label}<small>{d.note}</small></span><strong className={d.value>0?'negative':'positive'}>{d.value>0?'+':''}{d.value}</strong></div>):<div className="simempty">No additional contributor detected.</div>}</div></div></div><div className="unitfoot"><Info size={14}/><span>Explainability here means showing the demo inputs and trend behind a welfare signal. It is not a clinical explanation or a validated predictive model.</span></div></section>;
}

function CommanderDashboard({stats,personnel,alerts,onAssessment,onWorkspace}){
 const units=[...new Set(personnel.map(p=>p.unit))].map(unit=>{
  const rows=personnel.filter(p=>p.unit===unit);
  const avg=Math.round(rows.reduce((s,p)=>s+p.wellness,0)/rows.length);
  const duty=Math.round(rows.reduce((s,p)=>s+p.duty,0)/rows.length*10)/10;
  const attention=rows.filter(p=>p.risk!=='Low').length;
  const leave=Math.round(rows.reduce((s,p)=>s+p.leave,0)/rows.length*10)/10;
  const trend=rows.reduce((s,p)=>s+(p.trend[p.trend.length-1]-p.trend[0]),0);
  return {unit,avg,duty,attention,leave,trend};
 });
 const openAlerts=alerts.filter(a=>a.status==='Open').length;
 const avgDuty=Math.round(personnel.reduce((s,p)=>s+p.duty,0)/personnel.length*10)/10;
 const avgLeave=Math.round(personnel.reduce((s,p)=>s+p.leave,0)/personnel.length*10)/10;
 const highIntensity=personnel.filter(p=>p.deployment!=='Routine').length;
 return <div className="page commander-page">
  <div className="hero"><div><div className="eyebrow">COMMAND VIEW • AGGREGATED WELFARE</div><h1>Unit Welfare Command Dashboard</h1><p>Aggregated welfare indicators for workload, deployment and unit-level planning. Individual case details stay outside this view.</p></div><button className="primary" onClick={onWorkspace}><BarChart3 size={17}/> Open unit workspace</button></div>
  <div className="notice"><Shield size={19}/><div><b>Privacy-preserving command view</b><span>Command-level planning uses aggregated signals. Identifiable personnel records and individual case files remain restricted to authorized welfare workflows.</span></div></div>
  <div className="stats"><Stat icon={Users} label="Units monitored" value={units.length} sub="Active demo units"/><Stat icon={HeartPulse} label="Avg. unit wellness" value={stats.avg+'%'} sub="Aggregated demo signal"/><Stat icon={AlertTriangle} label="Open welfare alerts" value={openAlerts} sub="Requires welfare-team review" warn/><Stat icon={Clock3} label="Avg. duty pattern" value={avgDuty+'h'} sub="Across demo personnel"/></div>
  <section className="card commander-summary"><div className="cardhead"><div><h2>Command planning snapshot</h2><p>Operational context without exposing individual welfare case files</p></div><span className="simpill"><Shield size={13}/> Aggregated view</span></div>
   <div className="commander-metrics"><div><span>Avg. leave opportunity</span><b>{avgLeave} days</b><small>Across demo personnel</small></div><div><span>Personnel in non-routine deployment</span><b>{highIntensity}</b><small>Routine vs operational context</small></div><div><span>Units with attention signals</span><b>{units.filter(u=>u.attention>0).length}</b><small>Use for resource planning</small></div></div>
  </section>
  <section className="card commander-units"><div className="cardhead"><div><h2>Unit welfare overview</h2><p>Aggregated indicators for workload balancing and welfare planning</p></div><BarChart3 size={18} className="mutedicon"/></div><div className="commander-unit-grid">{units.map(u=><div className="commander-unit" key={u.unit}><div className="commander-unit-head"><div><b>{u.unit}</b><span>{u.attention?u.attention+' attention signal'+(u.attention===1?'':'s'):'No current attention signals'}</span></div><span className="commander-unit-score">{u.avg}%</span></div><div className="commander-bar"><i style={{width:u.avg+'%'}}/></div><div className="commander-facts"><div><span>Avg. duty</span><b>{u.duty}h</b></div><div><span>Avg. leave</span><b>{u.leave} days</b></div><div><span>Trend</span><b>{u.trend>2?'Improving':u.trend<-2?'Declining':'Stable'}</b></div></div><div className="commander-note">{u.attention>0?'Consider workload, leave and deployment context at unit level.':'Continue routine welfare monitoring and resource review.'}</div></div>)}</div></section>
  <section className="card commander-actions"><div className="cardhead"><div><h2>Recommended planning actions</h2><p>Unit-level actions for authorized command planning</p></div></div><div className="commander-action-grid"><div><CalendarDays size={18}/><b>Review leave opportunity</b><span>Check whether current leave patterns allow adequate recovery time at unit level.</span></div><div><Clock3 size={18}/><b>Review duty distribution</b><span>Inspect workload and duty scheduling where aggregate signals show sustained pressure.</span></div><div><HeartPulse size={18}/><b>Coordinate welfare support</b><span>Work with welfare officers on support capacity; do not use aggregate signals as disciplinary scores.</span></div></div></section>
  <div className="unitfoot"><Info size={14}/><span>Command view is intentionally aggregated. This prototype does not expose individual names, case files, self-report details or individual intervention history here.</span></div>
 </div>;
}

function Dashboard({stats,personnel,role,onAssessment,onSelect,onPersonnel,onDashboard,alerts,onReviewAlert,interventions,followups,activity,onIntervention,onOutcome,demoMode,setDemoMode}){
 const reviewedAlerts=alerts.filter(a=>a.status==='Reviewed');
 const goToRecommended=(type)=>{ if(type==='checkin'){onAssessment();return;} document.getElementById(reviewedAlerts.length?'welfare-intervention-workflow':'early-welfare-alerts')?.scrollIntoView({behavior:'smooth',block:'start'}); };
 const low=personnel.filter(p=>p.risk==='Low').length, elevated=stats.elevated, high=stats.high;
 const flow=[{title:'Self-assessment',done:activity.some(x=>x.type==='checkin')},{title:'Risk signal',done:alerts.length>0},{title:'Human review',done:alerts.some(x=>x.status==='Reviewed')},{title:'Support planned',done:interventions.length>0},{title:'Outcome recorded',done:followups.some(x=>x.status==='Completed')}];
 return <>
  <div className="hero"><div><div className="eyebrow">WELFARE OPERATIONS • LIVE DEMO</div><h1>{role==='Personnel'?'My Wellness Overview':'Personnel Wellness Dashboard'}</h1><p>{role==='Personnel'?'Review your own wellness signals and complete a voluntary check-in.':'Early indicators, welfare trends and intervention signals — designed for supportive action, not disciplinary decisions.'}</p></div><button className="primary" onClick={onAssessment}><ClipboardCheck size={17}/> Start wellness check-in</button></div>
  <div className="notice"><Shield size={19}/><div><b>Confidential welfare workspace</b><span>Only authorized roles can access identifiable information. Risk indicators are support signals, not diagnoses.</span></div></div>
  <section className="card demoflow"><div className="cardhead"><div><h2>End-to-end welfare flow</h2><p>Presentation-ready demo path from voluntary check-in to human-reviewed outcome</p></div><span className="flowcount">{flow.filter(x=>x.done).length}/5 complete</span></div><div className="flowsteps">{flow.map((x,i)=><div className={'flowstep '+(x.done?'complete':'pending')} key={x.title}><div className="flowcircle">{x.done?<CheckCircle2 size={15}/>:<span>{String(i+1).padStart(2,'0')}</span>}</div><div><b>{x.title}</b><span>{x.done?'Completed in this demo':'Waiting for previous stage'}</span></div>{i<flow.length-1&&<div className={'flowconnector '+(flow[i+1].done?'complete':'')}/>}</div>)}</div><div className="flownote"><Info size={14}/><span>This is a demo workflow. Predictive signals are illustrative and require authorized human review before welfare action.</span></div></section>
  <div className="stats"><Stat icon={Users} label="Personnel monitored" value={stats.total} sub="Active demo records"/><Stat icon={HeartPulse} label="Avg. wellness" value={stats.avg+'%'} sub="Self-report + workload signals"/><Stat icon={AlertTriangle} label="Attention signals" value={stats.elevated+stats.high} sub={high+' high • '+elevated+' elevated'} warn/><Stat icon={ClipboardCheck} label="Avg. check-ins" value={stats.checkins} sub="Across demo personnel"/></div>
  {role!=='Personnel'&&<DemoPresentationFlow demoMode={demoMode} setDemoMode={setDemoMode} onAssessment={onAssessment} onPersonnel={onPersonnel} onDashboard={()=>setPage('dashboard')} onSelect={onSelect} personnel={personnel}/>}  {role!=='Personnel'&&<WhatIfSimulator personnel={personnel}/>}   {role==='Personnel'&&<PersonnelWellnessSuggestions person={personnel[0]} onAssessment={onAssessment}/>} 
  {role!=='Personnel'&&<UnitWelfareAnalytics personnel={personnel}/>} 
  {role!=='Personnel'&&<RiskIntelligence personnel={personnel}/>} 
  {role!=='Personnel'&&alerts.length>0&&<section id="early-welfare-alerts" className="card alertcard"><div className="cardhead"><div><h2>Early welfare alerts</h2><p>New signals requiring authorized human review</p></div><span className="livepill"><Activity size={13}/> Live demo</span></div><div className="alertlist">{alerts.map(a=><div className="alertitem" key={a.id}><div className="alerticon"><AlertTriangle size={17}/></div><div className="alertbody"><b>{a.name} • {a.risk} attention signal</b><span>Primary factor: {a.reason} • {a.time}</span>{a.status==='Reviewed'&&<small className="reviewmeta">Reviewed by {a.reviewedBy} • {a.reviewedAt}</small>}</div>{a.status==='Open'?<button className="textbtn" onClick={()=>onReviewAlert(a.id)}>Review <ChevronRight size={15}/></button>:<span className="reviewedpill"><CheckCircle2 size={13}/> Reviewed</span>}</div>)}</div><div className="alertfoot"><CheckCircle2 size={15}/> Alerts are prompts for welfare review, not automated decisions. Open: {alerts.filter(a=>a.status==='Open').length} • Reviewed: {alerts.filter(a=>a.status==='Reviewed').length}</div></section>}{role!=='Personnel'&&alerts.some(a=>a.status==='Reviewed')&&<section id="welfare-intervention-workflow" className="card interventioncard"><div className="cardhead"><div><h2>Welfare intervention workflow</h2><p>Human-led next steps after alert review</p></div><span className="livepill">Review → Support</span></div><div className="workflow"><div className="workflowstep done"><b>01</b><span>Signal detected</span></div><div className="workflowline"/><div className="workflowstep done"><b>02</b><span>Officer reviewed</span></div><div className="workflowline"/><div className="workflowstep active"><b>03</b><span>Choose support</span></div><div className="workflowline"/><div className="workflowstep"><b>04</b><span>Follow-up</span></div></div><div className="interventionchoices">{alerts.filter(a=>a.status==='Reviewed').slice(0,2).map(a=><div className="interventionitem" key={a.id}><div><b>{a.name}</b><span>{a.reason}</span></div><div className="choicebuttons"><button className="softbtn" onClick={()=>onIntervention(a,'Confidential welfare conversation')}>Welfare conversation</button><button className="softbtn" onClick={()=>onIntervention(a,'Review duty / leave context')}>Duty / leave review</button></div></div>)}</div>{interventions.length>0&&<div className="followups"><b>Planned follow-ups</b>{interventions.slice(0,3).map(x=><div key={x.id}><span>{x.name} • {x.action}</span><small>{x.time}</small></div>)}</div>}{followups.length>0&&<div className="outcomes"><div className="outcomehead"><div><b>Follow-up & outcome tracking</b><span>Record what happened after human-led support.</span></div><span className="outcomepill">{followups.filter(x=>x.status==='Pending').length} pending</span></div>{followups.slice(0,3).map(x=><div className="outcomeitem" key={x.id}><div className="outcomename"><b>{x.name}</b><span>{x.action}</span></div>{x.status==='Pending'?<div className="outcomebuttons"><button className="outcome improved" onClick={()=>onOutcome(x.id,'Improved')}>Improved</button><button className="outcome stable" onClick={()=>onOutcome(x.id,'Stable')}>Stable</button><button className="outcome review" onClick={()=>onOutcome(x.id,'Further review required')}>Further review</button></div>:<span className={'outcomestatus '+x.outcome.toLowerCase().replaceAll(' ','-')}><CheckCircle2 size={13}/>{x.outcome}</span>}</div>)}</div>}</section>}{role!=='Personnel'&&<section className="card activitycard"><div className="cardhead"><div><h2>Welfare activity timeline</h2><p>Recent human-reviewed actions in this demo workspace</p></div><Clock3 size={18} className="mutedicon"/></div><div className="activitylist">{activity.length===0?<div className="emptyactivity">No activity yet. Complete a check-in or review an alert to populate the timeline.</div>:activity.slice(0,5).map(x=><div className="activityitem" key={x.id}><div className={'activitydot '+x.type}></div><div><b>{x.text}</b><span>{x.time}</span></div></div>)}</div></section>}<section className="analytics">
   <div className="card trendcard"><div className="cardhead"><div><h2>Wellness trend</h2><p>Recent illustrative check-in pattern</p></div><div className="legend"><span><i/>Current</span></div></div><TrendChart personnel={personnel}/></div>
   <div className="card distribution"><div className="cardhead"><div><h2>Signal distribution</h2><p>Current demo risk signals</p></div><BarChart3 size={18} className="mutedicon"/></div><div className="distrows"><DistRow label="Low" count={low} total={personnel.length} type="low"/><DistRow label="Elevated" count={elevated} total={personnel.length} type="elevated"/><DistRow label="High" count={high} total={personnel.length} type="high"/></div><div className="signalnote"><Info size={14}/> Signals indicate review priority, not diagnosis.</div></div>
  </section>
  <section className="grid2"><div className="card"><div className="cardhead"><div><h2>Welfare signal overview</h2><p>Click a person to inspect demo context</p></div><button className="textbtn" onClick={onPersonnel}>View all <ChevronRight size={15}/></button></div>{personnel.map(p=><button className="personrow rowbutton" key={p.id} onClick={()=>onSelect(p)}><PersonRow p={p}/></button>)}</div><div className="card recommendedcard"><div className="cardhead"><div><div className="eyebrow actioneyebrow">WELFARE PRIORITIES</div><h2>Recommended actions</h2><p>Human-reviewed next steps based on current demo signals</p></div><span className="actioncount">{alerts.filter(a=>a.status==='Open').length} open</span></div><div className="actionlist"><Action icon={HeartPulse} title="Offer confidential check-in" text="Start with a supportive conversation for personnel showing attention signals." onClick={()=>goToRecommended('checkin')} priority/><Action icon={Clock3} title="Review duty load" text="Check extended duty patterns and consider workload balancing." onClick={()=>goToRecommended('review')} priority/><Action icon={CalendarDays} title="Consider leave discussion" text="Review leave access and recovery time where low leave frequency is visible." onClick={()=>goToRecommended('leave')}/></div><div className="safe"><CheckCircle2 size={17}/><span>Recommendations are prompts for authorized human review — never automatic decisions.</span></div></div></section>
  <div className="footer-note"><LockKeyhole size={15}/> Demo data only • No medical diagnosis • Access is role-based</div>
 </>;
}


function PersonnelWellnessSuggestions({person,onAssessment}){
 const suggestions=[];
 if(!person)return null;
 if(person.wellness<=65) suggestions.push({icon:HeartPulse,title:'Take a private wellness check-in',text:'A short voluntary check-in can help you reflect on how you are feeling and what support may help.',action:'Start check-in',onClick:onAssessment});
 if(person.duty>=10) suggestions.push({icon:Clock3,title:'Plan recovery after extended duty',text:'Consider protecting recovery time after extended duty and discussing workload support if needed.'});
 if(person.leave<=2) suggestions.push({icon:CalendarDays,title:'Review your leave and rest plan',text:'If you have had limited leave recently, consider discussing rest or leave options through the appropriate welfare channel.'});
 suggestions.push({icon:MessageCircle,title:'Reach out for confidential support',text:'You can request a welfare conversation if you would like to discuss stress, workload, sleep or personal concerns.'});
 if(person.risk==='Low'&&person.wellness>65) suggestions.unshift({icon:CheckCircle2,title:'Keep your current routine',text:'Your current demo wellness indicators are relatively stable. Continue routine self-care and voluntary check-ins.'});
 return <section className="card personnelsuggestions"><div className="cardhead"><div><h2>My Wellness Suggestions</h2><p>Private, supportive ideas based on your current wellness inputs</p></div><span className="suggestionprivacy"><LockKeyhole size={13}/> Personal view</span></div><div className="suggestionbanner"><HeartPulse size={18}/><div><b>Support, not diagnosis</b><span>These are general wellness suggestions. They do not replace professional care or make decisions about you.</span></div></div><div className="suggestionlist">{suggestions.slice(0,4).map((s,i)=>{const Icon=s.icon;return <div className="suggestionitem" key={s.title}><div className="suggestionicon"><Icon size={17}/></div><div className="suggestioncopy"><b>{s.title}</b><span>{s.text}</span></div>{s.onClick&&<button className="softbtn" onClick={s.onClick}>{s.action}</button>}</div>})}</div><div className="suggestionfooter"><Shield size={14}/><span>Your detailed welfare signals remain scoped to your personal role in this prototype.</span></div></section>;
}

function TrendChart({personnel}){
 const w=640,h=190,pad=28;
 const points=personnel.map(p=>p.trend);
 const all=points.flat(); const min=Math.max(0,Math.min(...all)-8),max=Math.min(100,Math.max(...all)+8);
 const x=i=>pad+i*((w-pad*2)/4), y=v=>h-pad-((v-min)/(max-min))*(h-pad*2);
 return <div className="chartwrap"><svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Illustrative wellness trend chart"><line x1={pad} x2={w-pad} y1={y(50)} y2={y(50)} className="gridline"/><line x1={pad} x2={w-pad} y1={y(75)} y2={y(75)} className="gridline"/>{points.map((arr,i)=><polyline key={personnel[i].id} points={arr.map((v,j)=>`${x(j)},${y(v)}`).join(' ')} className={`trendline line${i}`}/>)}</svg><div className="chartlabels"><span>−4 checks</span><span>−3</span><span>−2</span><span>−1</span><span>Latest</span></div><div className="trendlegend">{personnel.map((p,i)=><span key={p.id}><i className={`dot line${i}`}/>{p.name}</span>)}</div></div>;
}
function DistRow({label,count,total,type}){return <div className="distrow"><div className="distlabel"><span className={'dot '+type}/><b>{label}</b><small>{count} personnel</small></div><div className="distbar"><i className={type} style={{width:((count/total)*100)+'%'}}/></div><strong>{Math.round((count/total)*100)}%</strong></div>}
function Stat({icon:Icon,label,value,sub,warn}){return <div className="stat"><div className={warn?'staticon warn':'staticon'}><Icon size={18}/></div><div><span>{label}</span><strong>{value}</strong><small>{sub}</small></div></div>}
function PersonRow({p}){return <><div className="person"><div className="pavatar">{p.name.split(' ').map(x=>x[0]).join('')}</div><div><b>{p.name}</b><span>{p.id} • {p.unit}</span></div></div><div className="metric"><span>Wellness</span><b>{p.wellness}%</b></div><div className="metric"><span>Duty</span><b>{p.duty}h/day</b></div><div className="rowbadges"><span className={'badge '+p.risk.toLowerCase()}>{p.risk}</span>{p.pattern&&p.pattern.key!=='stable'&&p.pattern.key!=='neutral'&&<span className={'patternbadge '+p.pattern.key}>{p.pattern.type}</span>}</div></>}
function Action({icon:Icon,title,text,onClick}){return <button type="button" className="action" onClick={onClick}><div className="actionicon"><Icon size={17}/></div><div><b>{title}</b><span>{text}</span></div><ChevronRight size={16}/></button>}

function Assessment({form,setForm,submit,submitted}){
 const avg=Math.round((form.sleep+form.mood+form.energy+form.workload)/4);
 const labels=['Very low','Low','Okay','Good','Very good'];
 return <div className="page"><div className="pagehead"><div><div className="eyebrow">VOLUNTARY SELF-ASSESSMENT</div><h1>Wellness Check-in</h1><p>A short private check-in to help identify support needs.</p></div><div className="secure"><LockKeyhole size={16}/> Encrypted & confidential</div></div><div className="assessment"><div className="card formcard"><div className="formintro"><Brain size={23}/><div><h2>How have you been feeling?</h2><p>There are no right or wrong answers. Your responses are intended for welfare support.</p></div></div>{[['sleep','Sleep quality'],['mood','Mood & emotional balance'],['energy','Energy level'],['workload','Perceived workload']].map(([key,label])=><label className="range" key={key}><div><b>{label}</b><span>{labels[form[key]-1]}</span></div><input aria-label={label} type="range" min="1" max="5" value={form[key]} onChange={e=>setForm({...form,[key]:+e.target.value})}/><div className="ticks"><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span></div></label>)}<label className="field"><b>Anything you want welfare staff to know?</b><textarea placeholder="Optional — share only what you are comfortable sharing" value={form.concern} onChange={e=>setForm({...form,concern:e.target.value})}/></label><div className="checkinpreview"><div><span>Check-in signal</span><b>{labels[avg-1]}</b></div><div className="mini-meter"><i style={{width:(avg/5*100)+'%'}}/></div></div><button className="primary wide" onClick={submit}><CheckCircle2 size={17}/> Submit confidential check-in</button>{submitted&&<div className="success"><CheckCircle2 size={18}/><div><b>Check-in recorded for this demo</b><span>A support signal was generated for authorized welfare review.</span></div></div>}</div><div className="card explainer"><h3>How the demo works</h3><Step n="01" title="Self-report" text="Personnel voluntarily share wellness indicators."/><Step n="02" title="Risk signal" text="Demo analytics combine responses with workload context."/><Step n="03" title="Human review" text="Authorized welfare staff review context before action."/><Step n="04" title="Support" text="The system suggests welfare-oriented interventions."/><div className="redflag"><AlertTriangle size={16}/><span>Signals are indicative only and should never be treated as a diagnosis.</span></div></div></div></div>;
}
function Step({n,title,text}){return <div className="step"><span>{n}</span><div><b>{title}</b><small>{text}</small></div></div>}

function Workspace({stats,alerts,activity,personnel,onPersonnel,onDashboard,onPrivacy,onAssessment}){
 const activeAlerts=alerts.filter(a=>a.status==='Open').length;
 const recent=activity.length?activity.slice(0,5):[
  {id:'w1',type:'checkin',text:'Wellness check-in workspace ready',time:'Now'},
  {id:'w2',type:'review',text:'Welfare signals available for review',time:'Now'},
  {id:'w3',type:'support',text:'Human-led support workflow ready',time:'Now'}
 ];
 return <div className="workspace-page">
  <div className="workspace-head"><div><div className="eyebrow">WELFARE OPERATIONS</div><h1>Workspace</h1><p>Tools and resources to help you manage personnel welfare effectively.</p></div><button className="workspace-quick" onClick={onAssessment}><ClipboardCheck size={16}/> Quick check-in <ChevronRight size={15}/></button></div>
  <div className="workspace-actions">
   <button className="workspace-action blue" style={{background:"#e8f2ff",borderColor:"#9fc8f5"}} onClick={onPersonnel}><div className="wa-icon"><UserRound size={19}/></div><div><b>Add / view personnel</b><span>Open personnel welfare records and demo profiles.</span></div><ChevronRight/></button>
   <button className="workspace-action green" style={{background:"#e8f7ee",borderColor:"#a9d9bc"}} onClick={onDashboard}><div className="wa-icon"><FileText size={19}/></div><div><b>View reports</b><span>Review wellness trends, signals and outcomes.</span></div><ChevronRight/></button>
   <button className="workspace-action purple" style={{background:"#f0eaff",borderColor:"#c9b6ef"}} onClick={onDashboard}><div className="wa-icon"><AlertTriangle size={19}/></div><div><b>Manage alerts</b><span>{activeAlerts} open welfare signal{activeAlerts===1?'':'s'} ready for review.</span></div><ChevronRight/></button>
   <button className="workspace-action orange" style={{background:"#fff0dc",borderColor:"#efc88f"}} onClick={onPrivacy}><div className="wa-icon"><Settings2 size={19}/></div><div><b>System settings</b><span>Review access, privacy and demo controls.</span></div><ChevronRight/></button>
  </div>
  <div className="workspace-grid">
   <section className="card workspace-activity"><div className="cardhead"><div><h2>Recent Activity</h2><p>Latest actions in this demo workspace</p></div><Clock3 size={18} className="mutedicon"/></div><div className="workspace-activity-list">{recent.map(x=><div className="workspace-activity-item" key={x.id}><div className={'workspace-activity-icon '+x.type}>{x.type==='checkin'?<CheckCircle2 size={16}/>:x.type==='review'?<AlertTriangle size={16}/>:<HeartPulse size={16}/>}</div><div><b>{x.text}</b><span>{x.time}</span></div><em>{x.type==='review'?'Review':'Ready'}</em></div>)}</div></section>
   <section className="workspace-side"><div className="card workspace-stats"><div className="cardhead"><div><h2>Quick Statistics</h2><p>Current demo workspace</p></div><BarChart3 size={18} className="mutedicon"/></div><div className="quickstat-grid"><div className="quickstat bluebg" style={{background:"#e5f1ff",borderColor:"#b5d4f6"}}><Users size={17}/><span>Total Personnel</span><b>{stats.total}</b></div><div className="quickstat greenbg" style={{background:"#e6f6ed",borderColor:"#b5ddc5"}}><HeartPulse size={17}/><span>Wellness Avg.</span><b>{stats.avg}%</b></div><div className="quickstat redbg" style={{background:"#ffebeb",borderColor:"#efbcbc"}}><AlertTriangle size={17}/><span>Active Alerts</span><b>{activeAlerts}</b></div><div className="quickstat purplebg" style={{background:"#f0eaff",borderColor:"#d0bef0"}}><Shield size={17}/><span>Attention Signals</span><b>{stats.elevated+stats.high}</b></div></div></div>
    <div className="card workspace-chart"><div className="cardhead"><div><h2>Recent Charts</h2><p>Illustrative wellness trend</p></div><TrendingUp size={18} className="mutedicon"/></div><TrendChart personnel={personnel}/></div>
   </section>
  </div>
  <div className="workspace-note"><LockKeyhole size={14}/><span>Secure • Confidential • Demo data only. Welfare signals support authorized human review and are not diagnoses.</span></div>
 </div>;
}

function Personnel({personnel,onSelect}){
 const [q,setQ]=useState(''); const [unit,setUnit]=useState('All units');
 const units=['All units',...new Set(personnel.map(p=>p.unit))];
 const rows=personnel.filter(p=>(p.name+p.id+p.unit).toLowerCase().includes(q.toLowerCase())&&(unit==='All units'||p.unit===unit));
 return <div className="page"><div className="pagehead"><div><div className="eyebrow">AUTHORIZED VIEW</div><h1>Personnel</h1><p>Demo personnel records with welfare-oriented indicators.</p></div><div className="secure"><Users size={16}/> {rows.length} visible records</div></div><div className="card tablecard"><div className="tabletools"><div className="searchbox"><Users size={15}/><input aria-label="Search personnel" placeholder="Search personnel..." value={q} onChange={e=>setQ(e.target.value)}/></div><div className="filterbox"><SlidersHorizontal size={14}/><select value={unit} onChange={e=>setUnit(e.target.value)}>{units.map(u=><option key={u}>{u}</option>)}</select></div></div><div className="tablewrap"><table><thead><tr><th>Personnel</th><th>Deployment</th><th>Wellness</th><th>Duty</th><th>Leave</th><th>Signal</th><th>Last check-in</th></tr></thead><tbody>{rows.map(p=><tr key={p.id} onClick={()=>onSelect(p)} className="clickrow"><td><b>{p.name}</b><small>{p.id} • {p.unit}</small></td><td>{p.deployment}</td><td><div className="progress"><i style={{width:p.wellness+'%'}}/></div><small>{p.wellness}%</small></td><td>{p.duty}h</td><td>{p.leave} days</td><td><div className="tablebadges"><span className={'badge '+p.risk.toLowerCase()}>{p.risk}</span>{p.pattern&&p.pattern.key!=='stable'&&p.pattern.key!=='neutral'&&<span className={'patternbadge '+p.pattern.key}>{p.pattern.type}</span>}</div></td><td>{p.last}</td></tr>)}</tbody></table></div></div></div>;
}

function PersonnelModal({p,alerts,interventions,followups,activity,onClose}){
 const personAlerts=(alerts||[]).filter(x=>x.personId===p.id);
 const personInterventions=(interventions||[]).filter(x=>x.personId===p.id);
 const personFollowups=(followups||[]).filter(x=>x.personId===p.id);
 const personActivity=(activity||[]).filter(x=>x.text?.includes(p.name));
 const pattern=p.pattern?.type||'Pattern unavailable';
 const focus=p.duty>=10?'Review extended duty pattern and offer a confidential welfare conversation.':p.leave<=2?'Consider discussing leave access and current workload.':'Continue routine welfare check-ins and monitor trend.';
 return <div className="modalback" onClick={onClose}><div className="modal casefilemodal" onClick={e=>e.stopPropagation()}>
  <button className="closebtn" onClick={onClose}><X size={17}/></button>
  <div className="casefiletop"><div><div className="eyebrow">AUTHORIZED WELFARE CASE FILE</div><h2>{p.name}</h2><p>{p.id} • {p.unit} • {p.deployment}</p></div><span className={'badge '+p.risk.toLowerCase()}>{p.risk} signal</span></div>
  <div className="casefilestatus"><Shield size={15}/><span>Human review required • Welfare support only • Demo data</span></div>
  <div className="modalstats"><MiniStat label="Wellness" value={p.wellness+'%'}/><MiniStat label="Duty pattern" value={p.duty+'h/day'}/><MiniStat label="Leave" value={p.leave+' days'}/><MiniStat label="Check-ins" value={p.checkins}/></div>

  <div className="casefilegrid">
   <section className="casepanel"><div className="casepanelhead"><div><b>Risk & trend summary</b><span>Current illustrative signal</span></div><Activity size={16}/></div>
    <div className="caseheadline"><strong>{pattern}</strong><span>{p.pattern?.text||'More check-ins are needed for trend analysis.'}</span></div>
    <div className="casefocus"><MessageCircle size={16}/><div><b>Suggested review focus</b><span>{focus}</span></div></div>
   </section>
   <section className="casepanel"><div className="casepanelhead"><div><b>Observable contributors</b><span>Prototype signal inputs</span></div><Brain size={16}/></div>
    <div className="driverlist">{(p.riskFactors||[{label:p.duty>=10?'Duty hours':'Current wellness signal',value:1,weight:1}]).map(f=><div className="driveritem" key={f.label}><span><b>{f.label}</b><small>Illustrative review factor</small></span><strong className="negative">Review</strong></div>)}</div>
   </section>
  </div>

  <section className="casepanel casehistory"><div className="casepanelhead"><div><b>Wellness history</b><span>Recent check-ins and signal progression</span></div><TrendingUp size={16}/></div>
   <div className="historyrows">{(p.history||[]).slice(-5).map((h,i)=><div className="historyrow" key={i}><span>{h.date}</span><strong>{h.wellness}%</strong><span className={'badge '+h.risk.toLowerCase()}>{h.risk}</span></div>)}</div>
  </section>

  <div className="casefilegrid">
   <section className="casepanel"><div className="casepanelhead"><div><b>Alerts & review</b><span>{personAlerts.length} linked alert{personAlerts.length===1?'':'s'}</span></div><AlertTriangle size={16}/></div>
    {personAlerts.length===0?<div className="caseempty">No linked welfare alerts in this demo session.</div>:personAlerts.map(a=><div className="caseitem" key={a.id}><div><b>{a.reason}</b><span>{a.time} • Reviewed by {a.reviewedBy||'Pending review'}</span></div><span className={'badge '+a.status.toLowerCase()}>{a.status}</span></div>)}
   </section>
   <section className="casepanel"><div className="casepanelhead"><div><b>Interventions & follow-up</b><span>Human-led support workflow</span></div><HeartPulse size={16}/></div>
    {personInterventions.length===0?<div className="caseempty">No support action planned in this demo session.</div>:personInterventions.map(x=><div className="caseitem" key={x.id}><div><b>{x.action}</b><span>{x.time} • {x.status}</span></div></div>)}
    {personFollowups.map(x=><div className="caseitem followupitem" key={x.id}><div><b>Follow-up: {x.outcome}</b><span>{x.time} • {x.status}</span></div></div>)}
   </section>
  </div>

  <section className="casepanel"><div className="casepanelhead"><div><b>Welfare activity timeline</b><span>Linked human-reviewed activity</span></div><Clock3 size={16}/></div>
   {personActivity.length===0?<div className="caseempty">No linked activity recorded yet. New check-ins, reviews and support actions will appear here.</div>:<div className="caseactivity">{personActivity.slice(0,6).map(x=><div className="caseactivityitem" key={x.id}><i></i><div><b>{x.text}</b><span>{x.time}</span></div></div>)}</div>}
  </section>

  <div className="inputbox"><div className="factorhead"><b>Signals considered</b><span>Prototype input categories</span></div><div className="inputchips"><span>Self-assessment</span><span>Duty schedule</span><span>Leave pattern</span><span>Deployment</span><span>Workload</span></div><div className="inputnote"><Info size={13}/> These inputs support welfare review; they are not a diagnosis or an autonomous decision.</div></div>
  <div className="modalnote"><Info size={15}/> This prototype uses illustrative demo data. Production deployment would require validated models, consent/privacy controls, server-side authorization and appropriate security safeguards.</div>
 </div></div>;
}
function MiniStat({label,value}){return <div><span>{label}</span><b>{value}</b></div>}

function Privacy({role,onReset}){
 const permission=role==='Personnel'?'Own check-in and personal welfare view':role==='Commander'?'Aggregated welfare signals and recommendations':'Welfare signals, recommendations and support workflow';
 return <div className="page"><div className="pagehead"><div><div className="eyebrow">GOVERNANCE</div><h1>Privacy & Access</h1><p>Privacy safeguards are part of the welfare workflow, not an afterthought.</p></div></div><div className="privacygrid"><div className="card"><h2>Current demo role</h2><div className="rolebig"><Shield size={23}/><div><b>{role}</b><span>Role-based access context</span></div></div><div className="perm"><CheckCircle2/> {permission}</div><div className="perm"><CheckCircle2/> Review recommendations</div><div className="perm"><CheckCircle2/> Support check-in workflow</div><div className="perm muted"><LockKeyhole/> Raw sensitive data restricted</div></div><div className="card"><h2>Protection principles</h2><div className="guard"><LockKeyhole/><div><b>Data minimization</b><span>Only relevant welfare and organizational indicators are used.</span></div></div><div className="guard"><Shield/><div><b>Role-based access</b><span>Access is shown by role in this demo; production access would require server-side authorization.</span></div></div><div className="guard"><Users/><div><b>Human-in-the-loop</b><span>AI signals support review; they do not autonomously decide interventions.</span></div></div><div className="guard"><HeartPulse/><div><b>Welfare-first purpose</b><span>The system is intended for support rather than disciplinary action.</span></div></div></div></div><div className="card democontrol"><div className="demohead"><div><h2>Demo controls</h2><p>Reset the workspace before a fresh SIH walkthrough.</p></div><SlidersHorizontal size={18} className="mutedicon"/></div><div className="demobody"><div><b>Reset demo workspace</b><span>Clears alerts, interventions, follow-ups and timeline activity, then restores the original sample data.</span></div><button className="softbtn resetbtn" onClick={onReset}>Reset demo</button></div><div className="demonote"><Info size={14}/> This control only resets local demo state. It does not delete or modify real personnel data.</div></div></div>;
}

createRoot(document.getElementById('root')).render(<AppErrorBoundary><App/></AppErrorBoundary>)
 async function reviewAlert(id){const alert=alerts.find(x=>x.id===id);try{const saved=await fetchJson('/api/alerts/'+id+'/review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({role})});setBackendStatus('connected');setAlerts(v=>v.map(x=>x.id===id?mapAlert(saved):x));if(alert){logSecurity('Alert review by '+role);setActivity(v=>[{id:Date.now(),type:'review',text:alert.name+' alert reviewed by '+role,time:'Just now'},...v].slice(0,8));}}catch{setBackendStatus('offline');}}

 async function planIntervention(alert,action){try{const savedIntervention=await fetchJson('/api/interventions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({person_id:alert.personId,name:alert.name,action})});const savedFollowup=await fetchJson('/api/followups',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({person_id:alert.personId,name:alert.name,action})});setBackendStatus('connected');setInterventions(v=>[mapIntervention(savedIntervention),...v]);setFollowups(v=>[mapFollowup(savedFollowup),...v]);logSecurity('Support action planned by '+role);setActivity(v=>[{id:Date.now(),type:'support',text:alert.name+': '+action+' planned',time:'Just now'},...v].slice(0,8));}catch{setBackendStatus('offline');}}

 async function recordOutcome(id,outcome){const item=followups.find(x=>x.id===id);try{const saved=await fetchJson('/api/followups/'+id+'/outcome',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({outcome})});setBackendStatus('connected');setFollowups(v=>v.map(x=>x.id===id?mapFollowup(saved):x));const people=await fetchJson('/api/personnel');setPersonnel(people.map(x=>mapServerPersonnel(x,personnel.find(p=>p.id===x.id))));if(item){logSecurity('Follow-up outcome recorded by '+role);setActivity(v=>[{id:Date.now(),type:'outcome',text:item.name+' follow-up recorded: '+outcome,time:'Just now'},...v].slice(0,8));}}catch{setBackendStatus('offline');}}

;