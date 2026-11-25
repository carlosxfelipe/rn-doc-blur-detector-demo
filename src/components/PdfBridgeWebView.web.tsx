import type { Ref } from 'react';

export interface WebViewRefHandle {
  injectJavaScript: (script: string) => void;
}

export interface PdfBridgeWebViewProps {
  ref?: Ref<WebViewRefHandle>;
  onMessage: (data: string) => void;
}

export function PdfBridgeWebView(_props: PdfBridgeWebViewProps) {
  return null;
}
