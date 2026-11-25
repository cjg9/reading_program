import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { completedChallenges, exerciseChallenges, strategies, type Assignment, type ExerciseProgress, type ProgressRecord } from "../lib/exercises";
import { ExercisePlayer } from "./ExercisePlayer";

export function StudentExercises({client,classId,studentId}:{client:SupabaseClient;classId:number;studentId:string}) {
  const [assignments,setAssignments]=useState<Assignment[]>([]);
  const [records,setRecords]=useState<ProgressRecord[]>([]);
  const [selected,setSelected]=useState<string|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [saving,setSaving]=useState(false);
  const playerArea=useRef<HTMLDivElement>(null);
  const listArea=useRef<HTMLDivElement>(null);
  const lastOpened=useRef<string|null>(null);
  // Keep keyboard and screen-reader users in place: the button they pressed is removed when a practice opens or closes.
  useEffect(()=>{
    if(selected){lastOpened.current=selected;playerArea.current?.querySelector<HTMLElement>("h2")?.focus();return;}
    if(lastOpened.current){listArea.current?.querySelector<HTMLElement>(`[data-assignment="${lastOpened.current}"]`)?.focus();lastOpened.current=null;}
  },[selected,loading]);
  const load=useCallback(async()=>{
    setLoading(true);setError("");
    try {
      const a=await client.from("exercise_assignments").select("id,class_id,content,created_at,archived_at,narration_id").eq("class_id",classId).is("archived_at",null).order("created_at",{ascending:false});
      if(a.error)throw a.error;
      const items=(a.data??[]) as Assignment[];
      const p=items.length?await client.from("exercise_progress").select("assignment_id,student_id,progress,completed_at").eq("student_id",studentId).in("assignment_id",items.map(x=>x.id)):{data:[],error:null};
      if(p.error)throw p.error;setAssignments(items);setRecords(p.data??[]);
    }catch{setError("We could not load your practices. Please try again.");}finally{setLoading(false);}
  },[client,classId,studentId]);
  useEffect(()=>{void load();},[load]);
  async function save(assignment:Assignment,progress:ExerciseProgress,finish:boolean) {
    setSaving(true);
    try{
      const {data,error:e}=await client.rpc("save_exercise_progress",{p_assignment_id:assignment.id,p_progress:progress,p_complete:finish});
      if(e)throw e;
      const record={assignment_id:assignment.id,student_id:studentId,progress,completed_at:data as string|null};
      setRecords(current=>[...current.filter(x=>x.assignment_id!==assignment.id),record]);
    }finally{setSaving(false);}
  }
  const assignment=assignments.find(x=>x.id===selected);
  const record=records.find(x=>x.assignment_id===selected);
  return <section className="exercises-section" aria-labelledby="student-exercises-heading">
    <header className="exercise-section-heading"><div><p className="eyebrow">Your next discovery</p><h2 id="student-exercises-heading">Reading quests</h2></div>
      {!assignment&&<button className="text-button" disabled={loading||saving} onClick={()=>void load()}>Refresh practices</button>}</header>
    {error?<p className="error-message" role="alert">{error}</p>:loading?<p role="status">Loading your practices...</p>:assignment?<div ref={playerArea}>
      <button className="back-button" disabled={saving} onClick={()=>setSelected(null)}>← All practices</button>
      <ExercisePlayer key={assignment.id} content={assignment.content} assignmentId={assignment.id} initialProgress={record?.progress} completed={Boolean(record?.completed_at)} onSave={(p,f)=>save(assignment,p,f)}/>
    </div>:assignments.length===0?<p>Your teacher hasn’t assigned a practice yet. Check back soon.</p>:<div className="exercise-grid" ref={listArea}>{assignments.map(a=>{
      const p=records.find(x=>x.assignment_id===a.id);return <article className="exercise-card" key={a.id}>
        <p className="eyebrow">{p?.completed_at?"Quest complete":p?"Keep going":"New quest"}</p><h3>{a.content.title}</h3><p>{strategies[a.content.strategy].name}</p>
        <p>{p?completedChallenges(a.content,p.progress):0} / {exerciseChallenges(a.content).length} words solved</p>
        <button className="primary-button" data-assignment={a.id} onClick={()=>setSelected(a.id)}>{p?.completed_at?"Review practice":p?"Continue practice":"Start practice"}</button></article>;
    })}</div>}
  </section>;
}
