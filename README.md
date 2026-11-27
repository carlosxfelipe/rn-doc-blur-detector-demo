# rn-doc-blur-detector-demo

Aplicativo de demonstração em **React Native CLI** para validar o pacote [`rn-doc-blur-detector`](https://github.com/carlosxfelipe/rn-doc-blur-detector) no **Android**, no **iOS** e na **Web** (`react-native-web` + Vite).

Versão Web: https://rn-doc-blur-detector-demo.netlify.app/

## O que este app demonstra

- **Seleção de imagens e PDFs:** permite escolher arquivos da galeria, capturar fotos com a câmera ou selecionar imagens e documentos PDF pelo seletor do dispositivo.
- **Análise de nitidez e enquadramento no dispositivo:** utiliza o [`rn-doc-blur-detector`](https://github.com/carlosxfelipe/rn-doc-blur-detector) (em [src/components/DocumentBlurDetector.tsx](./src/components/DocumentBlurDetector.tsx)) para validar os arquivos, processar imagens e páginas de PDF e exibir na tela a pontuação de nitidez, a avaliação de enquadramento (bordas cortadas, área ocupada, inclinação e proporção) e o overlay da moldura detectada sobre o preview.
- **Telas do app:** conta com a aba **Detector** ([src/screens/HomeScreen.tsx](./src/screens/HomeScreen.tsx)) — com seletor da prop `framing` (`Auto`, `Folha A4 / Contrato`, `Identidade (RG/CNH)` e `Desativado`) para testar arquivos na prática — e a aba **Sobre** ([src/screens/AboutScreen.tsx](./src/screens/AboutScreen.tsx)) para consultar os limites e parâmetros padrão do pacote.

## Pré-requisitos

- **Node.js `>= 22.11.0`**
- Ambiente **Android** (Android Studio / SDK) e/ou **iOS** (Xcode + CocoaPods)

> O pacote `rn-doc-blur-detector` é instalado diretamente do GitHub (`github:carlosxfelipe/rn-doc-blur-detector`), então basta executar `npm install`.

## Como executar

```bash
npm install
npm start
```

Em outro terminal:

```bash
# Android
npm run android

# Gerar APK de release (salvo em apk/)
npm run build:android

# iOS (instalar pods na primeira vez ou após atualizar dependências nativas)
cd ios && pod install && cd ..
npm run ios

# Web (Vite + react-native-web)
npm run web

# Build de produção Web (salvo em dist/)
npm run build:web
```

## Verificações

```bash
npm run lint
npx tsc --noEmit
npx jest __tests__/documentFraming.test.ts
```

## Licença

Este projeto está licenciado sob a [Licença MIT](LICENSE).

Copyright (c) 2026 **Carlos Felipe Araújo**.
