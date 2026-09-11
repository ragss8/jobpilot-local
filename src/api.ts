import type { Conversation } from "./studioStorage";

const SESSION_KEY = "aangan-session-v1";

export interface User {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
}
export interface Session {
  token: string;
  user: User;
}
export interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: string;
  messageCount: number;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export function loadSession(): Session | null {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) ?? "null");
  } catch {
    return null;
  }
}
export function saveSession(session: Session | null) {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch {}
}

async function request<T>(
  path: string,
  token?: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok)
    throw new ApiError(
      body?.error ??
        "The account server isn't responding. Start it with npm run server.",
      response.status,
    );
  return body as T;
}

export const api = {
  config: () => request<{ googleClientId: string }>("/auth/config"),
  signIn: (credential: string) =>
    request<Session>("/auth/google", undefined, {
      method: "POST",
      body: JSON.stringify({ credential }),
    }),
  conversations: (token: string) =>
    request<ConversationSummary[]>("/conversations", token),
  conversation: (token: string, id: string) =>
    request<Conversation>(`/conversations/${id}`, token),
  saveConversation: (token: string, id: string, conversation: Conversation) =>
    request<ConversationSummary>(`/conversations/${id}`, token, {
      method: "PUT",
      body: JSON.stringify(conversation),
    }),
};
