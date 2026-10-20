import {useEffect,useRef,useState} from "react";
import {requestPublishedNarration,timedWords,narrationSentences,type PublishedNarration,type TimedWord} from "../lib/narration";
import type {ReadAloudProps} from "./ReadAloud";

export function ElevenLabsReadAloud({assignmentId,onWord,sentence}:ReadAloudProps){
  const [status,setStatus]=useState<"idle"|"loading"|"reading"|"paused">("idle");
  const [rate,setRate]=useState(1);
  const [error,setError]=useState("");
  const [recording,setRecording]=useState<PublishedNarration|null>(null);
  const [position,setPosition]=useState(0);
  const [duration,setDuration]=useState(0);
  const audio=useRef<HTMLAudioElement|null>(null);
  const objectURL=useRef<string|null>(null);
  const request=useRef<AbortController|null>(null);
  const frame=useRef<number|null>(null);
  const words=useRef<TimedWord[]>([]);
  const stopAt=useRef<number|undefined>(undefined);
  const rateRef=useRef(1);
  const run=useRef(0);
  const onWordRef=useRef(onWord);onWordRef.current=onWord;
  function stop(){
    run.current++;request.current?.abort();request.current=null;
    if(frame.current!==null)cancelAnimationFrame(frame.current);
    frame.current=null;
    audio.current?.pause();if(audio.current)audio.current.currentTime=0;
    stopAt.current=undefined;setPosition(0);onWordRef.current?.(null);setStatus("idle");
  }
  useEffect(()=>{
    setRecording(null);setDuration(0);setError("");
    const hide=()=>{if(document.hidden)stop();};
    document.addEventListener("visibilitychange",hide);
    return ()=>{
      document.removeEventListener("visibilitychange",hide);stop();
      if(audio.current){audio.current.onended=null;audio.current.onerror=null;audio.current.removeAttribute("src");audio.current.load();}
      audio.current=null;words.current=[];
      if(objectURL.current)URL.revokeObjectURL(objectURL.current);objectURL.current=null;
    };
  },[assignmentId]);
  function track(id:number){
    if(run.current!==id||!audio.current)return;
    const player=audio.current;
    setPosition(player.currentTime);
    if(stopAt.current!==undefined&&player.currentTime>=stopAt.current){
      player.pause();setStatus("paused");onWordRef.current?.(null);return;
    }
    onWordRef.current?.(words.current.find(word=>player.currentTime>=word.start&&player.currentTime<word.end)?.index??null);
    frame.current=requestAnimationFrame(()=>track(id));
  }
  async function play(range?:{start:number;end:number},seekSeconds?:number){
    if(!assignmentId)return;
    run.current++;const id=run.current;
    request.current?.abort();if(frame.current!==null)cancelAnimationFrame(frame.current);
    audio.current?.pause();setError("");
    try{
      if(!audio.current){
        setStatus("loading");const controller=new AbortController();request.current=controller;
        const saved=await requestPublishedNarration(assignmentId,controller.signal);
        if(run.current!==id)return;
        words.current=timedWords(saved.parts,saved.alignment);
        const bytes=Uint8Array.from(atob(saved.audio_base64),char=>char.charCodeAt(0));
        objectURL.current=URL.createObjectURL(new Blob([bytes],{type:"audio/mpeg"}));
        const player=new Audio(objectURL.current);audio.current=player;player.preservesPitch=true;
        player.onended=()=>stop();
        player.onerror=()=>{stop();setError("The saved recording could not play. Try the browser voice.");};
        setRecording(saved);setDuration(words.current.at(-1)?.end??0);
      }
      const player=audio.current;
      const selected=range?words.current.filter(word=>word.index>=range.start&&word.index<=range.end):[];
      if(range&&!selected.length)throw new Error("This sentence is not in the saved recording.");
      stopAt.current=selected.at(-1)?.end;
      player.currentTime=selected[0]?.start??seekSeconds??0;
      player.playbackRate=rateRef.current;
      try{await player.play();if(run.current!==id)return;setStatus("reading");track(id);}
      catch{if(run.current===id){setStatus("paused");setError("Select Resume reading to play the saved recording.");}}
    }catch(cause){if(run.current!==id)return;stop();setError(cause instanceof Error?cause.message:"Recording unavailable.");}
  }
  useEffect(()=>{if(sentence?.parts.length)void play({start:sentence.parts[0].index,end:sentence.parts.at(-1)!.index});},[sentence]);
  async function toggle(){
    if(status==="idle"){await play();return;}
    if(status==="reading"){
      audio.current?.pause();run.current++;if(frame.current!==null)cancelAnimationFrame(frame.current);
      onWordRef.current?.(null);setStatus("paused");return;
    }
    if(status==="paused")await play(undefined,audio.current?.currentTime??0);
  }
  const sentences=recording?narrationSentences(recording.parts):[];
  return <div className="read-aloud" role="group" aria-label="Read aloud controls">
    <button type="button" className="secondary-button" disabled={status==="loading"} onClick={()=>void toggle()}>
      {status==="loading"?"Loading recording…":status==="idle"?"Read aloud":status==="reading"?"Pause reading":"Resume reading"}
    </button>
    {sentence&&<button type="button" className="secondary-button" onClick={()=>void play({start:sentence.parts[0].index,end:sentence.parts.at(-1)!.index})}>Re-read sentence</button>}
    {status!=="idle"&&<button type="button" className="text-button" onClick={stop}>Stop reading</button>}
    <label>Reading speed <select value={rate} onChange={event=>{const next=Number(event.target.value);rateRef.current=next;setRate(next);if(audio.current)audio.current.playbackRate=next;}}>
      <option value={0.6}>Slower (0.6×)</option><option value={1}>Normal (1×)</option><option value={1.5}>Faster (1.5×)</option>
    </select></label>
    {recording&&<>
      <label>Play a sentence <select value="" onChange={event=>{const parts=sentences[Number(event.target.value)];if(parts)void play({start:parts[0].index,end:parts.at(-1)!.index});}}>
        <option value="" disabled>Choose where to listen</option>
        {sentences.map((parts,index)=><option key={index} value={index}>{index+1}. {parts.map(part=>part.text).join("").slice(0,65)}</option>)}
      </select></label>
      <label>Recording position <input type="range" min={0} max={duration} step={0.1} value={position} onChange={event=>void play(undefined,Number(event.target.value))}/></label>
    </>}
    {status==="loading"&&<span role="status">Loading saved narration…</span>}
    {error&&<p role="alert" className="error-message">{error}</p>}
  </div>;
}
