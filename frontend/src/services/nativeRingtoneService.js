import { NativeModules, Platform } from 'react-native';

const nativeRingtone = NativeModules.RingtoneControl;

export const stopNativeIncomingRingtone = (ringKey = '') => {
  if (Platform.OS !== 'android' || !nativeRingtone?.stopIncomingRingtone) return;

  try {
    nativeRingtone.stopIncomingRingtone(ringKey || '');
  } catch (error) {
    console.warn('Failed to stop native incoming ringtone:', error);
  }
};
