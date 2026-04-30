# 📱 APK BUILD VA DEPLOY QO'LLANMA

## 🎯 Maqsad
Bu qo'llanma Telegram Clone ilovasini Android APK sifatida build qilish va deploy qilish bo'yicha to'liq yo'riqnoma.

---

## 📋 Talab Qilinadigan Dasturlar

### 1. Development muhit
- Node.js v18+ ([nodejs.org](https://nodejs.org))
- Java JDK 17+ ([Oracle](https://www.oracle.com/java/technologies/downloads/) yoki [OpenJDK](https://adoptium.net/))
- Android Studio ([developer.android.com](https://developer.android.com/studio))
- Git

### 2. Environment Setup

#### Windows:
```bash
# JAVA_HOME o'rnatish
setx JAVA_HOME "C:\Program Files\Java\jdk-17"
setx PATH "%PATH%;%JAVA_HOME%\bin"

# ANDROID_HOME o'rnatish
setx ANDROID_HOME "%LOCALAPPDATA%\Android\Sdk"
setx PATH "%PATH%;%ANDROID_HOME%\platform-tools;%ANDROID_HOME%\tools"
```

#### Linux/Mac:
```bash
# ~/.bashrc yoki ~/.zshrc ga qo'shing
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk
export ANDROID_HOME=$HOME/Android/Sdk
export PATH=$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/tools
```

---

## 🔧 Loyihani Sozlash

### 1. Dependencies o'rnatish

```bash
cd mobile
npm install
```

### 2. Android SDK komponentlarini o'rnatish

Android Studio orqali yoki terminal orqali:

```bash
# SDK Manager orqali quyidagilarni o'rnating:
# - Android SDK Platform 34
# - Android SDK Build-Tools 34.0.0
# - Android Emulator
# - Android SDK Platform-Tools
```

---

## 🏗️ BUILD QILISH

### Variant 1: Development APK (Test uchun)

**EAS Build ishlatmasdan:**

```bash
cd mobile

# Android build
npx expo run:android --variant release
```

APK manzil: `mobile/android/app/build/outputs/apk/release/app-release.apk`

### Variant 2: EAS Build (Expo Cloud)

**1. EAS CLI o'rnatish:**
```bash
npm install -g eas-cli
```

**2. EAS login:**
```bash
eas login
```

**3. Build konfiguratsiyasi (eas.json):**
```json
{
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal",
      "android": {
        "buildType": "apk"
      }
    },
    "production": {
      "android": {
        "buildType": "apk"
      }
    }
  }
}
```

**4. APK build:**
```bash
# Preview build (test uchun)
eas build --platform android --profile preview

# Production build
eas build --platform android --profile production
```

### Variant 3: Local Build (Gradle to'g'ridan-to'g'ri)

```bash
cd mobile/android

# Debug APK
./gradlew assembleDebug

# Release APK (keystore kerak)
./gradlew assembleRelease
```

---

## 🔐 Release Keystore Yaratish

**APK ni Google Play Store ga yuklash yoki imzolangan versiya yaratish uchun:**

### 1. Keystore fayl yaratish:

```bash
keytool -genkeypair -v -storetype PKCS12 \
  -keystore telegram-clone-release.keystore \
  -alias telegram-clone-key \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -storepass YOUR_STORE_PASSWORD \
  -keypass YOUR_KEY_PASSWORD \
  -dname "CN=Your Name, OU=Your Org, O=Your Company, L=Your City, ST=Your State, C=UZ"
```

**Eslatma:** Parollarni xavfsiz saqlang! Yo'qotilsa, qayta tiklab bo'lmaydi.

### 2. Keystore ni loyihaga qo'shish:

```bash
# Keystore faylni ko'chirish
mv telegram-clone-release.keystore mobile/android/app/
```

### 3. gradle.properties sozlash:

`mobile/android/gradle.properties` ga qo'shing:

```properties
TELEGRAM_CLONE_RELEASE_STORE_FILE=telegram-clone-release.keystore
TELEGRAM_CLONE_RELEASE_KEY_ALIAS=telegram-clone-key
TELEGRAM_CLONE_RELEASE_STORE_PASSWORD=YOUR_STORE_PASSWORD
TELEGRAM_CLONE_RELEASE_KEY_PASSWORD=YOUR_KEY_PASSWORD
```

### 4. build.gradle yangilash:

`mobile/android/app/build.gradle` da:

```gradle
android {
    ...
    signingConfigs {
        release {
            if (project.hasProperty('TELEGRAM_CLONE_RELEASE_STORE_FILE')) {
                storeFile file(TELEGRAM_CLONE_RELEASE_STORE_FILE)
                storePassword TELEGRAM_CLONE_RELEASE_STORE_PASSWORD
                keyAlias TELEGRAM_CLONE_RELEASE_KEY_ALIAS
                keyPassword TELEGRAM_CLONE_RELEASE_KEY_PASSWORD
            }
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled true
            shrinkResources true
            proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
        }
    }
}
```

---

## ⚙️ Production Sozlamalari

### 1. API URL ni o'zgartirish

**mobile/config/api.js:**
```javascript
const PRODUCTION_URL = 'https://your-domain.com:8084';
```

### 2. App versiyasini yangilash

**mobile/app.json:**
```json
{
  "expo": {
    "version": "1.0.1",
    "android": {
      "versionCode": 2
    }
  }
}
```

**Qoida:**
- `version`: Foydalanuvchilarga ko'rinadigan (1.0.0, 1.0.1, 1.1.0)
- `versionCode`: Ichki versiya (butun son, har safar oshib boradi)

### 3. Network security (Production)

**mobile/android/app/src/main/res/xml/network_security_config.xml:**

Production uchun HTTPS majburiy qiling:
```xml
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="false">
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </base-config>
</network-security-config>
```

---

## 📦 APK Optimizatsiya

### 1. ProGuard/R8 yoqish

`mobile/android/gradle.properties`:
```properties
android.enableMinifyInReleaseBuilds=true
android.enableShrinkResourcesInReleaseBuilds=true
android.enablePngCrunchInReleaseBuilds=true
```

### 2. APK hajmini kamaytirish

```bash
# Split APKs (har bir CPU arch uchun alohida)
# android/app/build.gradle
android {
    splits {
        abi {
            enable true
            reset()
            include 'armeabi-v7a', 'arm64-v8a', 'x86', 'x86_64'
            universalApk false
        }
    }
}
```

---

## 🚀 Deploy (Tarqatish)

### Variant 1: Direct Download

1. APK ni serverga yuklash:
```bash
scp app-release.apk user@server:/var/www/downloads/
```

2. Foydalanuvchilarga link yuborish:
```
https://your-domain.com/downloads/app-release.apk
```

### Variant 2: Google Play Store

1. **Google Play Console**ga kiring: [play.google.com/console](https://play.google.com/console)

2. Yangi ilova yarating

3. APK yoki AAB yuklang (AAB tavsiya etiladi):
```bash
# AAB build
./gradlew bundleRelease
```

4. Store listing to'ldiring:
   - Nom, tavsif
   - Screenshots
   - Privacy policy
   - Content rating

5. Internal testing → Beta → Production

### Variant 3: Firebase App Distribution

```bash
# Firebase CLI o'rnatish
npm install -g firebase-tools

# Login
firebase login

# Deploy
firebase appdistribution:distribute app-release.apk \
  --app YOUR_FIREBASE_APP_ID \
  --groups testers
```

---

## 🐛 Muammolarni Hal Qilish

### APK install bo'lmayapti

**Sabab 1:** Version code past
- **Hal:** app.json da versionCode ni oshiring

**Sabab 2:** Signature mismatch
- **Hal:** Avvalgi APK ni o'chirib, yangisini o'rnating

### APK crash bo'lyapti

**Sabab 1:** ProGuard noto'g'ri sozlangan
- **Hal:** proguard-rules.pro ni tekshiring

**Sabab 2:** Server URL noto'g'ri
- **Hal:** config/api.js ni tekshiring

**Sabab 3:** Permissions yo'q
- **Hal:** AndroidManifest.xml va app.json tekshiring

### APK juda katta (>100MB)

**Hal:**
1. Split APKs yoqing
2. Unnecessary resources olib tashlang
3. Hermes yoqilganini tekshiring

### Network error: Cleartext HTTP

**Hal:**
- Production da HTTPS ishlating
- Yoki network_security_config.xml da cleartextTrafficPermitted=true

---

## ✅ Pre-Release Checklist

**Build qilishdan oldin:**

- [ ] API URL production serverga ko'rsatyapti
- [ ] Version code va version name yangilandi
- [ ] Keystore xavfsiz saqlandi
- [ ] ProGuard rules to'g'ri
- [ ] Network security config to'g'ri
- [ ] Debug logs o'chirilgan
- [ ] Permissions minimal
- [ ] Icon va splash screen to'g'ri
- [ ] App nom va description to'g'ri

**Test qilish:**

- [ ] Ro'yxatdan o'tish
- [ ] Kirish
- [ ] Xabar yuborish
- [ ] Fayl yuklash
- [ ] Qo'ng'iroq (voice/video)
- [ ] Offline mode
- [ ] Background notifications
- [ ] Deep links (agar bor bo'lsa)

---

## 📚 Qo'shimcha Resurslar

- [Expo Build Process](https://docs.expo.dev/build/introduction/)
- [React Native Android Setup](https://reactnative.dev/docs/environment-setup)
- [Google Play Console](https://play.google.com/console)
- [Firebase App Distribution](https://firebase.google.com/docs/app-distribution)

---

**Oxirgi yangilanish:** 2026-04-20  
**Versiya:** 1.0
