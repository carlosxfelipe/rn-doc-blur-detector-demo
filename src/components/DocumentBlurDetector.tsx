import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
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
  validateFileSize,
} from 'rn-doc-blur-detector/pdf';

import {
  captureCameraPhoto,
  pickDocumentFile,
  type PickedMediaAsset,
  pickGalleryImage,
  releasePickedUri,
} from '../utils/documentPicker';
import {
  analyzeDocumentFraming,
  type DocumentFramingConfig,
  type DocumentFramingProfile,
  type DocumentFramingResult,
  type FramingStatus,
  resolveFramingConfig,
} from '../utils/documentFraming';
import { Icon } from './Icon';
import { PdfBridgeWebView, type WebViewRefHandle } from './PdfBridgeWebView';

const STATUS_COLORS: Record<BlurStatus, { accent: string; bg: string }> = {
  sharp: { accent: '#15803D', bg: 'rgba(21, 128, 61, 0.12)' },
  borderline: { accent: '#B45309', bg: 'rgba(180, 83, 9, 0.12)' },
  blurry: { accent: '#B91C1C', bg: 'rgba(185, 28, 28, 0.12)' },
  insufficient: { accent: '#475569', bg: 'rgba(100, 116, 139, 0.16)' },
};

const FRAMING_STATUS_COLORS: Record<
  FramingStatus,
  { accent: string; bg: string }
> = {
  good: { accent: '#15803D', bg: 'rgba(21, 128, 61, 0.12)' },
  warning: { accent: '#B45309', bg: 'rgba(180, 83, 9, 0.12)' },
  poor: { accent: '#B91C1C', bg: 'rgba(185, 28, 28, 0.12)' },
  insufficient: { accent: '#475569', bg: 'rgba(100, 116, 139, 0.16)' },
};

export interface DocumentBlurDetectorProps {
  config?: Partial<LaplacianBlurConfig>;
  framing?: DocumentFramingProfile | Partial<DocumentFramingConfig>;
  maxPdfPages?: number;
  maxFileSizeMb?: number;
  onDocumentAnalyzed?: (
    document: AnalyzedDocumentItem,
    framingAnalyses?: DocumentFramingResult[],
  ) => void;
  style?: StyleProp<ViewStyle>;
}

