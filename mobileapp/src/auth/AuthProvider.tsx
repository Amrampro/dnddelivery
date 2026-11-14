import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type PropsWithChildren,
} from "react";
import { Platform, AppState } from "react-native";
import {
  api,
  ApiError,
  onSessionInvalid,
  restoreCredentials,
  forgetSession,
  switchContext,
  assertCanSwitchContext,
  login as signIn,
  logout as signOut,
} from "./client";
import type { Profile } from "./types";
import { parseProfile } from "./contracts";
interface Auth {
  state: "loading" | "anonymous" | "authenticated" | "error";
  profile: Profile | null;
  error: string;
  reload: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  select: (key: string) => Promise<void>;
}
const Context = createContext<Auth | null>(null);
export function AuthProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<Auth["state"]>("loading"),
    [profile, setProfile] = useState<Profile | null>(null),
    [error, setError] = useState("");
  const revision = useRef(0),
    selecting = useRef(0),
    restored = useRef<Promise<boolean> | null>(null);
  const lastProfile = useRef<Profile | null>(null);
  const reload = useCallback(async () => {
    if (selecting.current) return;
    const version = ++revision.current;
    try {
      if (!(await (restored.current ??= restoreCredentials()))) {
        if (version === revision.current) {
          lastProfile.current = null;
          setProfile(null);
          setState("anonymous");
        }
        return;
      }
      const value = parseProfile(await api<unknown>("/auth/me"));
      if (version !== revision.current) return;
      setProfile(value);
      lastProfile.current = value;
      setState("authenticated");
      setError("");
    } catch (e) {
      if (version !== revision.current) return;
      if (e instanceof ApiError && e.status === 401) {
        await forgetSession();
        restored.current = null;
        setProfile(null);
        lastProfile.current = null;
        setState("anonymous");
      } else {
        const transient = e instanceof ApiError && e.status === 0;
        if (!transient) {
          lastProfile.current = null;
          setProfile(null);
        }
        setState(transient && lastProfile.current ? "authenticated" : "error");
        setError(
          e instanceof Error ? e.message : "Le serveur est indisponible.",
        );
      }
    }
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void reload();
    });
    return () => sub.remove();
  }, [reload]);
  useEffect(
    () =>
      onSessionInvalid(() => {
        revision.current++;
        restored.current = null;
        lastProfile.current = null;
        setProfile(null);
        setState("anonymous");
      }),
    [],
  );
  const login = async (email: string, password: string) => {
    await signIn(
      email,
      password,
      Platform.OS === "ios" ? "Application iOS" : Platform.OS === "android" ? "Application Android" : "Aperçu Web Expo",
    );
    restored.current = Promise.resolve(true);
    await reload();
  };
  const logout = async () => {
    await signOut();
    lastProfile.current = null;
    revision.current++;
    restored.current = null;
    setProfile(null);
    setState("anonymous");
  };
  const select = async (key: string) => {
    assertCanSwitchContext();
    const version = ++revision.current;
    selecting.current = version;
    setState("loading");
    try {
      const value = parseProfile(await switchContext<unknown>(key));
      if (version === revision.current) {
        lastProfile.current = value;
        setProfile(value);
        setState("authenticated");
      }
    } catch (e) {
      if (version === revision.current) {
        lastProfile.current = null;
        setProfile(null);
        setState("error");
        setError(
          e instanceof Error
            ? e.message
            : "Le changement d’environnement n’est pas confirmé. Vérifiez vos accès.",
        );
      }
      throw e;
    } finally {
      if (selecting.current === version) selecting.current = 0;
    }
  };
  return (
    <Context.Provider
      value={{ state, profile, error, reload, login, logout, select }}
    >
      {children}
    </Context.Provider>
  );
}
export function useAuth() {
  const value = useContext(Context);
  if (!value) throw new Error("AuthProvider missing");
  return value;
}
