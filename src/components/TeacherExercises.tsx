import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildChallenges, exerciseChallenges, completedChallenges, strategies, validateExercise, type Assignment, type Exercise, type ExerciseContent, type ProgressRecord, type Strategy } from "../lib/exercises";
import { ExercisePlayer } from "./ExercisePlayer";

const blank=():ExerciseContent=>({title:"",passage:"",strategy:"missing",mode:"type",targetWords:[],vocabulary:{}});
export function TeacherExercises({client,classId}:{client:SupabaseClient;classId:number}) {
  const [library,setLibrary]=useState<Exercise[]>([]);
  const [assigned,setAssigned]=useState<Assignment[]>([]);
  const [progress,setProgress]=useState<ProgressRecord[]>([]);
  const [roster,setRoster]=useState<{student_id:string;email:string;first_name:string|null;last_name:string|null}[]>([]);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [editor,setEditor]=useState<ExerciseContent|null>(null);
  const [editId,setEditId]=useState<string|null>(null);
  const [targets,setTargets]=useState("");
  const [clues,setClues]=useState("");
  const [preview,setPreview]=useState<ExerciseContent|null>(null);
  const [showLibrary,setShowLibrary]=useState(false);
  const [results,setResults]=useState<string|null>(null);
  const [archiveTarget,setArchiveTarget]=useState<string|null>(null);
  const load=useCallback(async()=>{
    setLoading(true); setError("");
    try {
      const [l,a,r]=await Promise.all([
        client.from("reading_exercises").select("id,teacher_id,preset_key,content").order("created_at",{ascending:true}),
        client.from("exercise_assignments").select("id,class_id,content,created_at,archived_at").eq("class_id",classId).is("archived_at",null).order("created_at",{ascending:false}),
        client.rpc("class_roster_named",{p_class_id:classId}),
      ]);
      if(l.error||a.error||r.error)throw new Error();
      const assignments=(a.data??[]) as Assignment[];
      const p=assignments.length?await client.from("exercise_progress").select("assignment_id,student_id,progress,completed_at").in("assignment_id",assignments.map(x=>x.id)):{data:[],error:null};
      if(p.error)throw new Error();
      setLibrary(l.data??[]);setAssigned(assignments);setRoster(r.data??[]);setProgress(p.data??[]);
    }catch{setError("We could not load exercises. Please refresh and try again.");}finally{setLoading(false);}
  },[client,classId]);
  useEffect(()=>{void load();},[load]);
  function openEditor(exercise?:Exercise) {
    const content=exercise?structuredClone(exercise.content):blank();
    delete content.challenges;
    setEditor(content);setEditId(exercise?.teacher_id?exercise.id:null);
    setTargets(content.targetWords.join(", "));
    setClues(Object.entries(content.vocabulary).map(([word,v])=>`${word} | ${v.synonym} | ${v.definition}`).join("\n"));
    setPreview(null);setError("");setNotice("");
  }
  function editedContent():ExerciseContent|null {
    if(!editor)return null;
    const vocabulary:ExerciseContent["vocabulary"]={};
    for(const line of clues.split(/\r?\n/).filter(x=>x.trim())){
      const cells=line.split("|").map(x=>x.trim());
      if(cells.length!==3||cells.some(x=>!x)){setError("Use one clue per line: word | synonym | definition.");return null;}
      vocabulary[cells[0].toLowerCase()]={synonym:cells[1],definition:cells[2]};
    }
    const content={...editor,title:editor.title.trim(),passage:editor.passage.trim(),targetWords:targets.split(",").map(x=>x.trim()).filter(Boolean),vocabulary};
    const invalid=validateExercise(content);if(invalid){setError(invalid);return null;}return content;
  }
  async function save(){
    const content=editedContent();if(!content||busy)return;
    setBusy(true);setError("");
    try{
      const {error:e}=await client.rpc("save_reading_exercise",{p_content:{...content,challenges:buildChallenges(content)},p_exercise_id:editId});
      if(e)throw e;setEditor(null);setPreview(null);setShowLibrary(true);setNotice("Exercise saved to your library. Assign it when you’re ready.");await load();
    }catch{setError("We could not save the exercise. Your draft is still here; please try again.");}finally{setBusy(false);}
  }
  async function assign(exercise:Exercise){
    if(busy)return;setBusy(true);setError("");
    try{const {error:e}=await client.rpc("assign_reading_exercise",{p_class_id:classId,p_exercise_id:exercise.id});if(e)throw e;
      setNotice(`“${exercise.content.title}” is assigned to this class.`);await load();
    }catch{setError("We could not assign this exercise. Please try again.");}finally{setBusy(false);}
  }
  async function unassign(id:string){
    setBusy(true);setError("");
    try{const {error:e}=await client.rpc("unassign_reading_exercise",{p_assignment_id:id});if(e)throw e;
      setArchiveTarget(null);setNotice("Exercise unassigned. Saved student work is retained.");await load();
    }catch{setError("We could not unassign this exercise. Please try again.");}finally{setBusy(false);}
  }
  return <section className="exercises-section" aria-labelledby="exercises-heading">
    <header className="exercise-section-heading"><div><p className="eyebrow">Make reading a discovery</p><h2 id="exercises-heading">Exercises</h2><p>Turn a passage into a word quest for your class.</p></div>
      <div className="exercise-actions"><button className="primary-button" disabled={busy||loading} onClick={()=>openEditor()}>Create exercise</button>
        <button className="secondary-button" aria-expanded={showLibrary} disabled={busy} onClick={()=>setShowLibrary(x=>!x)}>Exercise library</button>
        <button className="text-button" disabled={busy||loading} onClick={()=>void load()}>Refresh exercises</button></div></header>
    {error&&<p className="error-message" role="alert">{error}</p>}{notice&&<p className="success-message" role="status">{notice}</p>}
    {editor && <form className="exercise-editor" onSubmit={e=>{e.preventDefault();void save();}}>
      <h3>{editId?"Edit exercise":"Create exercise"}</h3><p>Saved changes apply to future assignments. Exercises already assigned keep their original version.</p>
      <fieldset disabled={busy}><label htmlFor="exercise-title">Title</label><input id="exercise-title" maxLength={120} value={editor.title} onChange={e=>setEditor({...editor,title:e.target.value})}/>
      <label htmlFor="exercise-passage">Reading passage</label><textarea id="exercise-passage" rows={9} maxLength={20000} value={editor.passage} onChange={e=>setEditor({...editor,passage:e.target.value})}/>
      <div className="exercise-fields"><div><label htmlFor="exercise-game">Reading game</label><select id="exercise-game" value={editor.strategy} onChange={e=>setEditor({...editor,strategy:e.target.value as Strategy})}>
        {Object.entries(strategies).map(([key,value])=><option key={key} value={key}>{value.name}</option>)}</select></div>
        <div><label htmlFor="exercise-targets">Target words (optional)</label><input id="exercise-targets" value={targets} onChange={e=>setTargets(e.target.value)} placeholder="attentive, chaos, posture"/></div></div>
      <p className="people-help">Separate target words with commas, or leave blank to select words automatically. Up to 40 challenges per passage.</p>
      <details open={editor.strategy==="synonym"||editor.strategy==="definition"}><summary>Vocabulary clues (optional for other games)</summary>
        <label htmlFor="exercise-clues">One per line: word | synonym | definition</label><textarea id="exercise-clues" rows={4} value={clues} onChange={e=>setClues(e.target.value)} placeholder="attentive | watchful | Paying close attention."/></details>
      <div className="exercise-actions"><button className="primary-button" type="submit">{busy?"Saving...":"Save exercise"}</button>
        <button className="secondary-button" type="button" onClick={()=>{const c=editedContent();if(c){setError("");setPreview(c);}}}>Preview game</button>
        <button className="text-button" type="button" onClick={()=>{setEditor(null);setPreview(null);setError("");}}>Cancel editing</button></div></fieldset></form>}
    {showLibrary&&!loading&&<div className="exercise-library"><h3>Choose a starting point</h3><p className="people-help">Four starter games explore a Grade 6 dog-breed passage. Customize a preset to save your own version.</p>
      <div className="exercise-grid">{library.map(exercise=><article className="exercise-card" key={exercise.id}>
        <p className="eyebrow">{exercise.preset_key?"Grade 6 · Nonfiction preset":"Your exercise"}</p><h4>{exercise.content.title}</h4><p>{strategies[exercise.content.strategy].name}</p>
        <p className="people-help">{exerciseChallenges(exercise.content).length} words to solve</p><div className="exercise-actions">
          <button className="primary-button" disabled={busy} onClick={()=>void assign(exercise)}>Assign to class</button>
          <button className="text-button" disabled={busy} onClick={()=>{setEditor(null);setPreview(exercise.content);}}>Preview</button>
          <button className="text-button" disabled={busy} onClick={()=>openEditor(exercise)}>{exercise.preset_key?"Customize":"Edit"}</button></div></article>)}</div></div>}
    {preview&&<div className="exercise-preview"><button className="text-button" onClick={()=>setPreview(null)}>Close preview</button><ExercisePlayer key={JSON.stringify(preview)} content={preview} preview/></div>}
    <h3>Assigned to this class</h3>{loading?<p role="status">Loading exercises...</p>:assigned.length===0?<p>No exercises assigned yet. Choose a preset from the exercise library or create your own.</p>:
      <div className="exercise-grid">{assigned.map(a=>{
        const records=progress.filter(p=>p.assignment_id===a.id&&roster.some(s=>s.student_id===p.student_id));
        return <article className="exercise-card" key={a.id}><h4>{a.content.title}</h4><p>{strategies[a.content.strategy].name}</p>
          <p>{records.filter(p=>p.completed_at).length} of {roster.length} students finished</p><div className="exercise-actions">
            <button className="secondary-button" onClick={()=>setResults(results===a.id?null:a.id)}>Student progress</button>
            <button className="text-button" onClick={()=>setPreview(a.content)}>Preview</button>
            <button className="text-button danger-button" disabled={busy} onClick={()=>setArchiveTarget(a.id)}>Unassign</button></div>
          {archiveTarget===a.id&&<div className="exercise-confirm"><p>Remove this exercise from students’ class page? Their saved work will be retained.</p><button className="secondary-button" disabled={busy} onClick={()=>void unassign(a.id)}>Confirm unassign</button> <button className="text-button" disabled={busy} onClick={()=>setArchiveTarget(null)}>Cancel</button></div>}
          {results===a.id&&<ul className="exercise-results">{roster.length?roster.map(s=>{const p=records.find(x=>x.student_id===s.student_id);return <li key={s.student_id}><span>{s.first_name?`${s.first_name} ${s.last_name??""}`:s.email}</span><span>{p?.completed_at?"Finished":p?`${completedChallenges(a.content,p.progress)} / ${exerciseChallenges(a.content).length} solved`:"Not started"}{p?.progress.hints.length?` · ${p.progress.hints.length} hints`:""}</span></li>}):<li>No students have joined yet.</li>}</ul>}
        </article>;
      })}</div>}
  </section>;
}
