import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, NavLink, Route, Routes } from "react-router-dom";
import { Activity, ArrowUpRight, AudioLines, BookOpen, CalendarDays, LayoutDashboard, MessageSquare, Mic, Plus, Send, Settings, Users, Volume2 } from "lucide-react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import "./style.css";

type Config = { name:string; industry:string; description:string; timezone:string; opens:number; closes:number; languages:string[]; widget_origins:string[]; widget_welcome?:string; widget_theme?:"green"|"blue"; booking_policy:"automatic"|"approval" };
type Business = { id:string; config:Config };
type Recommendation = { id:string; name:string; url:string; reason:string };
type Message = { role:string; content:string; recommendations?:Recommendation[]; follow_up?:string };

function Reply({message}:{message:Message}) {
  const formatted = (value:string) => value.split("\n").map((line,index) => {
    const heading = /^#{1,6}\s+/.test(line);
    const parts = line.replace(/^#{1,6}\s+/, "").split(/\*\*([^*]+)\*\*/);
    return <span className="reply-line" key={index}>{parts.map((part,position) =>
      heading || position % 2 ? <strong key={position}>{part}</strong> : part)}</span>;
  });
  return <>{message.content && formatted(message.content)}
    {!!message.recommendations?.length && <ol className="reply-products">{message.recommendations.map(product =>
      <li key={product.id}><strong>{/^(?:https:\/\/|http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?=[:/]|$))/i.test(product.url)
        ? <a href={product.url} target="_blank" rel="noopener noreferrer">{product.name}</a> : product.name}</strong>
        {product.reason && <> — {product.reason}</>}</li>)}</ol>}
    {message.follow_up && <div className="reply-follow-up">{formatted(message.follow_up)}</div>}
  </>;
}
type Intelligence = { language?:string; sentiment?:string; summary?:string; objection?:string; intent?:string; trace?:string[]; primary_provider?:string; actual_provider?:string; model?:string|null; response_generated?:boolean; fallback_used?:boolean; route?:string; sources?:{source:string;chunk:number;score?:number}[] };
type Turn = Intelligence & { session:string; reply:string; score:number; reasons:Record<string,number>; slots:string[]; recommendations?:Recommendation[]; follow_up?:string };
type Lead = { id:string; email:string; score:number; reasons:Record<string,number>; profile:Record<string,string>; status:string };
type Conversation = { id:string; updated:string; messages:Message[]; intelligence:Intelligence; pending:string|null; approval_requested:boolean };
type Appointment = { id:string; slot:string; conversation:string; name?:string; lead_id?:string; session_type?:string; status?:string };
type Records = { metrics:Record<string,number>; leads:Lead[]; conversations:Conversation[]; appointments:Appointment[] };
type Document = { id:string; source:string; chunks:number };
type Api = <T,>(path:string, init?:RequestInit) => Promise<T>;

const navigation = [
  ["/", "Overview", LayoutDashboard],
  ["/playground", "Agent Playground", AudioLines],
  ["/leads", "Leads", Users],
  ["/conversations", "Conversations", MessageSquare],
  ["/appointments", "Appointments", CalendarDays],
  ["/knowledge", "Knowledge Base", BookOpen],
  ["/settings", "Business Settings", Settings],
] as const;

const body = (value:unknown, method = "POST"):RequestInit => ({ method, body:JSON.stringify(value) });
const date = (value:string) => new Date(value).toLocaleString();
const errorText = (error:unknown) => error instanceof Error ? error.message : String(error);
const blank:Config = { name:"", industry:"", description:"", timezone:"Asia/Kolkata", opens:9, closes:17, languages:["English","Hindi"], widget_origins:[], booking_policy:"automatic" };

function Page({title, subtitle, children}:{title:string; subtitle:string; children:ReactNode}) {
  return <><header className="page-title"><h1>{title}</h1><p>{subtitle}</p></header>{children}</>;
}

function Empty({children}:{children:ReactNode}) { return <p className="empty">{children}</p>; }

