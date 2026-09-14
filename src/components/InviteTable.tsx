import { useEffect, useRef, useState, type FormEvent } from "react";
import { MAX_INVITE_ROWS, validateRecipients, type InviteRecipient } from "../lib/invite-batch";
import { parseInviteList } from "../lib/parse-invite-list";

interface Entry extends InviteRecipient { id: number; status: "ready" | "sending" | "sent" | "failed"; error: string }
interface Props {
  send: (recipient: InviteRecipient) => Promise<void>;
  onComplete: () => Promise<void>;
  onBusyChange: (busy: boolean) => void;
  disabled: boolean;
}

export function InviteTable({ send, onComplete, onBusyChange, disabled }: Props) {
  const nextId = useRef(1);
  const blank = (): Entry => ({id:nextId.current++,firstName:"",lastName:"",email:"",status:"ready",error:""});
  const [rows, setRows] = useState<Entry[]>(() => [blank()]);
  const [busy, setBusy] = useState(false);
  const [tableOpen, setTableOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [pasteError, setPasteError] = useState("");
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const pending = rows.filter(row => row.status !== "sent");

  function importList(text: string) {
    if (busy || disabled) return;
    try {
      const imported = parseInviteList(text);
      const retained = rows.filter(row => row.status === "sent" || row.firstName.trim() || row.lastName.trim() || row.email.trim());
      if (retained.length + imported.length > MAX_INVITE_ROWS)
        throw new Error(`This would create ${retained.length + imported.length} rows. Keep the table to ${MAX_INVITE_ROWS} students per batch; no rows have been added.`);
      const combined: Entry[] = [...retained,...imported.map(recipient => ({...recipient,id:nextId.current++,status:"ready" as const,error:""}))];
      const errors = validateRecipients(combined);
      setRows(combined.map((row,index) => row.status === "sent" ? row : {...row,error:errors[index]}));
      setTableOpen(true);
      setPasteText(""); setPasteError("");
      setNotice(`Added ${imported.length} student${imported.length === 1 ? "" : "s"}. Review the names and emails below${errors.some(Boolean) ? " and correct the highlighted rows" : ""}, then send the invitations.`);
    } catch (error) { setPasteText(text); setPasteError(error instanceof Error ? error.message : "We could not read this list."); }
  }

  function update(id: number, field: keyof InviteRecipient, value: string) {
    setRows(current => current.map(row => row.id === id ? {...row,[field]:value,error:"",status:"ready"} : row));
    setNotice("");
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || disabled || !pending.length) return;
    if (pasteText.trim()) { setPasteError("Add your pasted list to the table before sending."); return; }
    // Include sent rows in duplicate validation so a retry cannot resend them.
    const errors = validateRecipients(rows);
    if (errors.some((error,index) => error && rows[index].status !== "sent")) {
      setTableOpen(true);
      setRows(current => current.map((row,index) => row.status === "sent" ? row : {...row,error:errors[index]}));
      setNotice("Check the highlighted rows before sending."); return;
    }
    setTableOpen(true); setBusy(true); onBusyChange(true); setNotice("Sending invitations. Keep this class open until the batch finishes.");
    let sent = 0; let failed = 0;
    try {
      for (const [index, row] of pending.entries()) {
        // Pace calls to the mail provider. Each recipient still has an individual,
        // server-authorized request and consumes the existing teacher quota.
        if (index > 0) await new Promise(resolve => setTimeout(resolve, 600));
        if (!mounted.current) break;
        setRows(current => current.map(item => item.id === row.id ? {...item,status:"sending",error:""} : item));
        try {
          await send({firstName:row.firstName.trim(),lastName:row.lastName.trim(),email:row.email.trim().toLowerCase()});
          sent++;
          if (mounted.current) setRows(current => current.map(item => item.id === row.id ? {...item,status:"sent"} : item));
        } catch (error) {
          failed++;
          if (mounted.current) setRows(current => current.map(item => item.id === row.id ? {...item,status:"failed",error:error instanceof Error ? error.message : "Unable to send. Please try again."} : item));
        }
      }
      if (mounted.current) {
        setNotice(`${sent} invitation${sent === 1 ? "" : "s"} sent.${failed ? ` ${failed} need attention. Retry sends only the unsent rows.` : " Links expire in 7 days."}`);
        await onComplete();
      }
    } finally { if (mounted.current) { setBusy(false); onBusyChange(false); } }
  }

  return <form className="invite-batch" onSubmit={submit} noValidate>
    <div className="invite-paste">
      <label htmlFor="invite-paste-list">Paste a student list</label>
      <p id="invite-paste-help">Copy columns from Excel or Google Sheets, or paste one student per line. Use first name, last name, and email; full name and email work too. Column headers are optional.</p>
      <textarea id="invite-paste-list" rows={5} value={pasteText} disabled={busy || disabled}
        aria-describedby="invite-paste-help invite-paste-error" aria-invalid={Boolean(pasteError)}
        placeholder={'Alex Rivera alex@example.com\nSam Chen sam@example.com'}
        onChange={event => { setPasteText(event.target.value); setPasteError(""); }} />
      <div className="invite-batch-actions">
        <button className="secondary-button" type="button" disabled={busy || disabled || !pasteText.trim()} onClick={() => importList(pasteText)}>Add list to table</button>
        {pasteText && <button className="text-button" type="button" disabled={busy || disabled} onClick={() => { setPasteText(""); setPasteError(""); }}>Clear pasted text</button>}
      </div>
      <p className="people-help">Comma-separated lists also work. Review the first and last name split for full names. Adding a list keeps existing rows and does not send emails.</p>
      <p id="invite-paste-error" className="error-message" role="alert">{pasteError}</p>
    </div>
    <button className="invite-toggle" type="button" aria-expanded={tableOpen} aria-controls="invite-review-table"
      disabled={busy} onClick={() => setTableOpen(open => !open)}>
      Invitation table<span className="invite-chevron" aria-hidden="true">{tableOpen ? "▴" : "▾"}</span>
    </button>
    <div id="invite-review-table" hidden={!tableOpen}><div className="invite-table-scroll"><table className="invite-table">
      <caption>Review students — edit any field before sending</caption>
      <thead><tr><th scope="col">First name</th><th scope="col">Last name</th><th scope="col">Email address</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
      <tbody>{rows.map((row,index) => <tr key={row.id}>
        {(["firstName","lastName","email"] as const).map((field,fieldIndex) => <td key={field}>
          <input aria-label={`${["First name","Last name","Email address"][fieldIndex]} ${index + 1}`}
            type={field === "email" ? "email" : "text"} autoComplete="off" value={row[field]}
            maxLength={field === "email" ? 254 : 80} required disabled={busy || disabled || row.status === "sent"}
            aria-invalid={Boolean(row.error)} aria-describedby={row.error ? `invite-row-${row.id}-error` : undefined}
            onPaste={event => {
              const text = event.clipboardData.getData("text/plain");
              if (/\t|\r|\n/.test(text) || (text.includes(",") && text.includes("@"))) {
                event.preventDefault();
                if (pasteText.trim()) { setPasteError("Add or clear the pasted list above before pasting into the table."); return; }
                importList(text);
              }
            }}
            onChange={event => update(row.id,field,event.target.value)} />
        </td>)}
        <td className="invite-row-status"><span>{row.status === "sent" ? "Sent" : row.status === "sending" ? "Sending..." : row.error ? "Needs attention" : "Ready"}</span>
          {row.error && <p id={`invite-row-${row.id}-error`} className="error-message">{row.error}</p>}</td>
        <td><button className="text-button" type="button" aria-label={`Remove student ${index + 1}`} disabled={busy || disabled || rows.length === 1}
          onClick={() => { setRows(current => current.filter(item => item.id !== row.id)); setNotice(""); }}>Remove</button></td>
      </tr>)}</tbody>
    </table></div></div>
    <div className="invite-batch-actions">
      <button className="secondary-button" type="button" disabled={busy || disabled || rows.length >= MAX_INVITE_ROWS}
        onClick={() => { setRows(current => [...current,blank()]); setTableOpen(true); setNotice(""); }}>Add student</button>
      {rows.some(row => row.status === "sent") && <button className="text-button" type="button" disabled={busy || disabled}
        onClick={() => { setRows(current => { const unsent = current.filter(row => row.status !== "sent"); return unsent.length ? unsent : [blank()]; }); setNotice(""); }}>Clear sent rows</button>}
      <button className="primary-button" disabled={busy || disabled || pending.length === 0} type="submit">
        {busy ? "Sending..." : `${rows.some(row => row.status === "failed") ? "Retry" : "Send"} ${pending.length > 1 ? `${pending.length} invitations` : "invitation"}`}
      </button>
    </div>
    <p className="people-help">Up to {MAX_INVITE_ROWS} students per batch. The existing limit of 30 invitations per hour applies across your classes. Each student receives a separate email.</p>
    <p role="status" aria-live="polite">{notice}</p>
  </form>;
}
