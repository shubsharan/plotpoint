import { supabase } from "@/lib/supabase";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const getStoriesByAuthorId = async (id: string) => {
  let query = supabase.from("stories").select("*").eq("author", id);

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }
  return data;
};

export const useGetStoriesByAuthorId = (id: string) => {
  return useQuery({
    queryKey: ["user stories", id],
    queryFn: () => getStoriesByAuthorId(id),
    enabled: !!id,
  });
};

const createNewStory = async (author: string) => {
  const { data, error } = await supabase
    .from("stories")
    .insert({
      author,
      title: "Untitled",
      description: "",
      status: "draft",
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }
  return data;
};

export const useCreateNewStoryMutation = (author_id: string) => {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => createNewStory(author_id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["user stories", author_id],
      });
    },
  });

  return mutation;
};

const getStory = async (id: number) => {
  const { data, error } = await supabase
    .from("stories")
    .select(
      `
        *,
        author(name),
        genre (
          type,
          name
        ),
        content (
          *,
          blocks (
            *
          )
        )
      `
    )
    .eq("id", id)
    .single();

  if (error) throw error;
  return data;
};

export const useGetStory = (id: number) => {
  return useQuery({
    queryKey: ["story", id],
    queryFn: () => getStory(id),
    enabled: !!id,
  });
};
