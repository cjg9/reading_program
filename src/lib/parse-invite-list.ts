import type { InviteRecipient } from "./invite-batch";

type Column = keyof InviteRecipient | "name" | "ignore";
function columnName(value: string): Column {
  const normalized = value.toLowerCase().replace(/[\s_-]+/g, "");
  if (["firstname", "givenname"].includes(normalized)) return "firstName";
  if (["lastname", "surname", "familyname"].includes(normalized)) return "lastName";
  if (["email", "emailaddress", "studentemail"].includes(normalized)) return "email";
  if (["name", "fullname", "studentname"].includes(normalized)) return "name";
  return "ignore";
}

function splitName(name: string): Pick<InviteRecipient, "firstName" | "lastName"> {
  // A comma in a full-name cell explicitly denotes "Last, First".
  if (name.includes(",")) {
    const comma = name.indexOf(",");
    return {firstName:name.slice(comma + 1).trim(), lastName:name.slice(0, comma).trim()};
  }
  const [firstName = "", ...last] = name.trim().split(/\s+/);
  return {firstName, lastName:last.join(" ")};
}

function cells(line: string, delimiter: string, lineNumber: number): string[] {
  const result: string[] = [];
  let value = ""; let quoted = false; let closed = false;
  for (let index = 0; index < line.length; index++) {
    const character = line[index];
    if (quoted) {
      if (character === '"' && line[index + 1] === '"') { value += '"'; index++; }
      else if (character === '"') { quoted = false; closed = true; }
      else value += character;
    } else if (character === delimiter) {
      result.push(value.trim()); value = ""; closed = false;
    } else if (character === '"' && !value.trim() && !closed) { value = ""; quoted = true; }
    else if (closed && character.trim()) throw new Error(`Line ${lineNumber}: check the quoted columns.`);
    else value += character;
  }
  if (quoted) throw new Error(`Line ${lineNumber}: close the quotation marks. Use one student per line.`);
  result.push(value.trim());
  return result;
}

/** Parse locally; importing never sends mail or drops an unrecognized row. */
export function parseInviteList(text: string): InviteRecipient[] {
  if (text.length > 100_000) throw new Error("This list is too large. Paste up to 30 students at a time.");
  const lines = text.replace(/^\uFEFF/, "").split(/\r\n|\n|\r/)
    .map((line,index) => ({line,number:index + 1})).filter(({line}) => line.trim());
  if (!lines.length) throw new Error("Paste a student list first.");
  let columns: Column[] | undefined;
  const students: InviteRecipient[] = [];
  for (const {line, number} of lines) {
    const delimiter = line.includes("\t") ? "\t" : line.includes(",") ? "," : "";
    const values = delimiter ? cells(line, delimiter, number) : [line.trim()];
    if (!students.length && !columns) {
      const candidates = values.map(columnName);
      if (candidates.includes("email") && (candidates.includes("name") || (candidates.includes("firstName") && candidates.includes("lastName")))) {
        const recognized = candidates.filter(column => column !== "ignore");
        if (new Set(recognized).size !== recognized.length) throw new Error(`Line ${number}: each name or email header must appear only once.`);
        columns = candidates; continue;
      }
    }
    let recipient: InviteRecipient;
    if (columns) {
      if (values.length !== columns.length) throw new Error(`Line ${number}: the number of columns does not match the header.`);
      recipient = {firstName:"",lastName:"",email:""};
      columns.forEach((column,index) => {
        if (column === "name") Object.assign(recipient,splitName(values[index]));
      });
      columns.forEach((column,index) => {
        if (column !== "ignore" && column !== "name") recipient[column] = values[index];
      });
    } else if (values.length === 3) {
      recipient = {firstName:values[0],lastName:values[1],email:values[2]};
    } else if (values.length === 2) {
      const emailFirst = values[0].includes("@") && !values[1].includes("@");
      recipient = {...splitName(values[emailFirst ? 1 : 0]),email:values[emailFirst ? 0 : 1]};
    } else if (values.length === 1) {
      const emails = line.match(/[^\s<>;,]+@[^\s<>;,]+/g) ?? [];
      if (emails.length > 1) throw new Error(`Line ${number}: use one student per line.`);
      const email = emails[0] ?? "";
      const name = email ? line.replace(email, "").replace(/[<>]/g, "").trim() : line.trim();
      recipient = {...splitName(name),email};
    } else throw new Error(`Line ${number}: use First name, Last name, Email, or include column headers.`);
    recipient.email = recipient.email.trim().toLowerCase();
    students.push(recipient);
  }
  if (!students.length) throw new Error("The list has a header but no students. Paste the student rows too.");
  return students;
}