function App() {
  const [token,setToken] = useState(sessionStorage.getItem("vt-token") || "");
  const [entry,setEntry] = useState(token);
  const [businesses,setBusinesses] = useState<Business[]>([]);
  const [selected,setSelected] = useState("");
  const [mode,setMode] = useState("checking");
  const [records,setRecords] = useState<Records>();
  const [error,setError] = useState("");
  const [connecting,setConnecting] = useState(false);
  const business = businesses.find(item => item.id === selected);
  async function api<T,>(path:string, init:RequestInit = {}, secret = token):Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("Authorization", "Bearer " + secret);
    if (typeof init.body === "string") headers.set("Content-Type", "application/json");
    const response = await fetch(path, {...init,headers});
    if (!response.ok) {
      const detail = (await response.json().catch(() => ({}))).detail;
      throw new Error(typeof detail === "string" ? detail : Array.isArray(detail) ? detail.map(item=>item.msg).join(", ") : "Request failed (" + response.status + ")");
    }
    return (response.status === 204 ? undefined : response.headers.get("content-type")?.startsWith("audio/") ? await response.blob() : await response.json()) as T;
  }
  const refresh = async (id = selected) => {
    const value = await api<Records>("/api/" + id + "/records");
    setRecords(previous => activeBusiness.current === id ? value : previous);
  };
  const activeBusiness = useRef("");
  useEffect(() => {
    fetch("/health").then(response => response.json()).then(value => setMode(value.mode)).catch(() => setMode("offline"));
  }, []);
  useEffect(() => {
    if (!token) return;
    api<Business[]>("/api/businesses").then(items => {setBusinesses(items); setSelected(items[0]?.id || "");})
      .catch(error => {setError(errorText(error)); setToken(""); sessionStorage.removeItem("vt-token");});
  }, [token]);
  useEffect(() => {
    activeBusiness.current = selected;
    setRecords(undefined);
    if (selected) refresh(selected).catch(error => setError(errorText(error)));
  }, [selected]);
  async function connect(event:FormEvent) {
    event.preventDefault(); setConnecting(true); setError("");
    try { await api<Business[]>("/api/businesses", {}, entry); sessionStorage.setItem("vt-token", entry); setToken(entry); }
    catch (error) {setError(errorText(error));}
    finally {setConnecting(false);}
  }
  if (!business) return <div className="login"><form className="panel" onSubmit={connect}>
    <Brand/><h1>Open the console</h1><p>Enter the administrator token from your VoxTroop environment.</p>
    <label>Console token<input type="password" required value={entry} onChange={event=>setEntry(event.target.value)}/></label>
    <button className="primary" disabled={connecting}>Connect <ArrowUpRight size={16}/></button>
    {error && <p role="alert" className="error">{error}</p>}
  </form></div>;
  const path = "/api/" + business.id;
  return <div className="shell">
    <aside className="sidebar"><Brand/><div className="workspace"><label htmlFor="business-select">Workspace</label>
      <select id="business-select" value={selected} onChange={event=>{setError("");setSelected(event.target.value);}}>
        {businesses.map(item=><option key={item.id} value={item.id}>{item.config.name}</option>)}
      </select></div>
      <nav>{navigation.map(([link,label,Icon])=><NavLink key={link} to={link} end={link==="/"}><Icon size={18}/>{label}</NavLink>)}</nav>
      <button className="signout" onClick={()=>{sessionStorage.removeItem("vt-token");setToken("");setBusinesses([]);setSelected("");setEntry("");setError("");}}>Disconnect</button>
    </aside>
    <main className="main"><div className="topbar"><span>{business.config.industry} workspace</span><span className="mode"><i/>{mode === "mock" ? "Mock development mode" : mode === "live" ? "Live AI mode" : mode}</span></div>
      {error && <div className="error" role="alert">{error} <button onClick={()=>setError("")}>Dismiss</button></div>}
      <div className="content" key={business.id}><Routes>
        <Route path="/" element={<Overview records={records}/>}/>
        <Route path="/playground" element={<Playground api={api} path={path} mode={mode} refresh={refresh}/>}/>
        <Route path="/leads" element={<Leads records={records} onStatus={async (id,status)=>{try {await api(path+"/leads/"+id,body({status},"PATCH")); await refresh();} catch(error){setError(errorText(error));}}}/>}/>
        <Route path="/conversations" element={<Conversations records={records}/>}/>
        <Route path="/appointments" element={<Appointments records={records} decide={async (id,decision)=>{try {await api(path+"/appointments/"+id+"/decision/"+decision,{method:"POST"}); await refresh();} catch(error){setError(errorText(error));}}}/>}/>
        <Route path="/knowledge" element={<Knowledge api={api} path={path}/>}/>
        <Route path="/settings" element={<BusinessSettings key={business.id} business={business} api={api} onSave={item=>{setBusinesses(previous=>[...previous.filter(value=>value.id!==item.id),item]);setSelected(item.id);}}/>}/>
        <Route path="*" element={<Empty>Page unavailable. Choose a section from the menu.</Empty>}/>
      </Routes></div>
    </main>
  </div>;
}

