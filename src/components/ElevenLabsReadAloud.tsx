import {useEffect,useRef,useState} from "react";
import {requestNarration,timedWords,type Narration} from "../lib/narration";
import type {ReadAloudProps} from "./ReadAloud";

export function ElevenLabsReadAloud({parts,onWord,sentence}:ReadAloudProps){
  const [status,setStatus]=useState<"idle"|"loading"|"reading"|"paused">("idle");
  const [rate,setRate]=useState(1);
  const [error,setError]=useState("");
  const rateRef=useRef(1);
  const run=useRef(0);
  const audio=useRef<HTMLAudioElement|null>(null);
  const objectURL=useRef<string|null>(null);
  const request=useRef<AbortController|null>(null);
  const frame=useRef<number|null>(null);
  const cache=useRef(new Map<string,Narration>());
  const onWordRef=useRef(onWord);onWordRef.current=onWord;
  function release(){
    run.current++;
    request.current?.abort();request.current=null;
    if(frame.current!==null)cancelAnimationFrame(frame.current);
    frame.current=null;
    const player=audio.current;
    if(player){player.onended=null;player.onerror=null;player.onpause=null;player.onplaying=null;player.pause();player.removeAttribute("src");player.load();}
    audio.current=null;
    if(objectURL.current)URL.revokeObjectURL(objectURL.current);
    objectURL.current=null;onWordRef.current?.(null);
  }
  function stop(){release();setStatus("idle");}
  useEffect(()=>{
    setStatus("idle");setError("");
    const hide=()=>{if(document.hidden)stop();};
    document.addEventListener("visibilitychange",hide);
    return ()=>{document.removeEventListener("visibilitychange",hide);release();};
  },[parts]);
  useEffect(()=>{if(sentence)void start(sentence.parts);},[sentence]);
  async function start(readingParts=parts){
    stop();setError("");
    const text=readingParts.map(part=>part.text).join("");
    if(!text.trim())return;
    if(text.length>5000){setError("For this trial, choose a passage under 5,000 characters or use the browser voice.");return;}
    const id=run.current;
    setStatus("loading");
    const controller=new AbortController();request.current=controller;
    try{
      let recording=cache.current.get(text);
      if(!recording){
        recording=await requestNarration(text,controller.signal);
        if(run.current!==id)return;
      }
      const words=timedWords(readingParts,recording.alignment);
      if(!cache.current.has(text)){
        if(cache.current.size>=4)cache.current.delete(cache.current.keys().next().value!);
        cache.current.set(text,recording);
      }
      const bytes=Uint8Array.from(atob(recording.audio_base64),character=>character.charCodeAt(0));
      objectURL.current=URL.createObjectURL(new Blob([bytes],{type:"audio/mpeg"}));
      const player=new Audio(objectURL.current);audio.current=player;
      player.playbackRate=rateRef.current;player.preservesPitch=true;
      let highlighted:number|null=null;
      const track=()=>{
        if(run.current!==id)return;
        const word=words.find(word=>player.currentTime>=word.start && player.currentTime<word.end)?.index??null;
        if(word!==highlighted){highlighted=word;onWordRef.current?.(word);}
        frame.current=requestAnimationFrame(track);
      };
      player.onended=()=>{if(run.current===id)stop();};
      player.onerror=()=>{if(run.current===id){stop();setError("This recording could not play. Try again or use the browser voice.");}};
      player.onpause=()=>{if(run.current===id)setStatus("paused");};
      player.onplaying=()=>{if(run.current===id)setStatus("reading");};
      track();
      try{await player.play();}
      catch{if(run.current===id){setStatus("paused");setError("Your browser paused audio. Select Resume reading to play it.");}}
    }catch(cause){
      if(run.current!==id)return;
      stop();setError(cause instanceof Error?cause.message:"ElevenLabs is unavailable. Try the browser voice.");
    }
  }
  async function toggle(){
    if(status==="idle"){await start();return;}
    if(status==="reading"){audio.current?.pause();setStatus("paused");return;}
    if(status==="paused"){
      try{await audio.current?.play();setError("");}
      catch{setError("Audio could not resume. Try again or use the browser voice.");}
    }
  }
  return <div className="read-aloud" role="group" aria-label="Read aloud controls">
    <button type="button" className="secondary-button" disabled={status==="loading"} onClick={()=>void toggle()}>
      {status==="loading"?"Preparing voice…":status==="idle"?"Read aloud":status==="reading"?"Pause reading":"Resume reading"}
    </button>
    {sentence&&<button type="button" className="secondary-button" onClick={()=>void start(sentence.parts)}>Re-read sentence</button>}
    {status!=="idle"&&<button type="button" className="text-button" onClick={stop}>Stop reading</button>}
    <label>Reading speed <select value={rate} onChange={event=>{
      const next=Number(event.target.value);rateRef.current=next;setRate(next);
      if(audio.current)audio.current.playbackRate=next;
    }}><option value={0.6}>Slower (0.6×)</option><option value={1}>Normal (1×)</option><option value={1.5}>Faster (1.5×)</option></select></label>
    {status==="loading"&&<span role="status">Preparing your recording…</span>}
    {error&&<p role="alert" className="error-message">{error}</p>}
  </div>;
}
