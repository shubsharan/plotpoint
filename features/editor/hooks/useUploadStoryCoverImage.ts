import { supabase } from "@/lib/supabase";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type * as ImagePicker from "expo-image-picker";
import { uploadImageToSupabase } from "../utils/uploadImageToSupabase";

/**
 * Mutation hook to upload a cover image and update the story.
 */
export function useUploadStoryCoverImage(storyId: number, userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (asset: ImagePicker.ImagePickerAsset) => {
      const uploadResult = await uploadImageToSupabase(asset, userId, {
        pathPrefix: `${userId}/stories/${storyId}`,
        fileName: `cover_${Date.now()}.jpg`,
      });

      if (!uploadResult) throw new Error("Image upload failed");

      // Update the story with the new image URL
      const { error } = await supabase
        .from("stories")
        .update({ cover_image: uploadResult.publicUrl })
        .eq("id", storyId);

      if (error) throw error;

      return uploadResult.publicUrl;
    },
    onSuccess: () => {
      // ✅ Invalidate cached story data
      queryClient.invalidateQueries({ queryKey: ["story", storyId] });
    },
  });
}
