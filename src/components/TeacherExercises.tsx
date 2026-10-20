import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildChallenges, exerciseChallenges, completedChallenges, strategies, validateExercise, passageLibrary, splitPassage, type Assignment, type Exercise, type ExerciseContent, type ProgressRecord, type Strategy } from "../lib/exercises";
import { ExercisePlayer } from "./ExercisePlayer";
import {ReadAloud} from "./ReadAloud";
import {prepareNarration} from "../lib/narration";
import type { TeacherClass } from "../lib/classes";

function reveal(node:HTMLElement|null) {node?.focus({preventScroll:true});node?.scrollIntoView?.({block:"start",behavior:window.matchMedia?.("(prefers-reduced-motion: reduce)").matches?"instant":"smooth"});}
function PlainPassage({content}:{content:ExerciseContent}) {
  const parts=useMemo(()=>splitPassage(content.passage).map((text,index)=>({text,index})),[content.passage]);
  const [spoken,setSpoken]=useState<number|null>(null);
  return <><h3>{content.title}</h3><ReadAloud parts={parts} onWord={setSpoken}/><div className="reading-passage plain-passage">{parts.map(part=><span key={part.index} className={spoken===part.index&&part.text.trim()?"reading-token is-spoken":"reading-token"}>{part.text}</span>)}</div></>;
}

