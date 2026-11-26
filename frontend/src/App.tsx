import React, { useCallback, useEffect, useState } from "react";
import { onIdTokenChanged, signOut, type User } from "firebase/auth";
import { APP_NAME, type ProjectRole } from "../../appConfig";
import { AuthGate } from "./components/AuthGate";
import { DesktopOnlyGate } from "./components/DesktopOnlyGate";
import { IntroSplash } from "./components/IntroSplash";
import { Lobby } from "./components/Lobby";
import { Workspace } from "./components/Workspace";
import { auth } from "./config/firebase";
import { api } from "./services/api";
import type { AnvilUser } from "./types/anvil";

export const App: React.FC = () => {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(auth.currentUser);
  const [authReady, setAuthReady] = useState(false);
  const [showIntro, setShowIntro] = useState(true);
  const [dbUser, setDbUser] = useState<AnvilUser | null>(null);
  const [activeProject, setActiveProject] = useState<{
    projectId: string;
    role: ProjectRole;
  } | null>(null);
  const [lobbyNotice, setLobbyNotice] = useState<string | null>(null);

  const initialInviteCode = React.useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("session");
    return code ? code.trim().toUpperCase() : null;
  }, []);

  useEffect(() => {
    document.title = APP_NAME;
  }, []);

  const syncMe = useCallback(async (fbUser: User | null) => {
    if (!fbUser || !fbUser.emailVerified) {
      setDbUser(null);
      setActiveProject(null);
      return;
    }
    try {
      const me = await api.getMe();
      setDbUser(me.user);
    } catch {
      setDbUser(null);
    }
  }, []);

  useEffect(() => {
    const unsub = onIdTokenChanged(auth, (fbUser) => {
      setFirebaseUser(fbUser);
      void syncMe(fbUser).finally(() => setAuthReady(true));
    });
    return () => unsub();
  }, [syncMe]);

  const handleSignOut = async () => {
    setActiveProject(null);
    setDbUser(null);
    await signOut(auth);
  };

  const renderContent = () => {
    if (!authReady) {
      return (
        <div className="h-screen w-screen bg-[#1e1e1e] text-[#cccccc] flex items-center justify-center text-[13px]">
          Initializing {APP_NAME}...
        </div>
      );
    }

    if (!firebaseUser || !firebaseUser.emailVerified || !dbUser) {
      return (
        <AuthGate
          firebaseUser={firebaseUser}
          onVerified={async () => {
            if (auth.currentUser) {
              setFirebaseUser(auth.currentUser);
              await syncMe(auth.currentUser);
            }
          }}
        />
      );
    }

    if (!activeProject) {
      return (
        <Lobby
          user={dbUser}
          initialInviteCode={initialInviteCode}
          bannerNotice={lobbyNotice}
          onClearNotice={() => setLobbyNotice(null)}
          onOpenProject={(projectId, role) => {
            setLobbyNotice(null);
            setActiveProject({ projectId, role });
          }}
          onSignOut={handleSignOut}
          onUserUpdated={(updated) => setDbUser(updated)}
        />
      );
    }

    return (
      <Workspace
        projectId={activeProject.projectId}
        initialRole={activeProject.role}
        user={dbUser}
        onExitToLobby={(notice) => {
          setActiveProject(null);
          if (notice) setLobbyNotice(notice);
        }}
        onSignOut={handleSignOut}
        onUserUpdated={(updated) => setDbUser(updated)}
      />
    );
  };

  return (
    <DesktopOnlyGate>
      <>
        {renderContent()}
        {showIntro && (
          <IntroSplash authReady={authReady} onFinish={() => setShowIntro(false)} />
        )}
      </>
    </DesktopOnlyGate>
  );
};

export default App;
