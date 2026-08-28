import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { formatRelativeTime } from "../lib/classes";
import { Brand } from "./Brand";

interface StudentDashboardProps {
  client: SupabaseClient;
  user: User;
}

interface StudentClass {
  class_id: number;
  student_id: string;
  last_accessed_at: string;
  class: {
    id: number;
    name: string;
  };
}

interface StudentMembershipRow {
  class_id: number;
  student_id: string;
  last_accessed_at: string;
  class:
    | {
        id: number;
        name: string;
      }
    | Array<{
        id: number;
        name: string;
      }>
    | null;
}

interface SupabaseDataError {
  code?: string;
  message: string;
}

type StudentClassOperation = "load" | "open";

const membershipColumns = `
  class_id,
  student_id,
  last_accessed_at,
  class:classes!class_memberships_class_owner_fkey (
    id,
    name
  )
`;

function getStudentClassError(
  error: SupabaseDataError,
  operation: StudentClassOperation,
): string {
  if (error.code === "42P01" || error.code === "PGRST205") {
    return "Student classes are not ready yet. Apply the included Supabase migration, then try again.";
  }

  if (error.code === "42501") {
    return "Your account does not have access to that class.";
  }

  if (error.code === "PGRST116" && operation === "open") {
    return "That class could not be found or is no longer available.";
  }

  if (error.message.toLowerCase().includes("fetch")) {
    return "We could not reach Supabase. Check your connection and try again.";
  }

  return operation === "load"
    ? "Something went wrong while loading your classes. Please try again."
    : "Something went wrong while opening the class. Please try again.";
}

function sortStudentClassesByLastAccessed(
  classes: StudentClass[],
): StudentClass[] {
  return [...classes].sort((left, right) => {
    const timestampDifference =
      Date.parse(right.last_accessed_at) - Date.parse(left.last_accessed_at);

    if (Number.isFinite(timestampDifference) && timestampDifference !== 0) {
      return timestampDifference;
    }

    return right.class_id - left.class_id;
  });
}

function normalizeStudentClass(
  membership: StudentMembershipRow,
): StudentClass | null {
  const relatedClass = Array.isArray(membership.class)
    ? membership.class[0]
    : membership.class;

  if (!relatedClass) {
    return null;
  }

  return {
    class_id: membership.class_id,
    student_id: membership.student_id,
    last_accessed_at: membership.last_accessed_at,
    class: relatedClass,
  };
}

