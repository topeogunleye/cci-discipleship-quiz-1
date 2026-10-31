import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

const isNative = Capacitor.isNativePlatform();

window.CciNative = {
  isNative,
  onBackButton(handler) {
    if (!isNative) return Promise.resolve(null);
    return App.addListener('backButton', event => handler(event));
  },
  onAppStateChange(handler) {
    if (!isNative) return Promise.resolve(null);
    return App.addListener('appStateChange', state => handler(state));
  },
  async exitApp() {
    if (isNative) await App.exitApp();
  },
  async shareFile(filename, text) {
    if (!isNative) return false;
    const file = await Filesystem.writeFile({
      path: filename,
      data: text,
      directory: Directory.Cache,
      encoding: Encoding.UTF8
    });
    await Share.share({
      title: filename,
      text: filename,
      files: [file.uri],
      dialogTitle: 'Share ' + filename
    });
    return true;
  },
  // Sermon recordings kept for offline listening (app storage, not the cache the OS may clear).
  async downloadAudio(url, filename, onProgress) {
    if (!isNative) throw new Error('Native downloads are only available in the app.');
    let handle = null;
    try {
      if (typeof onProgress === 'function') {
        handle = await Filesystem.addListener('progress', status => {
          if (status && status.url === url && status.contentLength > 0) onProgress(Math.min(0.99, status.bytes / status.contentLength));
        });
      }
      await Filesystem.downloadFile({ url, path: filename, directory: Directory.Data, recursive: true, progress: typeof onProgress === 'function' });
    } finally {
      if (handle) await handle.remove();
    }
  },
  async audioExists(filename) {
    if (!isNative) return false;
    try {
      await Filesystem.stat({ path: filename, directory: Directory.Data });
      return true;
    } catch (error) {
      return false;
    }
  },
  async audioSrc(filename) {
    const file = await Filesystem.getUri({ path: filename, directory: Directory.Data });
    return Capacitor.convertFileSrc(file.uri);
  },
  async deleteAudio(filename) {
    if (!isNative) return;
    try {
      await Filesystem.deleteFile({ path: filename, directory: Directory.Data });
    } catch (error) {}
  }
};
