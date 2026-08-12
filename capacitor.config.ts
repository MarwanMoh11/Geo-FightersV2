import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // Reverse-DNS bundle identifier. This is the App Store's permanent primary
  // key for the app — it can never be changed after the first submission, so
  // set it to the identifier registered in App Store Connect before shipping.
  appId: 'com.marwanmohamed.geofighters',
  appName: 'GeoFighters',
  // vite builds to dist/; `npx cap sync` copies it into the iOS bundle.
  webDir: 'dist',
  ios: {
    // The renderer draws its own background before the first frame lands;
    // black avoids a white flash on launch while three.js boots.
    backgroundColor: '#000000',
    // Off for shipping: a released build should not hand its webview to
    // Safari's Web Inspector. Flip to true temporarily (and re-run
    // `npm run ios:sync`) when you need to profile the three.js scene
    // on-device via Develop → Simulator.
    webContentsDebuggingEnabled: false,
    // WKWebView's scroll view rubber-bands past the content edge even though
    // the page sets `overscroll-behavior: none` — that CSS governs scroll
    // chaining, not the native bounce. The game is a fixed, non-scrolling
    // viewport, so dragging the whole arena a few points and watching it snap
    // back is the single biggest tell that this is a webview.
    scrollEnabled: false,
    // Never let iOS auto-inset the scroll view; the layout already positions
    // itself off the notch and home indicator with the --safe-* tokens, and a
    // second inset on top of that double-pads the HUD.
    contentInset: 'never',
    // App-bound domains would restrict the webview to domains declared in
    // Info.plist, which blocks the socket.io connection to the signaling
    // server on hf.space.
    limitsNavigationsToAppBoundDomains: false,
  },
  server: {
    // Serve over https://localhost rather than capacitor://localhost so the
    // page runs in a secure context. WebGL, wasm streaming compilation and
    // getUserMedia-style APIs all gate on that, and socket.io's wss upgrade
    // to the signaling server is blocked as mixed content from a non-secure
    // origin.
    iosScheme: 'https',
  },
};

export default config;
