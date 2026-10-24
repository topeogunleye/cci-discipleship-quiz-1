const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('Capacitor targets both native platforms and the existing offline build', () => {
  const config = JSON.parse(read('capacitor.config.json'));
  const pkg = JSON.parse(read('package.json'));
  assert.equal(config.appName, 'Disciple');
  assert.equal(config.webDir, 'dist');
  assert.match(config.appId, /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/);
  for (const platform of ['@capacitor/android', '@capacitor/ios']) assert.ok(pkg.dependencies[platform]);
  assert.match(pkg.scripts.sync, /npm run build.*cap sync/);
});

test('native bridge handles app back, background, and file sharing without requiring native APIs on web', () => {
  const bridge = read('js/native-bridge.mjs');
  assert.match(bridge, /Capacitor\.isNativePlatform\(\)/);
  assert.match(bridge, /App\.addListener\('backButton'/);
  assert.match(bridge, /App\.addListener\('appStateChange'/);
  assert.match(bridge, /App\.exitApp\(\)/);
  assert.match(bridge, /Filesystem\.writeFile/);
  assert.match(bridge, /Share\.share/);
  assert.match(bridge, /files:\s*\[file\.uri\]/);
});

test('iOS and Android shells use the offline app build, CCI icons, and matching splash screens', () => {
  const offlinePage = read('dist/index.html');
  const androidIcon = fs.readFileSync(path.join(root, 'android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png'));
  const iosIcon = fs.readFileSync(path.join(root, 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'));
  const androidSplash = fs.readFileSync(path.join(root, 'android/app/src/main/res/drawable-port-xxxhdpi/splash.png'));
  const iosSplash = fs.readFileSync(path.join(root, 'ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png'));
  assert.match(offlinePage, /Today’s Study/);
  for (const asset of [androidIcon, iosIcon, androidSplash, iosSplash]) assert.equal(asset.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(androidIcon.readUInt32BE(16), 192);
  assert.equal(iosIcon.readUInt32BE(16), 1024);
  assert.equal(androidSplash.readUInt32BE(16), 1280);
  assert.equal(androidSplash.readUInt32BE(20), 1920);
  assert.equal(iosSplash.readUInt32BE(16), 2732);
  assert.equal(iosSplash.readUInt32BE(20), 2732);
});

test('offline build inlines the bridge and the mobile study helper before app startup', () => {
  const page = read('index.html');
  const build = read('scripts/build.js');
  const bundled = read('dist/index.html');
  assert.ok(page.indexOf('js/native-bridge.bundle.js') < page.indexOf('js/app.js'));
  assert.ok(page.indexOf('js/mobile-study.js') < page.indexOf('js/app.js'));
  assert.match(build, /native-bridge\.bundle\.js/);
  assert.match(build, /mobile-study\.js/);
  assert.doesNotMatch(bundled, /<script src=/i);
  assert.match(bundled, /CciNative/);
  assert.match(bundled, /Today’s Study/);
});
