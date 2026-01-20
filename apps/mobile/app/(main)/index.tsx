import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useAuthContext } from '@/contexts/AuthContext';
import { useSignOut } from '@/hooks/useAuth';

export default function HomeScreen() {
  const { user, profile } = useAuthContext();
  const signOutMutation = useSignOut();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome to Plotpoint!</Text>
      {profile?.displayName && (
        <Text style={styles.subtitle}>Hello, {profile.displayName}</Text>
      )}
      {user && <Text style={styles.email}>{user.email}</Text>}

      <TouchableOpacity
        style={styles.button}
        onPress={() => signOutMutation.mutate()}
        disabled={signOutMutation.isPending}
      >
        <Text style={styles.buttonText}>
          {signOutMutation.isPending ? 'Signing out...' : 'Sign Out'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 20,
    marginBottom: 8,
    color: '#333',
  },
  email: {
    fontSize: 16,
    color: '#666',
    marginBottom: 32,
  },
  button: {
    backgroundColor: '#ef4444',
    borderRadius: 8,
    padding: 16,
    paddingHorizontal: 32,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
