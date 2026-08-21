// Tiny auth context. We boot by hitting /me once; the response either
// hydrates `user` or leaves it null (unauthenticated). All mutation
// methods go through the api client.
//
// Signup is two-step now: `signup(...)` returns the pending verification
// envelope; `verifyOtp(email, code)` completes it. The page owns the
// "which step are we on" state, not the context.
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api.js';

const AuthContext = createContext({
  user: null,
  ready: false,
  login: async () => { throw new Error('AuthProvider missing'); },
  signup: async () => { throw new Error('AuthProvider missing'); },
  verifyOtp: async () => { throw new Error('AuthProvider missing'); },
  resendOtp: async () => { throw new Error('AuthProvider missing'); },
  logout: async () => { throw new Error('AuthProvider missing'); },
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    api.me()
      .then(({ user }) => setUser(user))
      .catch(() => setUser(null))
      .finally(() => setReady(true));
  }, []);

  const login = useCallback(async (email, password) => {
    const { user } = await api.login({ email, password });
    setUser(user);
    return user;
  }, []);

  // signup no longer returns the user — it returns { status, email }
  // and the caller is expected to drive the OTP panel next.
  const signup = useCallback(async (name, email, password) => {
    return await api.signup({ name, email, password });
  }, []);

  const verifyOtp = useCallback(async (email, code) => {
    const { user } = await api.verifyOtp({ email, code });
    setUser(user);
    return user;
  }, []);

  const resendOtp = useCallback(async (email) => {
    await api.resendOtp({ email });
  }, []);

  const logout = useCallback(async () => {
    try { await api.logout(); } catch { /* ignore — server may already be gone */ }
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, ready, login, signup, verifyOtp, resendOtp, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
