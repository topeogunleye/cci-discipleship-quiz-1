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
  async shareText(title, text) {
    if (!isNative) return false;
    await Share.share({ title, text, dialogTitle: 'Share ' + title });
    return true;
  }
};