const blank=():ExerciseContent=>({title:"",passage:"",strategy:"missing",mode:"type",targetWords:[],vocabulary:{}});
export function TeacherExercises({client,classes}:{client:SupabaseClient;classes:TeacherClass[]}) {
  const classKey=classes.map(c=>c.id).join(",");
  const [selectedClasses,setSelectedClasses]=useState<number[]>([]);
  const [filter,setFilter]=useState("");
  const [library,setLibrary]=useState<Exercise[]>([]);
  const [assigned,setAssigned]=useState<Assignment[]>([]);
  const [progress,setProgress]=useState<ProgressRecord[]>([]);
  const [roster,setRoster]=useState<{class_id:number;student_id:string;email:string;first_name:string|null;last_name:string|null}[]>([]);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [editor,setEditor]=useState<ExerciseContent|null>(null);
  const [editingId,setEditingId]=useState<string|null>(null);
  const [targets,setTargets]=useState("");
  const [priorityWords,setPriorityWords]=useState("");
  const [clues,setClues]=useState("");
  const [preview,setPreview]=useState<ExerciseContent|null>(null);
  const [plainPreview,setPlainPreview]=useState(false);
  const [previewAssignment,setPreviewAssignment]=useState<string|undefined>();
  const editorRef=useRef<HTMLFormElement>(null);
  const previewRef=useRef<HTMLDivElement>(null);
  const editing=Boolean(editor);
  useEffect(()=>{if(editing)reveal(editorRef.current);},[editing]);
  useEffect(()=>{if(preview)reveal(previewRef.current);},[preview]);
  function showPreview(content:ExerciseContent,plain=false,assignmentId?:string){setPreviewAssignment(assignmentId);setPlainPreview(plain);setPreview({...content});}
  const [showLibrary,setShowLibrary]=useState(true);
  const [results,setResults]=useState<string|null>(null);
  const [archiveTarget,setArchiveTarget]=useState<string|null>(null);
  const [deleteTarget,setDeleteTarget]=useState<string|null>(null);
  const load=useCallback(async()=>{
    setLoading(true); setError("");
    try {
      const classIds=classKey?classKey.split(",").map(Number):[];
      const [l,a,rosters]=await Promise.all([
        client.from("reading_exercises").select("id,teacher_id,preset_key,content").order("created_at",{ascending:true}),
        classIds.length?client.from("exercise_assignments").select("id,class_id,content,created_at,archived_at,narration_id").in("class_id",classIds).is("archived_at",null).order("created_at",{ascending:false}):Promise.resolve({data:[],error:null}),
        Promise.all(classIds.map(async classId=>{
          const result=await client.rpc("class_roster_named",{p_class_id:classId});
          return {...result,data:(result.data??[]).map((student:Omit<typeof roster[number],"class_id">)=>({...student,class_id:classId}))};
        })),
      ]);
      if(l.error||a.error||rosters.some(r=>r.error))throw new Error();
      const assignments=(a.data??[]) as Assignment[];
      const p=assignments.length?await client.from("exercise_progress").select("assignment_id,student_id,progress,completed_at").in("assignment_id",assignments.map(x=>x.id)):{data:[],error:null};
      if(p.error)throw new Error();
      setLibrary(l.data??[]);setAssigned(assignments);setRoster(rosters.flatMap(r=>r.data));setProgress(p.data??[]);
    }catch{setError("We could not load practices. Please refresh and try again.");}finally{setLoading(false);}
  },[client,classKey]);
  useEffect(()=>{void load();},[load]);
  function openEditor(exercise?:Exercise,editExisting=false) {
    setEditingId(editExisting&&exercise?.teacher_id?exercise.id:null);
    const content=exercise?structuredClone(exercise.content):blank();
    delete content.challenges;
    delete content.sentenceNumbers;
    if(exercise){content.sourceTitle??=content.title.split(" · ")[0];content.sourcePassage??=content.passage;}
    setEditor(content);
    setTargets(content.targetWords.join(", "));
    setPriorityWords((content.priorityWords??Object.keys(content.vocabulary)).join(", "));
    setClues(Object.entries(content.vocabulary).map(([word,v])=>`${word} | ${v.synonym} | ${v.definition}`).join("\n"));
    setPreview(null);setError("");setNotice("");
    if(editor)reveal(editorRef.current);
  }
  function editedContent():ExerciseContent|null {
    if(!editor)return null;
    const vocabulary:ExerciseContent["vocabulary"]={};
    for(const line of clues.split(/\r?\n/).filter(x=>x.trim())){
      const cells=line.split("|").map(x=>x.trim());
      if(cells.length!==3||cells.some(x=>!x)){setError("Use one clue per line: word | synonym | definition.");return null;}
      vocabulary[cells[0].toLowerCase()]={synonym:cells[1],definition:cells[2]};
    }
    const content={...editor,title:editor.title.trim(),passage:editor.passage.trim(),sourceTitle:editor.sourceTitle??editor.title.trim(),sourcePassage:editor.sourcePassage??editor.passage.trim(),priorityWords:priorityWords.split(",").map(x=>x.trim()).filter(Boolean),targetWords:targets.split(",").map(x=>x.trim()).filter(Boolean),vocabulary};
    const invalid=validateExercise(content);if(invalid){setError(invalid);return null;}return content;
  }
  async function save(){
    const content=editedContent();if(!content||busy)return;
    setBusy(true);setError("");
    try{
      const {error:e}=await client.rpc("save_reading_exercise",{p_content:{...content,challenges:buildChallenges(content)},p_exercise_id:editingId});
      if(e)throw e;setEditor(null);setPreview(null);setShowLibrary(true);setNotice(editingId?"Practice updated. Existing classroom assignments keep their current version.":"Practice saved to your library. Assign it when you’re ready.");await load();
    }catch{setError("We could not save the practice. Your draft is still here; please try again.");}finally{setBusy(false);}
  }
  async function assign(exercise:Exercise){
    const destinations=classes.filter(c=>selectedClasses.includes(c.id));
    if(busy||!destinations.length)return;setBusy(true);setError("");setNotice("");
    let publicationId:string;
    setNotice("Preparing the complete narration before publishing. Please keep this page open.");
    try{publicationId=await prepareNarration(client,exercise.id);}
    catch(cause){setNotice("");setError(cause instanceof Error?cause.message:"Narration could not be prepared. The exercise has not been published.");setBusy(false);return;}
    const failed:string[]=[];
    let succeeded=0;
    for(const classroom of destinations){
      try{const {error:e}=await client.rpc("assign_reading_exercise",{p_class_id:classroom.id,p_exercise_id:exercise.id,p_narration_id:publicationId});if(e)throw e;succeeded++;}
      catch{failed.push(classroom.name);}
    }
    await load();
    if(succeeded)setNotice(`“${exercise.content.title}” assigned to ${succeeded} ${succeeded===1?"class":"classes"}.`);
    if(failed.length)setError(`Could not assign to ${failed.join(", ")}. Please try again.${succeeded?" Other assignments were saved.":""}`);
    setBusy(false);
  }
  async function deletePractice(exercise:Exercise){
    if(busy)return;
    setBusy(true);setError("");setNotice("");
    try{
      const {error:e}=await client.rpc("delete_reading_exercise",{p_exercise_id:exercise.id});
      if(e)throw e;
      setLibrary(current=>current.filter(item=>item.id!==exercise.id));
      setDeleteTarget(null);setPreview(null);
      setNotice(`“${exercise.content.title}” deleted from your saved practices.`);
    }catch{setError("We could not delete this practice. Please try again.");}finally{setBusy(false);}
  }
  async function unassign(id:string){
    setBusy(true);setError("");
    try{const {error:e}=await client.rpc("unassign_reading_exercise",{p_assignment_id:id});if(e)throw e;
      setArchiveTarget(null);setNotice("Practice unassigned. Saved student work is retained.");await load();
    }catch{setError("We could not unassign this practice. Please try again.");}finally{setBusy(false);}
  }
  return <section className="exercises-section" aria-labelledby="exercises-heading">
    <header className="exercise-section-heading"><div><p className="eyebrow">Make reading a discovery</p><h2 id="exercises-heading">Your practice library</h2><p>Create a practice once, then distribute it to any of your classrooms.</p></div>
      <div className="exercise-actions"><button className="primary-button" disabled={busy||loading} onClick={()=>openEditor()}>Create practice</button>
        <button className="secondary-button" aria-expanded={showLibrary} disabled={busy} onClick={()=>setShowLibrary(x=>!x)}>Passage library</button>
        <button className="text-button" disabled={busy||loading} onClick={()=>void load()}>Refresh practices</button></div></header>
    {error&&<p className="error-message" role="alert">{error}</p>}{notice&&<p className="success-message" role="status">{notice}</p>}
    {editor && <form ref={editorRef} tabIndex={-1} className="exercise-editor" aria-label="Practice editor" onSubmit={e=>{e.preventDefault();void save();}}>
      <h3>{editingId?"Edit practice":editor.sourceTitle?"Customize practice":"Create practice"}</h3><p>{editingId?"Save changes updates this saved practice. Existing classroom assignments keep their current version.":"Save creates a new practice. Your original stays in the library."} Unsaved changes are discarded when you leave this section.</p>
      <fieldset disabled={busy}><label htmlFor="exercise-title">Title</label><input id="exercise-title" maxLength={120} value={editor.title} onChange={e=>setEditor({...editor,title:e.target.value})}/>
      <label htmlFor="exercise-passage">Reading passage</label><textarea id="exercise-passage" rows={9} maxLength={20000} value={editor.passage} onChange={e=>setEditor({...editor,passage:e.target.value})}/>
      <div className="exercise-fields"><div><label htmlFor="exercise-game">Reading game</label><select id="exercise-game" value={editor.strategy} onChange={e=>setEditor({...editor,strategy:e.target.value as Strategy})}>
        {Object.entries(strategies).map(([key,value])=><option key={key} value={key}>{value.name}</option>)}</select></div>
        <div><label htmlFor="exercise-targets">Target words (optional)</label><input id="exercise-targets" disabled={editor.strategy==="upside"} value={targets} onChange={e=>setTargets(e.target.value)} placeholder="attentive, chaos, posture"/></div></div>
      <p className="people-help">{editor.strategy==="upside"?"One complete sentence per paragraph is flipped, with every word in those sentences becoming a puzzle word. Up to 40 puzzle words per practice.":"Separate target words with commas, or leave blank to choose automatically, favoring vocabulary words. Up to 40 puzzle words per passage."}</p>
      <label htmlFor="priority-words">Vocabulary words to practice more often</label><input id="priority-words" disabled={editor.strategy==="upside"} value={priorityWords} onChange={e=>setPriorityWords(e.target.value)} placeholder="attentive, chaos, posture"/><p className="people-help">These words are favored when target words are selected automatically and fit the chosen game.</p>
      <details open={editor.strategy==="synonym"||editor.strategy==="definition"}><summary>Vocabulary clues (optional for other games)</summary>
        <label htmlFor="exercise-clues">One per line: word | synonym | definition</label><textarea id="exercise-clues" rows={4} value={clues} onChange={e=>setClues(e.target.value)} placeholder="attentive | watchful | Paying close attention."/></details>
      <div className="exercise-actions"><button className="primary-button" type="submit">{busy?"Saving...":editingId?"Save changes":"Save practice"}</button>
        <button className="secondary-button" type="button" onClick={()=>{const c=editedContent();if(c){setError("");showPreview(c);}}}>Preview game</button>
        <button className="text-button" type="button" onClick={()=>{setEditor(null);setPreview(null);setError("");}}>Cancel editing</button></div></fieldset></form>}
    {showLibrary&&!loading&&<div className="exercise-library"><h3>Passage library</h3><p className="people-help">Start with an original passage, then choose a reading game. Each passage appears once.</p>
      <div className="exercise-grid">{passageLibrary(library).map(exercise=><article className="exercise-card" key={exercise.id}>
        <p className="eyebrow">Original passage</p><h4>{exercise.content.title}</h4><p className="passage-excerpt">{exercise.content.passage.slice(0,180)}…</p><div className="exercise-actions">
          <button className="text-button" disabled={busy} onClick={()=>{setEditor(null);showPreview(exercise.content,true);}}>Preview passage</button>
          <button className="primary-button" disabled={busy} onClick={()=>openEditor(exercise)}>Customize</button></div></article>)}</div></div>}
    {!loading&&<div className="exercise-library"><h3>Saved practices</h3><p className="people-help">Choose classrooms below, then distribute any saved practice.</p>
      {classes.length?<fieldset className="practice-destinations" disabled={busy}><legend>Distribute to classrooms</legend>{classes.map(classroom=><label key={classroom.id}><input type="checkbox" checked={selectedClasses.includes(classroom.id)} onChange={event=>setSelectedClasses(current=>event.target.checked?[...current,classroom.id]:current.filter(id=>id!==classroom.id))}/>{classroom.name}</label>)}</fieldset>:<p>Create a classroom in My Classrooms when you’re ready to distribute practices. You can create and save practices now.</p>}
      {library.some(e=>e.teacher_id)?<div className="saved-practices">{library.filter(e=>e.teacher_id).map(exercise=><article className="saved-practice" key={exercise.id}><div><h4>{exercise.content.title}</h4><p>{strategies[exercise.content.strategy].name} · {exerciseChallenges(exercise.content).length} words to solve</p></div><div className="exercise-actions"><button className="primary-button" disabled={busy||loading||!classes.some(c=>selectedClasses.includes(c.id))} onClick={()=>void assign(exercise)}>{busy?"Assigning…":"Assign to selected classes"}</button><button className="text-button" onClick={()=>{setEditor(null);showPreview(exercise.content);}}>Preview</button><button className="text-button" disabled={busy} onClick={()=>openEditor(exercise,true)}>Edit practice</button><button className="text-button" disabled={busy} onClick={()=>openEditor(exercise)}>Customize a copy</button><button className="text-button danger-button" disabled={busy} onClick={()=>{setDeleteTarget(exercise.id);setError("");}}>Delete practice</button></div>{deleteTarget===exercise.id&&<div className="exercise-confirm"><p>Delete “{exercise.content.title}” from your saved practices? Existing classroom assignments and student work will be kept. This cannot be undone.</p><button className="secondary-button danger-button" disabled={busy} onClick={()=>void deletePractice(exercise)}>{busy?"Deleting…":"Confirm delete"}</button> <button className="text-button" disabled={busy} onClick={()=>setDeleteTarget(null)}>Cancel</button></div>}</article>)}</div>:<p>No saved practices yet. Customize a passage to create your first.</p>}</div>}
    {!loading&&assigned.length>0&&!assigned.some(a=>a.content.title.toLowerCase().includes(filter.toLowerCase()))&&<p>No practices match your search.</p>}
    {preview&&<div ref={previewRef} tabIndex={-1} className="exercise-preview" aria-label="Practice preview"><button className="text-button" onClick={()=>setPreview(null)}>Close preview</button>{plainPreview?<PlainPassage content={preview}/>:<ExercisePlayer key={JSON.stringify(preview)+previewAssignment} content={preview} assignmentId={previewAssignment} preview/>}</div>}
    <h3>Classroom assignments</h3><label className="search-field"><img src="/design/search.svg" alt=""/><span className="sr-only">Filter practices</span><input value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Filter practices..."/></label>{loading?<p role="status">Loading practices...</p>:assigned.length===0?<p>No practices assigned yet. Save a practice, choose classrooms, and assign it above.</p>:
      <div className="exercise-grid assigned-exercises">{assigned.filter(a=>a.content.title.toLowerCase().includes(filter.toLowerCase())).map(a=>{
        const classRoster=roster.filter(s=>s.class_id===a.class_id);
        const records=progress.filter(p=>p.assignment_id===a.id&&classRoster.some(s=>s.student_id===p.student_id));
        return <article className="exercise-card assigned-exercise" key={a.id}><img className="exercise-type-icon" src="/design/exercise.svg" alt=""/><h4>{a.content.title}</h4><p className="eyebrow">{classes.find(c=>c.id===a.class_id)?.name}</p><p>{strategies[a.content.strategy].name}</p>
          <p>{records.filter(p=>p.completed_at).length} of {classRoster.length} students finished</p><div className="exercise-actions">
            <button className="secondary-button" onClick={()=>setResults(results===a.id?null:a.id)}>Student progress</button>
            <button className="text-button" onClick={()=>showPreview(a.content,false,a.narration_id?a.id:undefined)}>Preview</button>
            <button className="text-button danger-button" disabled={busy} onClick={()=>setArchiveTarget(a.id)}>Unassign</button></div>
          {archiveTarget===a.id&&<div className="exercise-confirm"><p>Remove this practice from students’ class page? Their saved work will be retained.</p><button className="secondary-button" disabled={busy} onClick={()=>void unassign(a.id)}>Confirm unassign</button> <button className="text-button" disabled={busy} onClick={()=>setArchiveTarget(null)}>Cancel</button></div>}
          {results===a.id&&<ul className="exercise-results">{classRoster.length?classRoster.map(s=>{const p=records.find(x=>x.student_id===s.student_id);return <li key={s.student_id}><span>{s.first_name?`${s.first_name} ${s.last_name??""}`:s.email}</span><span>{p?.completed_at?"Finished":p?`${completedChallenges(a.content,p.progress)} / ${exerciseChallenges(a.content).length} solved`:"Not started"}{p?.progress.hints.length?` · ${p.progress.hints.length} hints`:""}</span></li>}):<li>No students have joined yet.</li>}</ul>}
        </article>;
      })}</div>}
  </section>;
}

