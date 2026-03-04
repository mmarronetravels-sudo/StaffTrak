import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

const AuthContext = createContext({});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Set up auth state listener FIRST — always
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        await fetchProfile(session.user.id);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    // Check for token handoff from product switcher
    const params = new URLSearchParams(window.location.search);
    const accessToken = params.get('token');
    const refreshToken = params.get('refresh');

    if (accessToken && refreshToken) {
      // Clean the tokens from the URL immediately
      window.history.replaceState({}, '', window.location.pathname);
      // setSession will trigger onAuthStateChange above
      supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken
      }).catch(err => {
        console.error('Token handoff failed:', err);
        setLoading(false);
      });
    } else {
      // Normal session init
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (!session) setLoading(false);
        // if session exists, onAuthStateChange will handle it
      });
    }

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
