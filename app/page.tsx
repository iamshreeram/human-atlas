import {flushSync} from 'react-dom';
import {registerAtlasTools} from './agent-tools';
import {useEffect,useMemo,useRef,useState} from 'react';
import {Activity,ArrowLeft,ArrowUpRight,ChevronRight,Focus,Info,Layers3,MessageCircleQuestion,Pause,RotateCcw,RotateCw,Search,Send,Sparkles,X} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Badge} from '@/components/ui/badge';
import {Slider} from '@/components/ui/slider';
import {Switch} from '@/components/ui/switch';
import {Sheet,SheetContent,SheetTitle,SheetDescription} from '@/components/ui/sheet';
import {Combobox,ComboboxInput,ComboboxContent,ComboboxList,ComboboxItem,ComboboxEmpty} from '@/components/ui/combobox';
import AnatomyScene from './scene';
import {ask,type Scene} from './ask';
import {AREAS,BODIES,DEFAULT_VISIBLE,MODES,REGIONS,SYSTEMS,EXPLANATIONS,bodyBounds,elementsWithin,explanation,isPartVisible,tourFor,type AreaId,type Atlas,type Body,type Concept,type Mode,type RegionId,type SceneState,type SystemId,type View} from './anatomy';
const initial:SceneState={breastView:'tissue',explode:0,visible:DEFAULT_VISIBLE,selected:[],isolate:false,region:null,area:null,view:'three-quarter',rotate:false,reset:0,focus:[],focusNonce:0};
const SUGGESTIONS=['Where are my kidneys?','What is at L4-L5?','Which muscles do I use in a pushup?','How does blood leave the heart?'];
const params=()=>typeof location==='undefined'?new URLSearchParams():new URLSearchParams(location.search);
const requestedMode=()=>{const id=params().get('mode');return MODES.find(m=>m.id===id)??null;};
const requestedBody=()=>BODIES.find(b=>b.id===params().get('body'))??BODIES[0];
const stateFor=(m:Mode|null)=>m?{...initial,visible:m.systems}:initial;
export default function Home(){
 const detailTitle=useRef<HTMLHeadingElement>(null);
 const [body,setBody]=useState<Body>(requestedBody);
 const [atlas,setAtlas]=useState<Atlas|null>(null),[mode,setMode]=useState<Mode|null>(requestedMode),[step,setStep]=useState(0),[state,setState]=useState(()=>stateFor(requestedMode())),[progress,setProgress]=useState(0),[error,setError]=useState(''),[panel,setPanel]=useState<'layers'|'search'|'ask'|null>(null),[details,setDetails]=useState(false),[about,setAbout]=useState(false),[query,setQuery]=useState(''),[chosen,setChosen]=useState<Concept|null>(null);
 // The requested mode is applied in the same pass that installs the catalogue,
 // so there is no window in which the full body is the current state.
 useEffect(()=>{const abort=new AbortController(),requested=requestedMode();setProgress(0);setError('');setAtlas(null);setChosen(null);setDetails(false);setMode(requested);setState(stateFor(requested));
  fetch(`/models/${body.file}`,{signal:abort.signal}).then(r=>{if(!r.ok)throw new Error('The anatomy catalogue could not be loaded.');return r.json() as Promise<Atlas>;}).then(data=>{
   setAtlas(data);
   if(!requested)return;
   const concept=tourFor(data,requested)[0]??null;
   if(!concept)return;
   const index=new Map(data.parts.map(p=>[p.id,p]));
   setChosen(concept);setStep(0);setState(s=>({...s,selected:elementsWithin(concept,index,requested.systems)}));setDetails(true);
  }).catch(e=>{if(e.name!=='AbortError')setError(e.message);});return()=>abort.abort();},[body]);
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='?'&&!(e.target instanceof HTMLInputElement)&&!(e.target instanceof HTMLTextAreaElement)){e.preventDefault();setPanel('ask');setDetails(false);}
  if(e.key==='/'&&!(e.target instanceof HTMLInputElement)&&!(e.target instanceof HTMLTextAreaElement)){e.preventDefault();setPanel('search');setDetails(false);}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[]);
 const [question,setQuestion]=useState(''),[pending,setPending]=useState(false),[scene,setScene]=useState<Scene|null>(null),[askError,setAskError]=useState('');
 const inFlight=useRef<AbortController|null>(null);
 const submit=async(text:string)=>{
  const trimmed=text.trim();
  if(!trimmed||pending)return;
  inFlight.current?.abort();
  const controller=new AbortController();inFlight.current=controller;
  setPending(true);setAskError('');setScene(null);setDetails(false);
  // Aim the camera the moment the scene arrives, before the prose is finished.
  const applyScene=(next:Scene)=>{
   setScene(next);
   setState(s=>({...s,focus:next.focus.map(f=>({parts:f.parts,role:f.role,label:f.label})),focusNonce:s.focusNonce+1,
    visible:next.systems.length?next.systems as SystemId[]:s.visible,view:next.view,isolate:false,explode:0,rotate:false,selected:[]}));
  };
  try{
   await ask(trimmed,{onScene:applyScene,onAnswer:applyScene},controller.signal);
  }catch(error){
   if((error as Error).name!=='AbortError')setAskError(error instanceof Error?error.message:'Something went wrong.');
  }finally{
   if(inFlight.current===controller){setPending(false);inFlight.current=null;}
  }
 };
 useEffect(()=>()=>inFlight.current?.abort(),[]);
 const parts=useMemo(()=>new Map(atlas?.parts.map(p=>[p.id,p])),[atlas]);
 const bounds=useMemo(()=>atlas?bodyBounds(atlas.parts):null,[atlas]);
 const counts=useMemo(()=>Object.fromEntries(SYSTEMS.map(s=>[s.id,atlas?.parts.filter(p=>p.system===s.id).length??0])),[atlas]);
 const activeSystems=SYSTEMS.filter(s=>counts[s.id]>0);
 const selectedParts=state.selected.map(id=>parts.get(id)).filter(p=>!!p),selected=selectedParts[0],system=SYSTEMS.find(s=>s.id===selected?.system);
 const visibleCount=atlas&&bounds?atlas.parts.filter(p=>isPartVisible(p,state,bounds)).length:0;
 const chooseRegion=(id:RegionId|null)=>{setDetails(false);setState(s=>({...s,region:id,area:null,selected:[],isolate:false}));};
 const chooseArea=(id:AreaId)=>{setDetails(false);setState(s=>({...s,area:s.area===id?null:id,selected:[],isolate:false}));};
 const areas=AREAS.filter(a=>!state.region||a.regions.includes(state.region));
 const results=useMemo(()=>{if(!atlas)return[];const term=query.toLowerCase().trim();if(!term)return ['heart','brain','liver','stomach','spleen','pancreas','urinary bladder','trachea'].map(name=>atlas.concepts.find(c=>c.name.toLowerCase()===name)).filter((x):x is Concept=>!!x);return atlas.concepts.filter(c=>c.name.toLowerCase().includes(term)||c.id.toLowerCase().includes(term)).sort((a,b)=>a.name.length-b.name.length).slice(0,80);},[atlas,query]);
 const elementsFor=(c:Concept,visible:SystemId[])=>elementsWithin(c,parts,visible);
 const choose=(c:Concept)=>{setChosen(c);setState(s=>({...s,selected:elementsFor(c,s.visible),isolate:false,rotate:false}));setDetails(true);setPanel(null);};
 useEffect(()=>{if(!atlas)return;return registerAtlasTools(atlas,c=>flushSync(()=>choose(c)));},[atlas]);
 const choosePart=(id:string)=>{const p=parts.get(id);if(!p)return;setChosen({id:p.conceptId,name:p.name,elements:[id]});setState(s=>({...s,selected:[id],isolate:false,rotate:false}));setDetails(true);setPanel(null);};
 const modeBytes=useMemo(()=>Object.fromEntries(MODES.map(m=>[m.id,(atlas?.chunks??[]).filter(c=>c.system&&m.systems.includes(c.system)).reduce((sum,c)=>sum+(c.gzipBytes??c.bytes),0)])),[atlas]);
 const modeReady=(m:Mode)=>m.systems.every(id=>counts[id]>0);
 const tour=useMemo(()=>atlas&&mode?tourFor(atlas,mode):[],[atlas,mode]);
 const enterMode=(m:Mode)=>{
  const steps=atlas?tourFor(atlas,m):[],concept=steps[0]??null;
  setMode(m);setPanel(null);setChosen(concept);setStep(0);setScene(null);
  history.replaceState(null,'',link({mode:m.id}));
  setState(s=>({...s,visible:m.systems,selected:concept?elementsFor(concept,m.systems):[],isolate:false,explode:0,rotate:false,view:'three-quarter',focus:[],focusNonce:s.focusNonce+1,reset:s.reset+1}));
  setDetails(!!concept);
 };
 const goStep=(next:number)=>{
  if(!mode||!tour.length)return;
  const index=Math.max(0,Math.min(next,tour.length-1)),concept=tour[index];
  setStep(index);setChosen(concept);setDetails(true);
  setState(s=>({...s,selected:elementsFor(concept,mode.systems),isolate:false,rotate:false,reset:s.reset+1}));
 };
 const toggle=(id:SystemId)=>{setDetails(false);setScene(null);setMode(null);setState(s=>({...s,selected:[],isolate:false,focus:[],focusNonce:s.focusNonce+1,breastView:(id==='mammary'||id==='integumentary')&&!s.visible.includes(id)?'tissue':s.breastView,visible:s.visible.includes(id)?s.visible.filter(x=>x!==id):[...s.visible,id]}));};
 const reset=()=>{setState(s=>({...initial,visible:DEFAULT_VISIBLE,reset:s.reset+1,focusNonce:s.focusNonce+1}));setChosen(null);setDetails(false);setPanel(null);setScene(null);setAskError('');setMode(null);history.replaceState(null,'',link({mode:null}));};
 const link=(next:{mode?:string|null;body?:string})=>{const q=params();
  if('mode' in next){if(next.mode)q.set('mode',next.mode);else q.delete('mode');}
  if(next.body)q.set('body',next.body);
  const query=q.toString();return query?`?${query}`:location.pathname;};
 const chooseBody=(next:Body)=>{if(next.id===body.id)return;history.replaceState(null,'',link({body:next.id}));setBody(next);};
 const openPanel=(next:'layers'|'search'|'ask')=>{setDetails(false);setPanel(p=>p===next?null:next);};
 return <main className="studio">
  {atlas&&<AnatomyScene atlas={atlas} state={{...state,inspectorOpen:details&&selectedParts.length>0}} onSelect={choosePart} onProgress={n=>{setProgress(n);if(n===100)setError('');}} onError={setError}/>}
  <div className="vignette"/>
  <header className="identity"><div className="eyebrow"><span className="status-dot"/> INTERACTIVE ANATOMY</div><h1>Human Atlas<Badge variant="outline" className="edition">3D</Badge></h1><div className="identity-meta">{atlas?atlas.parts.length.toLocaleString():'2,234'} modeled pieces <span>·</span> {body.source}</div>
   <div className="body-choice" role="group" aria-label="Reference body">{BODIES.map(b=><Button variant="ghost" key={b.id} aria-pressed={body.id===b.id} onClick={()=>chooseBody(b)}>{b.label}</Button>)}</div></header>
  <nav className="top-actions" aria-label="Explorer panels"><Button variant="ghost" className={panel==='ask'?'active':''} onClick={()=>openPanel('ask')} aria-label="Ask about anatomy"><Sparkles size={18}/><span>Ask a question</span><kbd>?</kbd></Button><Button variant="ghost" className={panel==='search'?'active':''} onClick={()=>openPanel('search')} aria-label="Search anatomy"><Search size={18}/><span>Find a structure</span><kbd>/</kbd></Button><Button variant="ghost" className="icon-button" aria-label="About this atlas" onClick={()=>{setDetails(false);setPanel(null);setAbout(true);}}><Info size={18}/></Button></nav>
  <section className={`layers-panel glass ${panel==='layers'?'mobile-open':''}`} aria-label="Anatomical layers">
   <div className="panel-heading"><span>Systems</span><Button variant="ghost" className="mobile-only icon-button" onClick={()=>setPanel(null)} aria-label="Close systems"><X size={18}/></Button><Badge variant="secondary" className="desktop-only small-number">{activeSystems.length}</Badge></div>
   <div className="layer-presets"><Button variant="ghost" aria-pressed={activeSystems.every(x=>state.visible.includes(x.id))} onClick={()=>{setMode(null);setState(s=>({...s,selected:[],isolate:false,visible:activeSystems.map(x=>x.id)}));}}>All</Button><Button variant="ghost" aria-pressed={state.visible.length===1&&state.visible[0]==='skeletal'} onClick={()=>{setMode(null);setState(s=>({...s,selected:[],isolate:false,visible:['skeletal']}));}}>Skeleton</Button><Button variant="ghost" aria-pressed={state.visible.length===6&&['cardiac','respiratory','digestive','urinary','endocrine','reproductive'].every(id=>state.visible.includes(id as SystemId))} onClick={()=>{setMode(null);setState(s=>({...s,selected:[],isolate:false,visible:['cardiac','respiratory','digestive','urinary','endocrine','reproductive']}));}}>Organs</Button></div>
   {body.id==='female'&&<div className="breast-views" role="group" aria-label="Chest tissue view"><span>Chest detail</span><div>{([{id:'tissue',label:'Tissue'},{id:'cutaway',label:'Glands'},{id:'muscle',label:'Pectorals'}] as const).map(view=><Button key={view.id} variant="ghost" aria-pressed={state.breastView===view.id} onClick={()=>{setDetails(false);setMode(null);setState(s=>({...s,breastView:view.id,selected:[],isolate:false,visible:[...new Set([...s.visible.filter(id=>id!=='integumentary'&&(view.id!=='muscle'||id!=='mammary')),...(view.id==='muscle'?[]:['mammary' as const]),'muscular' as const])]}));}}>{view.label}</Button>)}</div><p>{state.breastView==='tissue'?'Exposed fat and connective-tissue detail.':state.breastView==='cutaway'?'Outer fat envelope removed to reveal glands and ducts.':'Breast tissues hidden to reveal the chest muscles.'}</p></div>}
   <div className="panel-heading region-heading"><span>Regions</span><Button variant="ghost" className="region-body" aria-pressed={state.region===null} onClick={()=>chooseRegion(null)}>Body</Button></div>
   <div className="layer-presets region-presets">{REGIONS.map(r=><Button variant="ghost" key={r.id} title={r.id==='arm'?'Arm, shoulder, and hand':r.name} aria-label={r.id==='arm'?'Arm, shoulder, and hand':r.name} aria-pressed={state.region===r.id} onClick={()=>chooseRegion(r.id)}>{r.name}</Button>)}</div>
   {areas.length>0&&<><div className="panel-heading region-heading"><span>Areas</span></div>
   <div className="layer-presets area-presets">{areas.map(a=><Button variant="ghost" key={a.id} title={a.id==='brachial-plexus'?'Scalenes, clavicle, and subclavian/axillary vessels — the plexus corridor. Named plexus trunks are not in this atlas.':a.name} aria-label={a.name} aria-pressed={state.area===a.id} onClick={()=>chooseArea(a.id)}>{a.name}</Button>)}</div></>}
   <div className="mode-group">
    <div className="mode-heading"><span>Study modes</span>{mode&&<Button variant="ghost" className="mode-exit" onClick={reset}>Exit</Button>}</div>
    <div className="mode-list">{MODES.filter(modeReady).map(m=><Button variant="ghost" key={m.id} className={`mode-chip ${mode?.id===m.id?'active':''}`} aria-pressed={mode?.id===m.id} title={m.summary} onClick={()=>enterMode(m)}><span className="mode-name">{m.name}</span><span className="mode-size">{modeBytes[m.id]?`${(modeBytes[m.id]/1e6).toFixed(modeBytes[m.id]<1e6?2:1)} MB`:''}</span></Button>)}</div>
    {mode&&<p className="mode-summary">{mode.summary}{tour.length>1?` ${tour.length} structures in order.`:''}</p>}
   </div>
   <div className="system-list">{activeSystems.map(s=><div className={`system-row ${state.visible.includes(s.id)?'enabled':''}`} key={s.id}><Button variant="ghost" className="system-name" title={`Show only ${s.name.toLowerCase()}`} onClick={()=>{setMode(null);setState(v=>({...v,visible:[s.id],isolate:false,selected:[]}));}}><span className="system-dot" style={{background:s.color}}/>{s.name}<span className="system-count">{counts[s.id]}</span></Button><Switch checked={state.visible.includes(s.id)} onCheckedChange={()=>toggle(s.id)} aria-label={`Show ${s.name.toLowerCase()}`} /></div>)}</div>
   <div className="panel-foot"><span>{visibleCount.toLocaleString()} pieces visible</span><Button variant="ghost" onClick={()=>{setMode(null);setState(s=>({...s,visible:[],selected:[],isolate:false}));}}>Hide all</Button></div>
  </section>
  {panel==='ask'&&<section className="ask-panel glass" aria-label="Ask about anatomy">
   <div className="panel-heading"><span>Ask about the body</span><Button variant="ghost" className="icon-button" onClick={()=>setPanel(null)} aria-label="Close"><X size={18}/></Button></div>
   <form className="ask-form" onSubmit={e=>{e.preventDefault();void submit(question);}}>
    <input value={question} onChange={e=>setQuestion(e.target.value)} placeholder="Where are my kidneys?" aria-label="Ask a question about anatomy" autoFocus maxLength={500} disabled={pending}/>
    <Button type="submit" variant="ghost" className="icon-button" disabled={pending||!question.trim()} aria-label="Send question"><Send size={17}/></Button>
   </form>
   {!scene&&!pending&&!askError&&<div className="ask-suggestions">{SUGGESTIONS.map(text=><Button key={text} variant="ghost" onClick={()=>{setQuestion(text);void submit(text);}}>{text}</Button>)}</div>}
   {pending&&!scene&&<p className="ask-status" role="status"><Activity size={15}/>Looking through the anatomy…</p>}
   {askError&&<p className="ask-error" role="alert">{askError}</p>}
   {scene&&<div className="ask-answer">
    {scene.answer?<p>{scene.answer}</p>:<p className="ask-status"><Activity size={15}/>Framing the view…</p>}
    {scene.focus.length>0&&<ul className="ask-tags">{scene.focus.map(f=><li key={f.conceptId+f.side}><button type="button" data-role={f.role} onClick={()=>{setState(v=>({...v,focus:[{parts:f.parts,role:'primary',label:f.label}],focusNonce:v.focusNonce+1}));}}><span className="tag-dot" data-role={f.role}/>{f.name}{f.side!=='both'&&<em>{f.side}</em>}</button></li>)}</ul>}
    {scene.unmodeled.length>0&&<p className="ask-missing"><MessageCircleQuestion size={14}/>Not in this model: {scene.unmodeled.join(', ')}. The nearest structures that are present are shown instead.</p>}
    {scene.rejected.length>0&&<p className="ask-missing">Discarded {scene.rejected.length} unverified {scene.rejected.length===1?'reference':'references'}.</p>}
    <Button variant="ghost" className="ask-clear" onClick={()=>{setScene(null);setQuestion('');setState(v=>({...v,focus:[],focusNonce:v.focusNonce+1}));}}>Clear highlight</Button>
   </div>}
   <p className="ask-note">Educational anatomy from a single adult male reference. Not medical advice.</p>
  </section>}
  {panel==='search'&&<section className="search-panel glass" aria-label="Find anatomy"><div className="panel-heading"><span>Find a structure</span><Button variant="ghost" className="icon-button" onClick={()=>setPanel(null)} aria-label="Close search"><X size={18}/></Button></div><Combobox<Concept> items={results} value={null} onValueChange={value=>{if(value)choose(value);}} inputValue={query} onInputValueChange={setQuery} itemToStringLabel={c=>c.name} filter={null} open onOpenChange={open=>{if(!open)setPanel(null);}}><ComboboxInput autoFocus placeholder="Heart, femur, cranial nerve…" aria-label="Search named anatomical structures" showTrigger={false}/><ComboboxContent className="anatomy-search-results"><ComboboxEmpty>No structures match your search.</ComboboxEmpty><ComboboxList>{(c:Concept)=><ComboboxItem key={c.id} value={c}><span className="search-result-name">{c.name}</span><span className="small-number">{c.elements.length} {c.elements.length===1?'piece':'pieces'}</span></ComboboxItem>}</ComboboxList></ComboboxContent></Combobox><p className="search-note">{query?'Showing up to 80 matches. Refine your search to find smaller structures.':'Start with a major organ, or search every named structure.'}</p></section>}
  <nav className="view-controls glass" aria-label="Camera controls">{(['three-quarter','front','side','back'] as View[]).map((v,i)=><Button variant="ghost" key={v} className={state.view===v?'active':''} aria-pressed={state.view===v} disabled={state.explode>.8&&v!=='front'} onClick={()=>setState(s=>({...s,view:v,reset:s.reset+1,rotate:false}))} title={`${v} view`} aria-label={`${v} view`}><span>{['¾','F','S','B'][i]}</span></Button>)}<i/><Button variant="ghost" disabled={state.explode>=.4} aria-label={state.rotate?'Pause rotation':'Rotate body'} title="Auto rotate" className={state.rotate?'active':''} onClick={()=>setState(s=>({...s,rotate:!s.rotate}))}>{state.rotate?<Pause size={17}/>:<RotateCw size={18}/>}</Button><Button variant="ghost" aria-label="Reset view and layers" title="Reset" onClick={reset}><RotateCcw size={17}/></Button></nav>
  <div className="scene-caption"><span className="caption-line"/><span>{state.isolate?(chosen?.name??'SELECTED STRUCTURE'):state.explode>.95?'ANATOMICAL INVENTORY':state.explode>.05?'SEPARATED STRUCTURES':state.area?(AREAS.find(a=>a.id===state.area)?.name??'AREA').toUpperCase():state.region?(REGIONS.find(r=>r.id===state.region)?.name??'REGION').toUpperCase():mode?`${mode.name.toUpperCase()} · STUDY MODE`:`ADULT HUMAN · ${body.label.toUpperCase()}`}</span><span className="caption-line"/></div>
  <div className="bottom-dock glass"><Button variant="ghost" className="mobile-only dock-layers" onClick={()=>openPanel('layers')} aria-label="Open system layers"><Layers3 size={20}/><span>Systems</span></Button><div className="explode-control"><div className="explode-label"><label id="explode-label">Explode anatomy</label><output>{Math.round(state.explode*100)}<span>%</span></output></div><Slider aria-labelledby="explode-label" min={0} max={100} step={1} value={[state.explode*100]} onValueChange={v=>setState(s=>({...s,explode:(Array.isArray(v)?v[0]:v)/100,view:(Array.isArray(v)?v[0]:v)>80?'front':s.view,rotate:false}))}/><div className="slider-endpoints"><span>Assembled</span><span>Every piece</span></div></div><Button variant="ghost" className="dock-reset" onClick={reset} aria-label="Assemble and reset"><RotateCcw size={18}/><span>Reset</span></Button></div>
  <footer className="studio-footer"><span>{state.explode>.8?'Drag to pan':'Drag to orbit'} <b>·</b> Pinch to zoom <b>·</b> Tap to inspect</span><Button variant="ghost" onClick={()=>{setDetails(false);setPanel(null);setAbout(true);}}>Source & credits <ArrowUpRight size={12}/></Button></footer>
  {progress<100&&!error&&<div className="loading glass" role="status"><Activity size={18}/><div><strong>Preparing the anatomy</strong><span>{progress}% · Loading {visibleCount.toLocaleString()} of {atlas?.parts.length.toLocaleString()??'2,234'} pieces</span><div className="loading-track"><i style={{width:`${progress}%`}}/></div></div></div>}
  {error&&<div className="loading glass error" role="alert"><p>{error}</p><Button variant="ghost" onClick={()=>location.reload()}>Reload viewer</Button></div>}
  <Sheet open={details&&selectedParts.length>0} modal={false} disablePointerDismissal onOpenChange={setDetails}><SheetContent initialFocus={detailTitle} className={`detail-sheet glass ${state.isolate?'is-isolated':''}`} showCloseButton={true}><div className="detail-header"><div className="detail-accent" style={{background:system?.color}}/><div className="eyebrow">{system?.name??'ANATOMY'}</div><SheetTitle ref={detailTitle} tabIndex={-1} className="structure-title">{chosen?.name}</SheetTitle></div><div className="detail-scroll" key={`${chosen?.id}-${state.isolate}`}><SheetDescription className="structure-description">{chosen&&selected?explanation(chosen.name,selected.system,body.id==='male'?'male':'female'):''}</SheetDescription>{chosen&&!EXPLANATIONS[chosen.name.toLowerCase()]&&<span className="context-note">System overview · structure identified from source anatomy</span>}<div className="structure-meta"><span>Atlas reference<strong>{chosen?.id}</strong></span><span>Selected pieces<strong>{state.selected.length.toLocaleString()}</strong></span></div>{selectedParts.length>1&&<div className="member-list"><h3>Included structures</h3>{selectedParts.slice(0,50).map(p=><Button variant="ghost" key={p.id} onClick={()=>choosePart(p.id)}><span>{p.name}</span><ChevronRight size={14}/></Button>)}{selectedParts.length>50&&<p>And {selectedParts.length-50} more modeled pieces.</p>}</div>}<a className="source-link" href="https://lifesciencedb.jp/bp3d/" target="_blank" rel="noreferrer">View anatomical source <ArrowUpRight size={14}/></a></div><div className="detail-actions">{mode&&tour.length>1&&<div className="tour-controls"><Button variant="ghost" className="tour-step" disabled={step===0} onClick={()=>goStep(step-1)} aria-label="Previous structure"><ArrowLeft size={16}/></Button><span className="tour-progress">{mode.name} · step {step+1} of {tour.length}</span><Button variant="ghost" className="tour-step" disabled={step===tour.length-1} onClick={()=>goStep(step+1)} aria-label="Next structure"><ChevronRight size={16}/></Button></div>}<Button className={`primary-action ${state.isolate?'active':''}`} onClick={()=>setState(s=>({...s,isolate:!s.isolate,explode:0}))}><Focus size={18}/>{state.isolate?'Show surrounding anatomy':'Isolate structure'}<ChevronRight size={16}/></Button><Button variant="ghost" className="secondary-action" onClick={()=>{setState(s=>({...s,selected:[],isolate:false}));setDetails(false);}}>Clear selection</Button></div></SheetContent></Sheet>
  <Sheet open={about} onOpenChange={setAbout}><SheetContent className="about-sheet glass"><div className="eyebrow">SOURCE & SCOPE</div><SheetTitle className="structure-title">A body, revealed.</SheetTitle><SheetDescription>Explore two reference bodies: the adult male anatomy from BodyParts3D, and a full-body female reconstruction combining BodyParts3D with 62 independently reviewed HRA-derived structures (skeleton, reproductive, breast tissue, body surface) plus a pregnancy/placenta reference repositioned from the Human Reference Atlas.</SheetDescription><div className="about-copy"><p><strong>{body.label} · {body.source}</strong><br/>{atlas?`${atlas.parts.length.toLocaleString()} individual meshes and ${atlas.concepts.length.toLocaleString()} named concepts`:'Loading'} — {atlas?.scope??'reference anatomy'}.</p><p>This reference does not contain every human structure or variation. Named concepts can contain multiple pieces; each source mesh is rendered once.</p><p>Colors and system groupings are designed for exploration. The geometry is simplified for the web, and short explanations provide general educational context. This is an anatomical reference, not a diagnostic or surgical tool.</p><h3>Source</h3><p>BodyParts3D, © The Database Center for Life Science, and the Human Reference Atlas united-female assembly by Kristen Browne and Heidi Schlehlein, both licensed under CC Attribution 4.0 International.</p><a href="https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html" target="_blank" rel="noreferrer">Dataset license <ArrowUpRight size={14}/></a><a href="https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html" target="_blank" rel="noreferrer">Original geometry & metadata <ArrowUpRight size={14}/></a><a href="https://academic.oup.com/nar/article/37/suppl_1/D782/1000752" target="_blank" rel="noreferrer">Read the source publication <ArrowUpRight size={14}/></a></div></SheetContent></Sheet>
 </main>;
}
