import {useEffect, useRef, useState} from "react";

export interface SpokenPart {text:string; index:number; isolate?:boolean}
export function speechChunks(parts:SpokenPart[]) {
  const chunks:{text:string;words:{start:number;index:number}[]}[]=[];
  let chunk={text:"",words:[] as {start:number;index:number}[]};
  const flush=()=>{if(chunk.text.trim())chunks.push(chunk);chunk={text:"",words:[]};};
  for(const part of parts) {
    if(part.isolate)flush();
    if(part.text.trim())chunk.words.push({start:chunk.text.length,index:part.index});
    chunk.text+=part.text;
    // Short chunks also avoid browser limits on long utterances.
    if(part.isolate || (chunk.text.length>180 && /[.!?]["'”’)]*\s*$/.test(part.text)))flush();
  }
  flush();return chunks;
}

export function ReadAloud({parts,onWord}:{parts:SpokenPart[];onWord?:(index:number|null)=>void}) {
  const supported=typeof window!=="undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
  const [status,setStatus]=useState<"idle"|"reading"|"paused">("idle");
  const [rate,setRate]=useState(0.9);
  const [error,setError]=useState("");
  const run=useRef(0);
  const ownsSpeech=useRef(false);
  const onWordRef=useRef(onWord);onWordRef.current=onWord;
  const utterance=useRef<SpeechSynthesisUtterance|null>(null);
  function stop() {
    run.current++;
    if(ownsSpeech.current && supported)window.speechSynthesis.cancel();
    ownsSpeech.current=false;utterance.current=null;setStatus("idle");onWordRef.current?.(null);
  }
  useEffect(()=>{
    const hide=()=>{if(document.hidden)stop();};
    document.addEventListener("visibilitychange",hide);
    return ()=>{
      document.removeEventListener("visibilitychange",hide);
      run.current++;
      if(ownsSpeech.current && supported)window.speechSynthesis.cancel();
      ownsSpeech.current=false;onWordRef.current?.(null);
    };
  },[parts,supported]);
  useEffect(()=>{setStatus("idle");},[parts]);
  function start() {
    if(!supported)return;
    stop();setError("");
    const id=run.current, chunks=speechChunks(parts);
    ownsSpeech.current=true;setStatus("reading");
    const speak=(position:number)=>{
      if(run.current!==id)return;
      const chunk=chunks[position];
      if(!chunk){stop();return;}
      const next=new SpeechSynthesisUtterance(chunk.text);
      next.lang="en-US";next.rate=rate;utterance.current=next;
      next.onstart=()=>{if(run.current===id)onWordRef.current?.(chunk.words[0]?.index??null);};
      next.onboundary=event=>{
        if(run.current!==id)return;
        const word=[...chunk.words].reverse().find(w=>w.start<=event.charIndex);
        onWordRef.current?.(word?.index??null);
      };
      next.onend=()=>speak(position+1);
      next.onerror=()=>{if(run.current===id){stop();setError("Read aloud could not start. Please try again or choose another browser.");}};
      window.speechSynthesis.speak(next);
    };
    speak(0);
  }
  if(!supported)return <p className="people-help">Read aloud is unavailable in this browser.</p>;
  return <div className="read-aloud" role="group" aria-label="Read aloud controls">
    <button type="button" className="secondary-button" onClick={()=>{
      if(status==="idle")start();
      else if(status==="reading"){window.speechSynthesis.pause();setStatus("paused");}
      else {window.speechSynthesis.resume();setStatus("reading");}
    }}>{status==="idle"?"Read aloud":status==="reading"?"Pause reading":"Resume reading"}</button>
    {status!=="idle"&&<button type="button" className="text-button" onClick={stop}>Stop reading</button>}
    <label>Reading speed <select value={rate} disabled={status!=="idle"} onChange={e=>setRate(Number(e.target.value))}>
      <option value={0.7}>Slower</option><option value={0.9}>Normal</option><option value={1.1}>Faster</option>
    </select></label>
    {error&&<p role="alert" className="error-message">{error}</p>}
  </div>;
}
