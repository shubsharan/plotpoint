/**
 * Auth Flow Test Suite
 * Tests core authentication flows: sign up, sign in, sign out, password reset
 */

import { mockSupabaseClient } from './__mocks__/supabase';

// Mock the supabase module before importing hooks
jest.mock('@/lib/supabase', () => ({
  supabase: mockSupabaseClient,
}));

// Mock react-query
const mockMutate = jest.fn();
const mockMutateAsync = jest.fn();
jest.mock('@tanstack/react-query', () => ({
  useMutation: jest.fn(({ mutationFn, onSuccess }) => ({
    mutate: (data: any) => {
      mockMutate(data);
      return mutationFn(data).then((result: any) => {
        if (onSuccess) onSuccess(result);
        return result;
      });
    },
    mutateAsync: (data: any) => {
      mockMutateAsync(data);
      return mutationFn(data);
    },
    isPending: false,
    isError: false,
    error: null,
  })),
  useQueryClient: () => ({
    clear: jest.fn(),
    invalidateQueries: jest.fn(),
  }),
}));

describe('Auth Flows', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSupabaseClient._setSession(null);
  });

  describe('Sign Up Flow', () => {
    it('should successfully sign up with valid credentials', async () => {
      const result = await mockSupabaseClient.auth.signUp({
        email: 'newuser@example.com',
        password: 'ValidPass123',
        options: {
          data: {
            displayName: 'New User',
          },
        },
      });

      expect(result.error).toBeNull();
      expect(result.data.user).toBeDefined();
      expect(result.data.user?.email).toBe('newuser@example.com');
      expect(result.data.user?.user_metadata.displayName).toBe('New User');
    });

    it('should fail sign up with short password', async () => {
      const result = await mockSupabaseClient.auth.signUp({
        email: 'test@example.com',
        password: 'short',
      });

      expect(result.error).toBeDefined();
      expect(result.error?.message).toBe('Password too short');
    });

    it('should fail sign up with missing email', async () => {
      const result = await mockSupabaseClient.auth.signUp({
        email: '',
        password: 'ValidPass123',
      });

      expect(result.error).toBeDefined();
      expect(result.error?.message).toBe('Email and password required');
    });
  });

  describe('Sign In Flow', () => {
    it('should successfully sign in with valid credentials', async () => {
      const result = await mockSupabaseClient.auth.signInWithPassword({
        email: 'test@example.com',
        password: 'ValidPass123',
      });

      expect(result.error).toBeNull();
      expect(result.data.user).toBeDefined();
      expect(result.data.session).toBeDefined();
      expect(result.data.user?.email).toBe('test@example.com');
    });

    it('should fail sign in with invalid credentials', async () => {
      const result = await mockSupabaseClient.auth.signInWithPassword({
        email: 'test@example.com',
        password: 'WrongPassword',
      });

      expect(result.error).toBeDefined();
      expect(result.error?.message).toBe('Invalid login credentials');
      expect(result.data.user).toBeNull();
    });

    it('should fail sign in with non-existent email', async () => {
      const result = await mockSupabaseClient.auth.signInWithPassword({
        email: 'nonexistent@example.com',
        password: 'ValidPass123',
      });

      expect(result.error).toBeDefined();
      expect(result.data.user).toBeNull();
    });
  });

  describe('Sign Out Flow', () => {
    it('should successfully sign out', async () => {
      // First sign in
      await mockSupabaseClient.auth.signInWithPassword({
        email: 'test@example.com',
        password: 'ValidPass123',
      });

      // Verify signed in
      let sessionResult = await mockSupabaseClient.auth.getSession();
      expect(sessionResult.data.session).toBeDefined();

      // Sign out
      const result = await mockSupabaseClient.auth.signOut();
      expect(result.error).toBeNull();

      // Verify signed out
      sessionResult = await mockSupabaseClient.auth.getSession();
      expect(sessionResult.data.session).toBeNull();
    });
  });

  describe('Password Reset Flow', () => {
    it('should successfully request password reset', async () => {
      const result = await mockSupabaseClient.auth.resetPasswordForEmail(
        'test@example.com',
        { redirectTo: 'plotpoint://reset-password' }
      );

      expect(result.error).toBeNull();
    });

    it('should fail password reset with invalid email', async () => {
      const result = await mockSupabaseClient.auth.resetPasswordForEmail('invalid-email');

      expect(result.error).toBeDefined();
      expect(result.error?.message).toBe('Invalid email');
    });

    it('should verify valid reset token', async () => {
      const result = await mockSupabaseClient.auth.verifyOtp({
        token_hash: 'valid-token',
        type: 'recovery',
      });

      expect(result.error).toBeNull();
      expect(result.data.user).toBeDefined();
      expect(result.data.session).toBeDefined();
    });

    it('should reject invalid reset token', async () => {
      const result = await mockSupabaseClient.auth.verifyOtp({
        token_hash: 'invalid-token',
        type: 'recovery',
      });

      expect(result.error).toBeDefined();
      expect(result.error?.message).toBe('Invalid token');
    });

    it('should successfully update password', async () => {
      // First verify token to get session
      await mockSupabaseClient.auth.verifyOtp({
        token_hash: 'valid-token',
        type: 'recovery',
      });

      // Update password
      const result = await mockSupabaseClient.auth.updateUser({
        password: 'NewValidPass123',
      });

      expect(result.error).toBeNull();
      expect(result.data.user).toBeDefined();
    });
  });

  describe('Session Management', () => {
    it('should return null session when not authenticated', async () => {
      const result = await mockSupabaseClient.auth.getSession();
      expect(result.data.session).toBeNull();
    });

    it('should return valid session after sign in', async () => {
      await mockSupabaseClient.auth.signInWithPassword({
        email: 'test@example.com',
        password: 'ValidPass123',
      });

      const result = await mockSupabaseClient.auth.getSession();
      expect(result.data.session).toBeDefined();
      expect(result.data.session?.user.email).toBe('test@example.com');
    });

    it('should notify listeners on auth state change', async () => {
      const listener = jest.fn();
      mockSupabaseClient.auth.onAuthStateChange(listener);

      // Sign in should trigger listener
      await mockSupabaseClient.auth.signInWithPassword({
        email: 'test@example.com',
        password: 'ValidPass123',
      });

      expect(listener).toHaveBeenCalledWith('SIGNED_IN', expect.any(Object));

      // Sign out should trigger listener
      await mockSupabaseClient.auth.signOut();

      expect(listener).toHaveBeenCalledWith('SIGNED_OUT', null);
    });
  });

  describe('Profile Fetching', () => {
    it('should fetch user profile after sign in', async () => {
      const result = await mockSupabaseClient
        .from('profiles')
        .select('*')
        .eq('id', 'test-user-id-123')
        .single();

      expect(result.error).toBeNull();
      expect(result.data).toBeDefined();
      expect(result.data?.username).toBe('testuser');
      expect(result.data?.display_name).toBe('Test User');
    });
  });
});

