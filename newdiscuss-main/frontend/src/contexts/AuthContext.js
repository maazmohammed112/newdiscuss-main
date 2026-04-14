import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { purgeUserSessionCaches } from '@/lib/cacheManager';
import { 
  auth, 
  googleProvider, 
  signInWithPopup, 
  signInWithRedirect, 
  getRedirectResult,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink
} from '@/lib/firebase';
import { database, ref, onValue, off } from '@/lib/firebase';
import { createUser, getUser, getUserByEmail, checkUsernameAvailable, updateUser, syncUserVerificationEverywhere } from '@/lib/db';
import { syncUserVerificationInCommentsFirestore } from '@/lib/commentsDb';

const AuthContext = createContext(null);

const EMAIL_LINK_REDIRECT_URL = 'https://dsscus.netlify.app/';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pendingVerification, setPendingVerification] = useState(false);

  const syncUser = useCallback(async (firebaseUser) => {
    if (!firebaseUser) {
      setUser(null);
      return null;
    }

    try {
      let dbUser = await getUser(firebaseUser.uid);
      
      if (!dbUser) {
        const email = firebaseUser.email?.toLowerCase();
        let username = firebaseUser.displayName?.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase().slice(0, 15) 
          || email?.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '').slice(0, 15) 
          || 'user';
        
        let isAvailable = await checkUsernameAvailable(username);
        let counter = 1;
        while (!isAvailable) {
          username = `${username.slice(0, 12)}${counter}`;
          isAvailable = await checkUsernameAvailable(username);
          counter++;
        }
        
        dbUser = await createUser(firebaseUser.uid, {
          username,
          email,
          photo_url: firebaseUser.photoURL || '',
          auth_provider: firebaseUser.providerData[0]?.providerId || 'email'
        });
      } else if (firebaseUser.photoURL && firebaseUser.photoURL !== dbUser.photo_url) {
        await updateUser(firebaseUser.uid, { photo_url: firebaseUser.photoURL });
        dbUser.photo_url = firebaseUser.photoURL;
      }
      
      const userData = {
        id: firebaseUser.uid,
        uid: firebaseUser.uid,
        email: dbUser.email || firebaseUser.email,
        username: dbUser.username,
        photo_url: dbUser.photo_url || firebaseUser.photoURL || '',
        verified: dbUser.verified || false, // Include verified status
        admin_message: dbUser.admin_message || '', // Include admin message
        created_at: dbUser.created_at
      };
      
      setUser(userData);
      return userData;
    } catch (error) {
      console.error('Error syncing user:', error);
      const basicUser = {
        id: firebaseUser.uid,
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        username: firebaseUser.displayName || firebaseUser.email?.split('@')[0],
        photo_url: firebaseUser.photoURL || '',
        verified: false, // Default to false on error
        admin_message: '' // Default to empty on error
      };
      setUser(basicUser);
      return basicUser;
    }
  }, []);

  // Handle email link sign-in on page load
  useEffect(() => {
    if (isSignInWithEmailLink(auth, window.location.href)) {
      let email = window.localStorage.getItem('emailForSignIn');
      if (!email) {
        email = window.prompt('Please provide your email for confirmation');
      }
      if (email) {
        signInWithEmailLink(auth, email, window.location.href)
          .then(async (result) => {
            window.localStorage.removeItem('emailForSignIn');
            window.localStorage.removeItem('pendingVerification');
            window.localStorage.removeItem('pendingUsername');
            
            // Check if we have stored username for this new user
            const storedUsername = window.localStorage.getItem('verifyUsername_' + email.toLowerCase());
            if (storedUsername) {
              // Create or update user in database with stored username
              let dbUser = await getUser(result.user.uid);
              if (!dbUser) {
                await createUser(result.user.uid, {
                  username: storedUsername,
                  email: email.toLowerCase(),
                  photo_url: '',
                  auth_provider: 'email'
                });
              }
              window.localStorage.removeItem('verifyUsername_' + email.toLowerCase());
            }
            
            await syncUser(result.user);
            setPendingVerification(false);
          })
          .catch((error) => {
            console.error('Email link sign-in error:', error);
          });
      }
    }
  }, [syncUser]);

  useEffect(() => {
    getRedirectResult(auth).then(async (result) => {
      if (result?.user) {
        await syncUser(result.user);
      }
    }).catch(console.error);

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      // If there's a pending verification, don't auto-login
      const isPending = window.localStorage.getItem('pendingVerification');
      if (isPending && firebaseUser && firebaseUser.providerData[0]?.providerId === 'password') {
        // Sign out unverified manual accounts
        await firebaseSignOut(auth);
        setUser(null);
        setPendingVerification(true);
        setLoading(false);
        return;
      }
      
      await syncUser(firebaseUser);
      setLoading(false);
    });

    return unsubscribe;
  }, [syncUser]);

  // Real-time listener for profile, verification, and account removal from primary RTDB
  useEffect(() => {
    if (!user?.id) return;

    const userRef = ref(database, `users/${user.id}`);
    let previousVerified = user.verified;
    let sawProfile = false;

    const handleUserUpdate = (snapshot) => {
      if (snapshot.exists()) {
        sawProfile = true;
        const userData = snapshot.val();
        const newVerified = userData.verified || false;

        if (previousVerified !== newVerified) {
          console.log(`Verification status changed: ${previousVerified} → ${newVerified}`);
          syncUserVerificationEverywhere(user.id, newVerified).catch(console.error);
          syncUserVerificationInCommentsFirestore(user.id, newVerified).catch(console.error);
          previousVerified = newVerified;
        }

        setUser((prev) => ({
          ...prev,
          verified: newVerified,
          admin_message: userData.admin_message || '',
        }));
      } else if (sawProfile) {
        sawProfile = false;
        (async () => {
          try {
            await purgeUserSessionCaches(user.id);
            await firebaseSignOut(auth);
            setUser(null);
          } catch (e) {
            console.error('Account removed cleanup failed:', e);
          }
        })();
      }
    };

    const unsub = onValue(userRef, handleUserUpdate);
    return () => unsub();
  }, [user?.id]);

  const register = async (username, email, password) => {
    try {
      if (!username || username.length < 2) {
        return { success: false, error: 'Username must be at least 2 characters' };
      }
      if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        return { success: false, error: 'Username can only contain letters, numbers, and underscores' };
      }
      if (!email || !/^[^@]+@[^@]+\.[^@]+$/.test(email)) {
        return { success: false, error: 'Please enter a valid email address' };
      }
      if (!password || password.length < 6) {
        return { success: false, error: 'Password must be at least 6 characters' };
      }

      const isAvailable = await checkUsernameAvailable(username);
      if (!isAvailable) {
        return { success: false, error: `Username "${username}" is already taken` };
      }

      const existingUser = await getUserByEmail(email);
      if (existingUser) {
        return { success: false, error: 'This email is already registered' };
      }

      // Create Firebase auth user
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      
      // Create database user
      await createUser(credential.user.uid, {
        username: username.trim(),
        email: email.toLowerCase().trim(),
        photo_url: '',
        auth_provider: 'email'
      });

      // Store username for email verification completion
      window.localStorage.setItem('verifyUsername_' + email.toLowerCase().trim(), username.trim());

      // Send verification email link
      const actionCodeSettings = {
        url: EMAIL_LINK_REDIRECT_URL,
        handleCodeInApp: true,
      };

      await sendSignInLinkToEmail(auth, email, actionCodeSettings);
      
      // Save email for verification completion
      window.localStorage.setItem('emailForSignIn', email);
      window.localStorage.setItem('pendingVerification', 'true');
      
      // Sign out until verified
      await firebaseSignOut(auth);
      setUser(null);
      setPendingVerification(true);

      return { success: true, needsVerification: true };
    } catch (error) {
      console.error('Registration error:', error);
      if (error.code === 'auth/email-already-in-use') {
        return { success: false, error: 'This email is already registered' };
      }
      if (error.code === 'auth/weak-password') {
        return { success: false, error: 'Password is too weak' };
      }
      return { success: false, error: error.message || 'Registration failed' };
    }
  };

  const login = async (email, password) => {
    try {
      if (!email) return { success: false, error: 'Email is required' };
      if (!password) return { success: false, error: 'Password is required' };

      // Clear any pending verification state for this login
      window.localStorage.removeItem('pendingVerification');
      
      const credential = await signInWithEmailAndPassword(auth, email, password);
      await syncUser(credential.user);
      setPendingVerification(false);
      return { success: true };
    } catch (error) {
      console.error('Login error:', error);
      if (error.code === 'auth/user-not-found') {
        return { success: false, error: 'No account found with this email' };
      }
      if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        return { success: false, error: 'Incorrect password' };
      }
      if (error.code === 'auth/invalid-email') {
        return { success: false, error: 'Invalid email address' };
      }
      return { success: false, error: error.message || 'Login failed' };
    }
  };

  const loginWithGoogle = async () => {
    try {
      googleProvider.setCustomParameters({ prompt: 'select_account' });
      
      // Clear any pending verification
      window.localStorage.removeItem('pendingVerification');
      setPendingVerification(false);
      
      try {
        const result = await signInWithPopup(auth, googleProvider);
        await syncUser(result.user);
        return { success: true };
      } catch (popupError) {
        const code = popupError.code || '';
        
        if (code === 'auth/popup-blocked' || code === 'auth/unauthorized-domain') {
          if (code === 'auth/unauthorized-domain') {
            return { 
              success: false, 
              error: `Please add "${window.location.hostname}" to Firebase Console > Authentication > Settings > Authorized domains` 
            };
          }
          await signInWithRedirect(auth, googleProvider);
          return { success: false, error: '' };
        }
        
        if (code === 'auth/popup-closed-by-user') {
          return { success: false, error: 'Sign-in popup was closed' };
        }
        if (code === 'auth/cancelled-popup-request') {
          return { success: false, error: '' };
        }
        
        throw popupError;
      }
    } catch (error) {
      console.error('Google auth error:', error);
      return { success: false, error: error.message || 'Google sign-in failed' };
    }
  };

  const resendVerificationEmail = async (email) => {
    try {
      const actionCodeSettings = {
        url: EMAIL_LINK_REDIRECT_URL,
        handleCodeInApp: true,
      };
      await sendSignInLinkToEmail(auth, email, actionCodeSettings);
      window.localStorage.setItem('emailForSignIn', email);
      return { success: true };
    } catch (error) {
      console.error('Resend verification error:', error);
      return { success: false, error: error.message || 'Failed to resend verification email' };
    }
  };

  const logout = async () => {
    try {
      window.localStorage.removeItem('pendingVerification');
      window.localStorage.removeItem('emailForSignIn');
      setPendingVerification(false);
      const uid = auth.currentUser?.uid;
      if (uid) {
        await purgeUserSessionCaches(uid);
      }
      await firebaseSignOut(auth);
      setUser(null);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const refreshUser = async () => {
    if (auth.currentUser) {
      await syncUser(auth.currentUser);
    }
  };

  return (
    <AuthContext.Provider value={{ 
      user, loading, pendingVerification, 
      login, register, loginWithGoogle, logout, resendVerificationEmail, refreshUser
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
