import { supabase } from "@/lib/supabase";
import { useQuery } from "@tanstack/react-query";

const getStoriesByAuthorId = async (id: string) => {
  const { data, error } = await supabase
    .from("stories")
    .select("*")
    .eq("author_id", id);
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
