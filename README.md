# rn-doc-blur-detector-demo

Aplicativo de demonstração em **React Native CLI** para validar o pacote [`rn-doc-blur-detector`](https://github.com/carlosxfelipe/rn-doc-blur-detector) no **Android** e no **iOS**.

## O que este app demonstra

- **Seleção de imagens e PDFs:** permite escolher arquivos da galeria, capturar fotos com a câmera ou selecionar imagens e documentos PDF pelo seletor do dispositivo.
- **Análise de nitidez no dispositivo:** utiliza o [`rn-doc-blur-detector`](https://github.com/carlosxfelipe/rn-doc-blur-detector) (em [src/components/DocumentBlurDetector.tsx](./src/components/DocumentBlurDetector.tsx)) para validar os arquivos, processar imagens e páginas de PDF e exibir a pontuação de nitidez e o veredito diretamente na tela.
- **Telas do app:** conta com a aba **Detector** ([src/screens/HomeScreen.tsx](./src/screens/HomeScreen.tsx)) para testar arquivos na prática e a aba **Sobre** ([src/screens/AboutScreen.tsx](./src/screens/AboutScreen.tsx)) para consultar os limites e parâmetros padrão do pacote.

## Pré-requisitos

- **Node.js `>= 22.11.0`**
- Ambiente **Android** (Android Studio / SDK) e/ou **iOS** (Xcode + CocoaPods)

> O pacote `rn-doc-blur-detector` já está incluído neste repositório em [vendor/rn-doc-blur-detector-1.0.0.tgz](./vendor/rn-doc-blur-detector-1.0.0.tgz), então basta executar `npm install`.

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
```

## Verificações

```bash
npm run lint
npx tsc --noEmit
```

## Licença

Este projeto está licenciado sob a [Licença MIT](LICENSE).

Copyright (c) 2026 **Carlos Felipe Araújo**.