function Brand() {
  return <div className="brand"><span><AudioLines size={21}/></span><div>VoxTroop<small>CONSOLE</small></div></div>;
}

function Overview({records}:{records?:Records}) {
  const metrics = records?.metrics;
  const recent = records?.conversations.slice(0,5) || [];
  const sentiments = ["positive","neutral","negative"].map(name=>({name, count:records?.conversations.filter(item=>item.intelligence.sentiment===name).length || 0}));
  return <Page title="Overview" subtitle="Track sales conversations, qualified leads and appointment activity.">
    {!metrics ? <Empty>Loading workspace activity…</Empty> : <>
      <div className="metrics">{Object.entries(metrics).map(([name,value],index)=>{
        const Icon = [MessageSquare,Users,CalendarDays,Activity][index];
        return <article className="panel metric" key={name}><Icon size={19}/><small>{name}</small><strong>{value}</strong></article>;
      })}</div>
      <div className="overview-grid">
        <section className="panel"><h2>Conversation sentiment</h2>{recent.length ? <ResponsiveContainer width="100%" height={220}><BarChart data={sentiments}><XAxis dataKey="name" tickLine={false}/><YAxis allowDecimals={false}/><Tooltip/><Bar dataKey="count" fill="#237b61" radius={[5,5,0,0]}/></BarChart></ResponsiveContainer> : <Empty>Sentiment appears after your first conversation.</Empty>}</section>
        <section className="panel"><h2>Recent conversations</h2>{recent.length ? recent.map(item=><div className="item" key={item.id}><strong>{item.messages[0]?.content || "New widget session"}</strong><small>{date(item.updated)}</small></div>) : <Empty>Send a message in the Agent Playground to get started.</Empty>}</section>
      </div>
    </>}
  </Page>;
}

