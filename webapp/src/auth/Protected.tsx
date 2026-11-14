import type { PropsWithChildren } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthProvider";
export function Protected({ children }: PropsWithChildren) {
  const auth = useAuth();
  if (auth.state === "loading")
    return (
      <main className="auth-loading" role="status">
        Restauration de votre session…
      </main>
    );
  if (auth.state === "error")
    return (
      <main className="entry-page">
        <div className="entry-card">
          <h1>Connexion interrompue.</h1>
          <p role="alert">{auth.error}</p>
          <button className="button" onClick={() => void auth.reload()}>
            Réessayer
          </button>
        </div>
      </main>
    );
  if (auth.state === "anonymous") return <Navigate to="/connexion" replace />;
  return children;
}
