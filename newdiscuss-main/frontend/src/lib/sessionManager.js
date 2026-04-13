/**
 * sessionManager.js — Multi-device session enforcement
 *
 * Strategy:
 *   - Each login writes a session record to RTDB: sessions/{userId}/{sessionId}
 *   - Each session listens to its own record for { kicked: true }
 *   - On login, if active sessions > MAX_SESSIONS, the OLDEST sessions are kicked
 *   - Kicked sessions detect the flag and call signOut automatically
 *
 * Data shape in RTDB:
 *   sessions/{userId}/{sessionId}: {
 *     createdAt: <timestamp>,
 *     deviceInfo: <string>,
 *     kicked: false | true,
 *   }
 */

import { database, ref, set, remove, onValue, get, off } from '@/lib/firebase';

const MAX_SESSIONS = 2;

// ── Generate or retrieve a stable session ID for this tab/device ──
function getOrCreateSessionId() {
  const KEY = 'discuss_session_id';
  let id = sessionStorage.getItem(KEY);
  if (!id) {
    id = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    sessionStorage.setItem(KEY, id);
  }
  return id;
}

// ── Device info string (best-effort) ──
function getDeviceInfo() {
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return 'Android device';
  if (/iPhone|iPad/i.test(ua)) return 'iOS device';
  if (/Macintosh/i.test(ua)) return 'Mac';
  if (/Windows/i.test(ua)) return 'Windows PC';
  return 'Unknown device';
}

// ─────────────────────────────────────────────────────────────
// registerSession
// Call this after a successful login / auth state confirmation.
// Returns an unsubscribe function to call on logout or unmount.
// ─────────────────────────────────────────────────────────────
export async function registerSession(userId, onKicked) {
  if (!userId) return () => {};

  const sessionId = getOrCreateSessionId();
  const sessionsRootRef = ref(database, `sessions/${userId}`);
  const mySessionRef = ref(database, `sessions/${userId}/${sessionId}`);

  try {
    // 1. Write this session record
    await set(mySessionRef, {
      sessionId,
      createdAt: Date.now(),
      deviceInfo: getDeviceInfo(),
      kicked: false,
    });

    // 2. Read all current sessions for this user
    const snapshot = await get(sessionsRootRef);
    if (snapshot.exists()) {
      const sessions = Object.entries(snapshot.val())
        // Filter out already-kicked sessions
        .filter(([, v]) => !v.kicked)
        // Sort oldest first
        .sort(([, a], [, b]) => a.createdAt - b.createdAt);

      // 3. If over the limit, kick the oldest sessions
      const overflow = sessions.length - MAX_SESSIONS;
      if (overflow > 0) {
        const toKick = sessions.slice(0, overflow);
        await Promise.all(
          toKick.map(([id]) =>
            set(ref(database, `sessions/${userId}/${id}/kicked`), true)
          )
        );
      }
    }
  } catch (err) {
    console.warn('[SessionManager] registerSession error:', err?.message);
    return () => {};
  }

  // 4. Watch my own session record for a kick signal
  const kickListener = onValue(mySessionRef, (snap) => {
    if (snap.exists() && snap.val()?.kicked === true) {
      console.warn('[SessionManager] This session was kicked (max sessions exceeded).');
      onKicked?.();
    }
  });

  // 5. Return cleanup function
  return async () => {
    off(mySessionRef, 'value', kickListener);
    // Remove own session record on explicit logout
    try { await remove(mySessionRef); } catch {}
  };
}

// ─────────────────────────────────────────────────────────────
// cleanupSession — call explicitly on manual sign-out
// ─────────────────────────────────────────────────────────────
export async function cleanupSession(userId) {
  if (!userId) return;
  const sessionId = getOrCreateSessionId();
  try {
    await remove(ref(database, `sessions/${userId}/${sessionId}`));
  } catch (err) {
    console.warn('[SessionManager] cleanupSession error:', err?.message);
  }
}
