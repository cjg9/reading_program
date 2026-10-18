import {describe,expect,it} from "vitest";
import {buildChallenges,exerciseChallenges,completedChallenges,correctAnswer,splitPassage,validateExercise,passageLibrary,passageSentences,type Strategy} from "./exercises";
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
  it("flips every word of one complete sentence in each paragraph",()=>{
    const passage='Careful readers enjoy a long story together. Dogs play!\n\nThey bring chaos. We keep watching outside.';
    const c={...exercisePresets[0].content,passage,strategy:"upside" as const,targetWords:["reading"],sentenceNumbers:[2]};
    const challenges=buildChallenges(c);
    expect(challenges.map(ch=>ch.word)).toEqual(["dogs","play","they","bring","chaos"]);
    const groups=new Set(challenges.map(ch=>ch.sentenceStart));
    expect(groups.size).toBe(2);
    expect(challenges.every(ch=>correctAnswer(splitPassage(passage)[ch.index],ch.word))).toBe(true);
    const assigned={...c,challenges:challenges.slice(1,2)};
    expect(exerciseChallenges(assigned)).toEqual(assigned.challenges);
  });
  it("keeps quoted sentence punctuation and CRLF paragraph boundaries in sentence ranges",()=>{
    const passage='The children play. "Dogs run!"\r\n\r\nBirds sing softly. They fly.';
    const tokens=splitPassage(passage);
    const sentences=passageSentences(passage);
    expect(sentences.map(s=>tokens.slice(s.start,s.end+1).join(""))).toEqual(['The children play.','"Dogs run!"','Birds sing softly.','They fly.']);
    expect(sentences.map(s=>s.paragraph)).toEqual([0,0,1,1]);
  });
  it("rejects oversized sentence games rather than flipping partial sentences",()=>{
    const content={...exercisePresets[0].content,strategy:"upside" as const,passage:Array.from({length:41},()=>"Dogs run.").join("\n\n")};
    expect(buildChallenges(content)).toHaveLength(82);
    expect(validateExercise(content)).toContain("more than 40 puzzle words");
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
