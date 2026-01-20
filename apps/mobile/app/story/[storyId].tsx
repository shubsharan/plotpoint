import { useLocalSearchParams } from 'expo-router';
import { StoryRunner } from '@/engine/runtime/story-runner';

export default function StoryPlayerScreen() {
  const { storyId } = useLocalSearchParams<{ storyId: string }>();

  if (!storyId) {
    return null;
  }

  return <StoryRunner storyId={storyId} />;
}
