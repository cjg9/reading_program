import {expect,it} from "vitest";
import {buildTimeline,locate,spliceVolume,wordStart} from "../src/lib/narrationTimeline";

// "One two. Three four. Five." — word token indexes 0,2 | 4,6 | 8 (odd indexes are spaces).
const base={key:"passage",duration:3.2,words:[
  {index:0,start:0,end:0.3},{index:2,start:0.4,end:0.8},
  {index:4,start:1.4,end:1.7},{index:6,start:1.8,end:2.2},
  {index:8,start:2.6,end:2.9},
]};
const clip={key:"corrected",duration:1.3,words:[{index:4,start:0.1,end:0.5},{index:6,start:0.6,end:1.0}]};
const near=(value:number|undefined,expected:number)=>expect(value).toBeCloseTo(expected,5);

it("uses the full recording alone when nothing is corrected",()=>{
  const line=buildTimeline(base,[]);
  expect(line.segments).toHaveLength(1);
  near(line.duration,3.2);near(wordStart(line,6),1.8);
});

it("splices a corrected clip into the natural pauses around its sentence",()=>{
  const line=buildTimeline(base,[clip]);
  expect(line.segments.map(s=>s.key)).toEqual(["passage","corrected","passage"]);
  const [before,middle,after]=line.segments;
  near(before.to,1.1);          // midway between "two." (0.8) and "Three" (1.4)
  near(middle.from,0.02);near(middle.to,1.2); // short lead-in, tail after the last word
  near(after.from,2.4);         // midway between "four." (2.2) and "Five." (2.6)
  expect(before.splicedOut&&middle.splicedIn&&middle.splicedOut&&after.splicedIn).toBe(true);
  // Every word maps to one point on the combined timeline.
  near(wordStart(line,4),1.1+0.1-0.02);
  near(wordStart(line,8),1.1+1.18+0.2);
  near(line.duration,1.1+1.18+0.8);
});

it("maps timeline positions and unspoken tokens to the right recording time",()=>{
  const line=buildTimeline(base,[clip]);
  expect(locate(line,1.5)).toEqual({segment:1,local:expect.closeTo(0.42,5)});
  expect(locate(line,99).segment).toBe(2);
  near(wordStart(line,3),wordStart(line,4)!);   // a space starts at the next word
  expect(wordStart(line,9)).toBeUndefined();
});

it("ignores overlapping clips and clips outside the recording",()=>{
  const overlap={key:"overlap",duration:1,words:[{index:6,start:0,end:0.4}]};
  const outside={key:"outside",duration:1,words:[{index:40,start:0,end:0.4}]};
  expect(buildTimeline(base,[clip,overlap,outside]).segments.map(s=>s.key)).toEqual(["passage","corrected","passage"]);
});

it("fades only at joins between different recordings",()=>{
  const [first,second]=buildTimeline(base,[clip]).segments;
  expect(spliceVolume(first,0)).toBe(1);
  expect(spliceVolume(first,1.1-0.01)).toBeCloseTo(0.25,5);
  expect(spliceVolume(second,second.from)).toBe(0);
  expect(spliceVolume(second,0.5)).toBe(1);
});
