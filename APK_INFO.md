# APK Build Ma'lumotlari

## ✅ Build Muvaffaqiyatli

**Sana:** 2026-04-20  
**Build vaqti:** 14 daqiqa 23 soniya  
**Build turi:** Release APK

## 📦 APK Fayl

**Joylashuv:**  
```
c:\Users\secre\Desktop\telegram\mobile\android\app\build\outputs\apk\release\app-release.apk
```

**Fayl hajmi:** 40.3 MB (40,280,835 bytes)

## 🔧 Amalga Oshirilgan O'zgarishlar

### 1. Story Limitlar
- **Kunlik limit:** 1 ta story / 24 soat
- **Haftalik limit:** 3 ta story / 7 kun
- Limit oshganda HTTP 429 qaytaradi

### 2. Story Validation Yaxshilangan
- **Fayl turi:** Faqat rasm va video ruxsat
- **Rasm limitlari:** 
  - Max 10MB
  - Ruxsat etilgan: .jpg, .jpeg, .png, .webp, .gif, .heic
- **Video limitlari:**
  - Max 50MB
  - Ruxsat etilgan: .mp4, .mov, .avi, .mkv, .webm
- **Caption limit:** Max 200 belgi
- **Xavfli fayllar bloklangan:** .html, .js, .php, .exe, .apk, va h.k.

### 3. Story Tozalash
- **Avtomatik tozalash:** Har 1 soatda
- **Muddati o'tgan story lar:** Database va diskdan o'chiriladi
- **Expiry:** 24 soat

### 4. Backend Xatoliklar Tuzatildi
- ✅ `sanitizeFilename` dublikati o'chirildi
- ✅ `cleanupExpiredStories` parametr muammosi hal qilindi
- ✅ Story model column nomlari to'g'rilandi
- ✅ Backend muvaffaqiyatli compile bo'ldi

### 5. Network Configuration
- ✅ IP konfiguratsiyasi to'g'ri
- ✅ Development uchun localhost va private IP lar ruxsat
- ✅ Network security config xatolarsiz

## 📱 APK O'rnatish

### Android 7.0+ qurilmalarda:

1. **APK ni qurilmaga o'tkazish:**
   ```powershell
   adb push "c:\Users\secre\Desktop\telegram\mobile\android\app\build\outputs\apk\release\app-release.apk" /sdcard/Download/
   ```

2. **O'rnatish:**
   - Qurilmada "Files" yoki "Downloads" ni oching
   - `app-release.apk` ni toping va bosing
   - "Settings > Security > Install from unknown sources" ni yoqing (agar kerak bo'lsa)
   - "Install" tugmasini bosing

### USB orqali to'g'ridan-to'g'ri:
```powershell
adb install "c:\Users\secre\Desktop\telegram\mobile\android\app\build\outputs\apk\release\app-release.apk"
```

## ⚙️ Backend Ishga Tushirish

1. **PostgreSQL ishga tushirish:**
   ```powershell
   cd "c:\Users\secre\Desktop\telegram"
   docker-compose up -d postgres
   ```

2. **Backend server:**
   ```powershell
   cd backend
   .\telegram-backend.exe
   ```
   Yoki:
   ```powershell
   go run ./cmd/server/main.go
   ```

3. **Server porti:** `http://localhost:8084`

## 🔌 Mobil App Backend'ga Ulash

### Birinchi ishga tushganda:

1. App ochilganda Settings ga o'ting
2. "Server URL" ni o'zgartiring:
   - **Emulator:** `http://10.0.2.2:8084`
   - **Real qurilma (WiFi):** `http://<kompyuter_ip>:8084`
   - Masalan: `http://192.168.1.100:8084`

3. Kompyuter IP ni topish:
   ```powershell
   ipconfig
   ```
   "Wireless LAN adapter Wi-Fi" qismida IPv4 Address ni ko'ring

## 📊 Story API Endpoints

### Story yaratish
```http
POST /api/stories
Authorization: Bearer <token>
Content-Type: multipart/form-data

media: <file>
caption: <text>
```

**Limitlar:**
- 1 kun - 1 story
- 1 hafta - 3 story

### Story larni ko'rish
```http
GET /api/stories
Authorization: Bearer <token>
```

### O'z story larini ko'rish
```http
GET /api/stories/my
Authorization: Bearer <token>
```

### Story ni ko'rilgan deb belgilash
```http
POST /api/stories/:storyId/view
Authorization: Bearer <token>
```

### Story ni o'chirish
```http
DELETE /api/stories/:storyId
Authorization: Bearer <token>
```

## ⚠️ Muhim Eslatmalar

1. **Development Mode:** Network security config faqat development uchun cleartext traffic ruxsat qiladi
2. **Production:** Production da HTTPS ishlatish majburiy
3. **ProGuard:** Release APK da kod obfuscation yoqilgan
4. **Signing:** Hozircha debug keystore ishlatilmoqda - production uchun o'z keystore yaratish kerak

## 🔐 Production Keystore Yaratish

```powershell
keytool -genkey -v -keystore my-release-key.keystore -alias my-key-alias -keyalg RSA -keysize 2048 -validity 10000
```

Keyin `android/gradle.properties` ga qo'shing:
```properties
MYAPP_RELEASE_STORE_FILE=my-release-key.keystore
MYAPP_RELEASE_KEY_ALIAS=my-key-alias
MYAPP_RELEASE_STORE_PASSWORD=****
MYAPP_RELEASE_KEY_PASSWORD=****
```

## 📝 Build Warnings

Build success bo'ldi, lekin bir nechta deprecated warnings bor:
- React Native deprecated API'lar (ReactNativeHost)
- Expo modules deprecated metodlar
- Bu normaldir va app ishga ta'sir qilmaydi

## 🎉 Natija

Barcha vazifalar muvaffaqiyatli bajarildi:
- ✅ Story limitlar qo'shildi (1/kun, 3/hafta)
- ✅ Backend xatolar tuzatildi
- ✅ IP konfiguratsiyasi tekshirildi
- ✅ Backend build qilindi
- ✅ APK muvaffaqiyatli build qilindi

**APK tayyor!** 🚀
