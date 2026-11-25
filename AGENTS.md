This is a **Bare React Native CLI** mobile app (non-Expo, **React Native 0.88.x** / **React 19**). Prioritize mobile-first patterns, New Architecture compatibility, performance, and iOS/Android parity.

## Verify Versions Before Writing Code

- Read `react-native` and `react` versions in `package.json` (expects RN `0.88.x`, React `19.x`, Node `>= 22.11.0`, New Architecture + Strict TypeScript API enabled).
- Only look up `https://reactnative.dev/docs/getting-started` (or `https://reactnative.dev/blog/2026/10/19/react-native-0.88`) when unsure about a recent API or breaking change — avoid unnecessary web fetches for standard tasks.

## Deprecated APIs & Opportunistic Cleanup

- **Never introduce deprecated APIs.**
- For **new** touchable components, prefer `Pressable` over `TouchableOpacity` / `TouchableHighlight` / `TouchableWithoutFeedback` / `TouchableNativeFeedback` (do not rewrite existing working `Touchable*` components during unrelated edits).
- When modifying a file, if you spot genuinely deprecated APIs or broken legacy patterns in the code you are touching, migrate them cleanly within that edit:
  - `SafeAreaView` from `react-native` → use `SafeAreaProvider`, `SafeAreaView`, or `useSafeAreaInsets` from `react-native-safe-area-context` (required for Android edge-to-edge).
  - `propTypes`, `defaultProps` on function components, string refs, unnecessary `React.forwardRef` → use TypeScript types, ES default params, and `ref` as a standard prop (React 19).
  - Removed core modules (`AsyncStorage`, `Clipboard`, `NetInfo`, `Geolocation`, `Picker`, `Slider`) → use maintained community packages.
  - Android `StatusBar.setBackgroundColor` / `translucent` hacks → design for edge-to-edge with safe-area insets.
  - Legacy Bridge (`UIManager` hacks) and loose `any` casts → target Fabric/TurboModules and Strict TypeScript types.

## Commands

Use the package manager matching the lockfile (`npm` / `yarn` / `pnpm` / `bun`). **Never** run `npx expo ...` or `eas ...`.

```bash
npm install <package>   # install deps (NEVER `npx expo install`)
cd ios && pod install   # required after adding/updating native iOS deps (`bundle exec pod install` if Gemfile exists)
npm start               # Metro bundler
npm run android         # build/run Android
npm run ios             # build/run iOS
npm run lint            # ESLint
npx tsc --noEmit        # typecheck
npm test                # tests
```

Run lint and typecheck before declaring any task done.

## Navigation & Native Code

- Use `@react-navigation/native` (or the navigation library in `package.json`) — never `expo-router` or `src/app/`.
- `ios/` and `android/` are real native projects (Xcode/CocoaPods/SwiftPM and Gradle/AGP 9+/Kotlin 2+). Configure permissions and native setup there directly, never via `app.json` Expo plugins, and rebuild native binaries after adding native packages.
