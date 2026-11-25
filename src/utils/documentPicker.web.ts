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

function selectWebFile(options: {
  accept: string;
  capture?: string;
}): Promise<File | null> {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = options.accept;
    if (options.capture) {
      input.setAttribute('capture', options.capture);
    }
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    input.style.opacity = '0';

    let settled = false;
    let focusTimer: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
      if (focusTimer !== undefined) {
        clearTimeout(focusTimer);
      }
      input.removeEventListener('change', handleChange);
      input.removeEventListener('cancel', handleCancel);
      window.removeEventListener('focus', handleWindowFocus);
      input.remove();
    };

    const finish = (file: File | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(file);
    };

    const handleChange = () => {
      finish(input.files?.[0] ?? null);
    };

    const handleCancel = () => {
      finish(null);
    };

    const handleWindowFocus = () => {
      // Fallback for browsers that do not emit the `cancel` event on file inputs.
      focusTimer = setTimeout(() => {
        if (!settled) {
          finish(input.files?.[0] ?? null);
        }
      }, 300);
    };

    input.addEventListener('change', handleChange);
    input.addEventListener('cancel', handleCancel);
    window.addEventListener('focus', handleWindowFocus, { once: true });

    document.body.appendChild(input);
    input.click();
  });
}

function toPickedAsset(file: File | null): PickedMediaAsset | null {
  if (!file) return null;
  return {
    uri: URL.createObjectURL(file),
    name: file.name,
    size: file.size,
    mimeType: file.type || undefined,
    file,
  };
}

export async function pickGalleryImage(
  _maxAnalysisDim: number,
): Promise<PickedMediaAsset | null> {
  const file = await selectWebFile({ accept: 'image/*' });
  return toPickedAsset(file);
}

export async function captureCameraPhoto(
  _maxAnalysisDim: number,
): Promise<PickedMediaAsset | null> {
  const file = await selectWebFile({
    accept: 'image/*',
    capture: 'environment',
  });
  return toPickedAsset(file);
}

export async function pickDocumentFile(): Promise<PickedMediaAsset | null> {
  const file = await selectWebFile({
    accept: 'application/pdf,.pdf,image/*',
  });
  return toPickedAsset(file);
}

export function releasePickedUri(uri?: string): void {
  if (uri && uri.startsWith('blob:')) {
    URL.revokeObjectURL(uri);
  }
}
