import {
  errorCodes,
  isErrorWithCode,
  keepLocalCopy,
  pick,
  types,
} from '@react-native-documents/picker';
import { PermissionsAndroid, Platform } from 'react-native';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import type { PdfSourceInput } from 'rn-doc-blur-detector/pdf';

export interface PickedMediaAsset {
  uri: string;
  name: string;
  width?: number;
  height?: number;
  size?: number;
  base64?: string;
  mimeType?: string;
  file?: PdfSourceInput['file'];
}

async function ensureCameraPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return true;
  }
  const granted = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.CAMERA,
  );
  return granted === PermissionsAndroid.RESULTS.GRANTED;
}

export async function pickGalleryImage(
  maxAnalysisDim: number,
): Promise<PickedMediaAsset | null> {
  const res = await launchImageLibrary({
    mediaType: 'photo',
    maxWidth: maxAnalysisDim,
    maxHeight: maxAnalysisDim,
    quality: 1,
    includeBase64: true,
    assetRepresentationMode: 'compatible',
  });
  if (res.didCancel) return null;
  if (res.errorMessage) {
    throw new Error(res.errorMessage);
  }
  const asset = res.assets?.[0];
  if (!asset?.uri) return null;

  return {
    uri: asset.uri,
    name: asset.fileName ?? 'galeria.jpg',
    width: asset.width,
    height: asset.height,
    size: asset.fileSize,
    base64: asset.base64,
    mimeType: asset.type,
  };
}

export async function captureCameraPhoto(
  maxAnalysisDim: number,
): Promise<PickedMediaAsset | null> {
  const ok = await ensureCameraPermission();
  if (!ok) {
    throw new Error('Permissão de câmera necessária.');
  }
  const res = await launchCamera({
    mediaType: 'photo',
    maxWidth: maxAnalysisDim,
    maxHeight: maxAnalysisDim,
    quality: 1,
    includeBase64: true,
  });
  if (res.didCancel) return null;
  if (res.errorMessage) {
    throw new Error(res.errorMessage);
  }
  const asset = res.assets?.[0];
  if (!asset?.uri) return null;

  return {
    uri: asset.uri,
    name: asset.fileName ?? 'camera.jpg',
    width: asset.width,
    height: asset.height,
    size: asset.fileSize,
    base64: asset.base64,
    mimeType: asset.type,
  };
}

export async function pickDocumentFile(): Promise<PickedMediaAsset | null> {
  try {
    const [picked] = await pick({
      type: [types.pdf, types.images],
    });
    if (!picked) return null;

    const fileName = picked.name ?? 'documento';
    const [copied] = await keepLocalCopy({
      files: [{ uri: picked.uri, fileName }],
      destination: 'cachesDirectory',
    });
    const localUri = copied.status === 'success' ? copied.localUri : picked.uri;

    return {
      uri: localUri,
      name: fileName,
      size: picked.size ?? undefined,
      mimeType: picked.type ?? undefined,
    };
  } catch (err) {
    if (isErrorWithCode(err) && err.code === errorCodes.OPERATION_CANCELED) {
      return null;
    }
    throw err;
  }
}

export function releasePickedUri(_uri?: string): void {
  // No-op on native platforms.
}