export function DocumentBlurDetector({
  config,
  framing = 'auto',
  maxPdfPages = 2,
  maxFileSizeMb = DEFAULT_MAX_FILE_SIZE_MB,
  onDocumentAnalyzed,
  style,
}: DocumentBlurDetectorProps) {
  const isDark = useColorScheme() === 'dark';
  const webViewRef = useRef<WebViewRefHandle>(null);
  const activeObjectUriRef = useRef<string | undefined>(undefined);
  const pdfBridge = useMemo(() => createPdfBridgeController(), []);

  useEffect(() => {
    return () => {
      releasePickedUri(activeObjectUriRef.current);
    };
  }, []);

  const [analyzedDoc, setAnalyzedDoc] = useState<AnalyzedDocumentItem | null>(
    null,
  );
  const [selectedPageIdx, setSelectedPageIdx] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [previewBoxWidth, setPreviewBoxWidth] = useState(0);

  const mergedConfig = useMemo<LaplacianBlurConfig>(
    () => ({ ...DEFAULT_LAPLACIAN_CONFIG, locale: 'pt-BR', ...config }),
    [config],
  );

  const resolvedFraming = useMemo(
    () => resolveFramingConfig(framing, mergedConfig.locale ?? 'pt-BR'),
    [framing, mergedConfig.locale],
  );
  const isFramingEnabled = resolvedFraming.profile !== 'off';

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
    (data: string) => {
      pdfBridge.handleMessage(data);
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
      const framingResults = isFramingEnabled
        ? doc.pages.map(page =>
            analyzeDocumentFraming(page.rgba, resolvedFraming),
          )
        : undefined;
      setAnalyzedDoc(doc);
      setSelectedPageIdx(0);
      onDocumentAnalyzed?.(doc, framingResults);
    },
    [isFramingEnabled, mergedConfig, onDocumentAnalyzed, resolvedFraming],
  );

  const trackActiveUri = useCallback((uri?: string) => {
    if (activeObjectUriRef.current && activeObjectUriRef.current !== uri) {
      releasePickedUri(activeObjectUriRef.current);
    }
    activeObjectUriRef.current = uri;
  }, []);

  const analyzeImageSource = useCallback(
    async (asset: PickedMediaAsset) => {
      if (!checkFileSize(asset.size)) {
        releasePickedUri(asset.uri);
        return;
      }
      trackActiveUri(asset.uri);
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
    [
      checkFileSize,
      finalizeDocument,
      mergedConfig.maxAnalysisDim,
      trackActiveUri,
    ],
  );

  const analyzePdfSource = useCallback(
    async (asset: PickedMediaAsset) => {
      if (!checkFileSize(asset.size)) {
        releasePickedUri(asset.uri);
        return;
      }
      trackActiveUri(undefined);
      setErrorMsg(null);
      setIsProcessing(true);
      setLoadingMsg(`Preparando "${asset.name}"...`);
      try {
        const pdfResult = await extractPdfPages(
          { uri: asset.uri, file: asset.file },
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
        releasePickedUri(asset.uri);
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
      trackActiveUri,
    ],
  );

  const handlePickGallery = useCallback(async () => {
    if (isProcessing) return;
    try {
      const asset = await pickGalleryImage(mergedConfig.maxAnalysisDim);
      if (!asset) return;
      await analyzeImageSource(asset);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Erro ao selecionar imagem.',
      );
    }
  }, [analyzeImageSource, isProcessing, mergedConfig.maxAnalysisDim]);

  const handleTakePhoto = useCallback(async () => {
    if (isProcessing) return;
    try {
      const asset = await captureCameraPhoto(mergedConfig.maxAnalysisDim);
      if (!asset) return;
      await analyzeImageSource(asset);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Erro ao capturar foto.',
      );
    }
  }, [analyzeImageSource, isProcessing, mergedConfig.maxAnalysisDim]);

  const handlePickDocument = useCallback(async () => {
    if (isProcessing) return;
    try {
      const asset = await pickDocumentFile();
      if (!asset) return;

      if (isPdfAsset(asset.name, asset.mimeType)) {
        await analyzePdfSource(asset);
      } else if (isImageAsset(asset.name, asset.mimeType)) {
        await analyzeImageSource(asset);
      } else {
        releasePickedUri(asset.uri);
        setErrorMsg('Selecione apenas arquivos PDF ou imagens.');
      }
    } catch (err) {
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

  const framingAnalyses = useMemo(() => {
    if (!analyzedDoc || !isFramingEnabled) return null;
    return analyzedDoc.pages.map(page =>
      analyzeDocumentFraming(page.rgba, resolvedFraming),
    );
  }, [analyzedDoc, isFramingEnabled, resolvedFraming]);

  const activeFraming = framingAnalyses?.[safeIdx] ?? null;
  const framingColors = activeFraming
    ? FRAMING_STATUS_COLORS[activeFraming.status]
    : null;

  const previewAspectRatio =
    activePage && activePage.width > 0 && activePage.height > 0
      ? Math.max(0.5, Math.min(2, activePage.width / activePage.height))
      : 4 / 3;

  const previewDimensions = useMemo(() => {
    if (!activePage || previewBoxWidth <= 0) return null;
    const innerWidth = Math.max(1, previewBoxWidth - 12);
    const ratio =
      activePage.width > 0 && activePage.height > 0
        ? activePage.width / activePage.height
        : previewAspectRatio;
    const maxH = 320;
    let width = innerWidth;
    let height = width / ratio;
    if (height > maxH) {
      height = maxH;
      width = height * ratio;
    }
    return { width, height };
  }, [activePage, previewAspectRatio, previewBoxWidth]);

  return (
    <View style={[styles.container, style]}>
      <PdfBridgeWebView ref={webViewRef} onMessage={handleWebViewMessage} />

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
            <Icon name="image-outline" size={18} color={colors.onPrimary} />
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
            <Icon name="camera-outline" size={18} color={colors.text} />
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
            <Icon name="file-document-outline" size={18} color={colors.text} />
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
                trackActiveUri(undefined);
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

          {activeFraming && framingColors ? (
            <View
              style={[
                styles.card,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <View style={styles.verdictTop}>
                <Text style={[styles.verdictTitle, { color: colors.text }]}>
                  {activeFraming.label}
                </Text>
                <View
                  style={[styles.badge, { backgroundColor: framingColors.bg }]}
                >
                  <Text style={[styles.bold, { color: framingColors.accent }]}>
                    {`${activeFraming.score}/100`}
                  </Text>
                </View>
              </View>
              <Text style={[styles.verdictDesc, { color: colors.muted }]}>
                {activeFraming.reason}
              </Text>
              {activeFraming.issues.length > 1
                ? activeFraming.issues.slice(1).map((issue, idx) => (
                    <Text
                      key={idx}
                      style={[styles.mutedSmall, { color: colors.muted }]}
                    >
                      {`• ${issue}`}
                    </Text>
                  ))
                : null}
              <Text style={[styles.metricsLine, { color: colors.muted }]}>
                {activeFraming.metrics.isFullPageScan
                  ? `Página inteira • Proporção: ${activeFraming.metrics.aspectRatio}:1 • ${activeFraming.metrics.elapsedMs} ms`
                  : `Área: ${Math.round(
                      activeFraming.metrics.areaCoverage * 100,
                    )}% • Inclinação: ${
                      activeFraming.metrics.skewDegrees
                    }° • Proporção: ${activeFraming.metrics.aspectRatio}:1 • ${
                      activeFraming.metrics.elapsedMs
                    } ms`}
              </Text>
            </View>
          ) : null}

          <View
            style={[
              styles.card,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View
              onLayout={event => {
                const nextWidth = event.nativeEvent.layout.width;
                if (nextWidth > 0 && nextWidth !== previewBoxWidth) {
                  setPreviewBoxWidth(nextWidth);
                }
              }}
              style={[styles.previewBox, { backgroundColor: colors.frame }]}
            >
              {previewDimensions ? (
                <View
                  style={{
                    width: previewDimensions.width,
                    height: previewDimensions.height,
                  }}
                >
                  <Image
                    source={{ uri: activePage.previewUri }}
                    resizeMode="contain"
                    style={styles.previewFullImage}
                  />
                  {activeFraming?.metrics.boundingBox &&
                  !activeFraming.metrics.isFullPageScan &&
                  framingColors ? (
                    <View
                      pointerEvents="none"
                      style={[
                        styles.framingOverlay,
                        {
                          left: `${activeFraming.metrics.boundingBox.x * 100}%`,
                          top: `${activeFraming.metrics.boundingBox.y * 100}%`,
                          width: `${
                            activeFraming.metrics.boundingBox.width * 100
                          }%`,
                          height: `${
                            activeFraming.metrics.boundingBox.height * 100
                          }%`,
                          borderColor: framingColors.accent,
                          backgroundColor: framingColors.bg,
                        },
                      ]}
                    />
                  ) : null}
                </View>
              ) : (
                <Image
                  source={{ uri: activePage.previewUri }}
                  resizeMode="contain"
                  style={[
                    styles.previewImage,
                    { aspectRatio: previewAspectRatio },
                  ]}
                />
              )}
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
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
    flexDirection: 'row',
    gap: 6,
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
  previewFullImage: { width: '100%', height: '100%' },
  framingOverlay: {
    position: 'absolute',
    borderWidth: 2,
    borderRadius: 4,
  },
});
