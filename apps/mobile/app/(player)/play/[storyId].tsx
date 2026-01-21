import { Redirect, useLocalSearchParams, usePathname } from "expo-router";
import { useAuthContext } from "@/contexts/auth-context";
import { StoryRunner } from "@features/player/story-runner";

export default function StoryPlayerScreen() {
  const { storyId } = useLocalSearchParams<{ storyId: string }>();
  const { isAuthenticated } = useAuthContext();
  const pathname = usePathname();

  // Route protection guard
  if (!isAuthenticated) {
    return (
      <Redirect
        href={{
          pathname: "/(modals)/login",
          params: { returnTo: pathname },
        }}
      />
    );
  }

  if (!storyId) {
    return null;
  }

  return <StoryRunner storyId={storyId} />;
}
