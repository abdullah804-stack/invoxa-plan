import type { StyleProp, ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';

/**
 * The rendered invoice, shown as the browser would print it. Scripts are off:
 * the document is HTML and CSS only, so nothing in it can run.
 */
export function InvoiceHtmlView({ html, style }: { html: string; style?: StyleProp<ViewStyle> }) {
  return (
    <WebView
      source={{ html }}
      originWhitelist={['*']}
      style={style}
      javaScriptEnabled={false}
      domStorageEnabled={false}
      setSupportMultipleWindows={false}
      allowsLinkPreview={false}
      overScrollMode="never"
      showsVerticalScrollIndicator={false}
    />
  );
}
