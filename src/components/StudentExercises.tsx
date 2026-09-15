import { useCallback, useEffect, useState } from "react";
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
  const load=useCallback(async()=>{
    setLoading(true);setError("");
    try {
      const a=await client.from("exercise_assignments").select("id,class_id,content,created_at,archived_at").eq("class_id",classId).is("archived_at",null).order("created_at",{ascending:false});
      if(a.error)throw a.error;
      const items=(a.data??[]) as Assignment[];
      const p=items.length?await client.from("exercise_progress").select("assignment_id,student_id,progress,completed_at").eq("student_id",studentId).in("assignment_id",items.map(x=>x.id)):{data:[],error:null};
      if(p.error)throw p.error;setAssignments(items);setRecords(p.data??[]);
    }catch{setError("We could not load your exercises. Please try again.");}finally{setLoading(false);}
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
      <button className="text-button" disabled={loading||saving} onClick={()=>{setSelected(null);void load();}}>Refresh exercises</button></header>
    {error?<p className="error-message" role="alert">{error}</p>:loading?<p role="status">Loading your exercises...</p>:assignment?<>
      <button className="back-button" disabled={saving} onClick={()=>setSelected(null)}>← All exercises</button>
      <ExercisePlayer key={assignment.id} content={assignment.content} initialProgress={record?.progress} completed={Boolean(record?.completed_at)} onSave={(p,f)=>save(assignment,p,f)}/>
    </>:assignments.length===0?<p>Your teacher hasn’t assigned an exercise yet. Check back soon.</p>:<div className="exercise-grid">{assignments.map(a=>{
      const p=records.find(x=>x.assignment_id===a.id);return <article className="exercise-card" key={a.id}>
        <p className="eyebrow">{p?.completed_at?"Quest complete":p?"Keep going":"New quest"}</p><h3>{a.content.title}</h3><p>{strategies[a.content.strategy].name}</p>
        <p>{p?completedChallenges(a.content,p.progress):0} / {exerciseChallenges(a.content).length} words solved</p>
        <button className="primary-button" onClick={()=>setSelected(a.id)}>{p?.completed_at?"Review exercise":p?"Continue exercise":"Start exercise"}</button></article>;
    })}</div>}
  </section>;
}