function Playground({api,path,mode,refresh}:{api:Api;path:string;mode:string;refresh:()=>Promise<void>}) {
  const [messages,setMessages] = useState<Message[]>([]);
  const [text,setText] = useState("");
  const [turn,setTurn] = useState<Turn>();
  const [busy,setBusy] = useState(false);
  const [recording,setRecording] = useState(false);
  const [error,setError] = useState("");
  const [slot,setSlot] = useState("");
  const [proposal,setProposal] = useState("");
  const [booking,setBooking] = useState("");
  const recorder = useRef<MediaRecorder|null>(null);
  const active = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  useEffect(()=>{active.current=true;return ()=>{active.current=false;clearTimeout(timer.current); if(recorder.current?.state==="recording") recorder.current.stop();};},[]);
  async function send(message:string) {
    if (!message.trim()) return;
    setBusy(true);setError("");
    try {
      const result = await api<Turn>(path+"/chat",body({message,session:turn?.session}));
      setTurn(result);setText("");
      setMessages(previous=>[...previous,{role:"user",content:message},{role:"assistant",content:result.reply,recommendations:result.recommendations,follow_up:result.follow_up}]);
      await refresh();
    } catch (error) {setError(errorText(error));}
    finally {setBusy(false);}
  }
  async function record() {
    if (recorder.current?.state === "recording") {recorder.current.stop();return;}
    let stream:MediaStream|undefined;
    try {
      stream = await navigator.mediaDevices.getUserMedia({audio:true});
      if (!active.current) {stream.getTracks().forEach(track=>track.stop());return;}
      const mic = new MediaRecorder(stream);
      const parts:Blob[] = [];
      mic.ondataavailable = event=>parts.push(event.data);
      mic.onstop = async () => {
        clearTimeout(timer.current);
        stream?.getTracks().forEach(track=>track.stop());
        if (!active.current) return;
        setRecording(false);setBusy(true);
        const form = new FormData();
        form.append("file",new Blob(parts,{type:mic.mimeType}),"recording");
        try {const result = await api<{text:string}>(path+"/voice/transcribe",{method:"POST",body:form});setText(result.text);}
        catch(error){setError(errorText(error));}
        finally{setBusy(false);}
      };
      recorder.current=mic;mic.start();setRecording(true);
      timer.current = setTimeout(()=>{if(mic.state==="recording")mic.stop();},60000);
    } catch(error){stream?.getTracks().forEach(track=>track.stop());setError(errorText(error));}
  }
  async function play() {
    if (!turn) return;
    setError("");setBusy(true);
    let url:string|undefined;
    try {
      const audio = await api<Blob>(path+"/voice/speak",body({text:turn.reply.slice(0,3000)}));
      url = URL.createObjectURL(audio);
      const player = new Audio(url);
      const playbackUrl = url;
      player.onended = player.onerror = ()=>URL.revokeObjectURL(playbackUrl);
      await player.play();
    } catch(error){if(url)URL.revokeObjectURL(url);setError(errorText(error));}
    finally{setBusy(false);}
  }
  async function book(action:"propose"|"confirm", suggested?:string) {
    if (!turn || (!slot && !suggested && !proposal)) return;
    setError("");setBusy(true);
    try {
      const result = await api<{slot:string;status?:string}>(path+"/appointments/"+turn.session+"/"+action,body({slot:action==="propose"?(suggested || new Date(slot).toISOString()):proposal}));
      if(action==="propose") {setProposal(result.slot);setBooking("");}
      else {setProposal("");setBooking(result.status === "pending_approval" ? "Submitted for staff approval." : "Booked for "+date(result.slot));await refresh();}
    } catch(error){setError(errorText(error));}
    finally{setBusy(false);}
  }
  return <Page title="Agent Playground" subtitle="Test customer conversations, inspect agent decisions and validate sales workflows.">
    {error && <p role="alert" className="error">{error}</p>}
    <div className="playground">
      <section className="panel chat"><div className="panel-heading"><h2>Conversation</h2><button disabled={busy||recording} onClick={()=>{setTurn(undefined);setMessages([]);setText("");setProposal("");setSlot("");setBooking("");setError("");}}><Plus size={16}/> New session</button></div>
      <div className="transcript" aria-live="polite">{messages.length ? messages.map((message,index)=><div className={"bubble "+message.role} key={index}><small>{message.role==="user"?"You":"VoxTroop"}</small>{message.role==="assistant"?<Reply message={message}/>:message.content}</div>) : <Empty>Ask about the business or introduce yourself as a prospective customer.</Empty>}</div>
      <form className="composer" onSubmit={event=>{event.preventDefault();void send(text);}}>
        <input aria-label="Customer message" placeholder="Type a customer message…" maxLength={3000} value={text} onChange={event=>setText(event.target.value)}/>
        <button type="button" title={recording?"Stop recording":"Record microphone"} aria-label={recording?"Stop recording":"Record microphone"} disabled={mode!=="live"||busy} onClick={record}><Mic size={18}/></button>
        <button className="primary" aria-label="Send message" disabled={!text.trim()||busy||recording}><Send size={18}/></button>
      </form>
      {mode==="mock" && <small className="muted">Voice is available in live AI mode.</small>}
      {mode==="live" && turn && <button onClick={play} disabled={busy||recording}><Volume2 size={17}/> Play latest answer</button>}
      </section>
      <div className="stack"><section className="panel"><h2>Turn inspection</h2>{turn ? <>
        <div className="tags">{[turn.intent,turn.language,turn.sentiment].filter(Boolean).map(value=><span key={value}>{value}</span>)}</div>
        <p className="trace">{turn.trace?.join(" → ")}</p>
        <div className="item"><small>Primary · {turn.primary_provider} | Used · {turn.actual_provider}{turn.model ? " · " + turn.model : ""}</small>
        <small>Route · {turn.route} | Fallback · {turn.fallback_used ? "used" : "unused"} | Reply · {turn.response_generated ? "model-generated" : "application-generated"}</small>
        {turn.route === "suggest_slots" && <small>Availability check · {turn.slots.length} slots returned</small>}
        {turn.route === "retrieve" && <small>Retrieval · {turn.sources?.length || 0} matching chunks</small>}</div>
        <div className="score"><strong>{turn.score}</strong><span> / 100 qualification score</span></div>
        {Object.entries(turn.reasons).map(([key,value])=><div className="split item" key={key}><span>{key}</span><strong>+{value}</strong></div>)}
        {turn.sources?.map((item,index)=><div className="item" key={index}><small>Source · {item.source}, chunk {item.chunk}{item.score === undefined ? "" : " · similarity " + item.score}</small></div>)}
      </> : <Empty>Agent steps and qualification appear here after a turn.</Empty>}</section>
      <section className="panel"><h2>Appointment</h2>{!!turn?.slots.length && <div className="stack">{turn.slots.map(time=><button key={time} disabled={busy} onClick={()=>book("propose",time)}>{date(time)}</button>)}</div>}<label>Visit time in your local timezone<input type="datetime-local" value={slot} onChange={event=>{setSlot(event.target.value);setProposal("");setBooking("");}}/></label>
        <button disabled={!slot||!turn||busy} onClick={()=>book("propose")}>Check availability</button>
        {proposal&&<p>Available at {date(proposal)}. <button className="primary" onClick={()=>book("confirm")} disabled={busy}>Confirm request</button></p>}
        {booking&&<p role="status">{booking}</p>}
      </section></div>
    </div>
  </Page>;
}

