import {
  type ComponentType,
  type Ref,
  type RefAttributes,
  useCallback,
} from 'react';
import { StyleSheet, View } from 'react-native';
import WebView, {
  type WebViewMessageEvent,
  type WebViewProps,
} from 'react-native-webview';
import { PDF_WEBVIEW_HTML } from 'rn-doc-blur-detector/pdf';

export interface WebViewRefHandle {
  injectJavaScript: (script: string) => void;
}

const TypedWebView = WebView as unknown as ComponentType<
  WebViewProps & RefAttributes<WebViewRefHandle>
>;

export interface PdfBridgeWebViewProps {
  ref?: Ref<WebViewRefHandle>;
  onMessage: (data: string) => void;
}

export function PdfBridgeWebView({ ref, onMessage }: PdfBridgeWebViewProps) {
  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      onMessage(event.nativeEvent.data);
    },
    [onMessage],
  );

  return (
    <View pointerEvents="none" style={styles.hiddenWebViewWrap}>
      <TypedWebView
        ref={ref}
        source={{ html: PDF_WEBVIEW_HTML }}
        originWhitelist={['*']}
        javaScriptEnabled
        onMessage={handleMessage}
        style={styles.hiddenWebView}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hiddenWebViewWrap: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
    overflow: 'hidden',
  },
  hiddenWebView: { width: 1, height: 1 },
});