export function StudentDashboard({ client, user }: StudentDashboardProps) {
  const [classes, setClasses] = useState<StudentClass[]>([]);
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [openingClassId, setOpeningClassId] = useState<number | null>(null);
  const [selectedClass, setSelectedClass] = useState<StudentClass | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [clock, setClock] = useState(Date.now());
  const menuHeading = useRef<HTMLHeadingElement>(null);
  const workspaceHeading = useRef<HTMLHeadingElement>(null);
  const returningToMenu = useRef(false);

  const loadClasses = useCallback(async () => {
    setLoadingClasses(true);
    setLoadError(null);

    const { data, error } = await client
      .from("class_memberships")
      .select(membershipColumns)
      .eq("student_id", user.id)
      .order("last_accessed_at", { ascending: false })
      .order("class_id", { ascending: false });

    if (error) {
      setLoadError(getStudentClassError(error, "load"));
      setLoadingClasses(false);
      return;
    }

    const loadedClasses = (
      (data ?? []) as unknown as StudentMembershipRow[]
    ).flatMap((membership) => {
      const studentClass = normalizeStudentClass(membership);
      return studentClass ? [studentClass] : [];
    });

    setClasses(sortStudentClassesByLastAccessed(loadedClasses));
    setLoadingClasses(false);
  }, [client, user.id]);

  useEffect(() => {
    void loadClasses();
  }, [loadClasses]);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (selectedClass) {
      workspaceHeading.current?.focus();
      return;
    }

    if (returningToMenu.current) {
      menuHeading.current?.focus();
      returningToMenu.current = false;
    }
  }, [selectedClass]);

  async function handleOpenClass(classToOpen: StudentClass) {
    if (openingClassId !== null) {
      return;
    }

    setOpeningClassId(classToOpen.class_id);
    setActionError(null);
    const accessedAt = new Date().toISOString();

    const { data, error } = await client
      .from("class_memberships")
      .update({ last_accessed_at: accessedAt })
      .eq("class_id", classToOpen.class_id)
      .eq("student_id", user.id)
      .select("class_id, last_accessed_at")
      .single();

    if (error) {
      setActionError(getStudentClassError(error, "open"));
      setOpeningClassId(null);
      return;
    }

    const openedClass: StudentClass = {
      ...classToOpen,
      last_accessed_at: data.last_accessed_at as string,
    };

    setClasses((currentClasses) =>
      sortStudentClassesByLastAccessed(
        currentClasses.map((studentClass) =>
          studentClass.class_id === openedClass.class_id
            ? openedClass
            : studentClass,
        ),
      ),
    );
    setSelectedClass(openedClass);
    setClock(Date.now());
    setOpeningClassId(null);
  }

  async function handleSignOut() {
    if (signingOut) {
      return;
    }

    setSigningOut(true);
    setActionError(null);

    const { error } = await client.auth.signOut({ scope: "local" });

    if (error) {
      setActionError("We could not sign you out. Please try again.");
      setSigningOut(false);
    }
  }

  function handleBackToClasses() {
    returningToMenu.current = true;
    setActionError(null);
    setSelectedClass(null);
  }

  const firstLetter = user.email?.charAt(0).toUpperCase() ?? "S";

  return (
    <main className="teacher-shell">
      <nav className="teacher-nav" aria-label="Student navigation">
        <Brand />
        <div className="teacher-nav-actions">
          <div className="teacher-account" title={user.email ?? "Student account"}>
            <span className="teacher-avatar" aria-hidden="true">
              {firstLetter}
            </span>
            <span className="teacher-email">{user.email ?? "Student account"}</span>
          </div>
          <button
            className="text-button"
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
          >
            {signingOut ? "Signing out..." : "Sign out"}
          </button>
        </div>
      </nav>

      {selectedClass ? (
        <section className="class-workspace" aria-labelledby="student-class-heading">
          <button
            className="back-button"
            type="button"
            onClick={handleBackToClasses}
          >
            <span aria-hidden="true">&larr;</span> All classes
          </button>
          <p className="eyebrow">Student class workspace</p>
          <h1 ref={workspaceHeading} id="student-class-heading" tabIndex={-1}>
            {selectedClass.class.name}
          </h1>
          <p>
            This is a preview of your class workspace. Reading assignments and
            class activities can be added here in the next stage.
          </p>
          <time dateTime={selectedClass.last_accessed_at}>
            Last accessed:{" "}
            {formatRelativeTime(selectedClass.last_accessed_at, clock)}
          </time>
          {actionError && (
            <p className="error-message workspace-message" aria-live="polite">
              {actionError}
            </p>
          )}
        </section>
      ) : (
        <section className="class-menu" aria-labelledby="student-classes-heading">
          <header className="class-menu-heading">
            <div>
              <p className="eyebrow">Student dashboard</p>
              <h1 ref={menuHeading} id="student-classes-heading" tabIndex={-1}>
                Your classes
              </h1>
              <p>Choose a class to open your student reading space.</p>
            </div>
            {!loadingClasses && !loadError && classes.length > 0 && (
              <span className="class-count">
                {classes.length} {classes.length === 1 ? "class" : "classes"}
              </span>
            )}
          </header>

          <div className="menu-message" aria-live="polite" aria-atomic="true">
            {actionError && <p className="error-message">{actionError}</p>}
          </div>

          {loadingClasses ? (
            <div className="class-status" aria-busy="true">
              <span className="loader" aria-hidden="true" />
              <p>Loading your classes...</p>
            </div>
          ) : loadError ? (
            <div className="class-status class-status-error" role="alert">
              <h2>We could not load your classes</h2>
              <p>{loadError}</p>
              <button className="secondary-button" type="button" onClick={loadClasses}>
                Try again
              </button>
            </div>
          ) : classes.length === 0 ? (
            <div className="class-status">
              <h2>No classes yet</h2>
              <p>
                Ask your teacher to add you to a class. It will appear here once
                you are enrolled.
              </p>
            </div>
          ) : (
            <ul className="class-grid" aria-label="Student classes">
              {classes.map((studentClass) => (
                <li key={studentClass.class_id}>
                  <button
                    className="class-tile existing-class-tile"
                    type="button"
                    onClick={() => void handleOpenClass(studentClass)}
                    disabled={openingClassId !== null}
                  >
                    <span className="class-tile-topline">
                      <span className="class-bookmark" aria-hidden="true" />
                      <span aria-hidden="true">&rarr;</span>
                    </span>
                    <span className="class-tile-name">{studentClass.class.name}</span>
                    <time
                      className="class-tile-detail"
                      dateTime={studentClass.last_accessed_at}
                    >
                      Last accessed:{" "}
                      {openingClassId === studentClass.class_id
                        ? "opening..."
                        : formatRelativeTime(studentClass.last_accessed_at, clock)}
                    </time>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </main>
  );
}
