import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type PropsWithChildren,
} from "react";
import { api, ApiError, clearAuthMemory, setAuthContext } from "./client";
import type { Profile } from "./types";
type State = "loading" | "authenticated" | "anonymous" | "error";
interface Auth {
  state: State;
  profile: Profile | null;
  error: string;
  reload: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  select: (key: string) => Promise<Profile>;
}
const Context = createContext<Auth | null>(null);
export function AuthProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<State>("loading"),
    [profile, setProfile] = useState<Profile | null>(null),
    [error, setError] = useState("");
  const revision = useRef(0);
  const selecting = useRef(0);
  const reload = useCallback(async () => {
    if(selecting.current)return;
    const version = ++revision.current;
    try {
      const value = await api<Profile>("/auth/me");
      if (version !== revision.current) return;
      setAuthContext(value.activeContext?.key ?? null, value.user.id);
      setProfile(value);
      setState("authenticated");
      setError("");
    } catch (e) {
      if (version !== revision.current) return;
      setAuthContext(null);
      setProfile(null);
      if (e instanceof ApiError && e.status === 401) {
        clearAuthMemory();
        setState("anonymous");
      } else {
        setState("error");
        setError(
          e instanceof Error ? e.message : "Le serveur est indisponible.",
        );
      }
    }
  }, []);
  useEffect(() => {
    void Promise.resolve().then(reload);
  }, [reload]);
  useEffect(() => {
    const focus = () => {
      void reload();
    };
    window.addEventListener("focus", focus);
    return () => window.removeEventListener("focus", focus);
  }, [reload]);
  useEffect(()=>{const invalid=()=>{revision.current++;clearAuthMemory();setProfile(null);setState('anonymous');};window.addEventListener('dnd-session-invalid',invalid);return()=>window.removeEventListener('dnd-session-invalid',invalid);},[]);
  const login = async (email: string, password: string) => {
    await api("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password, deviceName: "Navigateur Web" }),
    });
    await reload();
  };
  const logout = async () => {
    await api("/auth/logout", { method: "POST", body: "{}" });
    revision.current++;
    clearAuthMemory();
    setProfile(null);
    setState("anonymous");
  };
  const select = async (key: string) => {
    const version=++revision.current;
    selecting.current=version;
    setState("loading");
    setProfile(null);
    try {
    const value = await api<Profile>("/auth/switch-organization", {
      method: "POST",
      body: JSON.stringify({ contextKey: key }),
    });
    if(version===revision.current){setAuthContext(value.activeContext?.key ?? null, value.user.id);setProfile(value);setState("authenticated");}
    return value;
    }catch(e){
      if(version===revision.current){setAuthContext(null);setState("error");setError(e instanceof Error?e.message:"Changement impossible.");}
      throw e;
    }finally{if(selecting.current===version)selecting.current=0;}
  };
  return (
    <Context.Provider
      value={{ state, profile, error, reload, login, logout, select }}
    >
      {children}
    </Context.Provider>
  );
}
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const value = useContext(Context);
  if (!value) throw new Error("AuthProvider missing");
  return value;
}
