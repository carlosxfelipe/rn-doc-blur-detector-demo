import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import { DEFAULT_LAPLACIAN_CONFIG } from 'rn-doc-blur-detector';
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

import { Icon } from '../components/Icon';
import {
  PdfBridgeWebView,
  type WebViewRefHandle,
} from '../components/PdfBridgeWebView';
import {
  captureCameraPhoto,
  pickDocumentFile,
  type PickedMediaAsset,
  pickGalleryImage,
  releasePickedUri,
} from '../utils/documentPicker';

const PASS_COLOR = { accent: '#15803D', bg: 'rgba(21, 128, 61, 0.12)' };
const FAIL_COLOR = { accent: '#B91C1C', bg: 'rgba(185, 28, 28, 0.12)' };

const MAX_PDF_PAGES = 2;

interface ValidationSummary {
  fileName: string;
  fileMeta: string;
  approved: boolean;
  isBlurValid: boolean;
  isFramingValid: boolean;
  blurMessage: string;
  framingMessage: string;
}

export function ValidationScreen() {
  const isDark = useColorScheme() === 'dark';
  const webViewRef = useRef<WebViewRefHandle>(null);
  const activeObjectUriRef = useRef<string | undefined>(undefined);
  const pdfBridge = useMemo(() => createPdfBridgeController(), []);

  useEffect(() => {
    return () => {
      releasePickedUri(activeObjectUriRef.current);
    };
  }, []);

  const [validation, setValidation] = useState<ValidationSummary | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const colors = useMemo(
    () =>
      isDark
        ? {
            bg: '#0B1120',
            card: '#111827',
            frame: '#090D16',
            border: '#334155',
            text: '#F8FAFC',
            muted: '#94A3B8',
            primary: '#60A5FA',
            onPrimary: '#0B1120',
          }
        : {
            bg: '#F8FAFC',
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

  const checkFileSize = useCallback((size?: number): boolean => {
    const check = validateFileSize(size, DEFAULT_MAX_FILE_SIZE_MB);
    if (!check.valid) {
      setErrorMsg(
        `Arquivo muito grande (${check.formattedSize}). Limite: ${DEFAULT_MAX_FILE_SIZE_MB} MB.`,
      );
      return false;
    }
    return true;
  }, []);

  const evaluateDocument = useCallback(
    (item: Omit<AnalyzedDocumentItem, 'pageAnalyses' | 'summary'>) => {
      const analyzed = buildAnalyzedDocument(item, {
        ...DEFAULT_LAPLACIAN_CONFIG,
        locale: 'pt-BR',
        framing: 'auto',
      });

      const isBlurValid = analyzed.summary.status === 'sharp';
      const failedBlur = analyzed.pageAnalyses.find(p => p.status !== 'sharp');
      const failedFraming = analyzed.pageAnalyses.find(
        p => p.framing && p.framing.status !== 'good',
      )?.framing;
      const isFramingValid = !failedFraming;

      const fileMetaParts = [
        analyzed.type === 'pdf'
          ? `PDF • ${analyzed.pages.length}${
              analyzed.truncated ? `/${analyzed.totalPages}` : ''
            } pág(s)`
          : 'Imagem',
      ];
      if (analyzed.size) {
        fileMetaParts.push(formatBytes(analyzed.size));
      }

      setValidation({
        fileName: analyzed.name,
        fileMeta: fileMetaParts.join(' • '),
        approved: isBlurValid && isFramingValid,
        isBlurValid,
        isFramingValid,
        blurMessage: isBlurValid
          ? 'Aprovada'
          : failedBlur?.reason ?? analyzed.summary.label,
        framingMessage: isFramingValid
          ? 'Aprovado'
          : failedFraming?.reason ?? 'Enquadramento inadequado.',
      });
    },
    [],
  );

  const validateImageAsset = useCallback(
    async (asset: PickedMediaAsset) => {
      if (!checkFileSize(asset.size)) {
        releasePickedUri(asset.uri);
        return;
      }
      if (
        activeObjectUriRef.current &&
        activeObjectUriRef.current !== asset.uri
      ) {
        releasePickedUri(activeObjectUriRef.current);
      }
      activeObjectUriRef.current = asset.uri;

      setErrorMsg(null);
      setIsProcessing(true);
      setLoadingMsg('Validando imagem...');
      try {
        const page = await extractImagePage(
          {
            uri: asset.uri,
            width: asset.width,
            height: asset.height,
            base64: asset.base64,
          },
          DEFAULT_LAPLACIAN_CONFIG.maxAnalysisDim,
        );
        evaluateDocument({
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
          err instanceof Error ? err.message : 'Erro ao validar a imagem.',
        );
      } finally {
        releasePickedUri(asset.uri);
        activeObjectUriRef.current = undefined;
        setIsProcessing(false);
        setLoadingMsg('');
      }
    },
    [checkFileSize, evaluateDocument],
  );

  const validatePdfAsset = useCallback(
    async (asset: PickedMediaAsset) => {
      if (!checkFileSize(asset.size)) {
        releasePickedUri(asset.uri);
        return;
      }
      setErrorMsg(null);
      setIsProcessing(true);
      setLoadingMsg(`Validando "${asset.name}"...`);
      try {
        const pdfResult = await extractPdfPages(
          { uri: asset.uri, file: asset.file },
          {
            maxPages: MAX_PDF_PAGES,
            targetMaxDim: DEFAULT_LAPLACIAN_CONFIG.maxAnalysisDim,
            onProgress: (current, total) => {
              setLoadingMsg(`Validando página ${current} de ${total}...`);
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
        evaluateDocument({
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
          err instanceof Error ? err.message : 'Erro ao validar o PDF.',
        );
      } finally {
        releasePickedUri(asset.uri);
        setIsProcessing(false);
        setLoadingMsg('');
      }
    },
    [checkFileSize, evaluateDocument, pdfBridge],
  );

  const handlePickGallery = useCallback(async () => {
    if (isProcessing) return;
    try {
      const asset = await pickGalleryImage(
        DEFAULT_LAPLACIAN_CONFIG.maxAnalysisDim,
      );
      if (!asset) return;
      await validateImageAsset(asset);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Erro ao selecionar imagem.',
      );
    }
  }, [isProcessing, validateImageAsset]);

  const handleTakePhoto = useCallback(async () => {
    if (isProcessing) return;
    try {
      const asset = await captureCameraPhoto(
        DEFAULT_LAPLACIAN_CONFIG.maxAnalysisDim,
      );
      if (!asset) return;
      await validateImageAsset(asset);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Erro ao capturar foto.',
      );
    }
  }, [isProcessing, validateImageAsset]);

  const handlePickDocument = useCallback(async () => {
    if (isProcessing) return;
    try {
      const asset = await pickDocumentFile();
      if (!asset) return;

      if (isPdfAsset(asset.name, asset.mimeType)) {
        await validatePdfAsset(asset);
      } else if (isImageAsset(asset.name, asset.mimeType)) {
        await validateImageAsset(asset);
      } else {
        releasePickedUri(asset.uri);
        setErrorMsg('Selecione apenas arquivos PDF ou imagens.');
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Erro ao selecionar documento.',
      );
    }
  }, [isProcessing, validateImageAsset, validatePdfAsset]);

  const verdictColor = validation?.approved ? PASS_COLOR : FAIL_COLOR;

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: colors.bg }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
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
            { backgroundColor: FAIL_COLOR.bg, borderColor: FAIL_COLOR.accent },
          ]}
        >
          <Text style={{ color: FAIL_COLOR.accent }}>{errorMsg}</Text>
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

      {!isProcessing && validation ? (
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
                {validation.fileName}
              </Text>
              <Text style={[styles.mutedSmall, { color: colors.muted }]}>
                {validation.fileMeta}
              </Text>
            </View>
            <Pressable
              onPress={() => {
                setValidation(null);
                setErrorMsg(null);
              }}
              style={styles.clearBtn}
            >
              <Text style={[styles.semiBold, { color: colors.primary }]}>
                Limpar
              </Text>
            </Pressable>
          </View>

          <View
            style={[
              styles.card,
              {
                backgroundColor: colors.card,
                borderColor: verdictColor.accent,
              },
            ]}
          >
            <View style={styles.verdictTop}>
              <Text style={[styles.verdictTitle, { color: colors.text }]}>
                {validation.approved
                  ? 'Aprovado para upload'
                  : 'Reprovado para upload'}
              </Text>
              <View
                style={[styles.badge, { backgroundColor: verdictColor.bg }]}
              >
                <Text style={[styles.bold, { color: verdictColor.accent }]}>
                  {validation.approved ? 'Sim' : 'Não'}
                </Text>
              </View>
            </View>

            <Text
              style={[
                styles.verdictDesc,
                {
                  color: validation.isBlurValid
                    ? PASS_COLOR.accent
                    : FAIL_COLOR.accent,
                },
              ]}
            >
              {`${validation.isBlurValid ? '✓' : '✕'} Nitidez: ${
                validation.blurMessage
              }`}
            </Text>

            <Text
              style={[
                styles.verdictDesc,
                {
                  color: validation.isFramingValid
                    ? PASS_COLOR.accent
                    : FAIL_COLOR.accent,
                },
              ]}
            >
              {`${validation.isFramingValid ? '✓' : '✕'} Enquadramento: ${
                validation.framingMessage
              }`}
            </Text>
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, paddingBottom: 24, gap: 12 },
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
  verdictTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  verdictTitle: { flex: 1, fontSize: 16, fontWeight: '700' },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  verdictDesc: { fontSize: 14, lineHeight: 20 },
});
