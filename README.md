# Telegram Clone

Full-stack Telegram messenger clone with Go backend, React Native (Expo) mobile app, and PostgreSQL database. Docker-ready for VPS deployment.

## Architecture

- **Backend**: Go (Fiber + GORM + JWT + WebSocket)
- **Mobile**: React Native (Expo)
- **Database**: PostgreSQL 16
- **Real-time**: WebSocket + WebRTC (voice/video calls)
- **Containers**: Docker Compose

## Features

- Registration & login (phone + password)
- Default username "user" (unique username optional)
- Text, voice, image, video, audio, file messages
- Voice & video calls (WebRTC)
- Real-time messaging (WebSocket)
- Typing indicators
- Read receipts
- Contact management
- User search
- Profile editing (avatar, bio, username)

## Quick Start

### 1. Start Backend (Docker)

```bash
docker-compose up --build -d
```

This starts PostgreSQL, the Go backend, and the TURN server.

### 2. Start Mobile App

```bash
cd mobile
npm install
npx expo start
```

Scan the QR code with Expo Go on your phone.

### 3. API Configuration

Edit `mobile/config/api.ts` to set `BASE_URL` to your server IP:

```typescript
export const BASE_URL = 'http://YOUR_SERVER_IP:8084';
```

## Project Structure

```
├── docker-compose.yml
├── database/
│   └── init.sql
├── backend/
│   ├── Dockerfile
│   ├── cmd/server/main.go
│   └── internal/
│       ├── config/
│       ├── database/
│       ├── handlers/
│       ├── middleware/
│       └── models/
├── mobile/
│   ├── App.tsx
│   ├── config/
│   │   └── api.ts          ← SINGLE API config
│   └── src/
│       ├── navigation/
│       ├── screens/
│       ├── services/
│       ├── store/
│       └── theme/
└── turn/
    └── turnserver.conf
```

## VPS Deployment

1. Clone repo to VPS
2. Update `docker-compose.yml` passwords
3. `docker-compose up --build -d`
4. Update `mobile/config/api.ts` with VPS public IP
5. Build the app: `cd mobile && npx expo build`
