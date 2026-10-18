import {useEffect, useRef, useState} from "react";
import {ElevenLabsReadAloud} from "./ElevenLabsReadAloud";

export interface SpokenPart {text:string; index:number}
export function preferredVoice(voices:SpeechSynthesisVoice[]) {
  const score=(voice:SpeechSynthesisVoice)=>
    (/natural|neural|premium|enhanced/i.test(voice.name)?100:0)+
    (/^en-US$/i.test(voice.lang)?10:0)+(voice.default?1:0);
  return voices.filter(voice=>/^en(?:[-_]|$)/i.test(voice.lang)).sort((a,b)=>score(b)-score(a))[0];
}
export function speechChunks(parts:SpokenPart[]) {
  const chunks:{text:string;words:{start:number;index:number}[]}[]=[];
  let chunk={text:"",words:[] as {start:number;index:number}[]};
  const flush=()=>{if(chunk.text.trim())chunks.push(chunk);chunk={text:"",words:[]};};
  for(const part of parts) {
    if(part.text.trim())chunk.words.push({start:chunk.text.length,index:part.index});
    chunk.text+=part.text;
    // Short chunks also avoid browser limits on long utterances.
    if(chunk.text.length>180 && /[.!?]["'”’)]*\s*$/.test(part.text))flush();
  }
  flush();return chunks;
}

export interface ReadAloudProps {parts:SpokenPart[];onWord?:(index:number|null)=>void;sentence?:{parts:SpokenPart[];requestId:number}}
export function ReadAloud(props:ReadAloudProps){
  const trial=import.meta.env.VITE_ELEVENLABS_TRIAL==="true";
  const [provider,setProvider]=useState("browser");
  return <>
    {trial&&<div className="read-aloud"><label>Narrator <select value={provider} onChange={event=>setProvider(event.target.value)}>
      <option value="browser">Browser voice</option><option value="elevenlabs">ElevenLabs (trial)</option>
    </select></label></div>}
    {trial&&provider==="elevenlabs"?<ElevenLabsReadAloud {...props}/>:<BrowserReadAloud {...props}/>}
  </>;
}
function BrowserReadAloud({parts,onWord,sentence}:ReadAloudProps) {
  const supported=typeof window!=="undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
  const [status,setStatus]=useState<"idle"|"reading"|"paused">("idle");
  const [rate,setRate]=useState(1);
  const rateRef=useRef(1);
  const [error,setError]=useState("");
  const [voices,setVoices]=useState<SpeechSynthesisVoice[]>([]);
  const [voiceURI,setVoiceURI]=useState("");
  const run=useRef(0);
  const ownsSpeech=useRef(false);
  const onWordRef=useRef(onWord);onWordRef.current=onWord;
  const utterance=useRef<SpeechSynthesisUtterance|null>(null);
  const readingPartsRef=useRef<SpokenPart[]>([]);
  const currentWord=useRef<number|null>(null);
  const restartOnResume=useRef(false);
  useEffect(()=>{
    if(!supported)return;
    const synth=window.speechSynthesis;
    const update=()=>setVoices(synth.getVoices().filter(voice=>/^en(?:[-_]|$)/i.test(voice.lang)));
    update();synth.addEventListener("voiceschanged",update);
    return ()=>synth.removeEventListener("voiceschanged",update);
  },[supported]);
  function stop() {
    run.current++;
    if(ownsSpeech.current && supported){window.speechSynthesis.cancel();window.speechSynthesis.resume();}
    ownsSpeech.current=false;utterance.current=null;restartOnResume.current=false;setStatus("idle");onWordRef.current?.(null);
  }
  useEffect(()=>{
    const hide=()=>{if(document.hidden)stop();};
    document.addEventListener("visibilitychange",hide);
    return ()=>{
      document.removeEventListener("visibilitychange",hide);
      run.current++;
      if(ownsSpeech.current && supported){window.speechSynthesis.cancel();window.speechSynthesis.resume();}
      ownsSpeech.current=false;onWordRef.current?.(null);
    };
  },[parts,supported]);
  useEffect(()=>{setStatus("idle");},[parts]);
  useEffect(()=>{if(sentence)start(sentence.parts);},[sentence]);
  function start(readingParts=parts,readingRate=rateRef.current) {
    if(!supported)return;
    stop();setError("");
    const id=run.current, chunks=speechChunks(readingParts);
    readingPartsRef.current=readingParts;
    currentWord.current=readingParts.find(part=>part.text.trim())?.index??null;
    ownsSpeech.current=true;setStatus("reading");
    const speak=(position:number)=>{
      if(run.current!==id)return;
      const chunk=chunks[position];
      if(!chunk){stop();return;}
      const next=new SpeechSynthesisUtterance(chunk.text);
      const available=window.speechSynthesis.getVoices();
      const voice=available.find(voice=>voice.voiceURI===voiceURI)??preferredVoice(available);
      if(voice)next.voice=voice;
      next.lang=voice?.lang??"en-US";next.rate=readingRate;next.pitch=1;utterance.current=next;
      next.onstart=()=>{if(run.current===id){currentWord.current=chunk.words[0]?.index??null;onWordRef.current?.(currentWord.current);}};
      next.onboundary=event=>{
        if(run.current!==id)return;
        if(event.name && event.name!=="word")return;
        const word=[...chunk.words].reverse().find(w=>w.start<=event.charIndex);
        currentWord.current=word?.index??null;
        onWordRef.current?.(currentWord.current);
      };
      next.onend=()=>speak(position+1);
      next.onerror=()=>{if(run.current===id){stop();setError("Read aloud could not start. Please try again or choose another browser.");}};
      window.speechSynthesis.speak(next);
    };
    speak(0);
  }
  function changeRate(nextRate:number) {
    rateRef.current=nextRate;setRate(nextRate);
    if(status==="idle")return;
    const position=readingPartsRef.current.findIndex(part=>part.index===currentWord.current);
    const remaining=readingPartsRef.current.slice(Math.max(0,position));
    if(status==="paused"){
      stop();readingPartsRef.current=remaining;restartOnResume.current=true;setStatus("paused");
    }else start(remaining,nextRate);
  }
  if(!supported)return <p className="people-help">Read aloud is unavailable in this browser.</p>;
  return <div className="read-aloud" role="group" aria-label="Read aloud controls">
    <button type="button" className="secondary-button" onClick={()=>{
      if(status==="idle")start();
      else if(status==="reading"){window.speechSynthesis.pause();setStatus("paused");}
      else if(restartOnResume.current)start(readingPartsRef.current);
      else {window.speechSynthesis.resume();setStatus("reading");}
    }}>{status==="idle"?"Read aloud":status==="reading"?"Pause reading":"Resume reading"}</button>
    {sentence&&<button type="button" className="secondary-button" onClick={()=>start(sentence.parts)}>Re-read sentence</button>}
    {status!=="idle"&&<button type="button" className="text-button" onClick={stop}>Stop reading</button>}
    <label>Reading speed <select value={rate} onChange={e=>changeRate(Number(e.target.value))}>
      <option value={0.6}>Slower (0.6×)</option><option value={1}>Normal (1×)</option><option value={1.5}>Faster (1.5×)</option>
    </select></label>
    <label>Reading voice <select value={voiceURI} onChange={e=>{stop();setVoiceURI(e.target.value);}}>
      <option value="">Automatic (best available)</option>
      {voices.map(voice=><option key={voice.voiceURI} value={voice.voiceURI}>{voice.name} ({voice.lang})</option>)}
    </select></label>
    {error&&<p role="alert" className="error-message">{error}</p>}
  </div>;
}
