import {useEffect,useRef,useState} from "react";
import {requestPublishedNarration,requestPreviewNarration,timedWords,narrationSentences,type PublishedNarration} from "../lib/narration";
import {buildTimeline,locate,spliceVolume,wordStart,type Timeline,type TimelineSource} from "../lib/narrationTimeline";
import type {ReadAloudProps,SentenceCorrection} from "./ReadAloud";

interface Loaded {saved:PublishedNarration;source:TimelineSource;url:string;player:HTMLAudioElement}
const PASSAGE="passage";
const endOf=(saved:PublishedNarration)=>(saved.alignment.character_end_times_seconds.at(-1)??0)+0.3;
const correctionBody=(assignmentId:string|undefined,content:ReadAloudProps["content"],correction:SentenceCorrection)=>
  ({action:"corrected",assignmentId,content:assignmentId?undefined:content,sentenceStart:correction.sentenceStart,answers:correction.answers});

/**
 * Plays one continuous passage built from saved recordings: the published full recording,
 * with each corrected sentence's saved clip spliced in place of that sentence. Any word can
 * be a starting point; nothing is regenerated to seek, replay, pause or change speed.
 */
export function ElevenLabsReadAloud({assignmentId,content,answers,onWord,sentence,corrections=[],listenFrom}:ReadAloudProps){
  const [status,setStatus]=useState<"idle"|"loading"|"reading"|"paused">("idle");
  const [rate,setRate]=useState(1);
  const [error,setError]=useState("");
  const [recording,setRecording]=useState<PublishedNarration|null>(null);
  const [position,setPosition]=useState(0);
  const [duration,setDuration]=useState(0);
  const sourceKey=JSON.stringify({assignmentId,content:assignmentId?undefined:content});
  const loaded=useRef(new Map<string,Loaded>());
  const pending=useRef(new Map<string,{task:Promise<Loaded|null>;signal:AbortSignal}>());
  const timeline=useRef<{key:string;value:Timeline}|null>(null);
  const current=useRef<{segment:number;player:HTMLAudioElement}|null>(null);
  const positionRef=useRef(0);
  const request=useRef<AbortController|null>(null);
  const frame=useRef<number|null>(null);
  const stopAt=useRef<number|undefined>(undefined);
  const rateRef=useRef(1);
  const run=useRef(0);
  const onWordRef=useRef(onWord);onWordRef.current=onWord;
  const propsRef=useRef({assignmentId,content,answers,corrections});propsRef.current={assignmentId,content,answers,corrections};

  function halt(){
    run.current++;
    if(frame.current!==null)cancelAnimationFrame(frame.current);
    frame.current=null;
    for(const item of loaded.current.values())item.player.pause();
  }
  function stop(){
    halt();request.current?.abort();request.current=null;
    for(const item of loaded.current.values())item.player.currentTime=0;
    current.current=null;stopAt.current=undefined;positionRef.current=0;
    setPosition(0);onWordRef.current?.(null);setStatus("idle");
  }
  function release(){
    for(const item of loaded.current.values()){
      item.player.onended=null;item.player.onerror=null;item.player.removeAttribute("src");item.player.load();URL.revokeObjectURL(item.url);
    }
    loaded.current.clear();pending.current.clear();timeline.current=null;
  }
  useEffect(()=>{
    setRecording(null);setDuration(0);setError("");
    const hide=()=>{if(document.hidden)stop();};
    document.addEventListener("visibilitychange",hide);
    return ()=>{document.removeEventListener("visibilitychange",hide);stop();release();};
  },[sourceKey]);

  function store(key:string,saved:PublishedNarration):Loaded {
    const bytes=Uint8Array.from(atob(saved.audio_base64),char=>char.charCodeAt(0));
    const url=URL.createObjectURL(new Blob([bytes],{type:"audio/mpeg"}));
    const player=new Audio(url);player.preservesPitch=true;player.playbackRate=rateRef.current;
    player.onended=()=>{if(current.current?.player===player)advance(run.current);};
    player.onerror=()=>{if(current.current?.player===player){stop();setError("The saved recording could not play. Please try again.");}};
    const item={saved,url,player,source:{key,words:timedWords(saved.parts,saved.alignment),duration:endOf(saved)}};
    loaded.current.set(key,item);return item;
  }
  // Each recording is fetched once per view; the server returns its saved copy.
  async function fetchRecording(key:string,load:(signal:AbortSignal)=>Promise<PublishedNarration>,signal:AbortSignal,required:boolean){
    const existing=loaded.current.get(key);if(existing)return existing;
    const waiting=pending.current.get(key);
    if(waiting&&!waiting.signal.aborted)return waiting.task;
    const task=load(signal).then(saved=>{
      if(signal.aborted)throw new DOMException("Cancelled","AbortError");
      return store(key,saved);
    }).catch(cause=>{
      if(pending.current.get(key)?.task===task)pending.current.delete(key);
      if(required)throw cause;return null;
    });
    pending.current.set(key,{task,signal});
    return task;
  }
  async function ensureTimeline(signal:AbortSignal):Promise<Timeline>{
    const {assignmentId,content,corrections}=propsRef.current;
    if(!assignmentId&&!content)throw new Error("Open a practice to listen.");
    const keys=corrections.map(correction=>JSON.stringify(correction));
    const timelineKey=JSON.stringify(keys);
    if(timeline.current?.key===timelineKey&&loaded.current.has(PASSAGE))return timeline.current.value;
    const base=await fetchRecording(PASSAGE,s=>assignmentId?requestPublishedNarration(assignmentId,s):requestPreviewNarration({action:"preview",content},s),signal,true);
    // A missing clip falls back to the base recording for that sentence instead of failing playback.
    const clips=await Promise.all(corrections.map((correction,i)=>fetchRecording(keys[i],s=>requestPreviewNarration(correctionBody(assignmentId,content,correction),s),signal,false)));
    const value=buildTimeline(base!.source,clips.flatMap(clip=>clip?[clip.source]:[]));
    timeline.current={key:timelineKey,value};
    setRecording(base!.saved);setDuration(value.duration);
    return value;
  }

  function track(id:number){
    const now=current.current,line=timeline.current?.value;
    if(run.current!==id||!now||!line)return;
    const segment=line.segments[now.segment];
    const local=now.player.currentTime;
    const global=segment.offset+Math.min(Math.max(local-segment.from,0),segment.to-segment.from);
    positionRef.current=global;setPosition(global);
    if(stopAt.current!==undefined&&global>=stopAt.current){halt();setStatus("paused");onWordRef.current?.(null);return;}
    if(local>=segment.to-0.005){advance(id);return;}
    now.player.volume=spliceVolume(segment,local);
    // Pre-position the next recording so the switch is immediate.
    const next=line.segments[now.segment+1];
    if(next&&next.key!==segment.key&&segment.to-local<0.5){
      const upcoming=loaded.current.get(next.key)?.player;
      if(upcoming&&Math.abs(upcoming.currentTime-next.from)>0.05)upcoming.currentTime=next.from;
    }
    onWordRef.current?.(segment.words.find(word=>local>=word.start&&local<word.end)?.index??null);
    frame.current=requestAnimationFrame(()=>track(id));
  }
  function advance(id:number){
    const now=current.current,line=timeline.current?.value;
    if(run.current!==id||!now||!line)return;
    const next=now.segment+1;
    if(next>=line.segments.length){stop();return;}
    void startSegment(line,next,line.segments[next].from,id);
  }
  async function startSegment(line:Timeline,index:number,local:number,id:number){
    const segment=line.segments[index];
    const player=loaded.current.get(segment.key)!.player;
    if(current.current&&current.current.player!==player)current.current.player.pause();
    if(frame.current!==null)cancelAnimationFrame(frame.current);
    current.current={segment:index,player};
    if(player.currentTime!==local)player.currentTime=local;
    player.playbackRate=rateRef.current;player.volume=spliceVolume(segment,local);
    try{await player.play();if(run.current!==id)return;setStatus("reading");track(id);}
    catch{if(run.current===id){setStatus("paused");setError("Select Resume reading to play the saved recording.");}}
  }
  /** Plays the combined passage from a timeline position, optionally stopping at another. */
  async function playFrom(start:(line:Timeline)=>number|undefined,end?:(line:Timeline)=>number|undefined){
    halt();const id=run.current;
    request.current?.abort();const controller=new AbortController();request.current=controller;
    setError("");
    try{
      if(!timeline.current||!loaded.current.has(PASSAGE))setStatus("loading");
      const line=await ensureTimeline(controller.signal);
      if(run.current!==id)return;
      const from=start(line);
      if(from===undefined)throw new Error("This part of the passage is not in the saved recording.");
      stopAt.current=end?.(line);
      const {segment,local}=locate(line,from);
      await startSegment(line,segment,local,id);
    }catch(cause){
      if(run.current!==id||(cause instanceof DOMException&&cause.name==="AbortError"))return;
      stop();setError(cause instanceof Error?cause.message:"Recording unavailable.");
    }
  }
  const rangeEnd=(first:number,last:number)=>(line:Timeline)=>{
    const ends=[...line.words].filter(([index])=>index>=first&&index<=last).map(([,time])=>time.end);
    return ends.length?Math.max(...ends)+0.15:undefined;
  };
  const playRange=(first:number,last:number)=>playFrom(line=>wordStart(line,first),rangeEnd(first,last));

  useEffect(()=>{if(sentence?.parts.length)void playRange(sentence.parts[0].index,sentence.parts.at(-1)!.index);},[sentence]);
  useEffect(()=>{if(listenFrom)void playFrom(line=>wordStart(line,listenFrom.index));},[listenFrom]);
  async function toggle(){
    if(status==="idle"){await playFrom(()=>0);return;}
    if(status==="reading"){halt();onWordRef.current?.(null);setStatus("paused");return;}
    if(status==="paused"){const resume=positionRef.current,limit=stopAt.current;await playFrom(()=>resume,limit===undefined||resume>=limit?undefined:()=>limit);}
  }
  const sentences=recording?narrationSentences(recording.parts):[];
  return <div className="read-aloud" role="group" aria-label="Read aloud controls">
    <button type="button" className="secondary-button" disabled={status==="loading"} onClick={()=>void toggle()}>
      {status==="loading"?"Preparing audio…":status==="idle"?"Read aloud":status==="reading"?"Pause reading":"Resume reading"}
    </button>
    {sentence&&<button type="button" className="secondary-button" onClick={()=>void playRange(sentence.parts[0].index,sentence.parts.at(-1)!.index)}>Re-read sentence</button>}
    {status!=="idle"&&<button type="button" className="text-button" onClick={stop}>Stop reading</button>}
    <label>Reading speed <select value={rate} onChange={event=>{const next=Number(event.target.value);rateRef.current=next;setRate(next);for(const item of loaded.current.values())item.player.playbackRate=next;}}>
      <option value={0.6}>Slower (0.6×)</option><option value={1}>Normal (1×)</option><option value={1.5}>Faster (1.5×)</option>
    </select></label>
    {recording&&<>
      <label>Play a sentence <select value="" onChange={event=>{const parts=sentences[Number(event.target.value)];if(parts)void playRange(parts[0].index,parts.at(-1)!.index);}}>
        <option value="" disabled>Choose where to listen</option>
        {sentences.map((parts,index)=><option key={index} value={index}>{index+1}. {parts.map(part=>part.text).join("").slice(0,65)}</option>)}
      </select></label>
      <label>Recording position <input type="range" min={0} max={duration} step={0.1} value={position} onChange={event=>{const time=Number(event.target.value);void playFrom(()=>time);}}/></label>
    </>}
    {status==="loading"&&<span role="status">Preparing narration. Saved audio is reused whenever available.</span>}
    <p className="read-aloud-tip">Tip: select any word in the passage to listen from there.</p>
    {error&&<p role="alert" className="error-message">{error}</p>}
  </div>;
}
