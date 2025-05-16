import { Text } from "@/components/ui/text";
import {
  FlattenedNode,
  flattenTreeWithDepth,
  rebuildTreeFromFlat,
  StoryTree,
} from "@/lib/utils";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import DraggableFlatList from "react-native-draggable-flatlist";

export default function StoryDragTree({ storyTree }: { storyTree: StoryTree }) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const flatData = useMemo(
    () => flattenTreeWithDepth(storyTree.content, null, 0, [], expanded),
    [storyTree, expanded]
  );

  function toggleExpand(id: number) {
    setExpanded((prev) => {
      const copy = new Set(prev);
      if (copy.has(id)) {
        copy.delete(id);
      } else {
        copy.add(id);
      }
      return copy;
    });
  }

  const handleDragEnd = ({ data }: { data: FlattenedNode[] }) => {
    const rebuilt = rebuildTreeFromFlat(data);
    console.log("Rebuilt nested tree:", rebuilt);
    // TODO: persist changes to Supabase
  };

  return (
    <DraggableFlatList
      data={flatData}
      onDragEnd={handleDragEnd}
      keyExtractor={(item) => `${item.node.type}-${item.node.id}`}
      renderItem={({ item, drag }) => {
        const isLeafNode = item.node.type !== "section";
        const isLastChild =
          flatData.findIndex((node) => node.node.id === item.node.id) ===
          flatData.findIndex(
            (node) =>
              node.depth === item.depth &&
              node.node.parentId === item.node.parentId
          );

        return (
          <Pressable
            onLongPress={drag}
            onPress={() => {
              if (item.node.type === "section") toggleExpand(item.node.id);
            }}
            className={`pl-${item.depth * 4}`}
          >
            <View className="flex-row py-3 pr-4 items-center border-b border-border justify-between">
              <View className="flex-row items-center">
                {item.node.type === "section" ? (
                  expanded.has(item.node.id) ? (
                    <Ionicons
                      name="folder-open-outline"
                      size={16}
                      color="primary"
                    />
                  ) : (
                    <Ionicons name="folder-outline" size={16} color="primary" />
                  )
                ) : (
                  <Ionicons name="document-text" size={16} color="primary" />
                )}
                <Text className="ml-2">{item.node.name}</Text>
              </View>
              <Ionicons
                name="chevron-forward-outline"
                size={16}
                className={`${
                  isLeafNode && isLastChild ? "text-primary/25" : "text-primary"
                } ${
                  !isLeafNode && expanded.has(item.node.id)
                    ? "rotate-90"
                    : "rotate-0"
                }`}
              />
            </View>
          </Pressable>
        );
      }}
    />
  );
}
