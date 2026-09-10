import { parseProject } from "./engine";
import type { Brief } from "./brief";
import type { PlanningResult } from "./residentialPlanner";
export const CHAT_KEY = "aangan-conversation-v3";
const RESET_KEY = "aangan-fresh-chat-v3";
export interface Message {
  role: "user" | "assistant";
  text: string;
}
export interface Conversation {
  messages: Message[];
  brief: Brief | null;
  result: PlanningResult | null;
  choice: number;
}
export const emptyConversation = (): Conversation => ({
  messages: [],
  brief: null,
  result: null,
  choice: 0,
});
export function resetArchitecture(storage: Storage) {
  for (const key of [
    "aangan-project-v1",
    "aangan-project-v1-recovery",
    CHAT_KEY,
  ])
    storage.removeItem(key);
  storage.setItem(RESET_KEY, "1");
}
export function loadConversation(storage: Storage): Conversation {
  if (storage.getItem(RESET_KEY) !== "1") resetArchitecture(storage);
  const raw = storage.getItem(CHAT_KEY);
  if (!raw) return emptyConversation();
  const c = JSON.parse(raw) as Conversation;
  if (
    !Array.isArray(c.messages) ||
    c.messages.some(
      (m) =>
        !["user", "assistant"].includes(m.role) || typeof m.text !== "string",
    )
  )
    throw Error("Saved conversation could not be read.");
  if (c.result) {
    for (const proposal of c.result.proposals)
      proposal.project = parseProject(proposal.project);
  }
  return c;
}
