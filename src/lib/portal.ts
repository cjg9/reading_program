export type AccountType = "teacher" | "student";

export const portalPath: Record<AccountType, string> = {
  teacher: "/",
  student: "/student",
};

export function isAccountType(value: unknown): value is AccountType {
  return value === "teacher" || value === "student";
}

export function resolvePortal(pathname: string): AccountType | null {
  if (!pathname) {
    return null;
  }

  const normalizedPath = pathname.replace(/\/+$/, "") || "/";

  if (normalizedPath === portalPath.teacher) {
    return "teacher";
  }

  if (normalizedPath === portalPath.student) {
    return "student";
  }

  return null;
}
