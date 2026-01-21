import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";

// Story type based on database schema
export interface Story {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  authorId: string;
  status: "draft" | "published" | "archived";
  shellType: "ebook" | "chat" | "map";
  genreId: string | null;
  estimatedDurationMinutes: number | null;
  difficultyLevel: number | null; // 1-5 scale
  coverImageUrl: string | null;
  geographyType: "single_city" | "multi_region" | "location_agnostic";
  primaryCity: string | null;
  primaryCountry: string | null;
  startNodeId: string | null;
  isMultiplayer: boolean;
  minPlayers: number;
  maxPlayers: number;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  // Relations
  author?: {
    id: string;
    username: string | null;
    displayName: string | null;
    avatarUrl: string | null;
  };
  genre?: {
    id: string;
    name: string;
    slug: string;
    color: string | null;
    icon: string | null;
  };
}

interface CreateStoryData {
  title: string;
  description?: string;
  shellType?: "ebook" | "chat" | "map";
  genreId?: string;
  geographyType?: "single_city" | "multi_region" | "location_agnostic";
  primaryCity?: string;
  primaryCountry?: string;
}

/**
 * Fetch all published stories
 */
export function usePublishedStories() {
  return useQuery({
    queryKey: ["stories", "published"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stories")
        .select(`
          *,
          author:profiles!author_id (
            id,
            username,
            display_name,
            avatar_url
          ),
          genre:genres!genre_id (
            id,
            name,
            slug,
            color,
            icon
          )
        `)
        .eq("status", "published")
        .order("published_at", { ascending: false });

      if (error) throw error;
      return data as Story[];
    },
  });
}

/**
 * Fetch stories near a specific location
 */
export function useStoriesByLocation(
  latitude: number | null,
  longitude: number | null,
  radiusKm: number = 50,
) {
  return useQuery({
    queryKey: ["stories", "location", latitude, longitude, radiusKm],
    queryFn: async () => {
      // For location-based stories, we need to join with venues table
      // For now, just fetch published stories (will filter on client side)
      // TODO: Implement proper geospatial queries with PostGIS
      const { data, error } = await supabase
        .from("stories")
        .select(`
          *,
          author:profiles!author_id (
            id,
            username,
            display_name,
            avatar_url
          ),
          genre:genres!genre_id (
            id,
            name,
            slug,
            color,
            icon
          )
        `)
        .eq("status", "published")
        .order("published_at", { ascending: false });

      if (error) throw error;
      return data as Story[];
    },
    enabled: latitude !== null && longitude !== null,
  });
}

/**
 * Search stories by title or description
 */
export function useSearchStories(query: string) {
  return useQuery({
    queryKey: ["stories", "search", query],
    queryFn: async () => {
      if (!query.trim()) {
        return [];
      }

      const { data, error } = await supabase
        .from("stories")
        .select(`
          *,
          author:profiles!author_id (
            id,
            username,
            display_name,
            avatar_url
          ),
          genre:genres!genre_id (
            id,
            name,
            slug,
            color,
            icon
          )
        `)
        .eq("status", "published")
        .or(`title.ilike.%${query}%,description.ilike.%${query}%`)
        .order("published_at", { ascending: false });

      if (error) throw error;
      return data as Story[];
    },
    enabled: query.trim().length > 0,
  });
}

/**
 * Fetch a single story by ID
 */
export function useStoryById(storyId: string | null) {
  return useQuery({
    queryKey: ["stories", storyId],
    queryFn: async () => {
      if (!storyId) return null;

      const { data, error } = await supabase
        .from("stories")
        .select(`
          *,
          author:profiles!author_id (
            id,
            username,
            display_name,
            avatar_url
          ),
          genre:genres!genre_id (
            id,
            name,
            slug,
            color,
            icon
          )
        `)
        .eq("id", storyId)
        .single();

      if (error) throw error;
      return data as Story;
    },
    enabled: !!storyId,
  });
}

/**
 * Fetch current user's stories (requires authentication)
 */
export function useMyStories() {
  return useQuery({
    queryKey: ["stories", "my"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("stories")
        .select(`
          *,
          author:profiles!author_id (
            id,
            username,
            display_name,
            avatar_url
          ),
          genre:genres!genre_id (
            id,
            name,
            slug,
            color,
            icon
          )
        `)
        .eq("author_id", user.id)
        .order("updated_at", { ascending: false });

      if (error) throw error;
      return data as Story[];
    },
  });
}

/**
 * Create a new story (requires authentication)
 */
export function useCreateStory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateStoryData) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Generate slug from title
      const slug = data.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");

      const { data: story, error } = await supabase
        .from("stories")
        .insert({
          title: data.title,
          slug,
          description: data.description,
          author_id: user.id,
          shell_type: data.shellType || "ebook",
          genre_id: data.genreId,
          geography_type: data.geographyType || "location_agnostic",
          primary_city: data.primaryCity,
          primary_country: data.primaryCountry,
          status: "draft",
        })
        .select()
        .single();

      if (error) throw error;
      return story;
    },
    onSuccess: () => {
      // Invalidate my stories query
      queryClient.invalidateQueries({ queryKey: ["stories", "my"] });
    },
  });
}

/**
 * Fetch all genres for filtering
 */
export function useGenres() {
  return useQuery({
    queryKey: ["genres"],
    queryFn: async () => {
      const { data, error } = await supabase.from("genres").select("*").order("name");

      if (error) throw error;
      return data;
    },
  });
}
