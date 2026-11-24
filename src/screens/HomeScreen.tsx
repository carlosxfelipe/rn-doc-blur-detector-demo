import { ScrollView, StyleSheet, useColorScheme } from 'react-native';

import { DocumentBlurDetector } from '../components/DocumentBlurDetector';

export function HomeScreen() {
  const isDark = useColorScheme() === 'dark';
  const bg = isDark ? '#0B1120' : '#F8FAFC';

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: bg }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <DocumentBlurDetector />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, paddingBottom: 24 },
});
