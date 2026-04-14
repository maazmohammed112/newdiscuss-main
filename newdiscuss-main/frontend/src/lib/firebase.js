import { initializeApp, getApps } from 'firebase/app';
import {
  getDatabase,
  ref,
  get,
  set,
  push,
  update,
  remove,
  onValue,
  off,
  query,
  orderByChild,
  limitToLast,
  equalTo,
} from 'firebase/database';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  browserLocalPersistence,
  setPersistence,
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyAHjarX3OLHRw7kqvFh_8GsTnqsyl9vg9c",
  authDomain: "discuss-13fbc.firebaseapp.com",
  databaseURL: "https://discuss-13fbc-default-rtdb.firebaseio.com",
  projectId: "discuss-13fbc",
  storageBucket: "discuss-13fbc.firebasestorage.app",
  messagingSenderId: "922676469024",
  appId: "1:922676469024:web:1c81d8dfc6a914d9d2cb45",
  measurementId: "G-Y5S2G2EXDP",
};

// ── Initialize app (singleton) ─────────────────────────────────────────────
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const database = getDatabase(app);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

// ── authReady: resolves once persistence is set ────────────────────────────
// Any code that reads auth state should await this first so that the
// persistence layer (IndexedDB) is wired up before onAuthStateChanged fires.
export const authReady = setPersistence(auth, browserLocalPersistence)
  .then(() => auth)
  .catch((e) => {
    console.warn('[Auth] setPersistence failed (non-critical):', e?.code);
    return auth; // Continue with default persistence on error
  });

export {
  app,
  database,
  auth,
  googleProvider,
  ref,
  get,
  set,
  push,
  update,
  remove,
  onValue,
  off,
  query,
  orderByChild,
  limitToLast,
  equalTo,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  browserLocalPersistence,
  setPersistence,
};

export default app;
