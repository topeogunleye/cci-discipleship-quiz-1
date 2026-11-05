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
  // One-time scoped cleanup of files written by the retired audio store.
  async removeRetiredDownloads() {
    if (!isNative) return;
    try {
      await Filesystem.rmdir({ path: 'sermon-audio', directory: Directory.Data, recursive: true });
    } catch (error) {
      // A device that never downloaded recordings has no directory to remove.
      if (!/not exist|not found|ENOENT/i.test(String(error && error.message))) throw error;
    }
  }
};
