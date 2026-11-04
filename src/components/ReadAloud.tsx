import {ElevenLabsReadAloud} from "./ElevenLabsReadAloud";
import type {ExerciseContent} from "../lib/exercises";
export interface SpokenPart {text:string; index:number}
/** A sentence with correctly answered words, and only the answers inside that sentence. */
export interface SentenceCorrection {sentenceStart:number; answers:Record<number,string>}
export interface ReadAloudProps {
  parts:SpokenPart[]; assignmentId?:string; content?:ExerciseContent;
  answers?:Record<number,string>; onWord?:(index:number|null)=>void;
  sentence?:{parts:SpokenPart[];requestId:number};
  /** Saved corrected-sentence clips to splice into the full recording. */
  corrections?:SentenceCorrection[];
  /** Start reading at this passage token (e.g. a word the reader selected). */
  listenFrom?:{index:number;requestId:number};
}
export function ReadAloud(props:ReadAloudProps){return <ElevenLabsReadAloud {...props}/>;}
