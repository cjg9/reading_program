import {describe,expect,it} from "vitest";
import {buildChallenges,exerciseChallenges,completedChallenges,correctAnswer,splitPassage,validateExercise,type Strategy} from "./exercises";
import {exercisePresets,dogPassage} from "./exercise-presets";
describe("reading games",()=>{
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
