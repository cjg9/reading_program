import {useRef, useState, type KeyboardEvent} from "react";
import type {SupabaseClient} from "@supabase/supabase-js";
import {ClassPeople} from "./ClassPeople";
import {TeacherExercises} from "./TeacherExercises";
import {ClassInsights} from "./ClassInsights";

const sections = ["Overview", "Students", "Practices", "Statistics"] as const;
type Section = typeof sections[number];

export function ClassWorkspace({client, classId}: {client: SupabaseClient; classId: number}) {
  const [tab, setTab] = useState<Section>("Overview");
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);

  function navigate(event: KeyboardEvent, index: number) {
    let next: number;
    switch (event.key) {
      case "ArrowRight": next = (index + 1) % sections.length; break;
      case "ArrowLeft": next = (index + sections.length - 1) % sections.length; break;
      case "Home": next = 0; break;
      case "End": next = sections.length - 1; break;
      default: return;
    }
    event.preventDefault();
    setTab(sections[next]);
    buttons.current[next]?.focus();
  }

  return <>
    <div className="class-tabs" role="tablist" aria-label="Class sections">
      {sections.map((name, index) => <button key={name} role="tab"
        ref={node => { buttons.current[index] = node; }}
        id={`class-tab-${name}`} aria-controls={`class-panel-${name}`}
        aria-selected={tab === name} tabIndex={tab === name ? 0 : -1}
        onKeyDown={event => navigate(event, index)} onClick={() => setTab(name)}>
        {name}
      </button>)}
    </div>
    <section role="tabpanel" id="class-panel-Overview" aria-labelledby="class-tab-Overview" hidden={tab !== "Overview"} tabIndex={0}>
      <div className="class-overview">
        <h2>Your reading classroom</h2>
        <p>Invite your students, share a word quest, and follow their progress.</p>
        <div className="overview-grid">
          <button onClick={() => setTab("Students")}><img src="/design/users.svg" alt=""/><strong>Manage students</strong><span>Send invitations and manage your class roster.</span></button>
          <button onClick={() => setTab("Practices")}><img src="/design/exercise.svg" alt=""/><strong>Assign a reading practice</strong><span>Customize a library passage or create your own.</span></button>
          <button onClick={() => setTab("Statistics")}><img src="/design/dashboard.svg" alt=""/><strong>See class progress</strong><span>Review completed activities and participation.</span></button>
        </div>
      </div>
    </section>
    {/* Preserve invitation drafts; practice drafts are discarded when their section closes. */}
    <section role="tabpanel" id="class-panel-Students" aria-labelledby="class-tab-Students" hidden={tab !== "Students"} tabIndex={0}>
      <ClassPeople client={client} classId={classId} active={tab === "Students"}/>
    </section>
    <section role="tabpanel" id="class-panel-Practices" aria-labelledby="class-tab-Practices" hidden={tab !== "Practices"} tabIndex={0}>
      <TeacherExercises client={client} classId={classId} active={tab === "Practices"}/>
    </section>
    <section role="tabpanel" id="class-panel-Statistics" aria-labelledby="class-tab-Statistics" hidden={tab !== "Statistics"} tabIndex={0}>
      {tab === "Statistics" && <ClassInsights client={client} classId={classId}/>}
    </section>
  </>;
}
