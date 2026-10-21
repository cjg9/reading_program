import { useEffect, useMemo, useRef, useState } from "react";
import { exerciseChallenges, cleanWord, completedChallenges, correctAnswer, emptyProgress, passageSentences, splitPassage, strategies, type ExerciseContent, type ExerciseProgress } from "../lib/exercises";
import {ReadAloud} from "./ReadAloud";

interface Props {
  content:ExerciseContent;
  initialProgress?:ExerciseProgress;
  completed?:boolean;
  preview?:boolean;
  assignmentId?:string;
  onSave?:(progress:ExerciseProgress,finish:boolean)=>Promise<void>;
}
export function ExercisePlayer({content,initialProgress,completed=false,preview=false,assignmentId,onSave}:Props) {
  const challenges=useMemo(()=>exerciseChallenges(content),[content]);
  const [progress,setProgress]=useState(initialProgress??emptyProgress());
  const [selected,setSelected]=useState<number|undefined>(undefined);
  const [answer,setAnswer]=useState(selected===undefined?"":initialProgress?.answers[selected]??"");
  const [showCount,setShowCount]=useState(false);
  const [reread,setReread]=useState<{parts:{text:string;index:number}[];requestId:number}|undefined>();
  const tokens=useMemo(()=>splitPassage(content.passage),[content.passage]);
  const sentences=useMemo(()=>passageSentences(content.passage),[content.passage]);
  const [spoken,setSpoken]=useState<number|null>(null);
  const [busy,setBusy]=useState(false);
  const [finished,setFinished]=useState(completed);
  const [feedback,setFeedback]=useState("");
  const [error,setError]=useState("");
  const answerInput=useRef<HTMLInputElement>(null);
  const focusAnswer=useRef(false);
  useEffect(()=>{if(focusAnswer.current){answerInput.current?.focus();focusAnswer.current=false;}},[selected]);
  const active=challenges.find(c=>c.index===selected);
  const solved=completedChallenges(content,progress);
  const byIndex=new Map(challenges.map(c=>[c.index,c]));
  const spokenParts=useMemo(()=>splitPassage(content.passage).map((token,index)=>{
    const c=challenges.find(c=>c.index===index);
    if(!c||correctAnswer(progress.answers[index]??"",c.word))return {text:token,index};
    const text=c.effect==="missing"?"blank":c.effect==="endings"?c.shown.replace(/_/g,""):c.shown.replace(/_/g," blank ");
    return {text:`${token.match(/^[^\p{L}\p{N}]*/u)?.[0]??""}${text}${token.match(/[^\p{L}\p{N}]*$/u)?.[0]??""}`,index};
  }),[content.passage,challenges,progress.answers]);
  function select(index:number) { focusAnswer.current=true;setSelected(index); setAnswer(progress.answers[index]??""); setFeedback(""); setError(""); answerInput.current?.focus(); }
  async function persist(next:ExerciseProgress,finish=false) {
    if(busy) return false;
    setBusy(true); setError("");
    try { await onSave?.(next,finish); setProgress(next); if(finish)setFinished(true); return true; }
    catch { setError("Your progress could not be saved. Check your connection and try again. Your answer is still here."); return false; }
    finally { setBusy(false); }
  }
  async function check() {
    if(!active || !answer.trim())return;
    const next={...progress,answers:{...progress.answers,[active.index]:cleanWord(answer.trim())}};
    if(await persist(next)) {
      if(correctAnswer(answer,active.word)){
        setFeedback("Correct, you got it! Listen to the sentence with your corrected word.");
        const sentence=sentences.find(s=>active.index>=s.start&&active.index<=s.end);
        if(sentence)setReread(current=>({parts:tokens.flatMap((text,index)=>index>=sentence.start&&index<=sentence.end?[{text,index}]:[]),requestId:(current?.requestId??0)+1}));
      }else setFeedback("Not quite yet. Reread the sentence or try a hint.");
    }
  }
  async function hint() {
    if(!active)return;
    await persist({...progress,hints:[...new Set([...progress.hints,active.index])]});
  }
  return <section className="exercise-player" aria-label="Reading activity">
    <div className="exercise-player-heading"><div><p className="eyebrow">{preview?"Teacher preview":"Word quest"}</p><h2>{content.title}</h2></div>
      <span className="exercise-count">{solved} / {challenges.length} solved</span></div>
    <p>{strategies[content.strategy].instruction} {content.strategy==="endings"?"Listen for words that sound unfinished. Hover over or select a word to reveal the missing spaces, then type the complete word.":"Look for puzzle words as you read. Select one, type the original, and check your answer."}</p>
    <button type="button" className="text-button" aria-expanded={showCount} onClick={()=>setShowCount(value=>!value)}>How many puzzle words?</button>
    {showCount&&<p className="word-hint">There {challenges.length===1?"is":"are"} {challenges.length} puzzle {challenges.length===1?"word":"words"} in this practice.</p>}
    <ReadAloud content={{...content,challenges}} answers={progress.answers} parts={spokenParts} assignmentId={assignmentId} onWord={setSpoken} sentence={reread}/>
    <progress aria-label="Words solved" value={solved} max={Math.max(challenges.length,1)} />
    <div className={`exercise-play-area ${finished?"is-finished":""}`}><div className="reading-passage">{(()=>{
      const renderToken=(token:string,index:number)=>{
      const challenge=byIndex.get(index);
      if(!challenge)return <span key={index} className={spoken===index&&token.trim()?"reading-token is-spoken":"reading-token"}>{token}</span>;
      const done=correctAnswer(progress.answers[index]??"",challenge.word);
      return <span key={index}>{token.match(/^[^\p{L}\p{N}]*/u)?.[0]}<button type="button" disabled={busy}
        className={`reading-word ${challenge.effect==="endings"&&!done?"missing-ending":""} ${done?"is-solved":""} ${selected===index?"is-selected":""} ${spoken===index?"is-spoken":""}`}
        aria-label={done?`Solved word: ${challenge.word}`:`Challenge ${challenges.indexOf(challenge)+1}: ${challenge.effect==='missing'?'missing word':challenge.shown}`}
        aria-pressed={selected===index} onClick={()=>select(index)}>
        {done?token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu,""):challenge.effect==="endings"?<>{token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu,"").slice(0,challenge.shown.replace(/_/g,"").length)}<span className="ending-spaces">{challenge.shown.match(/_+$/)?.[0]}</span></>:challenge.effect==="upside"&&challenge.sentenceStart===undefined?<span className="word-upside">{challenge.shown}</span>:challenge.shown}
      </button>{challenge.effect==="synonym"&&content.vocabulary[challenge.word]?.definition&&<span className="synonym-definition"> [{content.vocabulary[challenge.word].definition}]</span>}{token.match(/[^\p{L}\p{N}]*$/u)?.[0]}</span>;
      };
      const groups=new Map<number,{end:number;indexes:number[]}>();
      for(const challenge of challenges){
        if(challenge.sentenceStart===undefined||challenge.sentenceEnd===undefined)continue;
        const group=groups.get(challenge.sentenceStart)??{end:challenge.sentenceEnd,indexes:[]};
        group.indexes.push(challenge.index);groups.set(challenge.sentenceStart,group);
      }
      const paragraphs:{start:number;end:number}[]=[];
      let start=0;
      tokens.forEach((token,index)=>{
        if(/(?:\r?\n[\t ]*){2,}/.test(token)){
          if(tokens.slice(start,index).some(text=>text.trim()))paragraphs.push({start,end:index-1});
          start=index+1;
        }
      });
      if(tokens.slice(start).some(text=>text.trim()))paragraphs.push({start,end:tokens.length-1});
      return paragraphs.map(({start,end},paragraph)=>{
      const count=challenges.filter(challenge=>challenge.index>=start&&challenge.index<=end).length;
      const passage=[];
      for(let index=start;index<=end;index++){
        const group=groups.get(index);
        if(group){
          const done=group.indexes.every(i=>correctAnswer(progress.answers[i]??"",byIndex.get(i)!.word));
          passage.push(<span key={index} className={done?"restored-sentence":"sentence-upside"}>{tokens.slice(index,group.end+1).map((token,offset)=>renderToken(token,index+offset))}</span>);
          index=group.end;
        }else passage.push(renderToken(tokens[index],index));
      }
      return <div className="practice-paragraph" key={start}><span className="paragraph-word-count">Paragraph {paragraph+1} · {count} practice {count===1?"word":"words"}</span><p>{passage}</p></div>;
      });
    })()}</div>
    {!finished&&!active&&<p className="word-answer people-help">Look for a puzzle word in the passage and select it to begin.</p>}
    {!finished && active && <form className="word-answer" onSubmit={event=>{event.preventDefault(); void check();}}>
      <label htmlFor="word-answer">Original word for challenge {challenges.indexOf(active)+1}</label>
      <div className="exercise-actions"><input ref={answerInput} id="word-answer" value={answer} maxLength={100} autoComplete="off" autoCapitalize="none" spellCheck={false}
        disabled={busy} onChange={event=>{setAnswer(event.target.value);setFeedback("");}} />
        <button type="submit" className="primary-button" disabled={busy||!answer.trim()}>{busy?"Saving...":"Check answer"}</button>
        <button type="button" className="secondary-button" disabled={busy||progress.hints.includes(active.index)} onClick={()=>void hint()}>Hint</button></div>
      {progress.hints.includes(active.index) && <p className="word-hint">Starts with “{active.word[0]}” and has {active.word.length} letters.
        {content.vocabulary[active.word]?.definition && ` ${content.vocabulary[active.word].definition}`}</p>}
      <p className="people-help">{preview?"Preview only. Answers do not create student records.":"Checked answers and hints are saved. You can return to this practice later."}</p>
      <div role="status">{feedback && <p>{feedback}</p>}</div>

    </form>}</div>
    <div role="status">{finished && <p className="exercise-finished">Quest complete! You restored all {challenges.length} words.</p>}</div>
    {error && <p role="alert" className="error-message">{error}</p>}
    {!finished && <button type="button" className="primary-button" disabled={busy||solved!==challenges.length||!challenges.length}
      onClick={()=>void persist(progress,true)}>Finish practice</button>}
  </section>;
}
