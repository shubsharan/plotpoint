import React, { useState, useEffect } from "react";
import { Modal, View, Text, TouchableOpacity, ScrollView } from "react-native";
import { useGenres } from "../../hooks/useStories";
import { cn } from "../../lib/utils";

export interface StoryFilters {
  genreIds: string[];
  difficultyLevels: number[];
  maxDistance?: number;
}

interface FilterSheetProps {
  visible: boolean;
  filters: StoryFilters;
  onApply: (filters: StoryFilters) => void;
  onClose: () => void;
}

export function FilterSheet({ visible, filters, onApply, onClose }: FilterSheetProps) {
  const { data: genres } = useGenres();
  const [localFilters, setLocalFilters] = useState<StoryFilters>(filters);

  useEffect(() => {
    setLocalFilters(filters);
  }, [filters]);

  const toggleGenre = (genreId: string) => {
    setLocalFilters((prev) => ({
      ...prev,
      genreIds: prev.genreIds.includes(genreId)
        ? prev.genreIds.filter((id) => id !== genreId)
        : [...prev.genreIds, genreId],
    }));
  };

  const toggleDifficulty = (level: number) => {
    setLocalFilters((prev) => ({
      ...prev,
      difficultyLevels: prev.difficultyLevels.includes(level)
        ? prev.difficultyLevels.filter((l) => l !== level)
        : [...prev.difficultyLevels, level],
    }));
  };

  const handleApply = () => {
    onApply(localFilters);
    onClose();
  };

  const handleReset = () => {
    const resetFilters: StoryFilters = {
      genreIds: [],
      difficultyLevels: [],
    };
    setLocalFilters(resetFilters);
    onApply(resetFilters);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <View className="flex-1 bg-black/50 justify-end">
        <View className="bg-background rounded-t-2xl max-h-[80%]">
          {/* Header */}
          <View className="flex-row justify-between items-center p-4 border-b-1 border-border">
            <Text className="text-foreground text-xl font-bold">Filter Stories</Text>
            <TouchableOpacity onPress={onClose}>
              <Text className="text-muted-foreground text-4xl">×</Text>
            </TouchableOpacity>
          </View>

          {/* Content */}
          <ScrollView className="p-4">
            {/* Genres */}
            <View className="mb-6">
              <Text className="text-foreground text-base font-semibold mb-3">Genres</Text>
              <View className="flex-row flex-wrap gap-2">
                {genres?.map((genre) => {
                  const isSelected = localFilters.genreIds.includes(genre.id);
                  return (
                    <TouchableOpacity
                      key={genre.id}
                      className={cn(
                        "px-4 py-2 rounded-full border-1",
                        isSelected ? "bg-primary border-primary" : "bg-card border-border",
                      )}
                      onPress={() => toggleGenre(genre.id)}
                    >
                      <Text
                        className={cn(
                          "text-sm",
                          isSelected
                            ? "text-primary-foreground font-semibold"
                            : "text-card-foreground",
                        )}
                      >
                        {genre.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Difficulty */}
            <View className="mb-6">
              <Text className="text-foreground text-base font-semibold mb-3">Difficulty</Text>
              <View className="flex-row flex-wrap gap-2">
                {[1, 2, 3, 4, 5].map((level) => {
                  const isSelected = localFilters.difficultyLevels.includes(level);
                  return (
                    <TouchableOpacity
                      key={level}
                      className={cn(
                        "px-4 py-2 rounded-full border-1",
                        isSelected ? "bg-primary border-primary" : "bg-card border-border",
                      )}
                      onPress={() => toggleDifficulty(level)}
                    >
                      <Text
                        className={cn(
                          "text-sm",
                          isSelected
                            ? "text-primary-foreground font-semibold"
                            : "text-card-foreground",
                        )}
                      >
                        {"★".repeat(level)}
                        {"☆".repeat(5 - level)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </ScrollView>

          {/* Footer */}
          <View className="flex-row p-4 gap-3 border-t-1 border-border">
            <TouchableOpacity
              className="flex-1 p-4 rounded-lg border-1 border-border items-center"
              onPress={handleReset}
            >
              <Text className="text-foreground text-base font-semibold">Reset</Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="flex-[2] p-4 rounded-lg bg-primary items-center"
              onPress={handleApply}
            >
              <Text className="text-primary-foreground text-base font-semibold">Apply Filters</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
