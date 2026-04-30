# 🐛 APK Muammolari va Yechimlari

## Eng Keng Tarqalgan Muammolar

### 1. ❌ APK Install Bo'lmayapti

#### Muammo: "App not installed"
**Sabablar:**
- Version code past (avvalgi versiyadan kam)
- Package name o'zgargan
- Signature mismatch

**Yechim:**
```bash
# 1. Avvalgi ilovani to'liq o'chiring
adb uninstall com.telegramclone.app

# 2. Version code ni oshiring (app.json)
"versionCode": 2  # Avvalgidan katta bo'lishi kerak

# 3. Qayta build qiling
npx expo run:android --variant release
```

---

### 2. ❌ Internet Ishlamayapti (Network Error)

#### Muammo: "Network Error" yoki "ERR_CLEARTEXT_NOT_PERMITTED"

**Sabab:** Android 9+ da HTTP (cleartext) default holda bloklangan.

**Yechim 1: HTTPS ishlatish (tavsiya etiladi)**
```javascript
// config/api.js
const PRODUCTION_URL = 'https://your-domain.com:8084';
```

**Yechim 2: Cleartext ruxsat berish (faqat development)**
```xml
<!-- android/app/src/main/AndroidManifest.xml -->
<application
    ...
    android:usesCleartextTraffic="true"
    android:networkSecurityConfig="@xml/network_security_config">
```

**Yechim 3: Dinamik IP ishlatish**
```javascript
// Ilovada Settings ekrani qo'shing va API URL ni o'zgartirish imkonini bering
import { setBaseUrl } from './config/api';

// Foydalanuvchi o'z server IP sini kiritadi
await setBaseUrl('http://192.168.1.100:8084');
```

---

### 3. ❌ APK Crash Bo'lyapti

#### Muammo: Ilova ochilishi bilan crash

**Debug qilish:**
```bash
# Loglarni ko'rish
adb logcat | grep -i ReactNativeJS
# yoki
adb logcat | findstr ReactNativeJS  # Windows

# yoki to'liq log
adb logcat > crash-log.txt
```

**Keng tarqalgan sabablar:**

**Sabab 1: ProGuard xato config**
```pro
# android/app/proguard-rules.pro ga qo'shing
-keep class com.facebook.react.** { *; }
-keep class com.swmansion.** { *; }
```

**Sabab 2: Missing permissions**
```xml
<!-- AndroidManifest.xml -->
<uses-permission android:name="android.permission.INTERNET"/>
<uses-permission android:name="android.permission.CAMERA"/>
```

**Sabab 3: Native module xatosi**
```bash
# node_modules va build ni tozalash
cd mobile
rm -rf node_modules android/build android/app/build
npm install
cd android && ./gradlew clean
```

---

### 4. ❌ Wi-Fi Da Ishlaydi, Mobile Data Da Ishlamaydi

**Sabab:** Firewall yoki VPN

**Yechim:**
1. Server firewall da mobile operator IP larini ruxsat bering
2. Ilova uchun VPN ishlating
3. Public server ishlatish (ngrok, cloudflare tunnel)

**Ngrok orqali test:**
```bash
# Backend serverni ngrok orqali ochish
ngrok http 8084

# Ngrok URL ni mobile config ga qo'yish
# config/api.js
const PRODUCTION_URL = 'https://abc123.ngrok.io';
```

---

### 5. ❌ Fayl Yuklash Ishlamayapti

**Muammo:** Image picker yoki camera ishlamayapti

**Sabab:** Permissions

**Yechim:**
```xml
<!-- AndroidManifest.xml -->
<uses-permission android:name="android.permission.CAMERA"/>
<uses-permission android:name="android.permission.READ_MEDIA_IMAGES"/>
<uses-permission android:name="android.permission.READ_MEDIA_VIDEO"/>

<!-- Android 12 va past uchun -->
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE"/>
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE"
    android:maxSdkVersion="29"/>
```

**Runtime permission:**
```javascript
// Kameradan oldin ruxsat so'rash
import { Camera } from 'expo-camera';

const { status } = await Camera.requestCameraPermissionsAsync();
if (status !== 'granted') {
  Alert.alert('Kamera ruxsati kerak!');
  return;
}
```