describe('Auth Validators', () => {
  // Import validators
  const {
    emailSchema,
    passwordSchema,
    signInFormSchema,
    signUpFormSchema,
    forgotPasswordFormSchema,
    resetPasswordFormSchema,
  } = require('@plotpoint/schemas');

  describe('Email Validation', () => {
    it('should accept valid email', () => {
      expect(() => emailSchema.parse('test@example.com')).not.toThrow();
    });

    it('should reject invalid email', () => {
      expect(() => emailSchema.parse('invalid-email')).toThrow();
      expect(() => emailSchema.parse('')).toThrow();
    });
  });

  describe('Password Validation', () => {
    it('should accept valid password', () => {
      expect(() => passwordSchema.parse('ValidPass123')).not.toThrow();
    });

    it('should reject short password', () => {
      expect(() => passwordSchema.parse('Short1')).toThrow();
    });

    it('should reject password without uppercase', () => {
      expect(() => passwordSchema.parse('lowercase123')).toThrow();
    });

    it('should reject password without lowercase', () => {
      expect(() => passwordSchema.parse('UPPERCASE123')).toThrow();
    });

    it('should reject password without number', () => {
      expect(() => passwordSchema.parse('NoNumbersHere')).toThrow();
    });
  });

  describe('Sign In Form Validation', () => {
    it('should accept valid sign in data', () => {
      const result = signInFormSchema.safeParse({
        email: 'test@example.com',
        password: 'anypassword',
      });
      expect(result.success).toBe(true);
    });

    it('should reject missing email', () => {
      const result = signInFormSchema.safeParse({
        email: '',
        password: 'anypassword',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Sign Up Form Validation', () => {
    it('should accept valid sign up data', () => {
      const result = signUpFormSchema.safeParse({
        email: 'test@example.com',
        password: 'ValidPass123',
        confirmPassword: 'ValidPass123',
        displayName: 'Test User',
      });
      expect(result.success).toBe(true);
    });

    it('should reject mismatched passwords', () => {
      const result = signUpFormSchema.safeParse({
        email: 'test@example.com',
        password: 'ValidPass123',
        confirmPassword: 'DifferentPass123',
      });
      expect(result.success).toBe(false);
    });

    it('should reject weak password', () => {
      const result = signUpFormSchema.safeParse({
        email: 'test@example.com',
        password: 'weak',
        confirmPassword: 'weak',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Forgot Password Form Validation', () => {
    it('should accept valid email', () => {
      const result = forgotPasswordFormSchema.safeParse({
        email: 'test@example.com',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid email', () => {
      const result = forgotPasswordFormSchema.safeParse({
        email: 'invalid',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Reset Password Form Validation', () => {
    it('should accept valid password reset data', () => {
      const result = resetPasswordFormSchema.safeParse({
        password: 'NewValidPass123',
        confirmPassword: 'NewValidPass123',
      });
      expect(result.success).toBe(true);
    });

    it('should reject mismatched passwords', () => {
      const result = resetPasswordFormSchema.safeParse({
        password: 'NewValidPass123',
        confirmPassword: 'DifferentPass456',
      });
      expect(result.success).toBe(false);
    });
  });
});
