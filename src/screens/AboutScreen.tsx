import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import { DEFAULT_LAPLACIAN_CONFIG } from 'rn-doc-blur-detector';
import { DEFAULT_MAX_FILE_SIZE_MB } from 'rn-doc-blur-detector/pdf';

import { Icon } from '../components/Icon';

const PACKAGE_REPO_URL =
  'https://github.com/carlosxfelipe/rn-doc-blur-detector';

export function AboutScreen() {
  const isDark = useColorScheme() === 'dark';

  const colors = isDark
    ? {
        bg: '#0B1120',
        card: '#111827',
        surface: '#090D16',
        border: '#334155',
        text: '#F8FAFC',
        muted: '#94A3B8',
        primary: '#60A5FA',
      }
    : {
        bg: '#F8FAFC',
        card: '#FFFFFF',
        surface: '#F1F5F9',
        border: '#CBD5E1',
        text: '#0F172A',
        muted: '#475569',
        primary: '#1D4ED8',
      };

  const handleOpenRepo = () => {
    Linking.openURL(PACKAGE_REPO_URL).catch(() => {});
  };

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: colors.bg }]}
      contentContainerStyle={styles.content}
    >
      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <Text style={[styles.title, { color: colors.text }]}>
          rn-doc-blur-detector
        </Text>
        <Text style={[styles.body, { color: colors.muted }]}>
          App demo em React Native 0.88.1 (sem Expo) validando o core em
          TypeScript puro para detecção de documentos borrados 100% no
          dispositivo.
        </Text>
        <Pressable
          onPress={handleOpenRepo}
          accessibilityRole="link"
          accessibilityLabel="Abrir repositório do pacote rn-doc-blur-detector no GitHub"
          style={[
            styles.linkButton,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Icon name="github" size={18} color={colors.text} />
          <Text
            numberOfLines={1}
            style={[styles.linkText, { color: colors.primary }]}
          >
            github.com/carlosxfelipe/rn-doc-blur-detector
          </Text>
        </Pressable>
      </View>

      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <Text style={[styles.title, { color: colors.text }]}>
          Parâmetros Padrão
        </Text>
        <Text style={[styles.row, { color: colors.muted }]}>
          {`• Dimensão máxima de análise: ${DEFAULT_LAPLACIAN_CONFIG.maxAnalysisDim} px`}
        </Text>
        <Text style={[styles.row, { color: colors.muted }]}>
          {`• Score Nítido: ≥ ${DEFAULT_LAPLACIAN_CONFIG.sharpScoreThreshold}`}
        </Text>
        <Text style={[styles.row, { color: colors.muted }]}>
          {`• Score Borrado: < ${DEFAULT_LAPLACIAN_CONFIG.blurScoreThreshold}`}
        </Text>
        <Text style={[styles.row, { color: colors.muted }]}>
          {`• Limite padrão de arquivo na demo: ${DEFAULT_MAX_FILE_SIZE_MB} MB`}
        </Text>
      </View>

      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <Text style={[styles.title, { color: colors.text }]}>
          Suporte de PDF por Plataforma
        </Text>
        <Text style={[styles.body, { color: colors.muted }]}>
          • Android e iOS: PDF.js 4.10.38 vendorizado offline via Blob URLs na
          WebView.
        </Text>
        <Text style={[styles.body, { color: colors.muted }]}>
          • Web (react-native-web): HTMLCanvasElement para imagens e PDF.js
          4.10.38 via CDN para PDFs.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, gap: 12 },
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  title: { fontSize: 16, fontWeight: '700' },
  body: { fontSize: 14, lineHeight: 20 },
  row: { fontSize: 14, lineHeight: 20 },
  linkButton: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  linkText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },
});
