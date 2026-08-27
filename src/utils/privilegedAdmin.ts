import prisma from "./prisma";

/** Privileged Super Admin who can set passwords on user create and fully edit/delete users. */
export const PRIVILEGED_SUPER_ADMIN_EMAIL = "allianceadmin@gmail.com";

/** Public label shown instead of the privileged Super Admin's real identity. */
export const SYSTEM_ADMIN_DISPLAY_NAME = "System Admin";

export const isPrivilegedSuperAdminEmail = (
  email?: string | null,
): boolean =>
  String(email || "")
    .trim()
    .toLowerCase() === PRIVILEGED_SUPER_ADMIN_EMAIL;

export const isPrivilegedSuperAdmin = (user?: {
  email?: string | null;
  originalRole?: string | null;
  role?: string | null;
} | null): boolean => {
  if (!user?.email) return false;
  if (!isPrivilegedSuperAdminEmail(user.email)) return false;
  const role = user.originalRole || user.role;
  // Middleware rewrites SUPER_ADMIN → ADMIN; accept either when email matches.
  return role === "SUPER_ADMIN" || role === "ADMIN";
};

/** ADMIN and SUPER_ADMIN (not SUB_ADMIN) — full user management incl. password on create. */
export const isAdminUser = (user?: {
  originalRole?: string | null;
  role?: string | null;
} | null): boolean => {
  if (!user) return false;
  const role = String(user.originalRole || user.role || "").toUpperCase();
  if (role === "SUB_ADMIN") return false;
  return role === "SUPER_ADMIN" || role === "ADMIN";
};

let privilegedIdCache: Set<string> | null = null;
let privilegedIdCacheAt = 0;
const PRIVILEGED_ID_CACHE_MS = 60_000;

/** Sync peek at cached privileged ids (may be empty until warmed). */
export const getCachedPrivilegedSuperAdminIds = (): Set<string> =>
  privilegedIdCache ?? new Set();

/** Resolve privileged Super Admin user ids (cached briefly). */
export const getPrivilegedSuperAdminIds = async (): Promise<Set<string>> => {
  const now = Date.now();
  if (privilegedIdCache && now - privilegedIdCacheAt < PRIVILEGED_ID_CACHE_MS) {
    return privilegedIdCache;
  }
  const rows = await prisma.user.findMany({
    where: {
      email: {
        equals: PRIVILEGED_SUPER_ADMIN_EMAIL,
        mode: "insensitive",
      },
    },
    select: { id: true },
  });
  privilegedIdCache = new Set(rows.map((row) => row.id));
  privilegedIdCacheAt = now;
  return privilegedIdCache;
};

export const invalidatePrivilegedSuperAdminIdCache = () => {
  privilegedIdCache = null;
  privilegedIdCacheAt = 0;
};

export const isPrivilegedIdentity = (
  person?: {
    id?: string | null;
    email?: string | null;
    name?: string | null;
  } | null,
  privilegedIds?: Set<string>,
): boolean => {
  if (!person) return false;
  if (isPrivilegedSuperAdminEmail(person.email)) return true;
  if (person.id && privilegedIds?.has(person.id)) return true;
  return false;
};

/** Mask a user/creator object so clients never see the privileged identity. */
export const maskPrivilegedIdentity = <
  T extends {
    id?: string | null;
    email?: string | null;
    name?: string | null;
  },
>(
  person: T | null | undefined,
  privilegedIds?: Set<string>,
): T | null | undefined => {
  if (!person || !isPrivilegedIdentity(person, privilegedIds)) return person;
  return {
    ...person,
    name: SYSTEM_ADMIN_DISPLAY_NAME,
    email: null,
  };
};

const USERISH_KEYS = new Set([
  "creator",
  "createdByUser",
  "updatedByUser",
  "amountAdder",
  "addedByUser",
  "user",
  "recipient",
  "changedByUser",
  "actor",
  "approver",
  "assignedByUser",
]);

/**
 * Deep-walk API payloads and replace privileged Super Admin identity with
 * "System Admin". Also redacts bare email strings that match the privileged email.
 */
export const sanitizePrivilegedIdentities = (
  value: unknown,
  privilegedIds?: Set<string>,
): unknown => {
  if (value == null) return value;
  if (Array.isArray(value)) {
    return value.map((item) => sanitizePrivilegedIdentities(item, privilegedIds));
  }
  if (typeof value !== "object") {
    if (
      typeof value === "string" &&
      isPrivilegedSuperAdminEmail(value)
    ) {
      return SYSTEM_ADMIN_DISPLAY_NAME;
    }
    return value;
  }

  const input = value as Record<string, unknown>;
  // Mask if this object itself looks like the privileged user
  let next: Record<string, unknown> = { ...input };
  if (
    isPrivilegedIdentity(
      {
        id: typeof next.id === "string" ? next.id : null,
        email: typeof next.email === "string" ? next.email : null,
        name: typeof next.name === "string" ? next.name : null,
      },
      privilegedIds,
    )
  ) {
    next = {
      ...next,
      name: SYSTEM_ADMIN_DISPLAY_NAME,
      email: null,
    };
  }

  for (const [key, child] of Object.entries(next)) {
    if (USERISH_KEYS.has(key) && child && typeof child === "object") {
      next[key] = maskPrivilegedIdentity(
        child as { id?: string; email?: string; name?: string },
        privilegedIds,
      );
      next[key] = sanitizePrivilegedIdentities(next[key], privilegedIds);
      continue;
    }
    // Nested creator.name style already handled by masking creator object.
    // Still recurse for nested payloads.
    next[key] = sanitizePrivilegedIdentities(child, privilegedIds);
  }

  return next;
};

/** Roles hidden from the User Role dashboard chart based on viewer. */
export const getHiddenRolesForDashboard = (
  viewerRole?: string | null,
): string[] => {
  const role = String(viewerRole || "").toUpperCase();
  if (role === "SUPER_ADMIN") return ["SUPER_ADMIN"];
  if (role === "ADMIN" || role === "SUB_ADMIN") {
    return ["SUPER_ADMIN", "ADMIN", "SUB_ADMIN"];
  }
  return [];
};

export const filterUsersByRoleForDashboard = <
  T extends { role?: string | null },
>(
  entries: T[] = [],
  viewerRole?: string | null,
): T[] => {
  const hidden = new Set(getHiddenRolesForDashboard(viewerRole));
  if (hidden.size === 0) return entries;
  return entries.filter(
    (entry) => !hidden.has(String(entry.role || "").toUpperCase()),
  );
};
