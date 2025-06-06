import { supabase } from "@/lib/supabase";
import { base64ToUint8Array } from "@/utils/base64ToUint8Array";
import * as FileSystem from "expo-file-system";
import type * as ImagePicker from "expo-image-picker";
import { Platform } from "react-native";

type UploadOptions = {
  bucket?: string;
  pathPrefix?: string;
  fileName?: string;
  upsert?: boolean;
};

/**
 * Uploads an image picker asset to Supabase Storage.
 */
export async function uploadImageToSupabase(
  asset: ImagePicker.ImagePickerAsset,
  userId: string,
  options: UploadOptions = {}
): Promise<{
  publicUrl: string;
  fullPath: string;
  fileName: string;
  mimeType: string;
} | null> {
  if (!asset?.uri || !userId) return null;

  const {
    bucket = "images",
    pathPrefix = "",
    fileName = `image_${Date.now()}.jpg`,
    upsert = true,
  } = options;

  const fileExt = fileName.split(".").pop() || "jpg";
  const mimeType = `image/${fileExt === "jpg" ? "jpeg" : fileExt}`;
  const fullPath = `${pathPrefix ? `${pathPrefix}/` : ""}${fileName}`;

  try {
    let fileData: Blob | Uint8Array;

    if (Platform.OS === "web") {
      const response = await fetch(asset.uri);
      const blob = await response.blob();
      if (!blob || blob.size === 0) throw new Error("Empty blob");
      fileData = blob;
    } else {
      const base64 = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      fileData = base64ToUint8Array(base64);
    }

    const { error } = await supabase.storage
      .from(bucket)
      .upload(fullPath, fileData, {
        contentType: mimeType,
        cacheControl: "3600",
        upsert,
      });

    if (error) throw error;

    const { data: urlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(fullPath);
    if (!urlData?.publicUrl) throw new Error("No public URL returned");

    return {
      publicUrl: urlData.publicUrl,
      fullPath,
      fileName,
      mimeType,
    };
  } catch (err) {
    console.error("Upload to Supabase failed:", err);
    return null;
  }
}
