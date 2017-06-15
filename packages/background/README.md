# ![Hybrid](http://i.imgur.com/jUDMlbO.png) Background

[![Join the chat at https://gitter.im/buildhybrid/platform](https://badges.gitter.im/Join%20Chat.svg)](https://gitter.im/buildhybrid/platform?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)

> Allows Cordova apps to continue running in the background

Most mobile operating systems are multitasking capable, but most apps don't need to run while in background and not present for the user. Therefore, by default, they pause the app in background mode and resume the app before switching to foreground mode. The system keeps all network connections open while in background, but does not deliver the data until the app resumes.

## Installation 
```
meteor add hybrid:background
```

### Supported Platforms
* [x] iOS
* [x] Android _(SDK >=11)_
* [x] Windows Phone 8
* [ ] Windows Phone 8.1

### Usage

##### Enable background mode
```javascript
BackgroundMode.enable();
```
##### Disable background mode
```javascript
BackgroundMode.disable();
```
##### Check if background mode is enabled (reactive)
```javascript
BackgroundMode.enabled.get();
```
##### Check if the app is currently running in the background (reactive)
```javascript
BackgroundMode.active.get();
```

### Android customization
To indicate that the app is executing tasks in background and being paused would disrupt the user, the plug-in has to create a notification while in background - like a download progress bar.

#### Override defaults
The title, ticker and text for that notification can be customized as follows:
```javascript
BackgroundMode.setDefaults({
    title:  String,
    ticker: String,
    text:   String
})
```

By default the app will come to foreground when taping on the notification. That can be changed also.
```javascript
BackgroundMode.setDefaults({
    resume: false
})
```

#### Modify the currently displayed notification
It's also possible to modify the currently displayed notification while in background.
```javascript
BackgroundMode.configure({
    title: String,
    ...
})
```

#### Run in background without notification
In silent mode the plugin will not display a notification - which is not the default. Be aware that Android recommends adding a notification otherwise the OS may pause the app.
```javascript
BackgroundMode.configure({
    silent: true
})
```

