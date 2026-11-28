import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';

import type { DocumentFramingProfile } from 'rn-doc-blur-detector';

import { DocumentBlurDetector } from '../components/DocumentBlurDetector';

const FRAMING_OPTIONS: Array<{
  value: DocumentFramingProfile;
  label: string;
}> = [
  { value: 'auto', label: 'Auto' },
  { value: 'a4', label: 'A4' },
  { value: 'id-card', label: 'RG/CNH' },
  { value: 'off', label: 'Desativado' },
];

export function HomeScreen() {
  const isDark = useColorScheme() === 'dark';
  const [framingProfile, setFramingProfile] =
    useState<DocumentFramingProfile>('auto');

  const colors = isDark
    ? {
        bg: '#0B1120',
        card: '#111827',
        border: '#334155',
        text: '#F8FAFC',
        muted: '#94A3B8',
        primary: '#60A5FA',
        onPrimary: '#0B1120',
      }
    : {
        bg: '#F8FAFC',
        card: '#FFFFFF',
        border: '#CBD5E1',
        text: '#0F172A',
        muted: '#475569',
        primary: '#1D4ED8',
        onPrimary: '#FFFFFF',
      };

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: colors.bg }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View
        style={[
          styles.profileCard,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <Text style={[styles.profileTitle, { color: colors.text }]}>
          Enquadramento do Documento
        </Text>
        <Text style={[styles.profileHint, { color: colors.muted }]}>
          Define a prop framing enviada para o detector avaliar bordas,
          ocupação, inclinação e proporção.
        </Text>
        <View style={styles.chipsWrap}>
          {FRAMING_OPTIONS.map(option => {
            const active = framingProfile === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => setFramingProfile(option.value)}
                style={[
                  styles.chip,
                  {
                    backgroundColor: active ? colors.primary : colors.bg,
                    borderColor: active ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    { color: active ? colors.onPrimary : colors.text },
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <DocumentBlurDetector framing={framingProfile} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, paddingBottom: 24, gap: 12 },
  profileCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  profileTitle: { fontSize: 14, fontWeight: '700' },
  profileHint: { fontSize: 12, lineHeight: 18 },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipText: { fontSize: 12, fontWeight: '600' },
});
