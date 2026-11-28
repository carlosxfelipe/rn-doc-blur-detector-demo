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
} from 'react-native';
import {
  DEFAULT_LAPLACIAN_CONFIG,
  type NormalizedBoundingBox,
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

const MAX_PDF_PAGES = 2;

const REQUIRED_DOCUMENTS = [
  { key: 'rg', label: 'RG', shortLabel: 'RG' },
  { key: 'cpf', label: 'CPF', shortLabel: 'CPF' },
  { key: 'cnpj', label: 'CNPJ', shortLabel: 'CNPJ' },
  {
    key: 'comprovante',
    label: 'Comprovante de residência',
    shortLabel: 'Comprovante',
  },
  {
    key: 'contrato',
    label: 'Contrato Social',
    shortLabel: 'Contrato Social',
  },
] as const;

type DocumentTypeKey = (typeof REQUIRED_DOCUMENTS)[number]['key'];
type FlowStage = 'intro' | 'collecting' | 'preview' | 'submitted';

interface AttachedDocument {
  key: DocumentTypeKey;
  label: string;
  fileName: string;
  fileMeta: string;
  sourceKind: 'image' | 'pdf';
}

interface PendingPreview {
  docKey: DocumentTypeKey;
  docLabel: string;
  fileName: string;
  fileMeta: string;
  sourceKind: 'image' | 'pdf';
  previewUri?: string;
  imageWidth?: number;
  imageHeight?: number;
  boundingBox?: NormalizedBoundingBox | null;
  approved: boolean;
  isBlurValid: boolean;
  isFramingValid: boolean;
  blurMessage: string;
  framingMessage: string;
}

const STATUS_PALETTE = {
  light: {
    pass: { accent: '#15803D', bg: 'rgba(21, 128, 61, 0.12)' },
    warn: { accent: '#C2410C', bg: 'rgba(194, 65, 12, 0.12)' },
    fail: { accent: '#B91C1C', bg: 'rgba(185, 28, 28, 0.12)' },
  },
  dark: {
    pass: { accent: '#4ADE80', bg: 'rgba(74, 222, 128, 0.16)' },
    warn: { accent: '#FB923C', bg: 'rgba(251, 146, 60, 0.16)' },
    fail: { accent: '#F87171', bg: 'rgba(248, 113, 113, 0.16)' },
  },
} as const;

export function DocumentsScreen() {
  const isDark = useColorScheme() === 'dark';
  const webViewRef = useRef<WebViewRefHandle>(null);
  const activePreviewUriRef = useRef<string | undefined>(undefined);
  const pdfBridge = useMemo(() => createPdfBridgeController(), []);

  useEffect(() => {
    return () => {
      releasePickedUri(activePreviewUriRef.current);
    };
  }, []);

  const [stage, setStage] = useState<FlowStage>('intro');
  const [activeDocKey, setActiveDocKey] = useState<DocumentTypeKey | null>(
    'rg',
  );
  const [attachedDocs, setAttachedDocs] = useState<
    Partial<Record<DocumentTypeKey, AttachedDocument>>
  >({});
  const [pendingPreview, setPendingPreview] = useState<PendingPreview | null>(
    null,
  );
  const [previewBoxWidth, setPreviewBoxWidth] = useState(0);
  const [bannerMsg, setBannerMsg] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submittedProtocol, setSubmittedProtocol] = useState<string | null>(
    null,
  );

  const colors = useMemo(
    () =>
      isDark
        ? {
            bg: '#0B1120',
            card: '#111827',
            frame: '#090D16',
            previewStage: '#0F172A',
            border: '#334155',
            text: '#F8FAFC',
            muted: '#94A3B8',
            primary: '#60A5FA',
            onPrimary: '#0B1120',
            track: '#1E293B',
            disabledBg: '#1E293B',
            disabledText: '#64748B',
          }
        : {
            bg: '#F8FAFC',
            card: '#FFFFFF',
            frame: '#F1F5F9',
            previewStage: '#1E293B',
            border: '#CBD5E1',
            text: '#0F172A',
            muted: '#475569',
            primary: '#1D4ED8',
            onPrimary: '#FFFFFF',
            track: '#E2E8F0',
            disabledBg: '#E2E8F0',
            disabledText: '#94A3B8',
          },
    [isDark],
  );

  const statusColors = isDark ? STATUS_PALETTE.dark : STATUS_PALETTE.light;

  const attachedList = useMemo(
    () =>
      REQUIRED_DOCUMENTS.map(doc => attachedDocs[doc.key]).filter(
        (item): item is AttachedDocument => Boolean(item),
      ),
    [attachedDocs],
  );

  const attachedCount = attachedList.length;
  const totalCount = REQUIRED_DOCUMENTS.length;
  const allAttached = attachedCount === totalCount;

  const activeDoc = useMemo(
    () =>
      activeDocKey
        ? REQUIRED_DOCUMENTS.find(doc => doc.key === activeDocKey) ?? null
        : null,
    [activeDocKey],
  );

  const findNextPendingKey = useCallback(
    (
      docsMap: Partial<Record<DocumentTypeKey, AttachedDocument>>,
      afterKey?: DocumentTypeKey,
    ): DocumentTypeKey | null => {
      if (afterKey) {
        const startIdx = REQUIRED_DOCUMENTS.findIndex(d => d.key === afterKey);
        for (let i = startIdx + 1; i < REQUIRED_DOCUMENTS.length; i++) {
          if (!docsMap[REQUIRED_DOCUMENTS[i].key]) {
            return REQUIRED_DOCUMENTS[i].key;
          }
        }
      }
      const firstMissing = REQUIRED_DOCUMENTS.find(d => !docsMap[d.key]);
      return firstMissing ? firstMissing.key : null;
    },
    [],
  );

  const clearPendingPreview = useCallback(() => {
    releasePickedUri(activePreviewUriRef.current);
    activePreviewUriRef.current = undefined;
    setPendingPreview(null);
  }, []);

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

  const buildPendingPreview = useCallback(
    (
      docKey: DocumentTypeKey,
      docLabel: string,
      item: Omit<AnalyzedDocumentItem, 'pageAnalyses' | 'summary'>,
    ) => {
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

      const firstPage = analyzed.pages[0];
      const firstFraming = analyzed.pageAnalyses[0]?.framing;

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

      if (analyzed.type === 'image' && firstPage?.previewUri) {
        if (
          activePreviewUriRef.current &&
          activePreviewUriRef.current !== firstPage.previewUri
        ) {
          releasePickedUri(activePreviewUriRef.current);
        }
        activePreviewUriRef.current = firstPage.previewUri;
      } else {
        releasePickedUri(activePreviewUriRef.current);
        activePreviewUriRef.current = undefined;
      }

      setPendingPreview({
        docKey,
        docLabel,
        fileName: analyzed.name,
        fileMeta: fileMetaParts.join(' • '),
        sourceKind: analyzed.type,
        previewUri:
          analyzed.type === 'image' ? firstPage?.previewUri : undefined,
        imageWidth: firstPage?.width,
        imageHeight: firstPage?.height,
        boundingBox: firstFraming?.metrics.isFullPageScan
          ? null
          : firstFraming?.metrics.boundingBox ?? null,
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
      setStage('preview');
    },
    [],
  );

  const validateImageAsset = useCallback(
    async (asset: PickedMediaAsset) => {
      if (!activeDoc) return;
      if (!checkFileSize(asset.size)) {
        releasePickedUri(asset.uri);
        return;
      }
      setErrorMsg(null);
      setBannerMsg(null);
      setIsProcessing(true);
      setLoadingMsg(`Validando ${activeDoc.label}...`);
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
        buildPendingPreview(activeDoc.key, activeDoc.label, {
          id: `${Date.now()}`,
          name: asset.name,
          type: 'image',
          size: asset.size,
          totalPages: 1,
          truncated: false,
          pages: [page],
        });
      } catch (err) {
        releasePickedUri(asset.uri);
        setErrorMsg(
          err instanceof Error ? err.message : 'Erro ao validar a imagem.',
        );
      } finally {
        setIsProcessing(false);
        setLoadingMsg('');
      }
    },
    [activeDoc, buildPendingPreview, checkFileSize],
  );

  const validatePdfAsset = useCallback(
    async (asset: PickedMediaAsset) => {
      if (!activeDoc) return;
      if (!checkFileSize(asset.size)) {
        releasePickedUri(asset.uri);
        return;
      }
      setErrorMsg(null);
      setBannerMsg(null);
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
        buildPendingPreview(activeDoc.key, activeDoc.label, {
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
    [activeDoc, buildPendingPreview, checkFileSize, pdfBridge],
  );

  const handleTakePhoto = useCallback(async () => {
    if (isProcessing || !activeDoc) return;
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
  }, [activeDoc, isProcessing, validateImageAsset]);

  const handlePickGallery = useCallback(async () => {
    if (isProcessing || !activeDoc) return;
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
  }, [activeDoc, isProcessing, validateImageAsset]);

  const handlePickDocument = useCallback(async () => {
    if (isProcessing || !activeDoc) return;
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
  }, [activeDoc, isProcessing, validateImageAsset, validatePdfAsset]);

  const handleConfirmPreview = useCallback(() => {
    if (!pendingPreview || !pendingPreview.approved) return;

    const nextDocs: Partial<Record<DocumentTypeKey, AttachedDocument>> = {
      ...attachedDocs,
      [pendingPreview.docKey]: {
        key: pendingPreview.docKey,
        label: pendingPreview.docLabel,
        fileName: pendingPreview.fileName,
        fileMeta: pendingPreview.fileMeta,
        sourceKind: pendingPreview.sourceKind,
      },
    };

    setAttachedDocs(nextDocs);
    setBannerMsg(`${pendingPreview.docLabel} anexado`);
    setActiveDocKey(findNextPendingKey(nextDocs, pendingPreview.docKey));
    clearPendingPreview();
    setStage('collecting');
  }, [attachedDocs, clearPendingPreview, findNextPendingKey, pendingPreview]);

  const handleRetryPreview = useCallback(() => {
    clearPendingPreview();
    setStage('collecting');
  }, [clearPendingPreview]);

  const handleSelectDocType = useCallback((key: DocumentTypeKey) => {
    setErrorMsg(null);
    setBannerMsg(null);
    setActiveDocKey(key);
    setStage('collecting');
  }, []);

  const handleSaveDraft = useCallback(() => {
    setErrorMsg(null);
    setBannerMsg(
      `Rascunho salvo localmente (${attachedCount}/${totalCount} documento(s)).`,
    );
  }, [attachedCount, totalCount]);

  const handleFinishFlow = useCallback(() => {
    if (!allAttached) return;
    setErrorMsg(null);
    setBannerMsg(null);
    setSubmittedProtocol(`DOC-${String(Date.now()).slice(-6)}`);
    setStage('submitted');
  }, [allAttached]);

  const handleRestartFlow = useCallback(() => {
    clearPendingPreview();
    setAttachedDocs({});
    setActiveDocKey('rg');
    setBannerMsg(null);
    setErrorMsg(null);
    setSubmittedProtocol(null);
    setStage('intro');
  }, [clearPendingPreview]);

  const previewDimensions = useMemo(() => {
    if (
      !pendingPreview?.imageWidth ||
      !pendingPreview?.imageHeight ||
      previewBoxWidth <= 0
    ) {
      return null;
    }
    const innerWidth = Math.max(1, previewBoxWidth - 16);
    const ratio = pendingPreview.imageWidth / pendingPreview.imageHeight;
    const maxH = 340;
    let width = innerWidth;
    let height = width / ratio;
    if (height > maxH) {
      height = maxH;
      width = height * ratio;
    }
    return { width, height };
  }, [pendingPreview, previewBoxWidth]);

  const renderIntro = () => (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.sectionBlock}>
        <Text style={[styles.screenTitle, { color: colors.text }]}>
          Coleta de documentos
        </Text>
        <Text style={[styles.subtitle, { color: colors.muted }]}>
          {`Aceitamos os formatos de imagem JPG, PNG e PDF até ${DEFAULT_MAX_FILE_SIZE_MB} MB.`}
        </Text>
      </View>

      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <Text style={[styles.sectionHeading, { color: colors.text }]}>
          Documentos necessários
        </Text>
        <View style={styles.checklist}>
          {REQUIRED_DOCUMENTS.map(doc => {
            const attached = Boolean(attachedDocs[doc.key]);
            return (
              <View key={doc.key} style={styles.checklistRow}>
                <Icon
                  name={
                    attached ? 'check-circle-outline' : 'alert-circle-outline'
                  }
                  size={20}
                  color={
                    attached
                      ? statusColors.pass.accent
                      : statusColors.warn.accent
                  }
                />
                <Text style={[styles.checklistLabel, { color: colors.text }]}>
                  {doc.label}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <View style={styles.tipHeader}>
          <Icon
            name="lightbulb-outline"
            size={20}
            color={statusColors.warn.accent}
          />
          <Text style={[styles.sectionHeading, { color: colors.text }]}>
            Como anexar os documentos?
          </Text>
        </View>

        <View style={styles.tipsGrid}>
          <View
            style={[
              styles.tipBox,
              { backgroundColor: colors.bg, borderColor: colors.border },
            ]}
          >
            <View style={styles.tipTitleRow}>
              <Icon
                name="check-circle-outline"
                size={18}
                color={statusColors.pass.accent}
              />
              <Text style={[styles.tipTitle, { color: colors.text }]}>
                Correto
              </Text>
            </View>
            <View
              style={[
                styles.tipIllustration,
                {
                  borderColor: statusColors.pass.accent,
                  backgroundColor: colors.card,
                },
              ]}
            >
              <Icon
                name="file-document-outline"
                size={28}
                color={colors.text}
              />
            </View>
            <Text style={[styles.tipDesc, { color: colors.muted }]}>
              Foto nítida, com boa iluminação e sem cortes
            </Text>
          </View>

          <View
            style={[
              styles.tipBox,
              { backgroundColor: colors.bg, borderColor: colors.border },
            ]}
          >
            <View style={styles.tipTitleRow}>
              <Icon
                name="alert-circle-outline"
                size={18}
                color={statusColors.warn.accent}
              />
              <Text style={[styles.tipTitle, { color: colors.text }]}>
                Evite
              </Text>
            </View>
            <View
              style={[
                styles.tipIllustration,
                {
                  borderColor: statusColors.warn.accent,
                  backgroundColor: colors.card,
                },
              ]}
            >
              <View style={styles.blurryIconWrap}>
                <Icon
                  name="file-document-outline"
                  size={28}
                  color={colors.muted}
                />
              </View>
            </View>
            <Text style={[styles.tipDesc, { color: colors.muted }]}>
              Evite reflexos, sombras ou imagens borradas
            </Text>
          </View>
        </View>
      </View>

      <Pressable
        onPress={() => {
          setErrorMsg(null);
          setBannerMsg(null);
          setActiveDocKey(findNextPendingKey(attachedDocs));
          setStage('collecting');
        }}
        style={[styles.primaryFullBtn, { backgroundColor: colors.primary }]}
      >
        <Text style={[styles.primaryBtnText, { color: colors.onPrimary }]}>
          {attachedCount > 0 ? 'Continuar coleta' : 'Começar'}
        </Text>
      </Pressable>
    </ScrollView>
  );

  const renderPreview = () => {
    if (!pendingPreview) return null;
    const verdictPalette = pendingPreview.approved
      ? statusColors.pass
      : statusColors.fail;

    return (
      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.previewHeader}>
          <Pressable
            onPress={handleRetryPreview}
            style={[
              styles.backBtn,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
            accessibilityLabel="Voltar para seleção de arquivo"
          >
            <Icon name="chevron-left" size={22} color={colors.text} />
          </Pressable>
          <View style={styles.previewHeaderText}>
            <Text style={[styles.screenTitle, { color: colors.text }]}>
              {pendingPreview.docLabel}
            </Text>
            <Text
              numberOfLines={1}
              style={[styles.mutedSmall, { color: colors.muted }]}
            >
              {`${pendingPreview.fileName} • ${pendingPreview.fileMeta}`}
            </Text>
          </View>
        </View>

        {pendingPreview.sourceKind === 'image' && pendingPreview.previewUri ? (
          <View
            onLayout={event => {
              const nextWidth = event.nativeEvent.layout.width;
              if (nextWidth > 0 && nextWidth !== previewBoxWidth) {
                setPreviewBoxWidth(nextWidth);
              }
            }}
            style={[
              styles.previewFrameCard,
              { backgroundColor: colors.previewStage },
            ]}
          >
            {previewDimensions ? (
              <View
                style={{
                  width: previewDimensions.width,
                  height: previewDimensions.height,
                }}
              >
                <Image
                  source={{ uri: pendingPreview.previewUri }}
                  resizeMode="contain"
                  style={styles.previewFullImage}
                />
                {pendingPreview.boundingBox ? (
                  <View
                    pointerEvents="none"
                    style={[
                      styles.framingOverlay,
                      {
                        left: `${pendingPreview.boundingBox.x * 100}%`,
                        top: `${pendingPreview.boundingBox.y * 100}%`,
                        width: `${pendingPreview.boundingBox.width * 100}%`,
                        height: `${pendingPreview.boundingBox.height * 100}%`,
                        borderColor: verdictPalette.accent,
                        backgroundColor: verdictPalette.bg,
                      },
                    ]}
                  />
                ) : null}
              </View>
            ) : (
              <Image
                source={{ uri: pendingPreview.previewUri }}
                resizeMode="contain"
                style={styles.previewFallbackImage}
              />
            )}
          </View>
        ) : (
          <View
            style={[
              styles.pdfPreviewCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Icon
              name="file-document-outline"
              size={36}
              color={colors.primary}
            />
            <Text style={[styles.fileTitle, { color: colors.text }]}>
              {pendingPreview.fileName}
            </Text>
            <Text style={[styles.mutedSmall, { color: colors.muted }]}>
              {pendingPreview.fileMeta}
            </Text>
          </View>
        )}

        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.card,
              borderColor: verdictPalette.accent,
            },
          ]}
        >
          <View style={styles.verdictTop}>
            <Text style={[styles.verdictTitle, { color: colors.text }]}>
              {pendingPreview.approved
                ? 'Documento válido para envio'
                : 'Documento reprovado'}
            </Text>
            <View
              style={[styles.badge, { backgroundColor: verdictPalette.bg }]}
            >
              <Text style={[styles.bold, { color: verdictPalette.accent }]}>
                {pendingPreview.approved ? 'Aprovado' : 'Ajustar'}
              </Text>
            </View>
          </View>

          <Text
            style={[
              styles.verdictDesc,
              {
                color: pendingPreview.isBlurValid
                  ? statusColors.pass.accent
                  : statusColors.fail.accent,
              },
            ]}
          >
            {`${pendingPreview.isBlurValid ? '✓' : '✕'} Nitidez: ${
              pendingPreview.blurMessage
            }`}
          </Text>

          <Text
            style={[
              styles.verdictDesc,
              {
                color: pendingPreview.isFramingValid
                  ? statusColors.pass.accent
                  : statusColors.fail.accent,
              },
            ]}
          >
            {`${pendingPreview.isFramingValid ? '✓' : '✕'} Enquadramento: ${
              pendingPreview.framingMessage
            }`}
          </Text>
        </View>

        <View style={styles.previewActions}>
          {pendingPreview.approved ? (
            <Pressable
              onPress={handleConfirmPreview}
              style={[
                styles.primaryFullBtn,
                { backgroundColor: colors.primary },
              ]}
            >
              <Text
                style={[styles.primaryBtnText, { color: colors.onPrimary }]}
              >
                Confirmar envio
              </Text>
            </Pressable>
          ) : null}

          <Pressable
            onPress={handleRetryPreview}
            style={[
              styles.outlinedFullBtn,
              {
                backgroundColor: colors.card,
                borderColor: pendingPreview.approved
                  ? colors.primary
                  : statusColors.fail.accent,
              },
            ]}
          >
            <Text
              style={[
                styles.primaryBtnText,
                {
                  color: pendingPreview.approved
                    ? colors.primary
                    : statusColors.fail.accent,
                },
              ]}
            >
              {pendingPreview.sourceKind === 'image'
                ? 'Tirar outra foto'
                : 'Escolher outro arquivo'}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  };

  const renderSubmitted = () => (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.card,
            borderColor: statusColors.pass.accent,
          },
        ]}
      >
        <View style={styles.tipTitleRow}>
          <Icon
            name="check-circle-outline"
            size={24}
            color={statusColors.pass.accent}
          />
          <Text style={[styles.screenTitle, { color: colors.text }]}>
            Envio concluído
          </Text>
        </View>
        <Text style={[styles.subtitle, { color: colors.muted }]}>
          {`Todos os ${totalCount} documentos foram validados no dispositivo e enviados (fluxo mockado).`}
        </Text>
        {submittedProtocol ? (
          <Text style={[styles.mutedSmall, { color: colors.muted }]}>
            {`Protocolo: ${submittedProtocol}`}
          </Text>
        ) : null}
      </View>

      <View style={styles.attachedList}>
        {attachedList.map(item => (
          <View
            key={item.key}
            style={[
              styles.attachedRow,
              {
                backgroundColor: colors.card,
                borderColor: statusColors.pass.accent,
              },
            ]}
          >
            <Icon
              name="check-circle-outline"
              size={20}
              color={statusColors.pass.accent}
            />
            <View style={styles.attachedInfo}>
              <Text style={[styles.fileTitle, { color: colors.text }]}>
                {`${item.label} — ${item.fileName}`}
              </Text>
              <Text style={[styles.mutedSmall, { color: colors.muted }]}>
                {item.fileMeta}
              </Text>
            </View>
          </View>
        ))}
      </View>

      <Pressable
        onPress={handleRestartFlow}
        style={[styles.primaryFullBtn, { backgroundColor: colors.primary }]}
      >
        <Text style={[styles.primaryBtnText, { color: colors.onPrimary }]}>
          Nova coleta
        </Text>
      </Pressable>
    </ScrollView>
  );

  const renderCollecting = () => (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {bannerMsg ? (
        <View
          style={[
            styles.banner,
            {
              backgroundColor: statusColors.pass.bg,
              borderColor: statusColors.pass.accent,
            },
          ]}
        >
          <Icon
            name="check-circle-outline"
            size={18}
            color={statusColors.pass.accent}
          />
          <Text
            style={[styles.bannerText, { color: statusColors.pass.accent }]}
          >
            {bannerMsg}
          </Text>
        </View>
      ) : null}

      <View style={styles.sectionBlock}>
        <View style={styles.progressHeader}>
          <Text style={[styles.screenTitle, { color: colors.text }]}>
            Coleta de documentos
          </Text>
          <Text style={[styles.progressCount, { color: colors.primary }]}>
            {`${attachedCount}/${totalCount}`}
          </Text>
        </View>

        <View style={[styles.progressTrack, { backgroundColor: colors.track }]}>
          <View
            style={[
              styles.progressFill,
              {
                backgroundColor: colors.primary,
                width: `${(attachedCount / totalCount) * 100}%`,
              },
            ]}
          />
        </View>

        <Text style={[styles.subtitle, { color: colors.muted }]}>
          {`Aceitamos os formatos de imagem JPG, PNG e PDF até ${DEFAULT_MAX_FILE_SIZE_MB} MB.`}
        </Text>
      </View>

      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <Text style={[styles.mutedSmall, { color: colors.muted }]}>
          Etapas de envio
        </Text>
        <View style={styles.stepButtonsWrap}>
          {REQUIRED_DOCUMENTS.map((doc, idx) => {
            const isSelected = activeDoc?.key === doc.key;
            const isDone = Boolean(attachedDocs[doc.key]);
            return (
              <Pressable
                key={doc.key}
                onPress={() => handleSelectDocType(doc.key)}
                disabled={isProcessing}
                style={[
                  styles.stepBtn,
                  {
                    backgroundColor: isSelected
                      ? colors.primary
                      : isDone
                      ? statusColors.pass.bg
                      : colors.frame,
                    borderColor: isSelected
                      ? colors.primary
                      : isDone
                      ? statusColors.pass.accent
                      : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.stepBtnText,
                    {
                      color: isSelected
                        ? colors.onPrimary
                        : isDone
                        ? statusColors.pass.accent
                        : colors.text,
                    },
                  ]}
                >
                  {`${isDone && !isSelected ? '✓ ' : `${idx + 1}. `}${
                    doc.shortLabel
                  }`}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {activeDoc ? (
        <View
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <View style={styles.activeDocHeader}>
            <Text style={[styles.activeDocTitle, { color: colors.text }]}>
              {`${activeDoc.label}*`}
            </Text>
            {allAttached ? (
              <Pressable onPress={() => setActiveDocKey(null)}>
                <Text style={[styles.mutedSmall, { color: colors.primary }]}>
                  Voltar para revisão
                </Text>
              </Pressable>
            ) : attachedDocs[activeDoc.key] ? (
              <Text
                style={[styles.mutedSmall, { color: statusColors.pass.accent }]}
              >
                Substituindo anexo atual
              </Text>
            ) : null}
          </View>

          <View style={styles.uploadCardsRow}>
            <Pressable
              onPress={handleTakePhoto}
              disabled={isProcessing}
              style={[
                styles.uploadCard,
                { backgroundColor: colors.frame, borderColor: colors.border },
                isProcessing && styles.buttonDisabled,
              ]}
            >
              <Icon name="camera-outline" size={24} color={colors.primary} />
              <Text style={[styles.uploadCardText, { color: colors.text }]}>
                Tirar foto
              </Text>
            </Pressable>

            <Pressable
              onPress={handlePickGallery}
              disabled={isProcessing}
              style={[
                styles.uploadCard,
                { backgroundColor: colors.frame, borderColor: colors.border },
                isProcessing && styles.buttonDisabled,
              ]}
            >
              <Icon name="image-outline" size={24} color={colors.primary} />
              <Text style={[styles.uploadCardText, { color: colors.text }]}>
                Galeria
              </Text>
            </Pressable>

            <Pressable
              onPress={handlePickDocument}
              disabled={isProcessing}
              style={[
                styles.uploadCard,
                { backgroundColor: colors.frame, borderColor: colors.border },
                isProcessing && styles.buttonDisabled,
              ]}
            >
              <Icon
                name="file-document-outline"
                size={24}
                color={colors.primary}
              />
              <Text style={[styles.uploadCardText, { color: colors.text }]}>
                Escolher arquivo
              </Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.sectionBlock}>
          <Text style={[styles.sectionHeading, { color: colors.text }]}>
            Revise seus documentos
          </Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>
            Confira se todos os arquivos estão corretos antes de prosseguir.
          </Text>
        </View>
      )}

      {errorMsg ? (
        <View
          style={[
            styles.card,
            {
              backgroundColor: statusColors.fail.bg,
              borderColor: statusColors.fail.accent,
            },
          ]}
        >
          <Text style={{ color: statusColors.fail.accent }}>{errorMsg}</Text>
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

      {attachedList.length > 0 ? (
        <View style={styles.attachedSection}>
          {activeDoc ? (
            <Text style={[styles.sectionHeading, { color: colors.text }]}>
              Documentos anexados
            </Text>
          ) : null}

          <View style={styles.attachedList}>
            {attachedList.map(item => (
              <View
                key={item.key}
                style={[
                  styles.attachedRow,
                  {
                    backgroundColor: colors.card,
                    borderColor: statusColors.pass.accent,
                  },
                ]}
              >
                <Icon
                  name="check-circle-outline"
                  size={20}
                  color={statusColors.pass.accent}
                />
                <View style={styles.attachedInfo}>
                  <Text
                    numberOfLines={1}
                    style={[styles.fileTitle, { color: colors.text }]}
                  >
                    {`${item.label} — ${item.fileName}`}
                  </Text>
                  <Text style={[styles.mutedSmall, { color: colors.muted }]}>
                    {item.fileMeta}
                  </Text>
                </View>
                <Pressable
                  onPress={() => handleSelectDocType(item.key)}
                  style={styles.editBtn}
                  accessibilityLabel={`Editar ${item.label}`}
                >
                  <Icon name="pencil-outline" size={18} color={colors.text} />
                </Pressable>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.footerRow}>
        <Pressable
          onPress={handleSaveDraft}
          disabled={isProcessing}
          style={[
            styles.footerBtn,
            styles.outlinedButton,
            { backgroundColor: colors.card, borderColor: colors.primary },
            isProcessing && styles.buttonDisabled,
          ]}
        >
          <Text style={[styles.primaryBtnText, { color: colors.primary }]}>
            Salvar rascunho
          </Text>
        </Pressable>

        <Pressable
          onPress={handleFinishFlow}
          disabled={!allAttached || isProcessing}
          style={[
            styles.footerBtn,
            {
              backgroundColor:
                allAttached && !isProcessing
                  ? colors.primary
                  : colors.disabledBg,
            },
          ]}
        >
          <Text
            style={[
              styles.primaryBtnText,
              {
                color:
                  allAttached && !isProcessing
                    ? colors.onPrimary
                    : colors.disabledText,
              },
            ]}
          >
            Concluir
          </Text>
        </Pressable>
      </View>

      <Pressable
        onPress={() => setStage('intro')}
        style={styles.backToIntroBtn}
      >
        <Text style={[styles.mutedSmall, { color: colors.primary }]}>
          Ver instruções de envio
        </Text>
      </Pressable>
    </ScrollView>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <PdfBridgeWebView ref={webViewRef} onMessage={handleWebViewMessage} />
      {stage === 'intro'
        ? renderIntro()
        : stage === 'preview' && pendingPreview
        ? renderPreview()
        : stage === 'submitted'
        ? renderSubmitted()
        : renderCollecting()}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, paddingBottom: 28, gap: 14 },
  sectionBlock: { gap: 6 },
  screenTitle: { fontSize: 20, fontWeight: '700' },
  sectionHeading: { fontSize: 16, fontWeight: '700' },
  subtitle: { fontSize: 14, lineHeight: 20 },
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 10,
  },
  checklist: { gap: 10 },
  checklistRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  checklistLabel: { fontSize: 15, fontWeight: '500' },
  tipHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tipsGrid: { flexDirection: 'row', gap: 10 },
  tipBox: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    gap: 8,
  },
  tipTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tipTitle: { fontSize: 14, fontWeight: '700' },
  tipIllustration: {
    height: 60,
    borderWidth: 1.5,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  blurryIconWrap: { opacity: 0.45 },
  tipDesc: { fontSize: 12, lineHeight: 16 },
  primaryFullBtn: {
    minHeight: 48,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  outlinedFullBtn: {
    minHeight: 48,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primaryBtnText: { fontSize: 15, fontWeight: '700' },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  bannerText: { fontSize: 14, fontWeight: '600', flex: 1 },
  progressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  progressCount: { fontSize: 15, fontWeight: '700' },
  progressTrack: {
    height: 6,
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 999 },
  stepButtonsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  stepBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  stepBtnText: { fontSize: 12, fontWeight: '600' },
  activeDocHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  activeDocTitle: { fontSize: 18, fontWeight: '700' },
  uploadCardsRow: { flexDirection: 'row', gap: 8 },
  uploadCard: {
    flex: 1,
    minHeight: 82,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  uploadCardText: { fontSize: 12, fontWeight: '600', textAlign: 'center' },
  buttonDisabled: { opacity: 0.5 },
  loadingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  attachedSection: { gap: 10 },
  attachedList: { gap: 10 },
  attachedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  attachedInfo: { flex: 1, gap: 2 },
  editBtn: { padding: 6 },
  fileTitle: { fontSize: 14, fontWeight: '600' },
  mutedSmall: { fontSize: 12 },
  footerRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  footerBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  outlinedButton: { borderWidth: 1 },
  backToIntroBtn: { alignSelf: 'center', paddingVertical: 4 },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderWidth: 1,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewHeaderText: { flex: 1, gap: 2 },
  previewFrameCard: {
    borderRadius: 12,
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  previewFullImage: { width: '100%', height: '100%' },
  previewFallbackImage: { width: '100%', height: 320 },
  framingOverlay: {
    position: 'absolute',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: 4,
  },
  pdfPreviewCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  verdictTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  verdictTitle: { flex: 1, fontSize: 16, fontWeight: '700' },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  bold: { fontWeight: '700' },
  verdictDesc: { fontSize: 14, lineHeight: 20 },
  previewActions: { gap: 10 },
});
