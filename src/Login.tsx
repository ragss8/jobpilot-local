import { useEffect, useRef, useState } from "react";
import { House } from "lucide-react";
import { api, type Session } from "./api";

interface GoogleIdentity {
  initialize(options: {
    client_id: string;
    callback: (response: { credential: string }) => void;
  }): void;
  renderButton(parent: HTMLElement, options: Record<string, string | number>): void;
}
declare global {
  interface Window {
    google?: { accounts: { id: GoogleIdentity } };
  }
}

let googleScript: Promise<void> | undefined;
function loadGoogleScript() {
  googleScript ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      googleScript = undefined;
      reject(
        Error("Google sign-in couldn't load. Check your internet connection and reload."),
      );
    };
    document.head.append(script);
  });
  return googleScript;
}

export default function Login({
  onSignIn,
}: {
  onSignIn: (session: Session) => void;
}) {
  const [clientId, setClientId] = useState<string | null>(null),
    [error, setError] = useState("");
  const button = useRef<HTMLDivElement>(null);
  useEffect(() => {
    api.config().then(
      (config) => setClientId(config.googleClientId),
      (e: Error) => setError(e.message),
    );
  }, []);
  useEffect(() => {
    if (!clientId) return;
    loadGoogleScript().then(
      () => {
        const google = window.google!.accounts.id;
        google.initialize({
          client_id: clientId,
          callback: ({ credential }) => {
            setError("");
            api.signIn(credential).then(onSignIn, (e: Error) => setError(e.message));
          },
        });
        if (button.current)
          google.renderButton(button.current, {
            theme: "outline",
            size: "large",
            shape: "pill",
            width: 280,
          });
      },
      (e: Error) => setError(e.message),
    );
  }, [clientId]);
  return (
    <div className="studio">
      <header className="studio-header">
        <a className="studio-brand" href="/" aria-label="Aangan home">
          <span>
            <House size={23} />
          </span>
          <b>aangan</b>
          <i>HOUSE DESIGN STUDIO</i>
        </a>
      </header>
      <main className="studio-welcome">
        <div className="welcome-intro">
          <div className="intro-kicker">
            <span />A HOME THAT STARTS WITH YOU
          </div>
          <h1>
            Sign in to your
            <br />
            design <em>studio.</em>
          </h1>
          <p>
            Every conversation is saved to your account,
            <br />
            so you can return to any design where you left it.
          </p>
        </div>
        <div className="login-card">
          {clientId ? (
            <div ref={button} />
          ) : clientId === "" ? (
            <p>
              Google sign-in isn’t set up yet. Add <code>GOOGLE_CLIENT_ID</code>{" "}
              to <code>.env</code>, then restart <code>npm run server</code>.
            </p>
          ) : (
            !error && <p>Connecting to the account server…</p>
          )}
          {error && (
            <p role="alert" className="storage-error">
              {error}
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
