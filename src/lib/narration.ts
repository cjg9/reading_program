import {supabase} from "./supabase";
import type {SpokenPart} from "../components/ReadAloud";
import type {SupabaseClient} from "@supabase/supabase-js";

export interface Alignment {
  characters:string[];
  character_start_times_seconds:number[];
  character_end_times_seconds:number[];
}
export interface Narration {audio_base64:string;alignment:Alignment}
export interface PublishedNarration extends Narration {parts:SpokenPart[]}
export interface TimedWord {index:number;start:number;end:number}

export function narrationSentences(parts:SpokenPart[]):SpokenPart[][] {
  let offset=0;
  const ranges=parts.map(part=>{const start=offset;offset+=part.text.length;return {part,start,end:offset};});
  const text=parts.map(part=>part.text).join("");
  return Array.from(new Intl.Segmenter("en",{granularity:"sentence"}).segment(text)).flatMap(segment=>{
    if(!segment.segment.trim())return [];
    const start=segment.index+segment.segment.search(/\S/);
    const end=segment.index+segment.segment.trimEnd().length;
    const sentence=ranges.filter(range=>range.end>start&&range.start<end).map(range=>({
      index:range.part.index,text:range.part.text.slice(Math.max(0,start-range.start),Math.min(range.part.text.length,end-range.start)),
    }));
    return [sentence];
  });
}

// Use original-text alignment, never normalized text offsets (e.g. "12" → "twelve").
export function timedWords(parts:SpokenPart[],alignment:Alignment):TimedWord[] {
  const text=parts.map(part=>part.text).join("");
  const {characters,character_start_times_seconds:starts,character_end_times_seconds:ends}=alignment;
  if(characters.join("")!==text || starts.length!==characters.length || ends.length!==characters.length)
    throw new Error("The recording could not be matched to this passage. Please try again.");
  let offset=0;
  const ranges=characters.map((character,i)=>{
    const start=offset;offset+=character.length;
    if(!Number.isFinite(starts[i]) || !Number.isFinite(ends[i]) || starts[i]<0 || ends[i]<starts[i] || (i>0 && starts[i]<starts[i-1]))
      throw new Error("The recording has invalid word timings. Please try again.");
    return {start,end:offset,time:starts[i],until:ends[i]};
  });
  offset=0;
  return parts.flatMap(part=>{
    const start=offset;offset+=part.text.length;
    if(!part.text.trim())return [];
    const first=start+part.text.search(/\S/);
    const last=start+part.text.trimEnd().length;
    const chars=ranges.filter(range=>range.end>first && range.start<last);
    return chars.length?[{index:part.index,start:chars[0].time,end:chars[chars.length-1].until}]:[];
  });
}

async function invokeNarration(client:SupabaseClient,body:object,signal:AbortSignal) {
  for(let attempt=0;attempt<35;attempt++){
  if(signal.aborted)throw new DOMException("Cancelled","AbortError");
  const {data,error}=await client.functions.invoke("read-aloud",{body,signal});
  if(error){
    if(error.context instanceof Response && error.context.status===409 && attempt<34){
      await new Promise<void>((resolve,reject)=>{
        const cancel=()=>{clearTimeout(timer);reject(new DOMException("Cancelled","AbortError"));};
        const timer=setTimeout(()=>{signal.removeEventListener("abort",cancel);resolve();},2000);
        signal.addEventListener("abort",cancel,{once:true});
        if(signal.aborted)cancel();
      });
      continue;
    }
    let message="ElevenLabs is unavailable. Please try again.";
    if(error.context instanceof Response){
      const body=await error.context.json().catch(()=>null);
      if(typeof body?.error==="string")message=body.error;
    }
    throw new Error(message);
  }
  return data;
  }
  throw new Error("The recording is still being prepared. Please try again.");
}
export async function requestPublishedNarration(assignmentId:string,signal:AbortSignal):Promise<PublishedNarration>{
  if(!supabase)throw new Error("Sign in to listen.");
  const data=await invokeNarration(supabase,{action:"play",assignmentId},signal);
  if(!data?.audio_base64||!data?.alignment||!Array.isArray(data?.parts))throw new Error("The saved recording is incomplete. Ask your teacher for help.");
  return data;
}
export async function prepareNarration(client:SupabaseClient,exerciseId:string):Promise<string>{
  const data=await invokeNarration(client,{action:"prepare",exerciseId},new AbortController().signal);
  if(typeof data?.publicationId!=="string")throw new Error("The recording was not saved. Please try publishing again.");
  return data.publicationId;
}

export async function requestPreviewNarration(body:object,signal:AbortSignal):Promise<PublishedNarration>{
  if(!supabase)throw new Error("Sign in to listen.");
  const data=await invokeNarration(supabase,body,signal);
  if(!data?.audio_base64||!data?.alignment||!Array.isArray(data?.parts))throw new Error("The recording is incomplete. Please try again.");
  return data;
}
