import { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '../supabaseClient';

const AuthContext = createContext({});
const IDLE_TIMEOUT_MS = 60 * 60 * 1000; // 60 minutes

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      // Check for token handoff from product switcher
      const params = new URLSearchParams(window.location.search);
      const accessToken = params.get('token');
      const refreshToken = params.get('refresh');

      if (accessToken && refreshToken) {
        window.history.replaceState({}, '', window.location.pathname);
        const { data, error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken
        });
        if (data?.session?.user) {
          setUser(data.session.user);
          await fetchProfile(data.session.user.id);
          return;
        }
        // setSession failed, try refreshSession
        const { data: refreshData } = await supabase.auth.refreshSession({
          refresh_token: refreshToken
        });
        if (refreshData?.session?.user) {
          setUser(refreshData.session.user);
          await fetchProfile(refreshData.session.user.id);
          return;
        }
        // Both failed, go to login
        console.error('Token handoff failed:', error);
        window.location.href = '/login';
        return;
      }

      // Normal session init
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUser(session.user);
        await fetchProfile(session.user.id);
      } else {
        setLoading(false);
      }
    };

    init();

    // Auth state listener for sign out only
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (_event === 'SIGNED_OUT') {
        setUser(null);
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId, retries = 3) => {
    for (let i = 0; i < retries; i++) {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      if (data) {
        setProfile(data);
        setLoading(false);
        return;
      }
      if (i < retries - 1) await new Promise(r => setTimeout(r, 500));
    }
    setLoading(false);
  };

  const signIn = async (email, password) => {
    return supabase.auth.signInWithPassword({ email, password });
  };

  const signOut = async () => {
    setUser(null);
    setProfile(null);
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  // Idle timeout — sign out after 60 minutes of no activity
  const idleTimer = useRef(null);

  const resetIdleTimer = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      if (user) signOut();
    }, IDLE_TIMEOUT_MS);
  }, [user]);

  useEffect(() => {
    if (!user) return;

    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    events.forEach(e => window.addEventListener(e, resetIdleTimer));
    resetIdleTimer(); // start the timer

    return () => {
      events.forEach(e => window.removeEventListener(e, resetIdleTimer));
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [user, resetIdleTimer]);

  const isAdmin = profile?.role === 'district_admin' || profile?.role === 'school_admin';
  const isEvaluator = profile?.is_evaluator === true || isAdmin;
  const isHR = profile?.role === 'hr';

  return (
    <AuthContext.Provider value={{
      user, profile, loading,
      signIn, signOut,
      isAdmin, isEvaluator, isHR
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
