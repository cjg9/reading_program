import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
} from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import {
  CLASS_NAME_MAX_LENGTH,
  formatRelativeTime,
  sortClassesByLastAccessed,
  validateClassName,
  type TeacherClass,
} from "../lib/classes";
import { Brand } from "./Brand";

interface TeacherDashboardProps {
  client: SupabaseClient;
  user: User;
}

const classColumns = "id, teacher_id, name, created_at, last_accessed_at";

interface SupabaseDataError {
  code?: string;
  message: string;
}

type ClassOperation = "load" | "create" | "open";

function getClassError(
  error: SupabaseDataError,
  operation: ClassOperation,
): string {
  if (error.code === "42P01" || error.code === "PGRST205") {
    return "Class storage is not ready yet. Apply the included Supabase migration, then try again.";
  }

  if (error.code === "42501") {
    return operation === "create"
      ? "Your account does not have permission to create classes."
      : "Your account does not have access to that class.";
  }

  if (error.code === "PGRST116" && operation === "open") {
    return "That class could not be found or is no longer available.";
  }

  if (error.message.toLowerCase().includes("fetch")) {
    return "We could not reach Supabase. Check your connection and try again.";
  }

  const fallback = {
    load: "Something went wrong while loading your classes. Please try again.",
    create: "Something went wrong while creating the class. Please try again.",
    open: "Something went wrong while opening the class. Please try again.",
  };

  return fallback[operation];
}

