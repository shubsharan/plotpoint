import { vi } from 'vitest';
import type { Session, User, AuthError } from '@supabase/supabase-js';

// Mock user data
export const mockUser: User = {
  id: 'test-user-id-123',
  email: 'test@example.com',
  app_metadata: {},
  user_metadata: {
    displayName: 'Test User',
  },
  aud: 'authenticated',
  created_at: '2024-01-01T00:00:00.000Z',
};

export const mockSession: Session = {
  access_token: 'mock-access-token',
  refresh_token: 'mock-refresh-token',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  token_type: 'bearer',
  user: mockUser,
};

export const mockProfile = {
  id: 'test-user-id-123',
  username: 'testuser',
  display_name: 'Test User',
  avatar_url: null,
  bio: 'Test bio',
  is_public: true,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
};

// Create mock auth error
export function createAuthError(message: string, status = 400): AuthError {
  return {
    message,
    status,
    name: 'AuthError',
  } as AuthError;
}

// Mock Supabase client factory
export function createMockSupabaseClient() {
  let currentSession: Session | null = null;
  const authStateListeners: ((event: string, session: Session | null) => void)[] = [];

  const mockAuth = {
    getSession: vi.fn().mockImplementation(async () => ({
      data: { session: currentSession },
      error: null,
    })),

    getUser: vi.fn().mockImplementation(async () => ({
      data: { user: currentSession?.user ?? null },
      error: null,
    })),

    signUp: vi.fn().mockImplementation(async ({ email, password, options }) => {
      if (!email || !password) {
        return { data: { user: null, session: null }, error: createAuthError('Email and password required') };
      }
      if (password.length < 8) {
        return { data: { user: null, session: null }, error: createAuthError('Password too short') };
      }
      const newUser = { ...mockUser, email, user_metadata: options?.data || {} };
      return { data: { user: newUser, session: null }, error: null };
    }),

    signInWithPassword: vi.fn().mockImplementation(async ({ email, password }) => {
      if (email === 'test@example.com' && password === 'ValidPass123') {
        currentSession = mockSession;
        authStateListeners.forEach((listener) => listener('SIGNED_IN', mockSession));
        return { data: { user: mockUser, session: mockSession }, error: null };
      }
      return { data: { user: null, session: null }, error: createAuthError('Invalid login credentials') };
    }),

    signOut: vi.fn().mockImplementation(async () => {
      currentSession = null;
      authStateListeners.forEach((listener) => listener('SIGNED_OUT', null));
      return { error: null };
    }),

    resetPasswordForEmail: vi.fn().mockImplementation(async (email) => {
      if (!email || !email.includes('@')) {
        return { error: createAuthError('Invalid email') };
      }
      return { data: {}, error: null };
    }),

    updateUser: vi.fn().mockImplementation(async ({ password }) => {
      if (password && password.length < 8) {
        return { data: { user: null }, error: createAuthError('Password too short') };
      }
      return { data: { user: mockUser }, error: null };
    }),

    verifyOtp: vi.fn().mockImplementation(async ({ token_hash, type }) => {
      if (token_hash === 'valid-token' && type === 'recovery') {
        currentSession = mockSession;
        return { data: { user: mockUser, session: mockSession }, error: null };
      }
      return { data: { user: null, session: null }, error: createAuthError('Invalid token') };
    }),

    onAuthStateChange: vi.fn().mockImplementation((callback) => {
      authStateListeners.push(callback);
      return {
        data: {
          subscription: {
            unsubscribe: vi.fn(() => {
              const index = authStateListeners.indexOf(callback);
              if (index > -1) authStateListeners.splice(index, 1);
            }),
          },
        },
      };
    }),
  };

  const mockFrom = vi.fn().mockImplementation((table: string) => {
    return {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockImplementation(async () => {
        if (table === 'profiles') {
          return { data: mockProfile, error: null };
        }
        return { data: null, error: null };
      }),
    };
  });

  return {
    auth: mockAuth,
    from: mockFrom,
    _setSession: (session: Session | null) => {
      currentSession = session;
    },
    _triggerAuthEvent: (event: string, session: Session | null) => {
      authStateListeners.forEach((listener) => listener(event, session));
    },
  };
}

export const mockSupabaseClient = createMockSupabaseClient();
