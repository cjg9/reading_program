import {describe,expect,it} from "vitest";
import {buildChallenges,exerciseChallenges,completedChallenges,correctAnswer,splitPassage,validateExercise,passageLibrary,passageSentences,parseSentenceNumbers,type Strategy} from "./exercises";
import {exercisePresets,dogPassage} from "./exercise-presets";
describe("reading games",()=>{
  it("groups presets and customized copies under their unchanged original passage",()=>{
    const originals=exercisePresets.map((p,i)=>({id:String(i),teacher_id:null,preset_key:p.key,content:p.content}));
    const copy={id:"copy",teacher_id:"teacher",preset_key:null,content:{...originals[0].content,title:"My version",passage:"Changed passage",sourcePassage:dogPassage,sourceTitle:"Dog Detectives"}};
    const library=passageLibrary([...originals,copy]);
    expect(library).toHaveLength(1);
    expect(library[0].content.passage).toBe(dogPassage);
    expect(library[0].content.title).toBe("Dog Detectives");
  });
  it("prioritizes vocabulary beyond the first forty automatically sampled words",()=>{
    const c={...exercisePresets[0].content,targetWords:[],passage:"Ordinary reading words fill this sentence. ".repeat(60)+"Attentive readers notice chaos."};
    const challenges=buildChallenges(c);
    expect(challenges).toHaveLength(40);
    expect(challenges.map(c=>c.word)).toContain("attentive");
    expect(challenges.map(c=>c.word)).toContain("chaos");
  });
  it("parses sentence ranges and preserves token indexes when selecting upside-down sentences",()=>{
    const passage='Dr. Smith enjoys reading. "Dogs are attentive!"\n\nThey bring chaos. We keep watching.';
    const sentences=passageSentences(passage);
    expect(sentences).toHaveLength(4);
    expect(sentences.flatMap(s=>s.tokens.map(t=>t.text)).join("")).toBe(passage);
    expect(parseSentenceNumbers("2, 3–4",4)).toEqual([2,3,4]);
    for(const invalid of ["0","4-2","1-5","no","1,"])expect(parseSentenceNumbers(invalid,4)).toBeNull();
    const c={...exercisePresets[0].content,passage,strategy:"upside" as const,targetWords:[],sentenceNumbers:[2,3]};
    const allowed=sentences.filter(s=>[2,3].includes(s.number)).flatMap(s=>s.tokens.map(t=>t.index));
    expect(buildChallenges(c).length).toBeGreaterThan(0);
    expect(buildChallenges(c).every(ch=>allowed.includes(ch.index)&&correctAnswer(splitPassage(passage)[ch.index],ch.word))).toBe(true);
  });
  it("uses saved challenges for assigned work and progress counts",()=>{
    const content=exercisePresets[0].content;
    const saved=buildChallenges(content).slice(0,1);
    const assigned={...content,challenges:saved};
    expect(exerciseChallenges(assigned)).toEqual(saved);
    expect(completedChallenges(assigned,{answers:{[saved[0].index]:saved[0].word},hints:[]})).toBe(1);
    expect(buildChallenges(assigned).length).toBe(10);
  });
  it("preserves passage text, paragraphs, and the ten source vocabulary targets",()=>{
    expect(splitPassage(dogPassage).join("")).toBe(dogPassage);
    expect(buildChallenges(exercisePresets[0].content).map(c=>c.word).sort()).toEqual(["chaos","illegal","torture","posture","hysterical","attentive","boyhood","panicked","ferocious","yield"].sort());
  });
  it("makes each preset usable and deterministic",()=>{
    for(const {content} of exercisePresets){expect(validateExercise(content)).toBe("");expect(buildChallenges(content).length).toBeGreaterThan(0);expect(buildChallenges(content)).toEqual(buildChallenges(content));}
  });
  it.each(["missing","endings","digraphs","backwards","scramble","nonsense"] as Strategy[])("actually changes eligible words for %s",strategy=>{
    const content={...exercisePresets[0].content,strategy,targetWords:[]};
    const challenges=buildChallenges(content);expect(challenges.length).toBeGreaterThan(0);
    expect(challenges.every(c=>c.shown!==c.word)).toBe(true);
  });
  it("uses all three effects in mixed mode and keeps indexed words stable",()=>{
    const content=exercisePresets[1].content;
    expect(new Set(buildChallenges(content).map(c=>c.effect))).toEqual(new Set(["missing","scramble","upside"]));
    for(const c of buildChallenges(content))expect(correctAnswer(splitPassage(content.passage)[c.index],c.word)).toBe(true);
  });
  it("rejects unmatched targets and missing vocabulary clues",()=>{
    expect(validateExercise({...exercisePresets[0].content,targetWords:["absentword"]})).toContain("No words match");
    expect(validateExercise({...exercisePresets[3].content,vocabulary:{}})).toContain("vocabulary clues");
  });
});