export function TeacherDashboard({ client, user }: TeacherDashboardProps) {
  const [classes, setClasses] = useState<TeacherClass[]>([]);
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [className, setClassName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [openingClassId, setOpeningClassId] = useState<number | null>(null);
  const [selectedClass, setSelectedClass] = useState<TeacherClass | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [clock, setClock] = useState(Date.now());
  const createDialog = useRef<HTMLDialogElement>(null);
  const createTile = useRef<HTMLButtonElement>(null);
  const menuHeading = useRef<HTMLHeadingElement>(null);
  const workspaceHeading = useRef<HTMLHeadingElement>(null);
  const returningToMenu = useRef(false);

  const loadClasses = useCallback(async () => {
    setLoadingClasses(true);
    setLoadError(null);

    const { data, error } = await client
      .from("classes")
      .select(classColumns)
      .eq("teacher_id", user.id)
      .order("last_accessed_at", { ascending: false })
      .order("id", { ascending: false });

    if (error) {
      setLoadError(getClassError(error, "load"));
      setLoadingClasses(false);
      return;
    }

    setClasses(sortClassesByLastAccessed((data ?? []) as TeacherClass[]));
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

  function openCreateDialog() {
    if (openingClassId !== null) {
      return;
    }

    setClassName("");
    setCreateError(null);
    setActionError(null);
    setNotice(null);
    createDialog.current?.showModal();
  }

  function closeCreateDialog() {
    if (!creating) {
      createDialog.current?.close();
    }
  }

  function handleDialogClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget) {
      closeCreateDialog();
    }
  }

  async function handleCreateClass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (creating) {
      return;
    }

    const validationError = validateClassName(className);

    if (validationError) {
      setCreateError(validationError);
      return;
    }

    setCreating(true);
    setCreateError(null);
    const trimmedName = className.trim();

    const { data, error } = await client
      .from("classes")
      .insert({ name: trimmedName })
      .select(classColumns)
      .single();

    if (error) {
      setCreateError(getClassError(error, "create"));
      setCreating(false);
      return;
    }

    const createdClass = data as TeacherClass;
    setClasses((currentClasses) =>
      sortClassesByLastAccessed([createdClass, ...currentClasses]),
    );
    setNotice(`Class "${createdClass.name}" was created.`);
    setClock(Date.now());
    setCreating(false);
    createDialog.current?.close();
  }

  async function handleOpenClass(classToOpen: TeacherClass) {
    if (openingClassId !== null) {
      return;
    }

    setOpeningClassId(classToOpen.id);
    setActionError(null);
    setNotice(null);
    const accessedAt = new Date().toISOString();

    const { data, error } = await client
      .from("classes")
      .update({ last_accessed_at: accessedAt })
      .eq("id", classToOpen.id)
      .eq("teacher_id", user.id)
      .select(classColumns)
      .single();

    if (error) {
      setActionError(getClassError(error, "open"));
      setOpeningClassId(null);
      return;
    }

    const openedClass = data as TeacherClass;
    setClasses((currentClasses) =>
      sortClassesByLastAccessed(
        currentClasses.map((teacherClass) =>
          teacherClass.id === openedClass.id ? openedClass : teacherClass,
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

  const firstLetter = user.email?.charAt(0).toUpperCase() ?? "T";

  return (
    <main className="teacher-shell">
      <nav className="teacher-nav" aria-label="Teacher navigation">
        <Brand />
        <div className="teacher-nav-actions">
          <div className="teacher-account" title={user.email ?? "Teacher account"}>
            <span className="teacher-avatar" aria-hidden="true">
              {firstLetter}
            </span>
            <span className="teacher-email">{user.email ?? "Teacher account"}</span>
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
        <section className="class-workspace" aria-labelledby="class-heading">
          <button
            className="back-button"
            type="button"
            onClick={handleBackToClasses}
          >
            <span aria-hidden="true">&larr;</span> All classes
          </button>
          <p className="eyebrow">Class workspace</p>
          <h1 ref={workspaceHeading} id="class-heading" tabIndex={-1}>
            {selectedClass.name}
          </h1>
          <p>
            This class is ready. Student rosters and reading tools can be added
            here in the next stage.
          </p>
          <time dateTime={selectedClass.last_accessed_at}>
            Last accessed: {formatRelativeTime(selectedClass.last_accessed_at, clock)}
          </time>
          {actionError && (
            <p className="error-message workspace-message" aria-live="polite">
              {actionError}
            </p>
          )}
        </section>
      ) : (
        <section className="class-menu" aria-labelledby="classes-heading">
          <header className="class-menu-heading">
            <div>
              <p className="eyebrow">Teacher dashboard</p>
              <h1 ref={menuHeading} id="classes-heading" tabIndex={-1}>
                Your classes
              </h1>
              <p>Choose a class to continue, or create a new space for readers.</p>
            </div>
            {!loadingClasses && !loadError && classes.length > 0 && (
              <span className="class-count">
                {classes.length} {classes.length === 1 ? "class" : "classes"}
              </span>
            )}
          </header>

          <div className="menu-message" aria-live="polite" aria-atomic="true">
            {actionError && <p className="error-message">{actionError}</p>}
            {notice && <p className="success-message">{notice}</p>}
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
          ) : (
            <>
              {classes.length === 0 && (
                <p className="empty-class-copy">
                  You do not have any classes yet. Create your first one below.
                </p>
              )}
              <ul className="class-grid" aria-label="Teacher classes">
                <li>
                  <button
                    ref={createTile}
                    className="class-tile create-class-tile"
                    type="button"
                    onClick={openCreateDialog}
                    disabled={openingClassId !== null}
                  >
                    <span className="create-icon" aria-hidden="true">+</span>
                    <span className="class-tile-name">Create a class</span>
                    <span className="class-tile-detail">Start a new reading space</span>
                  </button>
                </li>
                {classes.map((teacherClass) => (
                  <li key={teacherClass.id}>
                    <button
                      className="class-tile existing-class-tile"
                      type="button"
                      onClick={() => void handleOpenClass(teacherClass)}
                      disabled={openingClassId !== null}
                    >
                      <span className="class-tile-topline">
                        <span className="class-bookmark" aria-hidden="true" />
                        <span aria-hidden="true">&rarr;</span>
                      </span>
                      <span className="class-tile-name">{teacherClass.name}</span>
                      <time
                        className="class-tile-detail"
                        dateTime={teacherClass.last_accessed_at}
                      >
                        Last accessed:{" "}
                        {openingClassId === teacherClass.id
                          ? "opening..."
                          : formatRelativeTime(teacherClass.last_accessed_at, clock)}
                      </time>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      <dialog
        ref={createDialog}
        className="create-dialog"
        aria-labelledby="create-class-heading"
        aria-describedby="create-class-description"
        onCancel={(event) => {
          if (creating) {
            event.preventDefault();
          }
        }}
        onClose={() => {
          setClassName("");
          setCreateError(null);
          createTile.current?.focus();
        }}
        onClick={handleDialogClick}
      >
        <form className="create-class-form" onSubmit={handleCreateClass} noValidate>
          <p className="eyebrow">New class</p>
          <h2 id="create-class-heading">Create a class</h2>
          <p id="create-class-description">
            Give the class a name your students and you will recognize.
          </p>
          <div className="field">
            <label htmlFor="class-name">Class name</label>
            <input
              id="class-name"
              name="class-name"
              type="text"
              autoComplete="off"
              maxLength={CLASS_NAME_MAX_LENGTH}
              placeholder="For example, English 9"
              value={className}
              onChange={(event) => {
                setClassName(event.target.value);
                setCreateError(null);
              }}
              disabled={creating}
              aria-invalid={Boolean(createError)}
              aria-describedby={createError ? "class-name-error" : undefined}
              autoFocus
              required
            />
          </div>
          <div className="dialog-message" aria-live="polite">
            {createError && (
              <p id="class-name-error" className="error-message">
                {createError}
              </p>
            )}
          </div>
          <div className="dialog-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={closeCreateDialog}
              disabled={creating}
            >
              Cancel
            </button>
            <button className="primary-button" type="submit" disabled={creating}>
              {creating ? "Creating..." : "Create class"}
            </button>
          </div>
        </form>
      </dialog>
    </main>
  );
}
