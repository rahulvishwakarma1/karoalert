import { AppState, Linking, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { authAPI } from './api';
// TEMPORARY: Expo Go (SDK 53+) mein push notifications unsupported hain. Jin files mein notification calls hain
// wahan isRunningInExpoGo() check se unhe skip kiya ja raha hai, taaki Expo Go testing crash na kare.
// Development build / production build mein ye code normally chalega.
import { isRunningInExpoGo } from '../utils/expoEnv';

const CALL_CHANNEL_ID = 'incoming-calls';
const ALERT_CHANNEL_ID = 'vehicle-alerts';
const MISSED_CALL_CHANNEL_ID = 'missed-calls';
const RING_TIMEOUT_MS = 300000;
let activeCall = null;
let activeAlert = null;
const callListeners = new Set();
const alertListeners = new Set();

// Ek hi call/alert ID dobara ring na kare — chahe wahi payload socket se,
// push se ya retry se 2 baar aaye (activeCall clear hone ke baad bhi).
const seenIds = new Map();
const SEEN_WINDOW_MS = RING_TIMEOUT_MS;

const hasSeenRecently = (key) => {
  if (!key) return false;
  const seenAt = seenIds.get(key);
  if (seenAt && Date.now() - seenAt < SEEN_WINDOW_MS) return true;
  seenIds.set(key, Date.now());
  if (seenIds.size > 200) {
    const cutoff = Date.now() - SEEN_WINDOW_MS;
    for (const [k, t] of seenIds) {
      if (t < cutoff) seenIds.delete(k);
    }
  }
  return false;
};

const isExpired = (sentAt) => {
  if (!sentAt) return false;
  const elapsed = Date.now() - new Date(sentAt).getTime();
  return elapsed > RING_TIMEOUT_MS;
};

// TEMPORARY: Expo Go mein notification handler set karna bhi crash karta hai, isliye Expo Go mein skip kiya ja raha hai.
if (Platform.OS !== 'web' && !isRunningInExpoGo()) {
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const type = notification.request.content.data?.type;
      return {
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        priority:
          type === 'incoming_call'
            ? Notifications.AndroidNotificationPriority.MAX
            : Notifications.AndroidNotificationPriority.DEFAULT,
      };
    },
  });
}

const normalizeIncomingCall = (data = {}) => ({
  call_id: data.call_id,
  qr_code_id: data.qr_code_id,
  caller_socket_id: data.caller_socket_id || data.scanner_socket_id || null,
  caller_user_id: data.caller_user_id || data.scanner_user_id || null,
  owner_user_id: data.owner_user_id || null,
  caller_name: data.caller_name || 'Someone',
  owner_name: data.owner_name || null,
  message: data.message || 'Incoming app call for your vehicle',
  sent_at: data.sent_at || null,
  fromPush: !!data.fromPush,
});

const normalizeIncomingAlert = (data = {}) => ({
  request_id: data.request_id,
  qr_code_id: data.qr_code_id,
  scanner_socket_id: data.scanner_socket_id || null,
  scanner_user_id: data.scanner_user_id || null,
  scanner_phone: data.scanner_phone || null,
  sms_gateway_configured: !!data.sms_gateway_configured,
  message: data.message || 'Someone is trying to contact you about your vehicle!',
  sent_at: data.sent_at || null,
  fromPush: !!data.fromPush,
});

const emitIncomingCall = (call) => {
  if (isExpired(call.sent_at)) return;
  // Duplicate events for the same call (reminder pushes, socket re-emits,
  // notification + socket both firing) must not restart the ringing.
  if (call.call_id && activeCall?.call_id === call.call_id) return;
  if (hasSeenRecently(`call:${call.call_id}`)) return;
  activeCall = call;
  callListeners.forEach((listener) => listener(call));
};

const emitIncomingAlert = (alert) => {
  if (isExpired(alert.sent_at)) return;
  const alertId = alert.request_id || alert.qr_code_id;
  const activeId = activeAlert?.request_id || activeAlert?.qr_code_id;
  if (alertId && activeId === alertId) return;
  if (hasSeenRecently(`alert:${alertId}`)) return;
  activeAlert = alert;
  alertListeners.forEach((listener) => listener(alert));
};

