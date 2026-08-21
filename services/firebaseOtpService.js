const { getAuth } = require('firebase-admin/auth');
const { getFirebaseApp } = require('./pushService');

const normalizePhone = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  return String(phone || '').trim();
};

const verifyPhoneOtpToken = async (idToken, expectedPhone) => {
  if (!idToken || typeof idToken !== 'string') {
    return { success: false, error: 'Firebase ID token is required' };
  }

  const app = getFirebaseApp();
  if (!app) {
    return { success: false, error: 'Firebase is not configured on this server' };
  }

  try {
    const decoded = await getAuth(app).verifyIdToken(idToken);
    const tokenPhone = decoded.phone_number || null;

    if (!tokenPhone) {
      return { success: false, error: 'Firebase token is not linked to a phone number' };
    }

    if (expectedPhone) {
      const expected = normalizePhone(expectedPhone);
      if (tokenPhone !== expected) {
        return { success: false, error: 'Phone number does not match the verified Firebase account' };
      }
    }

    return { success: true, phone: tokenPhone, uid: decoded.uid };
  } catch (error) {
    console.error('[FIREBASE-OTP] token verification failed:', error.message);
    return { success: false, error: 'Invalid or expired Firebase OTP session' };
  }
};

module.exports = { verifyPhoneOtpToken, normalizePhone };
