import {
  errorCodes,
  isErrorWithCode,
  keepLocalCopy,
  pick,
  types,
} from '@react-native-documents/picker';
import {
  type ComponentType,
  type RefAttributes,
  useCallback,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Image,
  PermissionsAndroid,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import WebView, {
  type WebViewMessageEvent,
  type WebViewProps,
} from 'react-native-webview';
import {
  type BlurStatus,
  DEFAULT_LAPLACIAN_CONFIG,
  type LaplacianBlurConfig,
} from 'rn-doc-blur-detector';
import {
  type AnalyzedDocumentItem,
  buildAnalyzedDocument,
  createPdfBridgeController,
  DEFAULT_MAX_FILE_SIZE_MB,
  extractImagePage,
  extractPdfPages,
  formatBytes,
  isImageAsset,
  isPdfAsset,
  PDF_WEBVIEW_HTML,
  validateFileSize,
} from 'rn-doc-blur-detector/pdf';

interface WebViewRefHandle {
  injectJavaScript: (script: string) => void;
}

const TypedWebView = WebView as unknown as ComponentType<
  WebViewProps & RefAttributes<WebViewRefHandle>
>;

const STATUS_COLORS: Record<BlurStatus, { accent: string; bg: string }> = {
  sharp: { accent: '#15803D', bg: 'rgba(21, 128, 61, 0.12)' },
  borderline: { accent: '#B45309', bg: 'rgba(180, 83, 9, 0.12)' },
  blurry: { accent: '#B91C1C', bg: 'rgba(185, 28, 28, 0.12)' },
  insufficient: { accent: '#475569', bg: 'rgba(100, 116, 139, 0.16)' },
};

async function ensureCameraPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return true;
  }
  const granted = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.CAMERA,
  );
  return granted === PermissionsAndroid.RESULTS.GRANTED;
}

export interface DocumentBlurDetectorProps {
  config?: Partial<LaplacianBlurConfig>;
  maxPdfPages?: number;
  maxFileSizeMb?: number;
  onDocumentAnalyzed?: (document: AnalyzedDocumentItem) => void;
  style?: StyleProp<ViewStyle>;
}