export const subscribeIncomingCalls = (listener) => {
  callListeners.add(listener);
  if (activeCall && !isExpired(activeCall.sent_at)) {
    listener(activeCall);
  }
  return () => callListeners.delete(listener);
};

export const subscribeIncomingAlerts = (listener) => {
  alertListeners.add(listener);
  if (activeAlert && !isExpired(activeAlert.sent_at)) {
    listener(activeAlert);
  }
  return () => alertListeners.delete(listener);
};

export const getActiveCall = () => activeCall;
export const getActiveAlert = () => activeAlert;

export const clearActiveCall = () => {
  activeCall = null;
};

export const clearActiveAlert = () => {
  activeAlert = null;
};

// ── Public QR deep link (Google Lens / browser → qralertgo://public/...) ──
// QR landing page se app khultih apne aap; Scanner screen is code ko utha
// ke turant scan kar leti hai.
let pendingQrCode = null;
const qrCodeListeners = new Set();

export const setPendingQrCode = (code) => {
  pendingQrCode = code || null;
  qrCodeListeners.forEach((listener) => listener(pendingQrCode));
};

export const getPendingQrCode = () => pendingQrCode;

export const clearPendingQrCode = () => {
  pendingQrCode = null;
};

export const subscribePendingQrCode = (listener) => {
  qrCodeListeners.add(listener);
  if (pendingQrCode) listener(pendingQrCode);
  return () => qrCodeListeners.delete(listener);
};

export const stopAllRinging = () => {
  activeCall = null;
  activeAlert = null;
  callListeners.forEach((listener) => listener(null));
  alertListeners.forEach((listener) => listener(null));
};

export const setupCallNotifications = async () => {
  // TEMPORARY: Expo Go mein notification channels/categories unsupported hain - testing ke liye skip karo.
  if (isRunningInExpoGo()) return;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CALL_CHANNEL_ID, {
      name: 'Incoming calls',
      importance: Notifications.AndroidImportance.MAX,
      sound: 'ringtone',
      vibrationPattern: [0, 1000, 700, 1000],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });

    await Notifications.setNotificationChannelAsync(ALERT_CHANNEL_ID, {
      name: 'Vehicle alerts',
      importance: Notifications.AndroidImportance.MAX,
      sound: 'ringtone',
      vibrationPattern: [0, 1000, 700, 1000],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });

    await Notifications.setNotificationChannelAsync(MISSED_CALL_CHANNEL_ID, {
      name: 'Missed calls',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'ringtone',
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  }

  await Notifications.setNotificationCategoryAsync('incoming_call', [
    {
      identifier: 'open_call',
      buttonTitle: 'Open',
      options: {
        opensAppToForeground: true,
      },
    },
  ]).catch(() => {});

  await Notifications.setNotificationCategoryAsync('incoming_alert', [
    {
      identifier: 'open_alert',
      buttonTitle: 'Open',
      options: {
        opensAppToForeground: true,
      },
    },
  ]).catch(() => {});
};

export const registerForCallPushNotifications = async () => {
  if (Platform.OS === 'web') return null;
  // TEMPORARY: Expo Go mein push registration unsupported hai - testing ke liye skip karo.
  if (isRunningInExpoGo()) return null;

  await setupCallNotifications();

  const existing = await Notifications.getPermissionsAsync();
  const finalStatus = existing.granted
    ? existing.status
    : (await Notifications.requestPermissionsAsync()).status;

  if (finalStatus !== 'granted') {
    throw new Error('NOTIFICATION_PERMISSION_DENIED');
  }

  const tokenResponse = await Notifications.getDevicePushTokenAsync();

  // Register both the native device token (used when the backend has Firebase
  // server credentials) and the Expo push token (routes through Expo's push
  // service, no server-side Firebase key required).
  let expoPushToken = null;
  try {
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ||
      Constants.easConfig?.projectId ||
      Constants.expoGoConfig?.extra?.eas?.projectId ||
      null;
    if (projectId) {
      const expoResponse = await Notifications.getExpoPushTokenAsync({ projectId });
      expoPushToken = expoResponse.data;
    }
  } catch (error) {
    console.warn('Expo push token could not be obtained:', error?.message || error);
  }

  await authAPI.registerPushToken(tokenResponse.data, expoPushToken);
  return tokenResponse.data;
};

