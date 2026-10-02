export const strategies = {
  missing: {name:"Disappearing words", instruction:"Use the sentence around each blank to work out the missing word."},
  endings: {name:"Missing endings", instruction:"Restore the missing word endings, such as ing, ed, or tion."},
  upside: {name:"Upside-down sentences", instruction:"Read the upside-down sentences, then type the highlighted target words."},
  scramble: {name:"Swapped letters", instruction:"Put the mixed-up letters back in order."},
  digraphs: {name:"Missing letter pairs", instruction:"Restore missing letter pairs such as sh, ch, th, and wh."},
  backwards: {name:"Backwards words", instruction:"Read the reversed letters to recover each word."},
  nonsense: {name:"Nonsense words", instruction:"A made-up word has taken the real word’s place. Use context to find the original."},
  synonym: {name:"Synonym detective", instruction:"Find the passage word that matches each synonym clue."},
  definition: {name:"Context clues", instruction:"Use each definition and the surrounding sentence to find the word."},
  mixed: {name:"Surprise mix", instruction:"Try a mix of disappearing, scrambled, and upside-down words."},
} as const;
export type Strategy = keyof typeof strategies;
export interface ExerciseContent {
  title: string;
  passage: string;
  strategy: Strategy;
  mode: "type";
  targetWords: string[];
  vocabulary: Record<string, {synonym:string; definition:string}>;
  challenges?: Challenge[];
  sourceTitle?: string;
  sourcePassage?: string;
  sentenceNumbers?: number[];
  priorityWords?: string[];
}
export interface Exercise { id:string; teacher_id:string|null; preset_key:string|null; content:ExerciseContent }
export interface Assignment { id:string; class_id:number; content:ExerciseContent; created_at:string; archived_at:string|null }
export interface ExerciseProgress { answers:Record<string,string>; hints:number[] }
export interface ProgressRecord { assignment_id:string; student_id:string; progress:ExerciseProgress; completed_at:string|null }
export const emptyProgress = (): ExerciseProgress => ({answers:{},hints:[]});
export const cleanWord = (word:string) => word.normalize("NFKC").toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
export function validateExercise(content:ExerciseContent):string {
  if (!content.title.trim() || content.title.length > 120) return "Enter a title of up to 120 characters.";
  if (content.passage.trim().length < 40 || content.passage.length > 20000) return "Enter a passage between 40 and 20,000 characters.";
  if (!(content.strategy in strategies)) return "Choose a reading game.";
  if (content.targetWords.length > 50) return "Choose up to 50 target words.";
  if ((content.priorityWords?.length ?? 0) > 50) return "Choose up to 50 vocabulary words.";
  if (content.sentenceNumbers?.some(n=>!Number.isInteger(n)||n<1||n>passageSentences(content.passage).length)) return "Choose sentence numbers that appear in this passage.";
  if (["definition","synonym"].includes(content.strategy) && !Object.keys(content.vocabulary).length) return "Add vocabulary clues or choose another game.";
  if (!buildChallenges(content).length) return "No words match this game. Change the target words or choose another game.";
  return "";
}
export function splitPassage(passage:string) { return passage.split(/(\s+)/).filter(Boolean); }
// Keep the original whitespace-token indexes: saved student answers use these keys.
export function passageSentences(passage:string) {
  const sentences:{number:number;tokens:{text:string;index:number}[]}[]=[];
  let tokens:{text:string;index:number}[]=[];
  let ended=false;
  splitPassage(passage).forEach((text,index)=>{
    if(ended && text.trim()) { sentences.push({number:sentences.length+1,tokens}); tokens=[]; ended=false; }
    tokens.push({text,index});
    if(/[.!?]["'”’)]*$/.test(text) && !/^(Mr|Mrs|Ms|Dr|Prof|St)\.$/i.test(text)) ended=true;
    if(/\n\s*\n/.test(text)) ended=true;
  });
  if(tokens.length)sentences.push({number:sentences.length+1,tokens});
  return sentences;
}
export function parseSentenceNumbers(value:string,count:number):number[]|null {
  if(!value.trim())return [];
  const result=new Set<number>();
  for(const part of value.split(",")) {
    const match=part.trim().match(/^(\d+)\s*(?:[-–]\s*(\d+))?$/);
    if(!match)return null;
    const start=Number(match[1]),end=Number(match[2]??match[1]);
    if(start<1||end<start||end>count)return null;
    for(let n=start;n<=end;n++)result.add(n);
  }
  return [...result].sort((a,b)=>a-b);
}
export function passageLibrary(library:Exercise[]):Exercise[] {
  const originals=new Map<string,Exercise>();
  for(const exercise of [...library].sort((a,b)=>Number(Boolean(b.preset_key))-Number(Boolean(a.preset_key)))) {
    const passage=exercise.content.sourcePassage??exercise.content.passage;
    const key=passage.trim().replace(/\s+/g," ");
    if(originals.has(key))continue;
    const title=exercise.content.sourceTitle??exercise.content.title.split(" · ")[0];
    originals.set(key,{...exercise,content:{...exercise.content,title,passage,sourceTitle:title,sourcePassage:passage,challenges:undefined}});
  }
  return [...originals.values()];
}
export interface Challenge { index:number; word:string; effect:Strategy; shown:string }
export function buildChallenges(content:ExerciseContent):Challenge[] {
  const targets = new Set(content.targetWords.map(cleanWord));
  const result:Challenge[]=[];
  const priorities=new Set([...(content.priorityWords??[]),...Object.keys(content.vocabulary)].map(cleanWord));
  const sentences=passageSentences(content.passage);
  const allowed=new Set(sentences.filter(s=>!content.sentenceNumbers?.length||content.sentenceNumbers.includes(s.number)).flatMap(s=>s.tokens.map(t=>t.index)));
  const candidates:{word:string;index:number}[]=[];
  let eligible=0;
  splitPassage(content.passage).forEach((token,index) => {
    const word=cleanWord(token);
    if (!/^\p{L}[\p{L}'’-]*$/u.test(word) || word.length < 3) return;
    const vocab=content.vocabulary[word];
    if (content.strategy === "endings" && !/(ing|ed|tion|ly|ness|ment|ful|less|s)$/.test(word)) return;
    if (content.strategy === "digraphs" && !/(sh|ch|th|wh|ph|ck|ng)/.test(word)) return;
    if (["synonym","definition"].includes(content.strategy) && !vocab?.[content.strategy as "synonym"|"definition"]) return;
    if (targets.size && !targets.has(word)) return;
    if (content.strategy === "upside" && !allowed.has(index))return;
    const sampled=eligible++ % 5 === 0;
    if (!targets.size && !priorities.has(word) && !sampled) return;
    candidates.push({word,index});
  });
  // Vocabulary takes priority even near the end of a long passage.
  const chosen=targets.size?candidates.slice(0,40):candidates.sort((a,b)=>Number(priorities.has(b.word))-Number(priorities.has(a.word))).slice(0,40).sort((a,b)=>a.index-b.index);
  chosen.forEach(({word,index})=>{
    const vocab=content.vocabulary[word];
    const effect = content.strategy === "mixed" ? (["missing","scramble","upside"] as Strategy[])[result.length%3] : content.strategy;
    let shown=word;
    if (effect === "missing") shown="_".repeat(Math.min(word.length,12));
    if (effect === "endings") shown=word.replace(/(ing|ed|tion|ly|ness|ment|ful|less|s)$/,match=>"_".repeat(match.length));
    if (effect === "digraphs") shown=word.replace(/sh|ch|th|wh|ph|ck|ng/g,"__");
    if (effect === "backwards") shown=[...word].reverse().join("");
    if (effect === "scramble") {
      const chars=[...word];
      const swap=chars.findIndex((char,i)=>i>0 && char!==chars[i-1]);
      if (swap>0) [chars[swap-1],chars[swap]]=[chars[swap],chars[swap-1]];
      shown=chars.join("");
    }
    if (effect === "nonsense") shown="zibble";
    if (effect === "synonym") shown=vocab.synonym;
    if (effect === "definition") shown=vocab.definition;
    result.push({index,word,effect,shown});
  });
  return result;
}
export const correctAnswer = (answer:string, word:string) => cleanWord(answer.trim()) === cleanWord(word);
// Assigned games use their saved manifest, even if word selection changes later.
export const exerciseChallenges = (content:ExerciseContent) => content.challenges ?? buildChallenges(content);
export function completedChallenges(content:ExerciseContent,progress:ExerciseProgress) {
  return exerciseChallenges(content).filter(c=>correctAnswer(progress.answers[c.index]??"",c.word)).length;
}