export function DocumentBlurDetector({
  config,
  maxPdfPages = 2,
  maxFileSizeMb = DEFAULT_MAX_FILE_SIZE_MB,
  onDocumentAnalyzed,
  style,
}: DocumentBlurDetectorProps) {
  const isDark = useColorScheme() === 'dark';
  const webViewRef = useRef<WebViewRefHandle>(null);
  const pdfBridge = useMemo(() => createPdfBridgeController(), []);

  const [analyzedDoc, setAnalyzedDoc] = useState<AnalyzedDocumentItem | null>(
    null,
  );
  const [selectedPageIdx, setSelectedPageIdx] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const mergedConfig = useMemo<LaplacianBlurConfig>(
    () => ({ ...DEFAULT_LAPLACIAN_CONFIG, locale: 'pt-BR', ...config }),
    [config],
  );

  const colors = useMemo(
    () =>
      isDark
        ? {
            card: '#111827',
            frame: '#090D16',
            border: '#334155',
            text: '#F8FAFC',
            muted: '#94A3B8',
            primary: '#60A5FA',
            onPrimary: '#0B1120',
          }
        : {
            card: '#FFFFFF',
            frame: '#F1F5F9',
            border: '#CBD5E1',
            text: '#0F172A',
            muted: '#475569',
            primary: '#1D4ED8',
            onPrimary: '#FFFFFF',
          },
    [isDark],
  );

  const handleWebViewMessage = useCallback(
    (event: WebViewMessageEvent) => {
      pdfBridge.handleMessage(event.nativeEvent.data);
    },
    [pdfBridge],
  );

  const checkFileSize = useCallback(
    (size?: number): boolean => {
      const check = validateFileSize(size, maxFileSizeMb);
      if (!check.valid) {
        setErrorMsg(
          `Arquivo muito grande (${check.formattedSize}). Limite: ${maxFileSizeMb} MB.`,
        );
        return false;
      }
      return true;
    },
    [maxFileSizeMb],
  );

  const finalizeDocument = useCallback(
    (item: Omit<AnalyzedDocumentItem, 'pageAnalyses' | 'summary'>) => {
      const doc = buildAnalyzedDocument(item, mergedConfig);
      setAnalyzedDoc(doc);
      setSelectedPageIdx(0);
      onDocumentAnalyzed?.(doc);
    },
    [mergedConfig, onDocumentAnalyzed],
  );

  const analyzeImageSource = useCallback(
    async (asset: {
      uri: string;
      name: string;
      width?: number;
      height?: number;
      size?: number;
      base64?: string;
    }) => {
      if (!checkFileSize(asset.size)) return;
      setErrorMsg(null);
      setIsProcessing(true);
      setLoadingMsg('Analisando nitidez da imagem...');
      try {
        const page = await extractImagePage(
          {
            uri: asset.uri,
            width: asset.width,
            height: asset.height,
            base64: asset.base64,
          },
          mergedConfig.maxAnalysisDim,
        );
        finalizeDocument({
          id: `${Date.now()}`,
          name: asset.name,
          type: 'image',
          size: asset.size,
          totalPages: 1,
          truncated: false,
          pages: [page],
        });
      } catch (err) {
        setErrorMsg(
          err instanceof Error ? err.message : 'Erro ao analisar a imagem.',
        );
      } finally {
        setIsProcessing(false);
        setLoadingMsg('');
      }
    },
    [checkFileSize, finalizeDocument, mergedConfig.maxAnalysisDim],
  );

  const analyzePdfSource = useCallback(
    async (asset: { uri: string; name: string; size?: number }) => {
      if (!checkFileSize(asset.size)) return;
      setErrorMsg(null);
      setIsProcessing(true);
      setLoadingMsg(`Preparando "${asset.name}"...`);
      try {
        const pdfResult = await extractPdfPages(
          { uri: asset.uri },
          {
            maxPages: maxPdfPages,
            targetMaxDim: mergedConfig.maxAnalysisDim,
            onProgress: (current, total) => {
              setLoadingMsg(
                `Renderizando página ${current} de ${total} do PDF...`,
              );
            },
            renderPdfViaBridge: params =>
              pdfBridge.runJob(params, script => {
                if (!webViewRef.current) {
                  throw new Error('WebView de PDF não está montada.');
                }
                webViewRef.current.injectJavaScript(script);
              }),
          },
        );

        finalizeDocument({
          id: `${Date.now()}`,
          name: asset.name,
          type: 'pdf',
          size: asset.size,
          totalPages: pdfResult.totalPages,
          truncated: pdfResult.truncated,
          pages: pdfResult.pages,
        });
      } catch (err) {
        setErrorMsg(
          err instanceof Error ? err.message : 'Erro ao analisar o PDF.',
        );
      } finally {
        setIsProcessing(false);
        setLoadingMsg('');
      }
    },
    [
      checkFileSize,
      finalizeDocument,
      maxPdfPages,
      mergedConfig.maxAnalysisDim,
      pdfBridge,
    ],
  );

  const handlePickGallery = useCallback(async () => {
    if (isProcessing) return;
    const res = await launchImageLibrary({
      mediaType: 'photo',
      maxWidth: mergedConfig.maxAnalysisDim,
      maxHeight: mergedConfig.maxAnalysisDim,
      quality: 1,
      includeBase64: true,
      assetRepresentationMode: 'compatible',
    });
    if (res.didCancel) return;
    if (res.errorMessage) {
      setErrorMsg(res.errorMessage);
      return;
    }
    const asset = res.assets?.[0];
    if (!asset?.uri) return;

    await analyzeImageSource({
      uri: asset.uri,
      name: asset.fileName ?? 'galeria.jpg',
      width: asset.width,
      height: asset.height,
      size: asset.fileSize,
      base64: asset.base64,
    });
  }, [analyzeImageSource, isProcessing, mergedConfig.maxAnalysisDim]);

  const handleTakePhoto = useCallback(async () => {
    if (isProcessing) return;
    const ok = await ensureCameraPermission();
    if (!ok) {
      setErrorMsg('Permissão de câmera necessária.');
      return;
    }
    const res = await launchCamera({
      mediaType: 'photo',
      maxWidth: mergedConfig.maxAnalysisDim,
      maxHeight: mergedConfig.maxAnalysisDim,
      quality: 1,
      includeBase64: true,
    });
    if (res.didCancel) return;
    if (res.errorMessage) {
      setErrorMsg(res.errorMessage);
      return;
    }
    const asset = res.assets?.[0];
    if (!asset?.uri) return;

    await analyzeImageSource({
      uri: asset.uri,
      name: asset.fileName ?? 'camera.jpg',
      width: asset.width,
      height: asset.height,
      size: asset.fileSize,
      base64: asset.base64,
    });
  }, [analyzeImageSource, isProcessing, mergedConfig.maxAnalysisDim]);

  const handlePickDocument = useCallback(async () => {
    if (isProcessing) return;
    try {
      const [picked] = await pick({
        type: [types.pdf, types.images],
      });
      if (!picked) return;

      const fileName = picked.name ?? 'documento';
      const mimeType = picked.type ?? undefined;

      const [copied] = await keepLocalCopy({
        files: [{ uri: picked.uri, fileName }],
        destination: 'cachesDirectory',
      });
      const localUri =
        copied.status === 'success' ? copied.localUri : picked.uri;

      if (isPdfAsset(fileName, mimeType)) {
        await analyzePdfSource({
          uri: localUri,
          name: fileName,
          size: picked.size ?? undefined,
        });
      } else if (isImageAsset(fileName, mimeType)) {
        await analyzeImageSource({
          uri: localUri,
          name: fileName,
          size: picked.size ?? undefined,
        });
      } else {
        setErrorMsg('Selecione apenas arquivos PDF ou imagens JPEG.');
      }
    } catch (err) {
      if (isErrorWithCode(err) && err.code === errorCodes.OPERATION_CANCELED) {
        return;
      }
      setErrorMsg(
        err instanceof Error ? err.message : 'Erro ao selecionar documento.',
      );
    }
  }, [analyzeImageSource, analyzePdfSource, isProcessing]);

  const safeIdx = analyzedDoc
    ? Math.min(selectedPageIdx, Math.max(0, analyzedDoc.pages.length - 1))
    : 0;
  const activePage = analyzedDoc?.pages[safeIdx] ?? null;
  const activeAnalysis = analyzedDoc?.pageAnalyses[safeIdx] ?? null;
  const statusColors = activeAnalysis
    ? STATUS_COLORS[activeAnalysis.status]
    : null;

  const previewAspectRatio =
    activePage && activePage.width > 0 && activePage.height > 0
      ? Math.max(0.5, Math.min(2, activePage.width / activePage.height))
      : 4 / 3;

  return (
    <View style={[styles.container, style]}>
      <View pointerEvents="none" style={styles.hiddenWebViewWrap}>
        <TypedWebView
          ref={webViewRef}
          source={{ html: PDF_WEBVIEW_HTML }}
          originWhitelist={['*']}
          javaScriptEnabled
          onMessage={handleWebViewMessage}
          style={styles.hiddenWebView}
        />
      </View>

      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <View style={styles.actionsRow}>
          <Pressable
            onPress={handlePickGallery}
            disabled={isProcessing}
            style={[
              styles.button,
              { backgroundColor: colors.primary },
              isProcessing && styles.buttonDisabled,
            ]}
          >
            <Text style={[styles.buttonText, { color: colors.onPrimary }]}>
              Galeria
            </Text>
          </Pressable>

          <Pressable
            onPress={handleTakePhoto}
            disabled={isProcessing}
            style={[
              styles.button,
              styles.outlinedButton,
              { backgroundColor: colors.frame, borderColor: colors.border },
              isProcessing && styles.buttonDisabled,
            ]}
          >
            <Text style={[styles.buttonText, { color: colors.text }]}>
              Câmera
            </Text>
          </Pressable>

          <Pressable
            onPress={handlePickDocument}
            disabled={isProcessing}
            style={[
              styles.button,
              styles.outlinedButton,
              { backgroundColor: colors.frame, borderColor: colors.border },
              isProcessing && styles.buttonDisabled,
            ]}
          >
            <Text style={[styles.buttonText, { color: colors.text }]}>PDF</Text>
          </Pressable>
        </View>
      </View>

      {errorMsg ? (
        <View
          style={[
            styles.card,
            {
              backgroundColor: STATUS_COLORS.blurry.bg,
              borderColor: STATUS_COLORS.blurry.accent,
            },
          ]}
        >
          <Text style={{ color: STATUS_COLORS.blurry.accent }}>{errorMsg}</Text>
        </View>
      ) : null}

      {isProcessing ? (
        <View
          style={[
            styles.loadingCard,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={{ color: colors.text }}>
            {loadingMsg || 'Processando...'}
          </Text>
        </View>
      ) : null}

      {!isProcessing &&
      analyzedDoc &&
      activePage &&
      activeAnalysis &&
      statusColors ? (
        <View style={styles.results}>
          <View
            style={[
              styles.fileRow,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View style={styles.fileInfo}>
              <Text
                numberOfLines={1}
                style={[styles.fileTitle, { color: colors.text }]}
              >
                {analyzedDoc.name}
              </Text>
              <Text style={[styles.mutedSmall, { color: colors.muted }]}>
                {analyzedDoc.type === 'pdf'
                  ? `PDF • ${analyzedDoc.pages.length}${
                      analyzedDoc.truncated ? `/${analyzedDoc.totalPages}` : ''
                    } pág(s)`
                  : `Imagem • ${activePage.width}×${activePage.height}px`}
                {analyzedDoc.size ? ` • ${formatBytes(analyzedDoc.size)}` : ''}
              </Text>
            </View>
            <Pressable
              onPress={() => {
                setAnalyzedDoc(null);
                setSelectedPageIdx(0);
                setErrorMsg(null);
              }}
              style={styles.clearBtn}
            >
              <Text style={[styles.semiBold, { color: colors.primary }]}>
                Limpar
              </Text>
            </Pressable>
          </View>

          {analyzedDoc.pages.length > 1 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipsRow}
            >
              {analyzedDoc.pageAnalyses.map((res, idx) => {
                const active = idx === safeIdx;
                return (
                  <Pressable
                    key={idx}
                    onPress={() => setSelectedPageIdx(idx)}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: active ? colors.primary : colors.card,
                        borderColor: active ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.semiBold,
                        { color: active ? colors.onPrimary : colors.text },
                      ]}
                    >
                      {`Pág. ${idx + 1} (${res.score})`}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}

          <View
            style={[
              styles.card,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View style={styles.verdictTop}>
              <Text style={[styles.verdictTitle, { color: colors.text }]}>
                {activeAnalysis.label}
              </Text>
              <View
                style={[styles.badge, { backgroundColor: statusColors.bg }]}
              >
                <Text style={[styles.bold, { color: statusColors.accent }]}>
                  {`${activeAnalysis.score}/100`}
                </Text>
              </View>
            </View>
            <Text style={[styles.verdictDesc, { color: colors.muted }]}>
              {activeAnalysis.reason}
            </Text>
            <Text style={[styles.metricsLine, { color: colors.muted }]}>
              {`Laplaciano: ${activeAnalysis.metrics.globalLaplacianVar} • ${activeAnalysis.metrics.analyzedWidth}×${activeAnalysis.metrics.analyzedHeight}px • ${activeAnalysis.metrics.elapsedMs} ms`}
            </Text>
          </View>

          <View
            style={[
              styles.card,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View
              style={[styles.previewBox, { backgroundColor: colors.frame }]}
            >
              <Image
                source={{ uri: activePage.previewUri }}
                resizeMode="contain"
                style={[
                  styles.previewImage,
                  { aspectRatio: previewAspectRatio },
                ]}
              />
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  hiddenWebViewWrap: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
    overflow: 'hidden',
  },
  hiddenWebView: { width: 1, height: 1 },
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  actionsRow: { flexDirection: 'row', gap: 10 },
  button: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlinedButton: { borderWidth: 1 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { fontSize: 14, fontWeight: '600' },
  semiBold: { fontWeight: '600' },
  bold: { fontWeight: '700' },
  loadingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  results: { gap: 12 },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  fileInfo: { flex: 1, gap: 2 },
  fileTitle: { fontSize: 14, fontWeight: '600' },
  mutedSmall: { fontSize: 12 },
  clearBtn: { paddingHorizontal: 8, paddingVertical: 6 },
  chipsRow: { gap: 8 },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  verdictTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  verdictTitle: { flex: 1, fontSize: 16, fontWeight: '700' },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  verdictDesc: { fontSize: 14, lineHeight: 20 },
  metricsLine: { fontSize: 12, marginTop: 2 },
  previewBox: {
    borderRadius: 8,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 6,
  },
  previewImage: { width: '100%', maxHeight: 320 },
});
