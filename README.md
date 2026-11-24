# rn-doc-blur-detector-demo

Aplicativo de demonstração em **React Native CLI 0.88.1 (sem Expo, Nova Arquitetura habilitada)** para validar o pacote [`rn-doc-blur-detector`](https://github.com/carlosxfelipe/rn-doc-blur-detector) no **Android** e no **iOS**.

## Pré-requisitos

- **Node.js `>= 22.11.0`** (conforme `engines.node` no [package.json](./package.json))
- Ambiente **Android** (Android Studio / SDK) e/ou **iOS** (Xcode + CocoaPods)
- **Tarball local do pacote:** o pacote [`rn-doc-blur-detector`](https://github.com/carlosxfelipe/rn-doc-blur-detector) já está incluído neste repositório em [vendor/rn-doc-blur-detector-1.0.0.tgz](./vendor/rn-doc-blur-detector-1.0.0.tgz) e referenciado no [package.json](./package.json) via `"file:./vendor/rn-doc-blur-detector-1.0.0.tgz"`. Não é necessário clonar o repositório `rn-doc-blur-detector` separadamente antes de rodar `npm install`.

## Como o pacote `rn-doc-blur-detector` é usado neste projeto

O fluxo de seleção, extração e análise fica encapsulado no componente [src/components/DocumentBlurDetector.tsx](./src/components/DocumentBlurDetector.tsx), consumido por [src/screens/HomeScreen.tsx](./src/screens/HomeScreen.tsx). A tela [src/screens/AboutScreen.tsx](./src/screens/AboutScreen.tsx) também lê `DEFAULT_LAPLACIAN_CONFIG` e `DEFAULT_MAX_FILE_SIZE_MB` para exibir os parâmetros padrão:

1. **Seleção de mídia nativa (sem Expo):**
   - **Galeria e Câmera:** `react-native-image-picker` (`launchImageLibrary` com `assetRepresentationMode: "compatible"` e `launchCamera` com permissão de câmera no Android) redimensiona a imagem nativamente para `DEFAULT_LAPLACIAN_CONFIG.maxAnalysisDim` (`1400 px`) e retorna o `base64`.
   - **Seletor de arquivos:** `@react-native-documents/picker` (`pick` com `[types.pdf, types.images]` + `keepLocalCopy` para `cachesDirectory`) copia o arquivo selecionado para o cache local. Quando uma imagem é escolhida por esse seletor (sem `base64`), apenas **JPEG** é suportado na demo, pois não há `extractImageAdapter` configurado.
2. **Extração e análise de nitidez (`rn-doc-blur-detector` e `rn-doc-blur-detector/pdf`):**
   - **Imagens:** `extractImagePage` decodifica o JPEG para RGBA e `buildAnalyzedDocument(..., { locale: "pt-BR" })` calcula o score Laplaciano e o veredito em português.
   - **PDFs:** uma `<WebView>` oculta (`react-native-webview`) recebe `PDF_WEBVIEW_HTML` (que resolve `pdf-webview-html.native` com `pdfjs-dist@4.10.38` vendorizado offline no iOS e no Android) e se comunica com `createPdfBridgeController()` dentro de `extractPdfPages` (por padrão `maxPdfPages = 2`).
   - **Validação e formatação:** `isPdfAsset`, `isImageAsset` e `validateFileSize` validam formato e tamanho (limite padrão `DEFAULT_MAX_FILE_SIZE_MB = 9` MB) antes da análise; `formatBytes` formata o tamanho em bytes para exibição na UI.
3. **Navegação e informações:**
   - [src/navigation/RootNavigator.tsx](./src/navigation/RootNavigator.tsx) configura o React Navigation (`@react-navigation/bottom-tabs`) com as abas **Detector** ([HomeScreen.tsx](./src/screens/HomeScreen.tsx)) e **Sobre** ([AboutScreen.tsx](./src/screens/AboutScreen.tsx)).

## Como executar

```bash
npm install
npm start
```

Em outro terminal:

```bash
# Android
npm run android

# Gerar APK de release (copiado para apk/RnDocBlurDetectorDemo-v0.0.1.apk)
npm run build:android

# iOS (instalar pods na primeira vez ou após atualizar dependências nativas)
cd ios && pod install && cd ..
npm run ios
```

## Verificações

```bash
npm run lint
npx tsc --noEmit
```

## Licença

Este projeto está licenciado sob a [Licença MIT](LICENSE).

Copyright (c) 2026 **Carlos Felipe Araújo**.
