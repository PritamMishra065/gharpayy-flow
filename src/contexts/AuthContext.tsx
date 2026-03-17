import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User, Session } from '@supabase/supabase-js';

type AppRole = 'admin' | 'manager' | 'agent' | 'owner' | 'customer';

interface UserContext {
  roles: AppRole[];
  defaultPath: string;
  isCrmUser: boolean;
  isOwner: boolean;
  ownerId: string | null;
  agentId: string | null;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  userContext: UserContext;
  signOut: () => Promise<void>;
}

const defaultUserContext: UserContext = {
  roles: [],
  defaultPath: '/explore',
  isCrmUser: false,
  isOwner: false,
  ownerId: null,
  agentId: null,
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  userContext: defaultUserContext,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [userContext, setUserContext] = useState<UserContext>(defaultUserContext);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const syncAuthState = async (nextSession: Session | null) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);

      if (!nextSession?.user) {
        setUserContext(defaultUserContext);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase.rpc('get_current_user_context');

      if (error) {
        console.error('Failed to load user context', error);
        setUserContext(defaultUserContext);
      } else {
        const context = (data || {}) as any;
        setUserContext({
          roles: Array.isArray(context.roles) ? context.roles : [],
          defaultPath: context.default_path || '/explore',
          isCrmUser: Boolean(context.is_crm_user),
          isOwner: Boolean(context.is_owner),
          ownerId: context.owner_id || null,
          agentId: context.agent_id || null,
        });
      }

      setLoading(false);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      void syncAuthState(nextSession);
    });

    supabase.auth.getSession().then(({ data: { session: existingSession } }) => {
      void syncAuthState(existingSession);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, userContext, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
