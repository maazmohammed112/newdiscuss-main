// Fifth Firebase Project — Realtime Database for Signal Stories
// Project: discuss-d48be
// Data stored: stories/, storyViews/
// Shares the same Auth UID as primary Firebase for seamless identity sync.

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
  startAt,
  limitToLast,
  serverTimestamp,
} from 'firebase/database';

const fifthProjectId =
  process.env.REACT_APP_FIREBASE_FIFTH_PROJECT_ID || 'discuss-d48be';

const fifthFirebaseConfig = {
  apiKey:
    process.env.REACT_APP_FIREBASE_FIFTH_API_KEY ||
    'AIzaSyBUvMeIlN8Lb281abZfdKdVcVxuzkIikss',
  authDomain:
    process.env.REACT_APP_FIREBASE_FIFTH_AUTH_DOMAIN ||
    `${fifthProjectId}.firebaseapp.com`,
  databaseURL:
    process.env.REACT_APP_FIREBASE_FIFTH_DATABASE_URL ||
    `https://${fifthProjectId}-default-rtdb.firebaseio.com`,
  projectId: fifthProjectId,
  storageBucket:
    process.env.REACT_APP_FIREBASE_FIFTH_STORAGE_BUCKET ||
    `${fifthProjectId}.firebasestorage.app`,
  messagingSenderId:
    process.env.REACT_APP_FIREBASE_FIFTH_MESSAGING_SENDER_ID || '931882933125',
  appId:
    process.env.REACT_APP_FIREBASE_FIFTH_APP_ID ||
    '1:931882933125:web:4a52a7a2abc9be4ac502ec',
  measurementId:
    process.env.REACT_APP_FIREBASE_FIFTH_MEASUREMENT_ID || 'G-Z6DQR03THV',
};

let fifthApp = null;
let fifthDatabase = null;
let initError = null;

try {
  fifthApp =
    getApps().find((app) => app.name === 'signalDb') ||
    initializeApp(fifthFirebaseConfig, 'signalDb');
  fifthDatabase = getDatabase(fifthApp);
  console.log('Fifth Firebase (Signal Stories) initialized successfully');
} catch (error) {
  console.warn('Failed to initialize fifth Firebase (Signal):', error.message);
  initError = error;
}

export const isFifthDbAvailable = () =>
  fifthDatabase !== null && initError === null;

export {
  fifthApp,
  fifthDatabase,
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
  startAt,
  limitToLast,
  serverTimestamp,
};

export default fifthApp;
