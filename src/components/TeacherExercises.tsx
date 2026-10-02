import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildChallenges, exerciseChallenges, completedChallenges, strategies, validateExercise, passageLibrary, passageSentences, parseSentenceNumbers, splitPassage, type Assignment, type Exercise, type ExerciseContent, type ProgressRecord, type Strategy } from "../lib/exercises";
import { ExercisePlayer } from "./ExercisePlayer";
import {ReadAloud} from "./ReadAloud";

function reveal(node:HTMLElement|null) {node?.focus({preventScroll:true});node?.scrollIntoView?.({block:"start",behavior:window.matchMedia?.("(prefers-reduced-motion: reduce)").matches?"instant":"smooth"});}
function PlainPassage({content}:{content:ExerciseContent}) {
  const parts=useMemo(()=>splitPassage(content.passage).map((text,index)=>({text,index})),[content.passage]);
  return <><h3>{content.title}</h3><ReadAloud parts={parts}/><div className="reading-passage plain-passage">{content.passage}</div></>;
}

const blank=():ExerciseContent=>({title:"",passage:"",strategy:"missing",mode:"type",targetWords:[],vocabulary:{}});
export function TeacherExercises({client,classId,active=true}:{client:SupabaseClient;classId:number;active?:boolean}) {
  const [filter,setFilter]=useState("");
  const [library,setLibrary]=useState<Exercise[]>([]);
  const [assigned,setAssigned]=useState<Assignment[]>([]);
  const [progress,setProgress]=useState<ProgressRecord[]>([]);
  const [roster,setRoster]=useState<{student_id:string;email:string;first_name:string|null;last_name:string|null}[]>([]);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [editor,setEditor]=useState<ExerciseContent|null>(null);
  const [targets,setTargets]=useState("");
  const [priorityWords,setPriorityWords]=useState("");
  const [sentenceRange,setSentenceRange]=useState("");
  const [clues,setClues]=useState("");
  const [preview,setPreview]=useState<ExerciseContent|null>(null);
  const [plainPreview,setPlainPreview]=useState(false);
  const editorRef=useRef<HTMLFormElement>(null);
  const previewRef=useRef<HTMLDivElement>(null);
  const editing=Boolean(editor);
  useEffect(()=>{if(editing)reveal(editorRef.current);},[editing]);
  useEffect(()=>{if(preview)reveal(previewRef.current);},[preview]);
  useEffect(()=>{if(!active){setEditor(null);setPreview(null);setError("");}},[active]);
  function showPreview(content:ExerciseContent,plain=false){setPlainPreview(plain);setPreview({...content});}
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
    }catch{setError("We could not load practices. Please refresh and try again.");}finally{setLoading(false);}
  },[client,classId]);
  useEffect(()=>{if(active)void load();},[load,active]);
  function openEditor(exercise?:Exercise) {
    const content=exercise?structuredClone(exercise.content):blank();
    delete content.challenges;
    if(exercise){content.sourceTitle??=content.title.split(" · ")[0];content.sourcePassage??=content.passage;}
    setEditor(content);
    setTargets(content.targetWords.join(", "));
    setPriorityWords((content.priorityWords??Object.keys(content.vocabulary)).join(", "));
    setSentenceRange(content.sentenceNumbers?.join(", ")??"");
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
    const sentenceNumbers=editor.strategy==="upside"?parseSentenceNumbers(sentenceRange,passageSentences(editor.passage).length):[];
    if(sentenceNumbers===null){setError("Enter valid sentence numbers or ranges, such as 1, 3–6.");return null;}
    const content={...editor,title:editor.title.trim(),passage:editor.passage.trim(),sourceTitle:editor.sourceTitle??editor.title.trim(),sourcePassage:editor.sourcePassage??editor.passage.trim(),sentenceNumbers,priorityWords:priorityWords.split(",").map(x=>x.trim()).filter(Boolean),targetWords:targets.split(",").map(x=>x.trim()).filter(Boolean),vocabulary};
    const invalid=validateExercise(content);if(invalid){setError(invalid);return null;}return content;
  }
  async function save(){
    const content=editedContent();if(!content||busy)return;
    setBusy(true);setError("");
    try{
      const {error:e}=await client.rpc("save_reading_exercise",{p_content:{...content,challenges:buildChallenges(content)},p_exercise_id:null});
      if(e)throw e;setEditor(null);setPreview(null);setShowLibrary(true);setNotice("Practice saved to your library. Assign it when you’re ready.");await load();
    }catch{setError("We could not save the practice. Your draft is still here; please try again.");}finally{setBusy(false);}
  }
  async function assign(exercise:Exercise){
    if(busy)return;setBusy(true);setError("");
    try{const {error:e}=await client.rpc("assign_reading_exercise",{p_class_id:classId,p_exercise_id:exercise.id});if(e)throw e;
      setNotice(`“${exercise.content.title}” is assigned to this class.`);await load();
    }catch{setError("We could not assign this practice. Please try again.");}finally{setBusy(false);}
  }
  async function unassign(id:string){
    setBusy(true);setError("");
    try{const {error:e}=await client.rpc("unassign_reading_exercise",{p_assignment_id:id});if(e)throw e;
      setArchiveTarget(null);setNotice("Practice unassigned. Saved student work is retained.");await load();
    }catch{setError("We could not unassign this practice. Please try again.");}finally{setBusy(false);}
  }
  return <section className="exercises-section" aria-labelledby="exercises-heading">
    <header className="exercise-section-heading"><div><p className="eyebrow">Make reading a discovery</p><h2 id="exercises-heading">Practices</h2><p>Turn a passage into a word quest for your class.</p></div>
      <div className="exercise-actions"><button className="primary-button" disabled={busy||loading} onClick={()=>openEditor()}>Create practice</button>
        <button className="secondary-button" aria-expanded={showLibrary} disabled={busy} onClick={()=>setShowLibrary(x=>!x)}>Passage library</button>
        <button className="text-button" disabled={busy||loading} onClick={()=>void load()}>Refresh practices</button></div></header>
    {error&&<p className="error-message" role="alert">{error}</p>}{notice&&<p className="success-message" role="status">{notice}</p>}
    {editor && <form ref={editorRef} tabIndex={-1} className="exercise-editor" aria-label="Practice editor" onSubmit={e=>{e.preventDefault();void save();}}>
      <h3>{editor.sourceTitle?"Customize practice":"Create practice"}</h3><p>Save creates a new practice. Your original stays in the library. Unsaved changes are discarded when you leave this section.</p>
      <fieldset disabled={busy}><label htmlFor="exercise-title">Title</label><input id="exercise-title" maxLength={120} value={editor.title} onChange={e=>setEditor({...editor,title:e.target.value})}/>
      <label htmlFor="exercise-passage">Reading passage</label><textarea id="exercise-passage" rows={9} maxLength={20000} value={editor.passage} onChange={e=>setEditor({...editor,passage:e.target.value})}/>
      <div className="exercise-fields"><div><label htmlFor="exercise-game">Reading game</label><select id="exercise-game" value={editor.strategy} onChange={e=>{setEditor({...editor,strategy:e.target.value as Strategy});setTargets("");}}>
        {Object.entries(strategies).map(([key,value])=><option key={key} value={key}>{value.name}</option>)}</select></div>
        <div><label htmlFor="exercise-targets">Target words (optional)</label><input id="exercise-targets" value={targets} onChange={e=>setTargets(e.target.value)} placeholder="attentive, chaos, posture"/></div></div>
      <p className="people-help">Separate target words with commas, or leave blank to choose automatically, favoring vocabulary words. Up to 40 challenges per passage.</p>
      {editor.strategy==="upside"&&<div className="sentence-picker"><label htmlFor="sentence-range">Upside-down sentence numbers</label><input id="sentence-range" value={sentenceRange} onChange={e=>setSentenceRange(e.target.value)} placeholder="For example: 1, 3–6"/><p className="people-help">Leave blank to turn sentences containing target words. Students answer individual words.</p><details><summary>Show numbered sentences</summary><ol>{passageSentences(editor.passage).map(s=><li key={s.number}>{s.tokens.map(t=>t.text).join("")}</li>)}</ol></details></div>}
      <label htmlFor="priority-words">Vocabulary words to practice more often</label><input id="priority-words" value={priorityWords} onChange={e=>setPriorityWords(e.target.value)} placeholder="attentive, chaos, posture"/><p className="people-help">These words are favored when target words are selected automatically and fit the chosen game.</p>
      <details open={editor.strategy==="synonym"||editor.strategy==="definition"}><summary>Vocabulary clues (optional for other games)</summary>
        <label htmlFor="exercise-clues">One per line: word | synonym | definition</label><textarea id="exercise-clues" rows={4} value={clues} onChange={e=>setClues(e.target.value)} placeholder="attentive | watchful | Paying close attention."/></details>
      <div className="exercise-actions"><button className="primary-button" type="submit">{busy?"Saving...":"Save practice"}</button>
        <button className="secondary-button" type="button" onClick={()=>{const c=editedContent();if(c){setError("");showPreview(c);}}}>Preview game</button>
        <button className="text-button" type="button" onClick={()=>{setEditor(null);setPreview(null);setError("");}}>Cancel editing</button></div></fieldset></form>}
    {showLibrary&&!loading&&<div className="exercise-library"><h3>Passage library</h3><p className="people-help">Start with an original passage, then choose a reading game. Each passage appears once.</p>
      <div className="exercise-grid">{passageLibrary(library).map(exercise=><article className="exercise-card" key={exercise.id}>
        <p className="eyebrow">Original passage</p><h4>{exercise.content.title}</h4><p className="passage-excerpt">{exercise.content.passage.slice(0,180)}…</p><div className="exercise-actions">
          <button className="text-button" disabled={busy} onClick={()=>{setEditor(null);showPreview(exercise.content,true);}}>Preview passage</button>
          <button className="primary-button" disabled={busy} onClick={()=>openEditor(exercise)}>Customize</button></div></article>)}</div>
      <h3>Saved practices</h3><p className="people-help">Assign a saved version, or customize it to create another practice.</p>
      {library.some(e=>e.teacher_id)?<div className="saved-practices">{library.filter(e=>e.teacher_id).map(exercise=><article className="saved-practice" key={exercise.id}><div><h4>{exercise.content.title}</h4><p>{strategies[exercise.content.strategy].name} · {exerciseChallenges(exercise.content).length} words to solve</p></div><div className="exercise-actions"><button className="primary-button" disabled={busy} onClick={()=>void assign(exercise)}>Assign to class</button><button className="text-button" onClick={()=>{setEditor(null);showPreview(exercise.content);}}>Preview</button><button className="text-button" disabled={busy} onClick={()=>openEditor(exercise)}>Customize a copy</button></div></article>)}</div>:<p>No saved practices yet. Customize a passage to create your first.</p>}</div>}
    {!loading&&assigned.length>0&&!assigned.some(a=>a.content.title.toLowerCase().includes(filter.toLowerCase()))&&<p>No practices match your search.</p>}
    {preview&&<div ref={previewRef} tabIndex={-1} className="exercise-preview" aria-label="Practice preview"><button className="text-button" onClick={()=>setPreview(null)}>Close preview</button>{plainPreview?<PlainPassage content={preview}/>:<ExercisePlayer key={JSON.stringify(preview)} content={preview} preview/>}</div>}
    <h3>Assigned to this class</h3><label className="search-field"><img src="/design/search.svg" alt=""/><span className="sr-only">Filter practices</span><input value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Filter practices..."/></label>{loading?<p role="status">Loading practices...</p>:assigned.length===0?<p>No practices assigned yet. Customize a library passage or create your own.</p>:
      <div className="exercise-grid assigned-exercises">{assigned.filter(a=>a.content.title.toLowerCase().includes(filter.toLowerCase())).map(a=>{
        const records=progress.filter(p=>p.assignment_id===a.id&&roster.some(s=>s.student_id===p.student_id));
        return <article className="exercise-card assigned-exercise" key={a.id}><img className="exercise-type-icon" src="/design/exercise.svg" alt=""/><h4>{a.content.title}</h4><p>{strategies[a.content.strategy].name}</p>
          <p>{records.filter(p=>p.completed_at).length} of {roster.length} students finished</p><div className="exercise-actions">
            <button className="secondary-button" onClick={()=>setResults(results===a.id?null:a.id)}>Student progress</button>
            <button className="text-button" onClick={()=>showPreview(a.content)}>Preview</button>
            <button className="text-button danger-button" disabled={busy} onClick={()=>setArchiveTarget(a.id)}>Unassign</button></div>
          {archiveTarget===a.id&&<div className="exercise-confirm"><p>Remove this practice from students’ class page? Their saved work will be retained.</p><button className="secondary-button" disabled={busy} onClick={()=>void unassign(a.id)}>Confirm unassign</button> <button className="text-button" disabled={busy} onClick={()=>setArchiveTarget(null)}>Cancel</button></div>}
          {results===a.id&&<ul className="exercise-results">{roster.length?roster.map(s=>{const p=records.find(x=>x.student_id===s.student_id);return <li key={s.student_id}><span>{s.first_name?`${s.first_name} ${s.last_name??""}`:s.email}</span><span>{p?.completed_at?"Finished":p?`${completedChallenges(a.content,p.progress)} / ${exerciseChallenges(a.content).length} solved`:"Not started"}{p?.progress.hints.length?` · ${p.progress.hints.length} hints`:""}</span></li>}):<li>No students have joined yet.</li>}</ul>}
        </article>;
      })}</div>}
  </section>;
}
