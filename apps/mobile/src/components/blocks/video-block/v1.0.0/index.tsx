import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import type { VideoBlockProps } from './types';
import { videoBlockSchema } from './schema';
import { registerComponent } from '@plotpoint/engine/registry';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

function VideoBlockV1({ data, context, edges }: VideoBlockProps) {
  const {
    videoUrl,
    posterUrl,
    autoPlay = false,
    loop = false,
    muted = false,
    showControls = true,
    onEndAction = 'continue',
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
        case 'continue':
          context.onComplete();
          break;
        case 'loop':
          videoRef.current?.replayAsync();
          break;
        case 'pause':
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
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  if (error) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorIcon}>!</Text>
          <Text style={styles.errorText}>Failed to load video</Text>
          <Text style={styles.errorDetail}>{error}</Text>
          <Pressable style={styles.skipButton} onPress={handleContinue}>
            <Text style={styles.skipButtonText}>Skip Video</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.videoContainer}>
        <Video
          ref={videoRef}
          source={{ uri: videoUrl }}
          posterSource={posterUrl ? { uri: posterUrl } : undefined}
          usePoster={!!posterUrl}
          posterStyle={styles.poster}
          style={styles.video}
          resizeMode={ResizeMode.CONTAIN}
          isLooping={loop}
          isMuted={muted}
          useNativeControls={false}
          onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
        />

        {isLoading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#ffffff" />
            <Text style={styles.loadingText}>Loading video...</Text>
          </View>
        )}

        {showControls && !isLoading && (
          <Pressable style={styles.controlsOverlay} onPress={handlePlayPause}>
            {!isPlaying && (
              <View style={styles.playButtonContainer}>
                <Text style={styles.playButton}>▶</Text>
              </View>
            )}
          </Pressable>
        )}
      </View>

      {showControls && (
        <View style={styles.controlsBar}>
          <Text style={styles.timeText}>{formatTime(progress)}</Text>
          <View style={styles.progressContainer}>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  { width: duration > 0 ? `${(progress / duration) * 100}%` : '0%' },
                ]}
              />
            </View>
          </View>
          <Text style={styles.timeText}>{formatTime(duration)}</Text>
        </View>
      )}

      {(hasEnded || onEndAction === 'pause') && (
        <View style={styles.continueContainer}>
          <Pressable style={styles.continueButton} onPress={handleContinue}>
            <Text style={styles.continueButtonText}>Continue</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  videoContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  video: {
    width: SCREEN_WIDTH,
    height: (SCREEN_WIDTH * 9) / 16,
  },
  poster: {
    width: '100%',
    height: '100%',
    resizeMode: 'contain',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  loadingText: {
    color: '#ffffff',
    marginTop: 12,
    fontSize: 14,
  },
  controlsOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playButtonContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(59, 130, 246, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playButton: {
    color: '#ffffff',
    fontSize: 32,
    marginLeft: 4,
  },
  controlsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#1a1a1a',
  },
  timeText: {
    color: '#888888',
    fontSize: 12,
    fontFamily: 'monospace',
    minWidth: 45,
    textAlign: 'center',
  },
  progressContainer: {
    flex: 1,
    marginHorizontal: 12,
  },
  progressTrack: {
    height: 4,
    backgroundColor: '#3a3a3a',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#3b82f6',
    borderRadius: 2,
  },
  continueContainer: {
    padding: 24,
    backgroundColor: '#0f0f0f',
  },
  continueButton: {
    backgroundColor: '#3b82f6',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  continueButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: 16,
    color: '#ff6b6b',
  },
  errorText: {
    color: '#ff6b6b',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  errorDetail: {
    color: '#888888',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
  },
  skipButton: {
    backgroundColor: '#2a2a2a',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  skipButtonText: {
    color: '#ffffff',
    fontSize: 16,
  },
});

// Register the component with new taxonomy
registerComponent({
  componentType: 'video_block',
  version: '1.0.0',
  Component: VideoBlockV1,
  propsSchema: videoBlockSchema,
  defaultProps: {
    autoPlay: false,
    loop: false,
    muted: false,
    showControls: true,
    onEndAction: 'continue',
  },
});

export default VideoBlockV1;