function Leads({records,onStatus}:{records?:Records;onStatus:(id:string,status:string)=>Promise<void>}) {
  return <Page title="Leads" subtitle="Review customer details, qualification scores and CRM status."><section className="panel">
    {!records?.leads.length ? <Empty>No leads yet. A customer email in the Playground creates a lead.</Empty> :
    <div className="table-wrap"><table><thead><tr><th>Contact</th><th>Need</th><th>Qualification</th><th>Status</th></tr></thead>
      <tbody>{records.leads.map(lead=><tr key={lead.id}><td><strong>{lead.profile.name||lead.email}</strong><small>{lead.email}</small></td><td>{lead.profile.need||"—"}</td>
      <td><strong>{lead.score}/100</strong><small>{Object.entries(lead.reasons).map(([field,points])=>field+" +"+points).join(" · ")}</small></td>
      <td><select aria-label={"Status for "+lead.email} value={lead.status} onChange={event=>void onStatus(lead.id,event.target.value)}>{["new","contacted","qualified","converted","lost"].map(status=><option key={status}>{status}</option>)}</select></td>
      </tr>)}</tbody></table></div>}
  </section></Page>;
}

function Conversations({records}:{records?:Records}) {
  return <Page title="Conversations" subtitle="Inspect transcripts, summaries, sentiment and customer objections."><section className="panel">
    {records?.conversations.length ? records.conversations.map(item=><details key={item.id} className="item"><summary><strong>{item.messages[0]?.content || "New widget session"}</strong><small>{date(item.updated)} · {item.intelligence.sentiment || "No turns"}</small></summary>
      {item.intelligence.summary && <p>{item.intelligence.summary}</p>}
      {item.intelligence.objection && <p>Objection · {item.intelligence.objection}</p>}
      {item.messages.map((message,index)=><div className={"bubble "+message.role} key={index}><small>{message.role}</small>{message.role==="assistant"?<Reply message={message}/>:message.content}</div>)}
    </details>) : <Empty>No conversations recorded yet.</Empty>}
  </section></Page>;
}

function Appointments({records,decide}:{records?:Records;decide:(id:string,decision:string)=>Promise<void>}) {
  const pending = records?.conversations.filter(item=>item.approval_requested && item.pending) || [];
  return <Page title="Appointments" subtitle="Review confirmed bookings and pending staff decisions.">
    <div className="overview-grid"><section className="panel"><h2>Confirmed</h2>
      {records?.appointments.length ? records.appointments.map(item=><div className="item" key={item.id}><strong>{date(item.slot)}</strong>
        <small>{[item.session_type, item.name, item.status].filter(Boolean).join(" · ")}</small>
        <small>Reference {item.id} · Conversation {item.conversation.slice(0,8)}{item.lead_id ? " · Lead " + item.lead_id.slice(0,8) : ""}</small></div>) : <Empty>No confirmed bookings.</Empty>}
    </section><section className="panel"><h2>Pending approval</h2>{pending.length ? pending.map(item=><div className="item split" key={item.id}><span>{date(item.pending!)}</span><div className="actions"><button onClick={()=>void decide(item.id,"reject")}>Reject</button><button className="primary" onClick={()=>void decide(item.id,"approve")}>Approve</button></div></div>) : <Empty>No requests awaiting approval.</Empty>}</section></div>
  </Page>;
}

