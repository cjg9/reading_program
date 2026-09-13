export type AccountType = "teacher" | "student";

export const portalPath: Record<AccountType, string> = {
  teacher: "/teacher",
  student: "/",
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

  // Keep old student bookmarks and email callbacks working.
  if (normalizedPath === portalPath.student || normalizedPath === "/student") {
    return "student";
  }

  return null;
}
