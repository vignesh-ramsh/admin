import { useEffect, useState } from "react";
import { call } from "../../api/client";
import type { User } from "../../api/types";

/* Sessions/access-keys are keyed by user id (a raw UUID) — list_sessions/
   list_access_keys never join to _users (Relay's Query Engine only
   resolves REFERENCE fields, and `user` here has no target_field, so the
   id alone is what's returned). Loading the user list once and mapping
   id -> user client-side is cheap (one extra call per page) and avoids
   teaching two more endpoints to do a join neither table needs for
   anything else. */

export interface UserDirectory {
  users: User[];
  byId: Map<string, User>;
  loading: boolean;
  emailFor: (userId: string) => string;
}

export function useUserDirectory(): UserDirectory {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    call<User[]>("list_users", {}, { method: "GET" })
      .then(setUsers)
      .finally(() => setLoading(false));
  }, []);

  const byId = new Map(users.map((u) => [u.id, u]));

  return {
    users,
    byId,
    loading,
    emailFor: (userId: string) => byId.get(userId)?.email ?? userId,
  };
}