export const handleIncomingCallPayload = async (payload = {}) => {
  const call = normalizeIncomingCall(payload);
  if (!call.call_id) return null;

  emitIncomingCall(call);

  return call;
};

export const handleIncomingAlertPayload = async (payload = {}) => {
  const alert = normalizeIncomingAlert(payload);
  if (!alert.request_id && !alert.qr_code_id) return null;

  emitIncomingAlert(alert);

  return alert;
};

const parseIncomingUrl = (url) => {
  if (!url || typeof url !== 'string') return null;

  try {
    const parsed = new URL(url);
    const target = parsed.hostname || parsed.pathname.replace(/^\/+/, '');
    if (target === 'incoming-call' || target === 'incoming-alert') {
      const rawData = parsed.searchParams.get('data');
      const payload = rawData ? JSON.parse(rawData) : {};
      return { target, payload };
    }

    if (target === 'public' || target === 'qr') {
      const pathSegments = parsed.pathname.replace(/^\/+/, '').split('/').filter(Boolean);
      const code =
        parsed.searchParams.get('code') ||
        parsed.searchParams.get('qr_code_id') ||
        decodeURIComponent(pathSegments[pathSegments.length - 1] || '');
      if (code) return { target: 'public', code };
      return null;
    }

    return null;
  } catch (error) {
    console.warn('Incoming notification URL could not be parsed:', error?.message || error);
    return null;
  }
};

const handleIncomingUrl = (url) => {
  const parsed = parseIncomingUrl(url);
  if (!parsed) return;

  if (parsed.target === 'incoming-call') {
    handleIncomingCallPayload({ ...parsed.payload, fromPush: true });
  } else if (parsed.target === 'incoming-alert') {
    handleIncomingAlertPayload({ ...parsed.payload, fromPush: true });
  } else if (parsed.target === 'public') {
    setPendingQrCode(parsed.code);
  }
};

export const setupNotificationResponseListener = () => {
  if (Platform.OS === 'web') return () => {};
  // TEMPORARY: Expo Go mein notification listeners unsupported hain - testing ke liye no-op listener return karo.
  if (isRunningInExpoGo()) {
    return () => {};
  }
  const receivedSub = Notifications.addNotificationReceivedListener((notification) => {
    const data = notification.request.content.data || {};
    if (data.type === 'incoming_call') {
      handleIncomingCallPayload({ ...data, fromPush: true });
    } else if (data.type === 'incoming_alert') {
      handleIncomingAlertPayload({ ...data, fromPush: true });
    } else if (data.type === 'missed_call') {
      clearActiveCall();
    }
  });

  const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data || {};
    if (data.type === 'incoming_call') {
      handleIncomingCallPayload({ ...data, fromPush: true });
    } else if (data.type === 'incoming_alert') {
      handleIncomingAlertPayload({ ...data, fromPush: true });
    } else if (data.type === 'missed_call') {
      clearActiveCall();
    }
  });

  Notifications.getLastNotificationResponseAsync()
    .then((response) => {
      const data = response?.notification?.request?.content?.data || {};
      if (data.type === 'incoming_call') {
        handleIncomingCallPayload({ ...data, fromPush: true });
      } else if (data.type === 'incoming_alert') {
        handleIncomingAlertPayload({ ...data, fromPush: true });
      } else if (data.type === 'missed_call') {
        clearActiveCall();
      }
    })
    .catch(() => {});

  Linking.getInitialURL()
    .then(handleIncomingUrl)
    .catch(() => {});

  const linkSub = Linking.addEventListener('url', ({ url }) => {
    handleIncomingUrl(url);
  });

  return () => {
    receivedSub.remove();
    responseSub.remove();
    linkSub.remove();
  };
};

export const isAppActive = () => AppState.currentState === 'active';
