import React, { useState, useRef, useEffect } from "react";
import { View, Text, Pressable, ActivityIndicator, Dimensions } from "react-native";
import { Video, ResizeMode, AVPlaybackStatus } from "expo-av";
import type { VideoPlayerProps } from "./types";
import { videoPlayerSchema } from "./schema";
import { registerComponent } from "@plotpoint/engine/registry";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

function VideoPlayerV1({ data, context, edges }: VideoPlayerProps) {
  const {
    videoUrl,
    posterUrl,
    autoPlay = false,
    loop = false,
    muted = false,
    showControls = true,
    onEndAction = "continue",
  } = data;

  const videoRef = useRef<Video>(null);
  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [isLoading, setIsLoading] = useState(true);
  const [hasEnded, setHasEnded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    if (autoPlay) {
      videoRef.current?.playAsync();
    }
  }, [autoPlay]);

  const handlePlaybackStatusUpdate = (status: AVPlaybackStatus) => {
    if (!status.isLoaded) {
      if (status.error) {
        setError(`Playback error: ${status.error}`);
      }
      return;
    }

    setIsLoading(false);
    setIsPlaying(status.isPlaying);
    setProgress(status.positionMillis);
    setDuration(status.durationMillis ?? 0);

    if (status.didJustFinish && !status.isLooping) {
      setHasEnded(true);

      switch (onEndAction) {
        case "continue":
          context.onComplete();
          break;
        case "loop":
          videoRef.current?.replayAsync();
          break;
        case "pause":
          // Already paused, do nothing
          break;
      }
    }
  };

  const handlePlayPause = async () => {
    if (!videoRef.current) return;

    if (isPlaying) {
      await videoRef.current.pauseAsync();
    } else {
      if (hasEnded) {
        await videoRef.current.replayAsync();
        setHasEnded(false);
      } else {
        await videoRef.current.playAsync();
      }
    }
  };

  const handleContinue = () => {
    context.onComplete();
  };

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  if (error) {
    return (
      <View className="flex-1 bg-background">
        <View className="flex-1 justify-center items-center p-6">
          <Text className="text-5xl mb-4">⚠️</Text>
          <Text className="text-destructive text-lg font-semibold mb-2">Failed to load video</Text>
          <Text className="text-muted-foreground text-sm text-center mb-6">{error}</Text>
          <Pressable
            className="bg-card px-6 py-3 rounded-lg border-1 border-border"
            onPress={handleContinue}
          >
            <Text className="text-card-foreground text-base">Skip Video</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <View className="flex-1 justify-center items-center">
        <Video
          ref={videoRef}
          source={{ uri: videoUrl }}
          posterSource={posterUrl ? { uri: posterUrl } : undefined}
          usePoster={!!posterUrl}
          posterStyle={{ width: "100%", height: "100%", resizeMode: "contain" }}
          style={{ width: SCREEN_WIDTH, height: (SCREEN_WIDTH * 9) / 16 }}
          resizeMode={ResizeMode.CONTAIN}
          isLooping={loop}
          isMuted={muted}
          useNativeControls={false}
          onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
        />

        {isLoading && (
          <View className="absolute inset-0 justify-center items-center bg-black/70">
            <ActivityIndicator size="large" color="var(--card-foreground)" />
            <Text className="text-card-foreground text-sm mt-3">Loading video...</Text>
          </View>
        )}

        {showControls && !isLoading && (
          <Pressable
            className="absolute inset-0 justify-center items-center"
            onPress={handlePlayPause}
          >
            {!isPlaying && (
              <View className="w-20 h-20 rounded-full bg-yellow-400/90 justify-center items-center">
                <Text className="text-primary-foreground text-3xl ml-1">▶</Text>
              </View>
            )}
          </Pressable>
        )}
      </View>

      {showControls && (
        <View className="flex-row items-center p-4 bg-card">
          <Text className="text-muted-foreground text-xs font-mono min-w-[45px] text-center">
            {formatTime(progress)}
          </Text>
          <View className="flex-1 mx-3">
            <View className="h-1 bg-muted rounded overflow-hidden">
              <View
                style={{
                  width: duration > 0 ? `${(progress / duration) * 100}%` : "0%",
                }}
                className="h-full bg-primary rounded"
              />
            </View>
          </View>
          <Text className="text-muted-foreground text-xs font-mono min-w-[45px] text-center">
            {formatTime(duration)}
          </Text>
        </View>
      )}

      {(hasEnded || onEndAction === "pause") && (
        <View className="p-6 bg-background">
          <Pressable className="bg-primary py-4 rounded-lg items-center" onPress={handleContinue}>
            <Text className="text-primary-foreground text-lg font-semibold">Continue</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// Register the component
registerComponent({
  componentType: "video_player",
  version: "1.0.0",
  Component: VideoPlayerV1,
  propsSchema: videoPlayerSchema,
  defaultProps: {
    autoPlay: false,
    loop: false,
    muted: false,
    showControls: true,
    onEndAction: "continue",
  },
});

export default VideoPlayerV1;
