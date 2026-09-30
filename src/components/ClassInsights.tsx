import type {SupabaseClient} from "@supabase/supabase-js";
import {summarizeReading,useReadingOverview} from "../lib/reading-overview";

export function ClassInsights({client,classId}:{client:SupabaseClient;classId:number}){
  const data=useReadingOverview(client,[classId]);
  if(data.loading)return <p role="status">Loading class progress...</p>;
  if(data.error)return <div role="alert"><p>{data.error}</p><button className="secondary-button" onClick={data.refresh}>Try again</button></div>;
  const s=data.summary;
  return <section className="class-insights" aria-label="Class statistics">
    <div className="section-title"><div><h2>Class statistics</h2><p>Progress on active exercises for students currently in this class.</p></div><button className="text-button" onClick={data.refresh}>Refresh statistics</button></div>
    <div className="metric-grid"><article><span>Students</span><strong>{s.students}</strong></article><article><span>Assigned exercises</span><strong>{s.assignments}</strong></article><article><span>Completed activities</span><strong>{s.completed}</strong></article><article><span>Completion rate</span><strong>{s.expected?`${s.rate}%`:"—"}</strong></article></div>
    <div className="insights-panel"><h3>Exercise completion</h3><p>Completed student activities out of all assigned student activities.</p>
      {data.assignments.length?data.assignments.map(a=>{const row=summarizeReading(data.members,[a],data.progress);return <div className="insight-row" key={a.id}><div><strong>{a.content.title}</strong><span>{row.completed} / {row.expected} finished</span></div><progress aria-label={`${a.content.title} completion`} value={row.completed} max={Math.max(row.expected,1)}/></div>}):<p>Assign your first exercise to start tracking progress.</p>}
    </div>
  </section>;
}
