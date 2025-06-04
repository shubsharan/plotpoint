import { supabase } from "@/lib/supabase";
import { useQuery } from "@tanstack/react-query";

export async function fetchCompleteStory(storyId: number) {
  const { data, error } = await supabase
    .from("stories")
    .select(
      `
        id,
        title,
        description,
        content (
          id,
          type,
          position,
          content,
          blocks (
            id,
            config
          )
        )
      `
    )
    .eq("id", storyId)
    .single();

  if (error) throw error;
  return data;
}

export const useFetchCompleteStory = (storyId: number) => {
  return useQuery({
    queryKey: ["completeStory", storyId],
    queryFn: () => fetchCompleteStory(storyId),
    enabled: !!storyId,
  });
};
