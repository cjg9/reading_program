import type {TimedWord} from "./narration";

// A saved recording and the passage words it speaks, in that recording's own seconds.
export interface TimelineSource {key:string;words:TimedWord[];duration:number}
// One stretch of one saved recording, placed on the combined passage timeline.
export interface TimelineSegment {key:string;from:number;to:number;offset:number;words:TimedWord[];splicedIn:boolean;splicedOut:boolean}
export interface Timeline {segments:TimelineSegment[];duration:number;words:Map<number,{start:number;end:number}>}

// Silence kept around a corrected-sentence clip. Base cuts sit midway through the natural
// pause between sentences, so the joined audio keeps a similar rhythm to the original.
const LEAD=0.08,TAIL=0.2;

/**
 * Combines the saved full-passage recording with saved corrected-sentence clips.
 * Each clip replaces the stretch of the base recording that speaks the same word
 * indexes; no audio is generated or re-requested to make the combination.
 */
export function buildTimeline(base:TimelineSource,overlays:TimelineSource[]):Timeline {
  const clips=overlays.filter(clip=>clip.words.length).sort((a,b)=>a.words[0].index-b.words[0].index);
  const pieces:Omit<TimelineSegment,"offset"|"splicedIn"|"splicedOut">[]=[];
  const baseWords=(from:number,to:number)=>base.words.filter(word=>word.start>=from&&word.start<to);
  let cursor=0,lastIndex=-1;
  for(const clip of clips){
    const first=clip.words[0].index,last=clip.words[clip.words.length-1].index;
    if(first<=lastIndex)continue; // Overlapping clips: keep the earlier one.
    const before=base.words.filter(word=>word.index<first).at(-1),start=base.words.find(word=>word.index>=first);
    const end=base.words.filter(word=>word.index<=last).at(-1),after=base.words.find(word=>word.index>last);
    if(!start||!end)continue; // The base recording does not cover these words.
    const cutIn=Math.max(cursor,before?(before.end+start.start)/2:0);
    const cutOut=after?(end.end+after.start)/2:base.duration;
    if(cutIn>cursor)pieces.push({key:base.key,from:cursor,to:cutIn,words:baseWords(cursor,cutIn)});
    const from=Math.max(0,clip.words[0].start-LEAD),to=Math.min(clip.duration,clip.words[clip.words.length-1].end+TAIL);
    pieces.push({key:clip.key,from,to,words:clip.words});
    cursor=cutOut;lastIndex=last;
  }
  if(base.duration>cursor)pieces.push({key:base.key,from:cursor,to:base.duration,words:baseWords(cursor,base.duration)});
  const segments:TimelineSegment[]=[];
  const words=new Map<number,{start:number;end:number}>();
  let offset=0;
  pieces.forEach((piece,i)=>{
    if(piece.to-piece.from<0.001&&!piece.words.length)return;
    const segment={...piece,offset,splicedIn:i>0&&pieces[i-1].key!==piece.key,splicedOut:i<pieces.length-1&&pieces[i+1].key!==piece.key};
    for(const word of piece.words)words.set(word.index,{start:offset+word.start-piece.from,end:offset+word.end-piece.from});
    segments.push(segment);offset+=piece.to-piece.from;
  });
  return {segments,duration:offset,words};
}

/** Finds the segment and recording time for a point on the combined timeline. */
export function locate(timeline:Timeline,time:number):{segment:number;local:number} {
  const clamped=Math.min(Math.max(time,0),timeline.duration);
  let segment=timeline.segments.findIndex(s=>clamped<s.offset+(s.to-s.from));
  if(segment<0)segment=timeline.segments.length-1;
  const s=timeline.segments[segment];
  return {segment,local:s.from+Math.min(clamped-s.offset,s.to-s.from)};
}

/** The combined-timeline start of a word, or of the next spoken word after it. */
export function wordStart(timeline:Timeline,index:number):number|undefined {
  const exact=timeline.words.get(index);
  if(exact)return exact.start;
  let next:number|undefined;
  for(const i of timeline.words.keys())if(i>index&&(next===undefined||i<next))next=i;
  return next===undefined?undefined:timeline.words.get(next)!.start;
}

/** Volume for smooth joins: a short fade at boundaries between different recordings. */
export function spliceVolume(segment:TimelineSegment,local:number,fade=0.04):number {
  let volume=1;
  if(segment.splicedIn)volume=Math.min(volume,(local-segment.from)/fade);
  if(segment.splicedOut)volume=Math.min(volume,(segment.to-local)/fade);
  return Math.min(1,Math.max(0,volume));
}
