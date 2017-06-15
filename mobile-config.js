App.info({
  name: 'BTSBots wallet',
  description: 'Create your trade bots in one minute.',
  author: 'alt',
  email: 'pch957@gmail.com',
  website: 'https://btsbots.com',
  version: '0.0.1'
});

App.icons({
  // Android
  'android_mdpi': 'resources/icons/icon-48x48.png',
  'android_hdpi': 'resources/icons/icon-72x72.png',
  'android_xhdpi': 'resources/icons/icon-96x96.png',
  'android_xxhdpi': 'resources/icons/icon-144x144.png',
  'android_xxxhdpi': 'resources/icons/icon-192x192.png'
});

App.launchScreens({
  // Android
  'android_mdpi_portrait': 'resources/splash/splash-720x1280.png',
  'android_mdpi_landscape': 'resources/splash/splash-720x1280.png',
  'android_hdpi_portrait': 'resources/splash/splash-720x1280.png',
  'android_hdpi_landscape': 'resources/splash/splash-720x1280.png',
  'android_xhdpi_portrait': 'resources/splash/splash-720x1280.png',
  'android_xhdpi_landscape': 'resources/splash/splash-720x1280.png'
});

App.setPreference('StatusBarOverlaysWebView', 'false');
App.setPreference('StatusBarBackgroundColor', '#000000');
