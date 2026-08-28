export const CLASS_NAME_MAX_LENGTH = 80;

export interface TeacherClass {
  id: number;
  teacher_id: string;
  name: string;
  created_at: string;
  last_accessed_at: string;
}

export function validateClassName(name: string): string | null {
  const trimmedName = name.trim();

  if (!trimmedName) {
    return "Enter a class name.";
  }

  if ([...trimmedName].length > CLASS_NAME_MAX_LENGTH) {
    return `Class names must be ${CLASS_NAME_MAX_LENGTH} characters or fewer.`;
  }

  return null;
}

export function sortClassesByLastAccessed(
  classes: TeacherClass[],
): TeacherClass[] {
  return [...classes].sort((left, right) => {
    const timestampDifference =
      Date.parse(right.last_accessed_at) - Date.parse(left.last_accessed_at);

    if (Number.isFinite(timestampDifference) && timestampDifference !== 0) {
      return timestampDifference;
    }

    return right.id - left.id;
  });
}

export function formatRelativeTime(
  timestamp: string,
  now = Date.now(),
): string {
  const accessedAt = Date.parse(timestamp);

  if (!Number.isFinite(accessedAt)) {
    return "recently";
  }

  const elapsedSeconds = Math.max(0, Math.floor((now - accessedAt) / 1000));

  if (elapsedSeconds < 10) {
    return "just now";
  }

  const units = [
    { seconds: 31_536_000, label: "year" },
    { seconds: 2_592_000, label: "month" },
    { seconds: 604_800, label: "week" },
    { seconds: 86_400, label: "day" },
    { seconds: 3_600, label: "hour" },
    { seconds: 60, label: "minute" },
    { seconds: 1, label: "second" },
  ];

  const unit = units.find(({ seconds }) => elapsedSeconds >= seconds);

  if (!unit) {
    return "just now";
  }

  const amount = Math.floor(elapsedSeconds / unit.seconds);
  return `${amount} ${unit.label}${amount === 1 ? "" : "s"} ago`;
}
