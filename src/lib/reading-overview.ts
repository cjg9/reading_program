import {useCallback,useEffect,useState} from "react";
import type {SupabaseClient} from "@supabase/supabase-js";
import type {Assignment,ProgressRecord} from "./exercises";

export interface Membership {class_id:number;student_id:string}
export function summarizeReading(members:Membership[],assignments:Assignment[],progress:ProgressRecord[]) {
  const active=assignments.filter(a=>!a.archived_at);
  const eligible=progress.filter(p=>active.some(a=>a.id===p.assignment_id&&members.some(m=>m.class_id===a.class_id&&m.student_id===p.student_id)));
  const expected=active.reduce((sum,a)=>sum+members.filter(m=>m.class_id===a.class_id).length,0);
  const completed=eligible.filter(p=>p.completed_at).length;
  return {students:new Set(members.map(m=>m.student_id)).size,assignments:active.length,completed,expected,started:eligible.length,rate:expected?Math.round(completed/expected*100):0};
}
export function useReadingOverview(client:SupabaseClient,classIds:number[]) {
  const key=classIds.join(",");
  const [state,setState]=useState<{loading:boolean;error:string;members:Membership[];assignments:Assignment[];progress:ProgressRecord[]}>({loading:true,error:"",members:[],assignments:[],progress:[]});
  const [revision,setRevision]=useState(0);
  const refresh=useCallback(()=>setRevision(x=>x+1),[]);
  useEffect(()=>{
    let current=true;const ids=key?key.split(",").map(Number):[];
    setState({loading:true,error:"",members:[],assignments:[],progress:[]});
    async function load(){
      try {
        if(!ids.length){if(current)setState({loading:false,error:"",members:[],assignments:[],progress:[]});return;}
        const [m,a]=await Promise.all([
          client.from("class_memberships").select("class_id,student_id").in("class_id",ids),
          client.from("exercise_assignments").select("id,class_id,content,created_at,archived_at").in("class_id",ids).is("archived_at",null),
        ]);
        if(m.error||a.error)throw new Error();
        const assignments=(a.data??[]) as Assignment[];
        const p=assignments.length?await client.from("exercise_progress").select("assignment_id,student_id,progress,completed_at").in("assignment_id",assignments.map(x=>x.id)):{data:[],error:null};
        if(p.error)throw new Error();
        if(current)setState({loading:false,error:"",members:m.data??[],assignments,progress:p.data??[]});
      }catch{if(current)setState({loading:false,error:"Progress could not be loaded. Please try again.",members:[],assignments:[],progress:[]});}
    }
    void load();return()=>{current=false;};
  },[client,key,revision]);
  return {...state,summary:summarizeReading(state.members,state.assignments,state.progress),refresh};
}