function Knowledge({api,path}:{api:Api;path:string}) {
  const [documents,setDocuments]=useState<Document[]>([]);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const refresh=async()=>setDocuments(await api<Document[]>(path+"/knowledge"));
  useEffect(()=>{void refresh().catch(error=>setError(errorText(error)));},[path]);
  async function change(action:()=>Promise<unknown>) {
    setBusy(true);setError("");
    try {await action();await refresh();} catch(error){setError(errorText(error));}
    finally{setBusy(false);}
  }
  return <Page title="Knowledge Base" subtitle="Manage the business documents the agent uses to ground its answers.">
    {error&&<p className="error" role="alert">{error}</p>}
    <section className="panel"><div className="panel-heading"><h2>Documents</h2><label className="upload"><Plus size={17}/> Upload document<input aria-label="Upload PDF or text document" type="file" accept=".pdf,.txt" disabled={busy} onChange={event=>{const file=event.target.files?.[0];event.target.value="";if(file){const form=new FormData();form.set("file",file);void change(()=>api(path+"/knowledge",{method:"POST",body:form}));}}}/></label></div>
    {documents.length ? documents.map(item=><div className="item split" key={item.id}><div><strong>{item.source}</strong><small>{item.chunks} indexed chunks</small></div><button disabled={busy} onClick={()=>void change(()=>api(path+"/knowledge/"+item.id,{method:"DELETE"}))}>Remove</button></div>) : <Empty>Upload a text file or PDF up to 5 MB.</Empty>}
    </section>
  </Page>;
}

function BusinessSettings({business,api,onSave}:{business:Business;api:Api;onSave:(item:Business)=>void}) {
  const [creating,setCreating]=useState(false);
  const [config,setConfig]=useState(business.config);
  const [origins,setOrigins]=useState(business.config.widget_origins.join(", "));
  const [languages,setLanguages]=useState(business.config.languages.join(", "));
  const [status,setStatus]=useState("");
  const [busy,setBusy]=useState(false);
  const update=<K extends keyof Config>(key:K,value:Config[K])=>setConfig(previous=>({...previous,[key]:value}));
  const split=(value:string)=>value.split(",").map(item=>item.trim()).filter(Boolean);
  const reset=(isNew:boolean)=>{const value=isNew?blank:business.config;setCreating(isNew);setConfig(value);setOrigins(value.widget_origins.join(", "));setLanguages(value.languages.join(", "));setStatus("");};
  async function save(event:FormEvent) {
    event.preventDefault();setBusy(true);setStatus("");
    try {const value=await api<Business>("/api/businesses"+(creating?"":"/"+business.id),body({...config,widget_origins:split(origins),languages:split(languages)},creating?"POST":"PUT"));onSave(value);setCreating(false);setStatus("Business settings saved.");}
    catch(error){setStatus(errorText(error));}
    finally{setBusy(false);}
  }
  return <Page title="Business Settings" subtitle="Configure the sales workspace, booking policy and widget origins.">
    <form className="panel settings" onSubmit={save}><div className="panel-heading"><h2>{creating?"New business":business.config.name}</h2><button type="button" onClick={()=>reset(!creating)}>{creating?"Cancel":"New business"}</button></div>
      <div className="fields">{(["name","industry","timezone"] as const).map(key=><label key={key}>{key}<input required value={config[key]} onChange={event=>update(key,event.target.value)}/></label>)}
      <label>Languages, comma separated<input required value={languages} onChange={event=>setLanguages(event.target.value)}/></label>
      <label>Opening hour<input type="number" min={0} max={23} required value={config.opens} onChange={event=>update("opens",Number(event.target.value))}/></label>
      <label>Closing hour<input type="number" min={1} max={24} required value={config.closes} onChange={event=>update("closes",Number(event.target.value))}/></label></div>
      <label>Description<textarea required value={config.description} onChange={event=>update("description",event.target.value)}/></label>
      <label>Booking policy<select value={config.booking_policy} onChange={event=>update("booking_policy",event.target.value==="approval"?"approval":"automatic")}><option value="automatic">Book after customer confirmation</option><option value="approval">Require staff approval</option></select></label>
      <label>Allowed widget origins, comma separated<input value={origins} onChange={event=>setOrigins(event.target.value)} placeholder="http://localhost:5173"/></label>
      <label>Widget welcome message<input value={config.widget_welcome||""} maxLength={250} onChange={event=>update("widget_welcome",event.target.value)}/></label>
      <label>Widget theme<select value={config.widget_theme||"green"} onChange={event=>update("widget_theme",event.target.value==="blue"?"blue":"green")}><option>green</option><option>blue</option></select></label>
      {!creating&&<pre>{'<script src="http://127.0.0.1:8000/widget.js" data-business="'+business.id+'" defer></script>'}</pre>}
      <button className="primary" disabled={busy}>Save business</button>{status&&<p role="status">{status}</p>}
    </form>
  </Page>;
}

createRoot(document.getElementById("root")!).render(<BrowserRouter><App/></BrowserRouter>);
