import { cert, getApps, initializeApp, applicationDefault, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getDataConnect } from "firebase-admin/data-connect";
import { getStorage } from "firebase-admin/storage";
import { env } from "./env.js";

function createFirebaseAdminApp(): App {
  if (getApps().length > 0) {
    return getApps()[0]!;
  }

  if (env.USE_FIREBASE_EMULATORS) {
    return initializeApp({
      projectId: env.FIREBASE_PROJECT_ID,
      storageBucket: env.FIREBASE_STORAGE_BUCKET,
    });
  }

  if (env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    const parsed = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
    return initializeApp({
      credential: cert(parsed),
      projectId: env.FIREBASE_PROJECT_ID,
      storageBucket: env.FIREBASE_STORAGE_BUCKET,
    });
  }

  return initializeApp({
    credential: applicationDefault(),
    projectId: env.FIREBASE_PROJECT_ID,
    storageBucket: env.FIREBASE_STORAGE_BUCKET,
  });
}

export const firebaseAdminApp = createFirebaseAdminApp();
export const adminAuth = getAuth(firebaseAdminApp);
export const adminStorage = getStorage(firebaseAdminApp);
export const dataConnect = getDataConnect(
  {
    serviceId: env.DATA_CONNECT_SERVICE_ID,
    location: env.DATA_CONNECT_LOCATION,
    connector: env.DATA_CONNECT_CONNECTOR,
  },
  firebaseAdminApp
);
