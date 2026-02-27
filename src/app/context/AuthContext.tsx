'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import {
  getSupabaseBrowserClient,
  hasSupabaseBrowserConfig,
} from '@/lib/supabase/client';

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  provider: string | null;
  created_at: string;
  updated_at: string;
}

interface EmailCredentials {
  email: string;
  password: string;
}

interface SignUpCredentials extends EmailCredentials {
  fullName?: string;
  phone?: string;
  address?: string;
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  isAuthenticated: boolean;
  isAuthReady: boolean;
  isConfigured: boolean;
  isBusy: boolean;
  statusMessage: string | null;
  errorMessage: string | null;
  clearMessages: () => void;
  signInWithEmail: (credentials: EmailCredentials) => Promise<void>;
  signUpWithEmail: (credentials: SignUpCredentials) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  updatePassword: (nextPassword: string) => Promise<void>;
  signOut: () => Promise<void>;
  deleteMyAccount: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function getFriendlyErrorMessage(error: unknown) {
  if (typeof error === 'string') {
    return error;
  }

  if (error && typeof error === 'object') {
    const payload = error as Record<string, unknown>;
    const message =
      (typeof payload.message === 'string' && payload.message) ||
      (typeof payload.msg === 'string' && payload.msg) ||
      (typeof payload.error_description === 'string' && payload.error_description) ||
      '';

    const normalized = message.toLowerCase();
    if (
      normalized.includes('unsupported provider') ||
      normalized.includes('provider is not enabled')
    ) {
      return '구글 로그인이 비활성화되어 있습니다. Supabase 대시보드 > Authentication > Providers > Google에서 Enable 후 Client ID/Secret을 저장하세요.';
    }

    if (message) {
      return message;
    }
  }

  return '알 수 없는 오류가 발생했습니다.';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isMountedRef = useRef(true);
  const isConfigured = hasSupabaseBrowserConfig();

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const clearMessages = useCallback(() => {
    setStatusMessage(null);
    setErrorMessage(null);
  }, []);

  const setSafeState = <T,>(
    setter: (value: T) => void,
    value: T,
  ) => {
    if (isMountedRef.current) {
      setter(value);
    }
  };

  const fetchProfile = async (targetUser: User | null) => {
    if (!targetUser) {
      setSafeState(setProfile, null);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setSafeState(setProfile, null);
      return;
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, full_name, avatar_url, provider, created_at, updated_at')
      .eq('id', targetUser.id)
      .maybeSingle<Profile>();

    if (error) {
      // Trigger/profile creation timing can briefly race after signup.
      setSafeState(setProfile, null);
      setSafeState(setErrorMessage, `Profile load failed: ${error.message}`);
      return;
    }

    setSafeState(setProfile, data ?? null);
  };

  const syncSession = async (nextSession: Session | null) => {
    setSafeState(setSession, nextSession);
    setSafeState(setUser, nextSession?.user ?? null);
    await fetchProfile(nextSession?.user ?? null);
    setSafeState(setIsAuthReady, true);
  };

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      setIsAuthReady(true);
      return;
    }

    let active = true;

    void supabase.auth.getSession().then(async ({ data, error }) => {
      if (!active) return;
      if (error) {
        setSafeState(setErrorMessage, error.message);
      }
      await syncSession(data.session ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      // Avoid async work directly inline in the auth callback.
      queueMicrotask(() => {
        if (!active) return;
        void syncSession(nextSession);
      });
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runAction = async (fn: () => Promise<void>) => {
    clearMessages();
    setIsBusy(true);
    try {
      await fn();
    } catch (error) {
      setErrorMessage(getFriendlyErrorMessage(error));
    } finally {
      if (isMountedRef.current) {
        setIsBusy(false);
      }
    }
  };

  const requireClient = () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      throw new Error(
        'Supabase env is missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.',
      );
    }
    return supabase;
  };

  const signInWithEmail = async ({ email, password }: EmailCredentials) => {
    await runAction(async () => {
      const supabase = requireClient();
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      setStatusMessage('Signed in.');
    });
  };

  const signUpWithEmail = async ({
    email,
    password,
    fullName,
    phone,
    address,
  }: SignUpCredentials) => {
    await runAction(async () => {
      const supabase = requireClient();
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName?.trim() || undefined,
            phone: phone?.trim() || undefined,
            address: address?.trim() || undefined,
          },
        },
      });
      if (error) throw error;

      if (data.session) {
        setStatusMessage('Sign-up complete. You are signed in.');
      } else {
        setStatusMessage(
          'Sign-up complete. Check your email for the confirmation link.',
        );
      }
    });
  };

  const signInWithGoogle = async () => {
    await runAction(async () => {
      const supabase = requireClient();
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(window.location.pathname)}`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo },
      });
      if (error) throw error;
      setStatusMessage('Redirecting to Google...');
    });
  };

  const updatePassword = async (nextPassword: string) => {
    await runAction(async () => {
      const password = nextPassword.trim();
      if (password.length < 8) {
        throw new Error('비밀번호는 8자 이상으로 입력하세요.');
      }

      const supabase = requireClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setStatusMessage('비밀번호가 변경되었습니다.');
    });
  };

  const signOut = async () => {
    await runAction(async () => {
      const supabase = requireClient();
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setProfile(null);
      setStatusMessage('Signed out.');
    });
  };

  const deleteMyAccount = async () => {
    await runAction(async () => {
      const supabase = requireClient();
      const { error } = await supabase.rpc('delete_my_account');
      if (error) throw error;

      // Session may already be invalid after the RPC deletes auth.users.
      await supabase.auth.signOut().catch(() => undefined);
      setProfile(null);
      setStatusMessage('Account deleted.');
    });
  };

  const refreshProfile = async () => {
    await runAction(async () => {
      await fetchProfile(user);
      setStatusMessage('Profile refreshed.');
    });
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        profile,
        isAuthenticated: Boolean(user || session?.user),
        isAuthReady,
        isConfigured,
        isBusy,
        statusMessage,
        errorMessage,
        clearMessages,
        signInWithEmail,
        signUpWithEmail,
        signInWithGoogle,
        updatePassword,
        signOut,
        deleteMyAccount,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
