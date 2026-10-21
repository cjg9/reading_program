import {ElevenLabsReadAloud} from "./ElevenLabsReadAloud";
import type {ExerciseContent} from "../lib/exercises";
export interface SpokenPart {text:string; index:number}
export interface ReadAloudProps {
  parts:SpokenPart[]; assignmentId?:string; content?:ExerciseContent;
  answers?:Record<number,string>; onWord?:(index:number|null)=>void;
  sentence?:{parts:SpokenPart[];requestId:number};
}
export function ReadAloud(props:ReadAloudProps){return <ElevenLabsReadAloud {...props}/>;}
