import { useState } from "react";
import Login from "./Login";
import Studio from "./Studio";
import { loadSession, saveSession, type Session } from "./api";

export default function App() {
  const [session, setSession] = useState(loadSession);
  function change(next: Session | null) {
    saveSession(next);
    setSession(next);
  }
  return session ? (
    <Studio
      key={session.user.id}
      session={session}
      onSignOut={() => change(null)}
    />
  ) : (
    <Login onSignIn={change} />
  );
}
