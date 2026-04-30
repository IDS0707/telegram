# 🔒 XAVFSIZLIK YO'RIQNOMASI / SECURITY GUIDE

## 📋 Umumiy Ma'lumot / Overview

Ushbu hujjat Telegram Clone ilovasining xavfsizlik sozlamalari va eng yaxshi amaliyotlarini tushuntiradi.

---

## 🚨 MUHIM: Production Uchun Majburiy Qadamlar

### 1. Environment Variables (Muhit O'zgaruvchilari)

Production muhitda quyidagi o'zgaruvchilarni ALBATTA o'zgartiring:

#### JWT Secret
```bash
# ❌ NOTO'G'RI (default)
JWT_SECRET=dev-secret-CHANGE-THIS-IN-PRODUCTION-MUST-BE-VERY-STRONG-32CHARS

# ✅ TO'G'RI (kuchli tasodifiy string)
JWT_SECRET=9k4j2m8n7b6v5c4x3z2a1s0d9f8g7h6j5k4l3m2n1b0v9c8x7z6a5s4d3f2g1h0
```

**Kuchli secret yaratish:**
```bash
# Linux/Mac
openssl rand -base64 48

# PowerShell (Windows)
[Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
```

#### Database Password
```bash
# ❌ NOTO'G'RI
POSTGRES_PASSWORD=CHANGE-THIS-STRONG-PASSWORD-IN-PRODUCTION

# ✅ TO'G'RI
POSTGRES_PASSWORD=X9m#Kp2$Lq8@Nv5!Rt7&Yw4^
```

**Parol talablari:**
- Kamida 16 ta belgi
- Katta va kichik harflar
- Raqamlar va maxsus belgilar
- Lug'atda bo'lmagan so'zlar

### 2. SSL/TLS (HTTPS) Yoqish

Production da ALBATTA HTTPS ishlatilishi kerak:

```yaml
# nginx yoki load balancer orqali
server {
    listen 443 ssl http2;
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
}
```

### 3. CORS Sozlamalari

Faqat ishonchli domenlarni ruxsat bering:

```bash
# ❌ NOTO'G'RI (hammaga ochiq)
CORS_ALLOWED_ORIGINS=*

# ✅ TO'G'RI (aniq domenlar)
CORS_ALLOWED_ORIGINS=https://yourdomain.com,https://app.yourdomain.com
```

### 4. Database SSL

Production da database uchun SSL yoqing:

```bash
# ❌ Development
DB_SSLMODE=disable

# ✅ Production
DB_SSLMODE=require
# yoki
DB_SSLMODE=verify-full  # eng xavfsiz
```

---

## 🛡️ Amalga Oshirilgan Xavfsizlik Choralari

### Backend (Go)

#### 1. Autentifikatsiya
- ✅ JWT token bilan autentifikatsiya
- ✅ Kuchli parol talablari (8+ belgi, katta/kichik harf, raqam)
- ✅ Bcrypt bilan parol hashlash (cost: 10)
- ✅ Token expiration (default: 72 soat)

#### 2. Input Validation
- ✅ Telefon raqam format validatsiyasi
- ✅ Username format validatsiyasi (4-32 ta belgi)
- ✅ Matn uzunligi cheklash (max 4000 belgi)
- ✅ File size limitlar (max 100MB)
- ✅ Xavfli file extension bloklanadi

#### 3. File Upload Xavfsizligi
- ✅ Bloklangan kengaytmalar: `.exe`, `.sh`, `.php`, `.js`, `.html`, va boshqalar
- ✅ MIME type tekshiruvi
- ✅ Fayl nomi sanitizatsiya (path traversal oldini olish)
- ✅ Tasodifiy UUID bilan fayl nomlash

#### 4. HTTP Security Headers
- ✅ `X-Content-Type-Options: nosniff`
- ✅ `X-Frame-Options: DENY`
- ✅ `X-XSS-Protection: 1; mode=block`
- ✅ `Strict-Transport-Security` (HSTS)
- ✅ `Content-Security-Policy`
- ✅ `Referrer-Policy: strict-origin-when-cross-origin`

