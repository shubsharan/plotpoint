import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { useAuth } from "@/providers/AuthProvider";
import { useGetUserById } from "@/queries/users";
import { Tables } from "@/types/database";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as ImagePicker from "expo-image-picker";
import { Image, Pressable, View } from "react-native";
import { useUploadStoryCoverImage } from "../hooks/useUploadStoryCoverImage";

export default function TitleCard({ story }: { story: Tables<"stories"> }) {
  const { session } = useAuth();

  // Fetch user data
  const { data: user } = useGetUserById(session?.user.id!);

  // Function to handle cover image upload
  const { mutate: uploadCoverImage, isPending: uploadIsPending } =
    useUploadStoryCoverImage(story?.id!, session?.user.id!);

  const handleUploadCoverImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });

    if (!result.canceled && result.assets.length > 0) {
      uploadCoverImage(result.assets[0]);
    }
  };

  return (
    <Card className="w-full mb-4">
      <CardHeader>
        {/* Cover Photo */}
        <Pressable
          className="w-full aspect-square bg-background rounded-md items-center justify-center overflow-hidden"
          onPress={async () => handleUploadCoverImage()}
          disabled={uploadIsPending}
        >
          {story?.cover_image ? (
            <Image
              source={{ uri: story.cover_image }}
              className="object-cover w-full h-full"
              alt="Cover Image"
            />
          ) : (
            <View className="flex-col gap-2 items-center justify-center">
              <Ionicons
                name="image-outline"
                size={24}
                className="text-muted-foreground"
              />
              <Text className="text-muted-foreground">Add cover photo</Text>
            </View>
          )}
        </Pressable>
      </CardHeader>

      <CardContent className="flex-col gap-2">
        {/* Title */}
        <Input
          value={story.title}
          onChangeText={() => {}}
          placeholder="Enter title..."
          editable
          variant="ghost"
          className="text-4xl font-semibold"
        />

        {/* Description */}
        <Input
          value={story.description ?? ""}
          onChangeText={() => {}}
          placeholder="Enter description..."
          editable
          multiline
          variant="ghost"
        />
      </CardContent>

      <CardFooter>
        {/* Author */}
        <View className="flex-row items-center gap-2">
          <Avatar alt={`${user?.name}'s Avatar`} className="size-6">
            <AvatarImage source={{ uri: user?.avatar || undefined }} />
            <AvatarFallback>
              {user ? (
                <Text className="text-xs font-semibold">
                  {user?.name
                    ?.split(" ")
                    .map((n) => n[0])
                    .join("")
                    .toUpperCase()}
                </Text>
              ) : (
                <Ionicons
                  name="person"
                  className="text-primary-foreground"
                  size={8}
                />
              )}
            </AvatarFallback>
          </Avatar>
          <Text className="font-semibold">{user?.name}</Text>
        </View>
      </CardFooter>
    </Card>
  );
}
