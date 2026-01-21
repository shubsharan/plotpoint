import React, { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, Image, Animated, FlatList } from "react-native";
import type { InventoryItem } from "@plotpoint/schemas";
import type { InventoryActionProps } from "./types";
import { inventoryActionSchema } from "./schema";
import { registerComponent } from "@plotpoint/engine/registry";

function InventoryActionV1({ data, context, edges }: InventoryActionProps) {
  const {
    action,
    itemId,
    itemName,
    itemDescription,
    itemImageUrl,
    quantity = 1,
    message,
    autoAdvance = true,
  } = data;

  const [showAnimation, setShowAnimation] = useState(true);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.5)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;

  useEffect(() => {
    // Entrance animation
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();

    // Perform the inventory action
    if (action === "add" || action === "remove") {
      const item: InventoryItem = {
        id: itemId ?? `item_${Date.now()}`,
        name: itemName ?? "Unknown Item",
        description: itemDescription,
        imageUrl: itemImageUrl,
        quantity,
      };

      context.onInventoryUpdate(item, action);
    }

    // Auto-advance after animation
    if (autoAdvance && action !== "display") {
      const timer = setTimeout(() => {
        context.onComplete();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [
    action,
    itemId,
    itemName,
    itemDescription,
    itemImageUrl,
    quantity,
    autoAdvance,
    context,
    fadeAnim,
    scaleAnim,
  ]);

  const handleContinue = () => {
    context.onComplete();
  };

  const getActionIcon = () => {
    switch (action) {
      case "add":
        return "📦";
      case "remove":
        return "🗑️";
      case "check":
        return "🔍";
      case "display":
        return "📋";
      default:
        return "📦";
    }
  };

  const getActionTitle = () => {
    switch (action) {
      case "add":
        return "Item Obtained!";
      case "remove":
        return "Item Removed";
      case "check":
        const hasItem = context.inventory.some((i) => i.id === itemId && i.quantity > 0);
        return hasItem ? "Item Found!" : "Item Not Found";
      case "display":
        return "Your Inventory";
      default:
        return "Inventory";
    }
  };

  const renderItem = ({ item }: { item: InventoryItem }) => (
    <View className="flex-row bg-card rounded-2xl p-4 mb-3 items-center">
      {item.imageUrl ? (
        <Image source={{ uri: item.imageUrl }} className="w-12 h-12 rounded-lg" />
      ) : (
        <View className="w-12 h-12 rounded-lg bg-muted justify-center items-center">
          <Text className="text-2xl">📦</Text>
        </View>
      )}
      <View className="flex-1 ml-4">
        <Text className="text-base font-semibold text-card-foreground">{item.name}</Text>
        {item.description && (
          <Text className="text-xs text-muted-foreground mt-1" numberOfLines={2}>
            {item.description}
          </Text>
        )}
      </View>
      <Text className="text-base font-semibold text-primary ml-3">x{item.quantity}</Text>
    </View>
  );

  // Display full inventory
  if (action === "display") {
    return (
      <View className="flex-1 bg-background">
        <Text className="text-2xl font-bold text-foreground px-6 pt-6 pb-4">
          {getActionTitle()}
        </Text>
        {context.inventory.length === 0 ? (
          <View className="flex-1 justify-center items-center">
            <Text className="text-6xl mb-4">🎒</Text>
            <Text className="text-lg text-muted-foreground">Your inventory is empty</Text>
          </View>
        ) : (
          <FlatList
            data={context.inventory}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            className="flex-1"
            contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 8 }}
          />
        )}
        <View className="px-6 py-6 bg-background border-t border-border">
          <Pressable className="bg-primary py-4 rounded-2xl items-center" onPress={handleContinue}>
            <Text className="text-primary-foreground text-lg font-semibold">Continue</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // Item action animation
  return (
    <View className="flex-1 bg-background">
      <Animated.View
        className="flex-1 justify-center items-center px-6"
        style={[
          {
            opacity: fadeAnim,
            transform: [{ scale: scaleAnim }, { translateY: slideAnim }],
          },
        ]}
      >
        <Text className="text-7xl mb-4">{getActionIcon()}</Text>
        <Text className="text-2xl font-bold text-foreground mb-6">{getActionTitle()}</Text>

        {(action === "add" || action === "remove") && (
          <View className="bg-card rounded-2xl p-6 items-center w-full max-w-xs">
            {itemImageUrl ? (
              <Image source={{ uri: itemImageUrl }} className="w-20 h-20 rounded-xl mb-4" />
            ) : (
              <View className="w-20 h-20 rounded-xl bg-muted justify-center items-center mb-4">
                <Text className="text-4xl">📦</Text>
              </View>
            )}
            <Text className="text-xl font-semibold text-card-foreground text-center">
              {itemName ?? "Unknown Item"}
            </Text>
            {itemDescription && (
              <Text className="text-sm text-muted-foreground text-center mt-2">
                {itemDescription}
              </Text>
            )}
            {quantity > 1 && (
              <Text className="text-lg font-semibold text-primary mt-3">x{quantity}</Text>
            )}
          </View>
        )}

        {action === "check" && (
          <View className="items-center">
            {context.inventory.some((i) => i.id === itemId && i.quantity > 0) ? (
              <>
                <Text className="text-5xl mb-4">✅</Text>
                <Text className="text-lg text-card-foreground text-center">
                  You have {itemName ?? "this item"}
                </Text>
              </>
            ) : (
              <>
                <Text className="text-5xl mb-4">❌</Text>
                <Text className="text-lg text-card-foreground text-center">
                  You don't have {itemName ?? "this item"}
                </Text>
              </>
            )}
          </View>
        )}

        {message && (
          <Text className="text-base text-muted-foreground text-center mt-6">{message}</Text>
        )}
      </Animated.View>

      {!autoAdvance && (
        <View className="px-6 py-6 bg-background border-t border-border">
          <Pressable className="bg-primary py-4 rounded-2xl items-center" onPress={handleContinue}>
            <Text className="text-primary-foreground text-lg font-semibold">Continue</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// Register the component
registerComponent({
  componentType: "inventory_action",
  version: "1.0.0",
  Component: InventoryActionV1,
  propsSchema: inventoryActionSchema,
  defaultProps: {
    quantity: 1,
    autoAdvance: true,
  },
});

export default InventoryActionV1;