---

### 6. ❌ WebSocket Ulanmayapti

**Muammo:** Real-time messages kelmayapti

**Sabab 1: URL noto'g'ri**
```javascript
// config/api.js
// ws:// (http uchun) yoki wss:// (https uchun)
export const WS_URL = BASE_URL.replace(/^http/, 'ws') + '/ws';
```

**Sabab 2: Token noto'g'ri**
```javascript
// websocket.js - token ni to'g'ri yuborish
const url = `${WS_URL}?user_id=${userId}&token=${token}`;
```

**Sabab 3: Background mode**
```xml
<!-- AndroidManifest.xml -->
<uses-permission android:name="android.permission.WAKE_LOCK"/>
```

---

### 7. ❌ Notifications Ishlamayapti

**Muammo:** Push notifications kelmayapti

**Yechim:**
```javascript
// services/notificationService.js
import * as Notifications from 'expo-notifications';

// Permission so'rash
const { status } = await Notifications.requestPermissionsAsync();
if (status !== 'granted') {
  Alert.alert('Bildirishnomalar o\'chirilgan!');
}

// Listener qo'shish
Notifications.addNotificationReceivedListener(notification => {
  console.log('Notification received:', notification);
});
```

---

### 8. ❌ APK Juda Katta (100MB+)

**Muammo:** APK hajmi juda katta

**Yechim 1: Split APKs**
```gradle
// android/app/build.gradle
android {
    splits {
        abi {
            enable true
            reset()
            include 'armeabi-v7a', 'arm64-v8a'
            universalApk false
        }
    }
}
```

**Yechim 2: Hermes yoqish**
```gradle
// android/app/build.gradle
project.ext.react = [
    enableHermes: true
]
```

**Yechim 3: ProGuard/R8**
```properties
# gradle.properties
android.enableMinifyInReleaseBuilds=true
android.enableShrinkResourcesInReleaseBuilds=true
```

---

### 9. ❌ Server Topilmayapti (ENOTFOUND)

**Muammo:** "ENOTFOUND" yoki "getaddrinfo failed"

**Sabablar:**
1. DNS muammosi
2. Server offline
3. IP noto'g'ri

**Yechim:**
```javascript
// Server health check qo'shing
const checkServerHealth = async () => {
  try {
    const response = await axios.get(`${BASE_URL}/health`, { timeout: 5000 });
    return response.status === 200;
  } catch (error) {
    console.error('Server offline:', error.message);
    return false;
  }
};

// Login qilishdan oldin tekshiring
const isServerOnline = await checkServerHealth();
if (!isServerOnline) {
  Alert.alert('Xatolik', 'Server ishlamayapti yoki internet yo\'q.');
  return;
}
```

---

### 10. ❌ Offline Mode Crash

**Muammo:** Internet yo'q bo'lsa ilova crash

**Yechim:**
```javascript
// api.js interceptor
apiClient.interceptors.response.use(
  response => response,
  error => {
    if (!error.response) {
      // Network xatosi
      error.userMessage = 'Internet aloqasi yo\'q';
      error.isNetworkError = true;
    }
    return Promise.reject(error);
  }
);

// UI da ko'rsatish
{error && <ErrorDisplay error={error} onRetry={retry} />}
```

---

## 🛠️ Debug Tools

### 1. Chrome DevTools
```bash
# React Native debugger
# Chrome da: chrome://inspect
# yoki
npx react-devtools
```

### 2. Flipper
```bash
# Flipper o'rnatish va ishlatish
# https://fbflipper.com/
```

### 3. ADB Commands
```bash
# Device ro'yxati
adb devices

# APK o'rnatish
adb install app-release.apk

# APK o'chirish
adb uninstall com.telegramclone.app

# Loglar
adb logcat

# Screen capture
adb shell screencap /sdcard/screen.png
adb pull /sdcard/screen.png
```

---

## 📞 Qo'llab-quvvatlash

Agar muammo hal bo'lmasa:
1. Loglarni saqlang (adb logcat)
2. APK_BUILD_GUIDE.md ni qaytadan o'qing
3. GitHub Issues ochish

---

**Oxirgi yangilanish:** 2026-04-20
