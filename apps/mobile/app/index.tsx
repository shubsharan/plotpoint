import { View, Text, StyleSheet, Pressable, FlatList } from 'react-native';
import { Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

// Placeholder stories for development
const PLACEHOLDER_STORIES = [
  { id: '1', title: 'The Mystery of Thornwood Manor', description: 'Uncover secrets in a haunted estate' },
  { id: '2', title: 'City of Shadows', description: 'A noir adventure through rain-soaked streets' },
  { id: '3', title: 'The Last Signal', description: 'Sci-fi survival on a distant colony' },
];

export default function HomeScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Plotpoint</Text>
        <Text style={styles.subtitle}>Interactive Stories</Text>
      </View>

      <FlatList
        data={PLACEHOLDER_STORIES}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Link href={`/story/${item.id}`} asChild>
            <Pressable style={styles.storyCard}>
              <Text style={styles.storyTitle}>{item.title}</Text>
              <Text style={styles.storyDescription}>{item.description}</Text>
            </Pressable>
          </Link>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f0f',
  },
  header: {
    padding: 24,
    paddingTop: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  subtitle: {
    fontSize: 16,
    color: '#888888',
    marginTop: 4,
  },
  list: {
    padding: 16,
    gap: 12,
  },
  storyCard: {
    backgroundColor: '#1a1a1a',
    padding: 20,
    borderRadius: 12,
    marginBottom: 12,
  },
  storyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
  },
  storyDescription: {
    fontSize: 14,
    color: '#888888',
    marginTop: 8,
  },
});
