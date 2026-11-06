// Reloads the app on every device connected to Metro, as pressing r in
// Metro's terminal does, then builds the bundle a device would fetch and
// reports whether it built, with Metro's error if it didn't.
//
//   npm run reload                  # iOS bundle, Metro on 8081
//   npm run reload -- android       # Android bundle
//   PORT=8082 npm run reload        # Metro on another port
//
// Metro's own output is in tmp/metro.log when it was started with
// `npm run dev`.
const port = process.env.PORT ?? '8081';
const platform = process.argv[2] ?? 'ios';

const sent = await new Promise((resolve) => {
  const ws = new WebSocket(`ws://localhost:${port}/message`);
  ws.onopen = () => {
    ws.send(JSON.stringify({ version: 2, method: 'reload' }));
    console.log(`reload: sent to Metro on ${port}`);
    setTimeout(() => {
      ws.close();
      resolve(true);
    }, 200);
  };
  ws.onerror = () => resolve(false);
});
if (!sent) {
  console.error(`reload: no Metro on port ${port}; start it with npm run dev`);
  process.exit(1);
}

// The bundle a dev build requests. Without transform.routerRoot, Expo Router
// looks for routes in app/ instead of src/app/ and the bundle has no screens.
const query = new URLSearchParams({
  platform,
  dev: 'true',
  minify: 'false',
  lazy: 'false',
  'transform.engine': 'hermes',
  'transform.routerRoot': 'src/app',
});
const started = Date.now();
const res = await fetch(`http://localhost:${port}/node_modules/expo-router/entry.bundle?${query}`);
const body = await res.text();
const seconds = ((Date.now() - started) / 1000).toFixed(1);
if (res.ok) {
  console.log(`reload: the ${platform} bundle builds (${(body.length / 1e6).toFixed(1)} MB, ${seconds}s)`);
} else {
  let message = body;
  try {
    const error = JSON.parse(body);
    message = `${error.type ?? 'Error'}: ${error.message ?? body}`;
  } catch {
    // Not JSON: print it as it came.
  }
  console.error(`reload: the ${platform} bundle failed to build (HTTP ${res.status})\n${message}`);
  process.exit(1);
}
