import { useEffect, lazy, Suspense } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import { Landing } from "./pages/Landing";
import { Entry } from "./pages/Entry";
import { PortalLayout } from "./layouts/PortalLayout";
import { AuthPage } from "./pages/AuthPage";
import { Organizations } from "./pages/Organizations";
import { ProfilePage } from "./pages/Profile";
import { Protected } from "./auth/Protected";
import { PublicLayout } from "./layouts/PublicLayout";
import { InvitationPage } from "./admin/InvitationPage";
const PartnerRegistration = lazy(() =>
  import("./partners/PartnerRegistration").then((m) => ({
    default: m.PartnerRegistration,
  })),
);
const TrackingPage = lazy(() => import("./tracking/TrackingPage").then(m=>({default:m.TrackingPage})));
const PartnerInvitation = lazy(() =>
  import("./partners/PartnerRegistration").then((m) => ({
    default: m.PartnerInvitation,
  })),
);
export default function App() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash)
      requestAnimationFrame(() =>
        document.getElementById(hash.slice(1))?.scrollIntoView(),
      );
    else window.scrollTo(0, 0);
  }, [pathname, hash]);
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/" element={<Landing />} />
        <Route path="/suivi" element={<Suspense fallback={<p role="status">Chargement du suivi…</p>}><TrackingPage /></Suspense>} />
      </Route>
      <Route path="/connexion" element={<AuthPage key="login" />} />
      <Route path="/invitation" element={<InvitationPage />} />
      <Route
        path="/inscription-boutique"
        element={
          <Suspense fallback={<p role="status">Chargement…</p>}>
            <PartnerRegistration />
          </Suspense>
        }
      />
      <Route
        path="/invitation-boutique"
        element={
          <Suspense fallback={<p role="status">Chargement…</p>}>
            <PartnerInvitation />
          </Suspense>
        }
      />
      <Route path="/mot-de-passe-oublie" element={<AuthPage key="forgot" />} />
      <Route path="/reinitialisation" element={<AuthPage key="reset" />} />
      <Route
        path="/organisations"
        element={
          <Protected>
            <Organizations />
          </Protected>
        }
      />
      <Route
        path="/profil"
        element={
          <Protected>
            <ProfilePage />
          </Protected>
        }
      />
      <Route
        path="/portail/:role/:module?/:entityId?/:action?"
        element={
          <Protected>
            <PortalLayout />
          </Protected>
        }
      />
      <Route path="*" element={<Entry />} />
    </Routes>
  );
}