#### 5. Rate Limiting
- ✅ Auth endpoint uchun rate limit (5 request/min)
- ✅ IP-based limiting

#### 6. Database Xavfsizligi
- ✅ Prepared statements (SQL injection oldini olish)
- ✅ GORM ORM ishlatilgan
- ✅ Connection pooling
- ✅ Cascade delete relations

### Frontend (React Native)

#### 1. Token Saqlash
- ✅ AsyncStorage ishlatilgan
- ✅ Token har bir request da yuboriladi

#### 2. WebSocket Xavfsizligi
- ✅ Token bilan autentifikatsiya
- ✅ Qayta ulanish limitlari (max 50 urinish)
- ✅ Exponential backoff

#### 3. Input Sanitization
- ⚠️ Client-side validation (server-side ham borligini unutmang)

### Docker

#### 1. Container Xavfsizligi
- ✅ Non-root user (appuser:1001)
- ✅ Multi-stage build
- ✅ Alpine Linux (minimal attack surface)
- ✅ Resource limits (CPU, Memory)
- ✅ Health checks

#### 2. Image Optimization
- ✅ Minimal base image
- ✅ Build optimizatsiya (CGO_ENABLED=0)
- ✅ Layer caching

---

## 📊 Xavfsizlik Audit Checklist

Production ga chiqishdan oldin tekshiring:

### Backend
- [ ] JWT_SECRET kuchli va tasodifiy
- [ ] Database parol o'zgartirilgan
- [ ] HTTPS yoqilgan
- [ ] DB_SSLMODE=require yoki verify-full
- [ ] CORS faqat kerakli domenlar
- [ ] APP_ENV=production
- [ ] Rate limiting yoqilgan
- [ ] Loglar xavfsiz joyda saqlanadi
- [ ] Backup strategiyasi mavjud

### Frontend
- [ ] API URL production serverga ko'rsatadi
- [ ] Debug mode o'chirilgan
- [ ] Sensitive ma'lumotlar console.log da yo'q
- [ ] Error handling to'g'ri amalga oshirilgan

### Infrastructure
- [ ] Firewall sozlangan
- [ ] Faqat kerakli portlar ochiq (80, 443, 22)
- [ ] SSH key-based auth
- [ ] Regular security updates
- [ ] Monitoring va alerting
- [ ] Backup va disaster recovery plan

---

## 🔍 Keng Tarqalgan Xatolar

### ❌ Qilmang:

1. **Default parollar ishlatish**
   ```bash
   POSTGRES_PASSWORD=password123  # Xavfli!
   ```

2. **CORS ni hammaga ochiq qoldirish**
   ```bash
   CORS_ALLOWED_ORIGINS=*  # Hech qachon!
   ```

3. **Sensitive ma'lumotlarni commit qilish**
   ```bash
   git add .env  # .gitignore da bo'lishi kerak!
   ```

4. **Production da debug mode**
   ```bash
   APP_ENV=development  # Production da production bo'lishi kerak
   ```

### ✅ To'g'ri qiling:

1. **Kuchli parollar**
2. **Environment variables ishlatish**
3. **HTTPS majburiy**
4. **Regular updates**
5. **Monitoring va logging**

---

## 📚 Qo'shimcha Resurslar

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Go Security Best Practices](https://github.com/Checkmarx/Go-SCP)
- [React Native Security](https://reactnative.dev/docs/security)
- [Docker Security](https://docs.docker.com/engine/security/)

---

## 🆘 Muammo Topilsa

Agar xavfsizlik muammosini topsangiz:

1. Darhol production serverni update qiling
2. Loglarni tekshiring
3. Zarur bo'lsa, tokenlarni bekor qiling
4. Foydalanuvchilarni xabardor qiling

---

**Oxirgi yangilanish:** 2026-04-20  
**Versiya:** 1.0
