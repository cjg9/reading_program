export const MAX_INVITE_ROWS = 30;
export interface InviteRecipient { firstName: string; lastName: string; email: string }
export function validateRecipients(rows: InviteRecipient[]): string[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const email = row.email.trim().toLowerCase();
    counts.set(email, (counts.get(email) ?? 0) + 1);
  }
  return rows.map(row => {
    if ([row.firstName,row.lastName].some(name => !name.trim() || [...name.trim()].length > 80 || /[\u0000-\u001f\u007f]/.test(name)))
      return "Enter a first and last name (up to 80 characters each).";
    const email = row.email.trim().toLowerCase();
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Enter a valid email address.";
    if ((counts.get(email) ?? 0) > 1) return "This email appears more than once in the table.";
    return "";
  });
}
