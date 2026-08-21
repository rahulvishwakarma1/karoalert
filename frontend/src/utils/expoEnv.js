import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';

// TEMPORARY: Expo Go mein expo-notifications ka push notification support SDK 53 se hata diya gaya hai.
// Yahaan check isliye hai taaki Expo Go mein testing ke dauran notification code crash na kare.
// NOTE: Ye check sirf testing ke liye hai - development build / production build mein notifications normal kaam karengi.
export const isRunningInExpoGo = () => {
  if (Platform.OS === 'web') return false;
  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
};