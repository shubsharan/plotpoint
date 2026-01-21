import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { router } from "expo-router";

interface SignUpData {
  email: string;
  password: string;
  displayName?: string;
  username?: string;
}

interface SignInData {
  email: string;
  password: string;
}

interface UpdatePasswordData {
  password: string;
}

interface UpdateProfileData {
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  bio?: string;
  isPublic?: boolean;
}

export function useSignUp() {
  return useMutation({
    mutationFn: async (data: SignUpData) => {
      const { error } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: {
            displayName: data.displayName,
            username: data.username,
          },
        },
      });

      if (error) throw error;
    },
  });
}

export function useSignIn() {
  return useMutation({
    mutationFn: async (data: SignInData) => {
      const { error } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });

      if (error) throw error;
    },
  });
}

export function useSignOut() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    },
    onSuccess: () => {
      // Clear all cached queries
      queryClient.clear();
      // Navigate to login
      router.replace("/login");
    },
  });
}

export function useRequestPasswordReset() {
  return useMutation({
    mutationFn: async (email: string) => {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: "plotpoint://reset-password",
      });

      if (error) throw error;
    },
  });
}

export function useUpdatePassword() {
  return useMutation({
    mutationFn: async (data: UpdatePasswordData) => {
      const { error } = await supabase.auth.updateUser({
        password: data.password,
      });

      if (error) throw error;
    },
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: UpdateProfileData) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) throw new Error("No authenticated user");

      // Convert camelCase to snake_case for database
      const dbData: Record<string, any> = {};
      if (data.username !== undefined) dbData.username = data.username;
      if (data.displayName !== undefined) dbData.display_name = data.displayName;
      if (data.avatarUrl !== undefined) dbData.avatar_url = data.avatarUrl;
      if (data.bio !== undefined) dbData.bio = data.bio;
      if (data.isPublic !== undefined) dbData.is_public = data.isPublic;
      dbData.updated_at = new Date().toISOString();

      const { error } = await supabase.from("profiles").update(dbData).eq("id", user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      // Invalidate auth-related queries if you have any
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
  });
}
