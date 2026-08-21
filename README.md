# KaroAlert

KaroAlert is a React Native (Expo) mobile app for QR-based parking alerts. Vehicle owners create QR code stickers for their vehicles. When someone scans the QR code, they can instantly alert, call, or contact the vehicle owner.

## Features

- User registration / login (JWT auth)
- Vehicle management (add, edit, delete)
- QR code generation, download & share (HTML / PNG formats)
- QR scanning via camera or gallery image upload
- Instant owner alerts via push notifications + Socket.IO
- Owner communication options (call, emergency, alert, app-to-app call, private call)
- Membership plans with Razorpay payments
- Private call balance & purchase plans
- Family members management
- Communication settings (which contact options appear after a scan)
- Admin dashboard (user management, permissions, private call plans & reports)
- Battery optimization prompt for reliable background alerts

## Tech Stack

- React Native 0.83 / React 19
- Expo SDK 55
- React Navigation (stack + bottom tabs)
- React Native Paper (UI)
- Axios (REST API)
- Socket.IO Client (realtime alerts & call signaling)
- react-native-webrtc (app-to-app voice calls)
- expo-notifications / expo-audio (notifications, ringtones)
- Firebase Cloud Messaging (push notifications)

## Project Structure

```text
qrfrontend/
├── App.js                  # Main entry - auth stack, tabs, socket/voice providers
├── app.json                # Expo config (app name, permissions, plugins)
├── index.js                # Expo registerRootComponent
├── assets/                 # Icons, splash, logo
├── src/
│   ├── config/network.js   # API base URL config (EXPO_PUBLIC_API_URL)
│   ├── context/
│   │   ├── AuthContext.js  # Logged-in user state
│   │   ├── SocketContext.js# Socket.IO connection
│   │   └── VoiceCallContext.js # App-to-app voice calls
│   ├── screens/            # Login, Register, Home, Vehicles, Scanner,
│   │                       # Profile, Membership, Admin, Private Call, etc.
│   ├── services/
│   │   ├── api.js          # Axios instance + all API calls
│   │   └── callNotificationService.js
│   └── utils/
│       └── batteryOptimization.js
└── android/                # Prebuilt native Android project
```

## Getting Started

### Prerequisites

- Node.js (>= 18)
- Expo Go app on your phone (or an Android device/emulator)
- MySQL database + backend server (Node.js/Express) running

### Install

```powershell
cd qrfrontend
npm install
```

### Run

```powershell
npm start
# or
npm run start:go
```

The app starts on port 8081. Scan the QR code from the terminal with the Expo Go app.

### Run with a Dev Client (custom native build)

```powershell
npm run start:dev-client
```

## Backend API Configuration

The app connects to the production backend by default:

```text
https://app.shreesswpl.com/api
```

To use a local backend, set `EXPO_PUBLIC_API_URL` before starting:

```powershell
$env:EXPO_PUBLIC_API_URL="http://YOUR_LOCAL_IP:5005"
npm start
```

Make sure your phone and computer are on the same Wi-Fi network.

## Available Scripts

| Command                   | Description                                 |
| ------------------------- | ------------------------------------------- |
| `npm start`               | Start Expo dev server (Go, LAN, port 8081) |
| `npm run start:go`        | Same as `npm start`                         |
| `npm run start:dev-client`| Start with a dev client build               |
| `npm run start:tunnel`    | Start via tunnel (works over any network)   |
| `npm run android`         | Run the Android native app                  |
| `npm run ios`             | Run the iOS native app                      |
| `npm run web`             | Start the web build                         |

## EAS Builds

```powershell
# Development build
npx eas build --profile development --platform android

# Preview APK
npx eas build --profile preview --platform android

# Production AAB
npx eas build --profile production --platform android
```

Build profiles are defined in `eas.json`.

## Key Configuration

- **App name / display name:** defined in `app.json` (`name: "KaroAlert"`)
- **Android package ID:** `com.karoalert.app` (must match `google-services.json`)
- **Firebase:** `google-services.json` at project root and `android/app/google-services.json`
- **EAS Project ID:** in `app.json` under `extra.eas.projectId`

> Note: The internal identifiers (slug, scheme, notification channel IDs) keep the original `qralertgo` values so existing deep-link behavior keeps working.

## Support

Company: DITS Company India Private Limited

- Email: supportdesk@ditscompany.com / hr@ditscompany.com
- Phone: +91 97544-06105
- Address: Police Line Road, Nearby Radio Mann, Ramdwara, Haripura, Vidisha, Madhya Pradesh, India - 464001
