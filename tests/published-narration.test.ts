import {expect,it,vi} from 'vitest';
import {createPublicationHandler,recordedParts,type PassageContent,type Publication} from '../supabase/functions/read-aloud/publication';
const content:PassageContent={passage:'They were watching together. They felt happy.',challenges:[{index:4,effect:'endings',shown:'watch___'}]};
const publication:Publication={id:'publication',content,cache_key:'key'};
function setup(){
 const deps={teacher:vi.fn(async()=>true),assignmentContent:vi.fn(async()=>null as PassageContent|null),authenticate:vi.fn(async()=>({id:'teacher',confirmed:true})),exercise:vi.fn(async()=>content as PassageContent|null),
 assigned:vi.fn(async()=> 'publication' as string|null),find:vi.fn(async()=>null as Publication|null),publication:vi.fn(async()=>publication),
 generate:vi.fn(async()=>new Response(JSON.stringify({cache_key:'key'}))),save:vi.fn(async()=>publication),read:vi.fn(async()=>({audio_base64:'saved'}))};
 const handler=createPublicationHandler(deps);
 const request=(body:object)=>handler(new Request('https://test/read-aloud',{method:'POST',headers:{Authorization:'Bearer user'},body:JSON.stringify(body)}));
 return {deps,request};
}
it('generates the complete puzzle once before creating a publication',async()=>{
 const {deps,request}=setup();const response=await request({action:'prepare',exerciseId:'exercise',text:'attacker text'});
 expect(await response.json()).toEqual({publicationId:'publication'});
 expect(deps.generate).toHaveBeenCalledWith('They were watch together. They felt happy.','teacher');
 expect(deps.save).toHaveBeenCalledWith('exercise',content,'key');
});
it('reuses a prepared publication without another provider call',async()=>{
 const {deps,request}=setup();deps.find.mockResolvedValue(publication);
 expect((await request({action:'prepare',exerciseId:'exercise'})).status).toBe(200);
 expect(deps.generate).not.toHaveBeenCalled();
});
it('denies students or other teachers before generating',async()=>{
 const {deps,request}=setup();deps.exercise.mockResolvedValue(null);
 expect((await request({action:'prepare',exerciseId:'other'})).status).toBe(403);
 expect(deps.generate).not.toHaveBeenCalled();
});
it('never generates during authorized playback or replay',async()=>{
 const {deps,request}=setup();
 for(let i=0;i<2;i++)expect((await request({action:'play',assignmentId:'assignment'})).status).toBe(200);
 expect(deps.read).toHaveBeenCalledTimes(2);expect(deps.generate).not.toHaveBeenCalled();expect(deps.save).not.toHaveBeenCalled();
});
it('does not read recordings outside the callers assignment access',async()=>{
 const {deps,request}=setup();deps.assigned.mockResolvedValue(null);
 expect((await request({action:'play',assignmentId:'other'})).status).toBe(404);
 expect(deps.read).not.toHaveBeenCalled();expect(deps.generate).not.toHaveBeenCalled();
});
it('does not regenerate missing stored audio during playback',async()=>{
 const {deps,request}=setup();deps.read.mockRejectedValue(new Error('missing object'));
 expect((await request({action:'play',assignmentId:'assignment'})).status).toBe(503);
 expect(deps.generate).not.toHaveBeenCalled();
});
it('rejects the legacy arbitrary-text generation route',async()=>{
 const {deps,request}=setup();expect((await request({text:'spend credits'})).status).toBe(400);
 expect(deps.generate).not.toHaveBeenCalled();
});
it('does not publish when provider generation or quota fails',async()=>{
 const {deps,request}=setup();deps.generate.mockResolvedValue(new Response('{}',{status:429}));
 expect((await request({action:'prepare',exerciseId:'exercise'})).status).toBe(429);expect(deps.save).not.toHaveBeenCalled();
});
it('keeps punctuation and original token indexes without revealing missing words',()=>{
 expect(recordedParts({passage:'Hello, friends!',challenges:[{index:2,effect:'missing',shown:'_______'}]})).toEqual([{text:'Hello,',index:0},{text:' ',index:1},{text:'blank!',index:2}]);
});

it('allows cached teacher previews but blocks student draft generation',async()=>{
 const {deps,request}=setup();
 expect((await request({action:'preview',content})).status).toBe(200);
 expect(deps.generate).toHaveBeenCalledWith('They were watch together. They felt happy.','teacher');
 deps.generate.mockClear();deps.teacher.mockResolvedValue(false);
 expect((await request({action:'preview',content})).status).toBe(403);expect(deps.generate).not.toHaveBeenCalled();
});
it('derives corrected text from authorized assignment, restoring only correct answers',async()=>{
 const {deps,request}=setup();deps.assignmentContent.mockResolvedValue({...content,challenges:[...content.challenges!,{index:6,effect:'missing',shown:'________'}]});
 const result=await request({action:'corrected',assignmentId:'assignment',content:{passage:'injected'},sentenceStart:0,answers:{4:'watching',6:'wrong'}});
 expect(result.status).toBe(200);expect(deps.generate).toHaveBeenCalledWith('They were watching blank.','teacher');
 expect((await result.json()).parts.map((p:{text:string})=>p.text).join('')).toBe('They were watching blank.');
});
it('denies corrected narration outside assignment access and invalid sentence ranges',async()=>{
 const {deps,request}=setup();
 expect((await request({action:'corrected',assignmentId:'other',sentenceStart:0,answers:{}})).status).toBe(403);
 deps.assignmentContent.mockResolvedValue(content);
 expect((await request({action:'corrected',assignmentId:'assignment',sentenceStart:999,answers:{}})).status).toBe(400);
 expect(deps.generate).not.toHaveBeenCalled();
});
it('upgrades legacy assignment audio through the shared content cache',async()=>{
 const {deps,request}=setup();deps.assigned.mockResolvedValue(null);deps.assignmentContent.mockResolvedValue(content);
 expect((await request({action:'play',assignmentId:'old'})).status).toBe(200);
 expect(deps.generate).toHaveBeenCalledWith('They were watch together. They felt happy.','teacher');
});
it('propagates quota failures without publishing or falling back to browser narration',async()=>{
 const {deps,request}=setup();deps.generate.mockResolvedValue(new Response('{}',{status:429}));
 expect((await request({action:'preview',content})).status).toBe(429);
 expect(deps.save).not.toHaveBeenCalled();
});
