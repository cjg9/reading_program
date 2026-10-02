import { useEffect, useMemo, useRef, useState } from "react";
import { exerciseChallenges, cleanWord, completedChallenges, correctAnswer, emptyProgress, splitPassage, passageSentences, strategies, type ExerciseContent, type ExerciseProgress } from "../lib/exercises";
import {ReadAloud} from "./ReadAloud";

interface Props {
  content:ExerciseContent;
  initialProgress?:ExerciseProgress;
  completed?:boolean;
  preview?:boolean;
  onSave?:(progress:ExerciseProgress,finish:boolean)=>Promise<void>;
}
export function ExercisePlayer({content,initialProgress,completed=false,preview=false,onSave}:Props) {
  const challenges=useMemo(()=>exerciseChallenges(content),[content]);
  const [progress,setProgress]=useState(initialProgress??emptyProgress());
  const [selected,setSelected]=useState<number|undefined>(()=>content.strategy==="endings"?undefined:challenges.find(c=>!correctAnswer(initialProgress?.answers[c.index]??"",c.word))?.index??challenges[0]?.index);
  const [answer,setAnswer]=useState(selected===undefined?"":initialProgress?.answers[selected]??"");
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
    return {text:`${token.match(/^[^\p{L}\p{N}]*/u)?.[0]??""}${text}${token.match(/[^\p{L}\p{N}]*$/u)?.[0]??""}`,index,isolate:c.effect==="endings"};
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
    if(await persist(next)) setFeedback(correctAnswer(answer,active.word)?"You found it! Choose another highlighted word to continue.":"Not quite yet. Reread the sentence or try a hint.");
  }
  async function hint() {
    if(!active)return;
    await persist({...progress,hints:[...new Set([...progress.hints,active.index])]});
  }
  return <section className="exercise-player" aria-label="Reading activity">
    <div className="exercise-player-heading"><div><p className="eyebrow">{preview?"Teacher preview":"Word quest"}</p><h2>{content.title}</h2></div>
      <span className="exercise-count">{solved} / {challenges.length} solved</span></div>
    <p>{strategies[content.strategy].instruction} {content.strategy==="endings"?"Listen for words that sound unfinished. Hover over or select a word to reveal the missing spaces, then type the complete word.":"Select a highlighted word, type the original, and check your answer."}</p>
    <ReadAloud parts={spokenParts} onWord={setSpoken}/>
    <progress aria-label="Words solved" value={solved} max={Math.max(challenges.length,1)} />
    <div className={`exercise-play-area ${finished?"is-finished":""}`}><div className="reading-passage">{passageSentences(content.passage).map(sentence=>{
      const rotated=content.strategy==="upside"&&content.sentenceNumbers?.length?content.sentenceNumbers.includes(sentence.number):sentence.tokens.some(t=>byIndex.get(t.index)?.effect==="upside");
      return <span key={sentence.number} className={rotated?"reading-sentence sentence-upside":"reading-sentence"} data-sentence={sentence.number}>{sentence.tokens.map(({text:token,index})=>{
      const challenge=byIndex.get(index);
      if(!challenge)return <span key={index}>{token}</span>;
      const done=correctAnswer(progress.answers[index]??"",challenge.word);
      return <span key={index}>{token.match(/^[^\p{L}\p{N}]*/u)?.[0]}<button type="button" disabled={busy}
        className={`reading-word ${challenge.effect==="endings"&&!done?"missing-ending":""} ${done?"is-solved":""} ${selected===index?"is-selected":""} ${spoken===index?"is-spoken":""}`}
        aria-label={done?`Solved word: ${challenge.word}`:`Challenge ${challenges.indexOf(challenge)+1}: ${challenge.effect==='missing'?'missing word':challenge.shown}`}
        aria-pressed={selected===index} onClick={()=>select(index)}>
        {done?token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu,""):challenge.effect==="endings"?<>{token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu,"").slice(0,challenge.shown.replace(/_/g,"").length)}<span className="ending-spaces">{challenge.shown.match(/_+$/)?.[0]}</span></>:challenge.shown}
      </button>{token.match(/[^\p{L}\p{N}]*$/u)?.[0]}</span>;
    })}</span>;})}</div>
    {!finished&&!active&&<p className="word-answer people-help">Select an unfinished word in the passage to restore its ending.</p>}
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
      {correctAnswer(progress.answers[active.index]??"",active.word) && solved<challenges.length && <button type="button" className="text-button" disabled={busy}
        onClick={()=>{const next=challenges.find(c=>!correctAnswer(progress.answers[c.index]??"",c.word));if(next)select(next.index);}}>Next unsolved word →</button>}
    </form>}</div>
    <div role="status">{finished && <p className="exercise-finished">Quest complete! You restored all {challenges.length} words.</p>}</div>
    {error && <p role="alert" className="error-message">{error}</p>}
    {!finished && <button type="button" className="primary-button" disabled={busy||solved!==challenges.length||!challenges.length}
      onClick={()=>void persist(progress,true)}>Finish practice</button>}
  </section>;
}
