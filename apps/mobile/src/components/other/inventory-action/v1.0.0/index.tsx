import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  Animated,
  ScrollView,
  FlatList,
} from 'react-native';
import type { InventoryItem } from '@plotpoint/schemas';
import type { InventoryActionProps } from './types';
import { inventoryActionSchema } from './schema';
import { registerComponent } from '@plotpoint/engine/registry';

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
    if (action === 'add' || action === 'remove') {
      const item: InventoryItem = {
        id: itemId ?? `item_${Date.now()}`,
        name: itemName ?? 'Unknown Item',
        description: itemDescription,
        imageUrl: itemImageUrl,
        quantity,
      };

      context.onInventoryUpdate(item, action);
    }

    // Auto-advance after animation
    if (autoAdvance && action !== 'display') {
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
      case 'add':
        return '📦';
      case 'remove':
        return '🗑️';
      case 'check':
        return '🔍';
      case 'display':
        return '📋';
      default:
        return '📦';
    }
  };

  const getActionTitle = () => {
    switch (action) {
      case 'add':
        return 'Item Obtained!';
      case 'remove':
        return 'Item Removed';
      case 'check':
        const hasItem = context.inventory.some(
          (i) => i.id === itemId && i.quantity > 0
        );
        return hasItem ? 'Item Found!' : 'Item Not Found';
      case 'display':
        return 'Your Inventory';
      default:
        return 'Inventory';
    }
  };

  const renderItem = ({ item }: { item: InventoryItem }) => (
    <View style={styles.inventoryItem}>
      {item.imageUrl ? (
        <Image source={{ uri: item.imageUrl }} style={styles.inventoryItemImage} />
      ) : (
        <View style={styles.inventoryItemPlaceholder}>
          <Text style={styles.inventoryItemIcon}>📦</Text>
        </View>
      )}
      <View style={styles.inventoryItemInfo}>
        <Text style={styles.inventoryItemName}>{item.name}</Text>
        {item.description && (
          <Text style={styles.inventoryItemDescription} numberOfLines={2}>
            {item.description}
          </Text>
        )}
      </View>
      <Text style={styles.inventoryItemQuantity}>x{item.quantity}</Text>
    </View>
  );

  // Display full inventory
  if (action === 'display') {
    return (
      <View style={styles.container}>
        <Text style={styles.displayTitle}>{getActionTitle()}</Text>
        {context.inventory.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>🎒</Text>
            <Text style={styles.emptyText}>Your inventory is empty</Text>
          </View>
        ) : (
          <FlatList
            data={context.inventory}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            style={styles.inventoryList}
            contentContainerStyle={styles.inventoryListContent}
          />
        )}
        <View style={styles.continueContainer}>
          <Pressable style={styles.continueButton} onPress={handleContinue}>
            <Text style={styles.continueButtonText}>Continue</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // Item action animation
  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.actionContainer,
          {
            opacity: fadeAnim,
            transform: [{ scale: scaleAnim }, { translateY: slideAnim }],
          },
        ]}
      >
        <Text style={styles.actionIcon}>{getActionIcon()}</Text>
        <Text style={styles.actionTitle}>{getActionTitle()}</Text>

        {(action === 'add' || action === 'remove') && (
          <View style={styles.itemCard}>
            {itemImageUrl ? (
              <Image source={{ uri: itemImageUrl }} style={styles.itemImage} />
            ) : (
              <View style={styles.itemImagePlaceholder}>
                <Text style={styles.itemImageIcon}>📦</Text>
              </View>
            )}
            <Text style={styles.itemName}>{itemName ?? 'Unknown Item'}</Text>
            {itemDescription && (
              <Text style={styles.itemDescription}>{itemDescription}</Text>
            )}
            {quantity > 1 && (
              <Text style={styles.itemQuantity}>x{quantity}</Text>
            )}
          </View>
        )}

        {action === 'check' && (
          <View style={styles.checkResult}>
            {context.inventory.some((i) => i.id === itemId && i.quantity > 0) ? (
              <>
                <Text style={styles.checkIcon}>✅</Text>
                <Text style={styles.checkText}>
                  You have {itemName ?? 'this item'}
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.checkIcon}>❌</Text>
                <Text style={styles.checkText}>
                  You don't have {itemName ?? 'this item'}
                </Text>
              </>
            )}
          </View>
        )}

        {message && <Text style={styles.message}>{message}</Text>}
      </Animated.View>

      {!autoAdvance && (
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
    backgroundColor: '#0f0f0f',
  },
  actionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  actionIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  actionTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 24,
  },
  itemCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    width: '100%',
    maxWidth: 300,
  },
  itemImage: {
    width: 80,
    height: 80,
    borderRadius: 12,
    marginBottom: 16,
  },
  itemImagePlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 12,
    backgroundColor: '#2a2a2a',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  itemImageIcon: {
    fontSize: 32,
  },
  itemName: {
    fontSize: 20,
    fontWeight: '600',
    color: '#ffffff',
    textAlign: 'center',
  },
  itemDescription: {
    fontSize: 14,
    color: '#888888',
    textAlign: 'center',
    marginTop: 8,
  },
  itemQuantity: {
    fontSize: 18,
    fontWeight: '600',
    color: '#3b82f6',
    marginTop: 12,
  },
  checkResult: {
    alignItems: 'center',
  },
  checkIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  checkText: {
    fontSize: 18,
    color: '#e0e0e0',
    textAlign: 'center',
  },
  message: {
    fontSize: 16,
    color: '#888888',
    textAlign: 'center',
    marginTop: 24,
  },
  displayTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
    padding: 24,
    paddingBottom: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 18,
    color: '#888888',
  },
  inventoryList: {
    flex: 1,
  },
  inventoryListContent: {
    padding: 16,
  },
  inventoryItem: {
    flexDirection: 'row',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    alignItems: 'center',
  },
  inventoryItemImage: {
    width: 48,
    height: 48,
    borderRadius: 8,
  },
  inventoryItemPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: '#2a2a2a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  inventoryItemIcon: {
    fontSize: 24,
  },
  inventoryItemInfo: {
    flex: 1,
    marginLeft: 16,
  },
  inventoryItemName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  inventoryItemDescription: {
    fontSize: 12,
    color: '#888888',
    marginTop: 4,
  },
  inventoryItemQuantity: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3b82f6',
    marginLeft: 12,
  },
  continueContainer: {
    padding: 24,
    backgroundColor: '#0f0f0f',
    borderTopWidth: 1,
    borderTopColor: '#2a2a2a',
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
});

// Register the component
registerComponent({
  componentType: 'inventory_action',
  version: '1.0.0',
  Component: InventoryActionV1,
  propsSchema: inventoryActionSchema,
  defaultProps: {
    quantity: 1,
    autoAdvance: true,
  },
});

export default InventoryActionV1;
