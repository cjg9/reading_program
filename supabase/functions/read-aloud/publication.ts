export interface PassageContent {
  passage:string;
  challenges?:{index:number;effect:string;shown:string}[];
}
export function recordedParts(content:PassageContent){
  return content.passage.split(/(\s+)/).filter(Boolean).map((token,index)=>{
    const challenge=content.challenges?.find(item=>item.index===index);
    if(!challenge)return {text:token,index};
    const spoken=challenge.effect==="missing"?"blank":challenge.effect==="endings"
      ?challenge.shown.replace(/_/g,""):challenge.shown.replace(/_/g," blank ");
    return {text:`${token.match(/^[^\p{L}\p{N}]*/u)?.[0]??""}${spoken}${token.match(/[^\p{L}\p{N}]*$/u)?.[0]??""}`,index};
  });
}
export interface Publication {id:string;content:PassageContent;cache_key:string}
interface Dependencies {
  teacher?:(jwt:string,user:string)=>Promise<boolean>;
  assignmentContent?:(jwt:string,id:string)=>Promise<PassageContent|null>;
  authenticate:(jwt:string)=>Promise<{id:string;confirmed:boolean}|null>;
  exercise:(jwt:string,id:string,user:string)=>Promise<PassageContent|null>;
  assigned:(jwt:string,id:string)=>Promise<string|null>;
  find:(exerciseId:string,content:PassageContent)=>Promise<Publication|null>;
  publication:(id:string)=>Promise<Publication|null>;
  generate:(text:string,user:string)=>Promise<Response>;
  save:(exerciseId:string,content:PassageContent,key:string)=>Promise<Publication>;
  read:(key:string)=>Promise<object>;
}
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const reply=(status:number,body:object)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json","Cache-Control":"no-store"}});
export function createPublicationHandler(deps:Dependencies){
  return async(request:Request)=>{
    if(request.method==="OPTIONS")return reply(200,{});
    if(request.method!=="POST")return reply(405,{error:"Method not allowed."});
    try{
      const jwt=request.headers.get("Authorization")?.match(/^Bearer (.+)$/i)?.[1];
      const user=jwt?await deps.authenticate(jwt):null;
      if(!jwt||!user?.confirmed)return reply(401,{error:"Sign in with a confirmed account to listen."});
      let body;try{body=await request.json();}catch{return reply(400,{error:"Invalid narration request."});}
      if(body?.action==="preview"||body?.action==="corrected"){
        let content:PassageContent|null=null;
        if(typeof body.assignmentId==="string")content=await deps.assignmentContent?.(jwt,body.assignmentId)??null;
        else if(await deps.teacher?.(jwt,user.id))content=body.content;
        if(!content||typeof content.passage!=="string"||!content.passage.trim()||content.passage.length>20000||
          (content.challenges!==undefined&&(!Array.isArray(content.challenges)||content.challenges.length>100||content.challenges.some(c=>!c||!Number.isInteger(c.index)||typeof c.shown!=="string"||c.shown.length>200||typeof c.effect!=="string"))))
          return reply(403,{error:"This narration is available only for your assigned exercise or a teacher preview."});
        let parts=recordedParts(content);
        if(body.action==="corrected"){
          const tokens=content.passage.split(/(\s+)/).filter(Boolean);
          const clean=(text:string)=>text.normalize("NFKC").toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu,"");
          const start=body.sentenceStart;
          let offset=0;
          const offsets=tokens.map(text=>{const begin=offset;offset+=text.length;return begin;});
          const segment=Array.from(new Intl.Segmenter("en",{granularity:"sentence"}).segment(content.passage)).find(s=>offsets[start]>=s.index&&offsets[start]<s.index+s.segment.length);
          if(!Number.isInteger(start)||!segment)return reply(400,{error:"Choose a sentence from this passage."});
          parts=parts.filter(p=>offsets[p.index]>=segment.index&&offsets[p.index]<segment.index+segment.segment.trimEnd().length).map(p=>{
            const answer=body.answers?.[p.index];
            return typeof answer==="string"&&clean(answer)===clean(tokens[p.index])?{...p,text:tokens[p.index]}:p;
          });
        }
        const generated=await deps.generate(parts.map(p=>p.text).join(""),user.id);
        if(!generated.ok)return generated;
        return reply(200,{...await generated.json(),parts});
      }
      if(body?.action==="prepare"&&typeof body.exerciseId==="string"){
        // Ownership is checked with the caller's JWT, before any paid operation.
        const content=await deps.exercise(jwt,body.exerciseId,user.id);
        if(!content)return reply(403,{error:"Only the teacher who owns this exercise can prepare its narration."});
        const existing=await deps.find(body.exerciseId,content);
        if(existing)return reply(200,{publicationId:existing.id});
        const text=recordedParts(content).map(part=>part.text).join("");
        const generated=await deps.generate(text,user.id);
        if(!generated.ok)return generated;
        const recording=await generated.json();
        const publication=await deps.save(body.exerciseId,content,recording.cache_key);
        return reply(200,{publicationId:publication.id});
      }
      if(body?.action==="play"&&typeof body.assignmentId==="string"){
        // RLS checks the current classroom membership / teacher ownership.
        const id=await deps.assigned(jwt,body.assignmentId);
        if(!id){
          const content=await deps.assignmentContent?.(jwt,body.assignmentId);
          if(!content)return reply(404,{error:"This assignment is unavailable."});
          const parts=recordedParts(content);
          const generated=await deps.generate(parts.map(p=>p.text).join(""),user.id);
          if(!generated.ok)return generated;
          return reply(200,{...await generated.json(),parts});
        }
        const publication=await deps.publication(id);
        if(!publication)return reply(404,{error:"This recording is unavailable. Ask your teacher for help."});
        const recording=await deps.read(publication.cache_key);
        return reply(200,{...recording,parts:recordedParts(publication.content)});
      }
      return reply(400,{error:"Choose a published assignment to listen. Narration is prepared only when a teacher publishes an exercise."});
    }catch{return reply(503,{error:"The saved recording could not be loaded. Try again; playback never generates a replacement recording."});}
  };
}
