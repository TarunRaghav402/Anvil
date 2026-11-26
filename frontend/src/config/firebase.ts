import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectStorageEmulator, getStorage } from "firebase/storage";

function requireFrontendEnv(name: keyof ImportMetaEnv, value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(
      `[Anvil] Missing required environment variable "${name}". Copy .env.example to .env at the repository root and restart Vite.`
    );
  }
  return trimmed;
}

const useEmulators = import.meta.env.VITE_USE_EMULATORS === "true";

const firebaseConfig = {
  apiKey: requireFrontendEnv("VITE_FIREBASE_API_KEY", import.meta.env.VITE_FIREBASE_API_KEY),
  authDomain: requireFrontendEnv(
    "VITE_FIREBASE_AUTH_DOMAIN",
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN
  ),
  projectId: requireFrontendEnv(
    "VITE_FIREBASE_PROJECT_ID",
    import.meta.env.VITE_FIREBASE_PROJECT_ID
  ),
  storageBucket: requireFrontendEnv(
    "VITE_FIREBASE_STORAGE_BUCKET",
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET
  ),
  appId: requireFrontendEnv("VITE_FIREBASE_APP_ID", import.meta.env.VITE_FIREBASE_APP_ID),
};

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const storage = getStorage(firebaseApp);

if (useEmulators) {
  const authUrl = requireFrontendEnv(
    "VITE_FIREBASE_AUTH_EMULATOR_URL",
    import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_URL
  );
  const storageHost = requireFrontendEnv(
    "VITE_FIREBASE_STORAGE_EMULATOR_HOST",
    import.meta.env.VITE_FIREBASE_STORAGE_EMULATOR_HOST
  );
  const storagePortRaw = requireFrontendEnv(
    "VITE_FIREBASE_STORAGE_EMULATOR_PORT",
    import.meta.env.VITE_FIREBASE_STORAGE_EMULATOR_PORT
  );
  const storagePort = Number(storagePortRaw);
  if (!Number.isInteger(storagePort) || storagePort < 1 || storagePort > 65535) {
    throw new Error(
      `[Anvil] Invalid VITE_FIREBASE_STORAGE_EMULATOR_PORT value "${storagePortRaw}". Expected a TCP port between 1 and 65535.`
    );
  }

  connectAuthEmulator(auth, authUrl, { disableWarnings: true });
  connectStorageEmulator(storage, storageHost, storagePort);
}

export const IS_EMULATOR_MODE = useEmulators;
