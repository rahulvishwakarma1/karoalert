# KaroAlert - Vehicle QR Alert System

Complete project with frontend (React Native/Expo) and backend (Node.js/Express).

## Structure

```
├── frontend/          # React Native Expo App
│   ├── src/           # Source code
│   ├── android/       # Android native config
│   ├── assets/        # Images, fonts
│   ├── scripts/       # Build scripts
│   ├── app.json       # Expo config
│   ├── eas.json       # EAS Build config
│   └── package.json
│
└── backend/           # Node.js Express API
    ├── routes/        # API routes
    ├── services/      # Business logic
    ├── middleware/    # Auth, validation
    ├── config/        # DB config
    ├── database/      # SQL schemas
    ├── scripts/       # Init scripts
    ├── server.js      # Entry point
    ├── ecosystem.config.js  # PM2 config
    ├── nginx.conf     # Nginx config
    └── package.json
```

## Quick Start

### Frontend (Mobile App)
```bash
cd frontend
npm install
npm start          # Development
# or
eas build --profile production --platform android  # Production build
```

### Backend (API Server)
```bash
cd backend
npm install
cp .env.production.template .env
# Edit .env with your credentials
node scripts/init-db.js
pm2 start ecosystem.config.js
```

## Features

- **QR Code Generation** - Vehicle QR codes with download/print
- **QR Scanning** - Camera + gallery picker
- **Alerts & Calls** - Ring, voice call, emergency call
- **Firebase OTP** - Phone verification via Firebase Auth
- **Push Notifications** - FCM + Expo push (data-only for background)
- **Private Calls** - Twilio conference calls
- **Membership Plans** - Razorpay payments
- **Admin Panel** - User management, analytics

## Tech Stack

| Frontend | Backend |
|----------|---------|
| React Native 0.83 | Node.js/Express |
| Expo SDK 55 | MySQL 8 |
| React Navigation 7 | Socket.IO |
| Firebase Auth | Firebase Admin |
| WebRTC | Twilio |
| React Native Paper | Razorpay |

## Deployment

### Backend (Production)
1. Server: Ubuntu 22.04+, Node 20, MySQL 8
2. Nginx + SSL (Let's Encrypt)
3. PM2 cluster mode
4. Environment: `.env.production.template`

### Frontend (Play Store)
1. EAS Build: `eas build --profile production --platform android`
2. Download `.aab` → Upload to Play Console
3. GitHub Actions: Free APK builds (see `.github/workflows/`)

## GitHub Actions

Free Android APK builds via GitHub Actions:
- Go to Actions tab → "Android APK Build" → Run workflow
- Download APK from artifacts (7 days retention)

## Environment Variables

Backend `.env` required:
- Database: DB_HOST, DB_USER, DB_PASSWORD, DB_NAME
- JWT: JWT_SECRET
- Firebase: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY_BASE64
- Twilio: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER
- Razorpay: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET
- TURN: TURN_SECRET, TURN_SERVER

Frontend: `EXPO_PUBLIC_API_URL` (set in eas.json or EAS dashboard)
