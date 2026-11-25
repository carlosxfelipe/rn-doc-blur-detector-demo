import {
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import { DEFAULT_LAPLACIAN_CONFIG } from 'rn-doc-blur-detector';
import { DEFAULT_MAX_FILE_SIZE_MB } from 'rn-doc-blur-detector/pdf';

export function AboutScreen() {
  const isDark = useColorScheme() === 'dark';

  const colors = isDark
    ? {
        bg: '#0B1120',
        card: '#111827',
        border: '#334155',
        text: '#F8FAFC',
        muted: '#94A3B8',
      }
    : {
        bg: '#F8FAFC',
        card: '#FFFFFF',
        border: '#CBD5E1',
        text: '#0F172A',
        muted: '#475569',
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
});
