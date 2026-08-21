import React, { useState, useEffect } from 'react';
import { Alert, Linking, Platform, View, Text, StyleSheet, StatusBar, Image, AppState } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Provider as PaperProvider, Appbar } from 'react-native-paper';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Camera } from 'expo-camera';
import { requestRecordingPermissionsAsync } from 'expo-audio';
import * as MediaLibrary from 'expo-media-library';
import * as Notifications from 'expo-notifications';

import AuthContext, { useAuth } from './src/context/AuthContext';
import { SocketProvider } from './src/context/SocketContext';
import { VoiceCallProvider } from './src/context/VoiceCallContext';
import IncomingAlertModal from './src/components/IncomingAlertModal';
import IncomingCallModal from './src/components/IncomingCallModal';
import VoiceCallModal from './src/components/VoiceCallModal';
import authStorage       from './src/utils/authStorage';
import LoginScreen       from './src/screens/LoginScreen';
import RegisterScreen    from './src/screens/RegisterScreen';
import HomeScreen        from './src/screens/HomeScreen';
import VehiclesScreen    from './src/screens/VehiclesScreen';
import QRScannerScreen   from './src/screens/QRScannerScreen';
import ProfileScreen     from './src/screens/ProfileScreen';
import AdminDashboardScreen from './src/screens/AdminDashboardScreen';
import MembershipPlanScreen from './src/screens/MembershipPlanScreen';
import CommunicationSettingsScreen from './src/screens/CommunicationSettingsScreen';
import MyPrivateCallScreen from './src/screens/MyPrivateCallScreen';
import PurchasePlanScreen from './src/screens/PurchasePlanScreen';
import AdminPrivateCallPlansScreen from './src/screens/AdminPrivateCallPlansScreen';
import AdminPrivateCallReportsScreen from './src/screens/AdminPrivateCallReportsScreen';
import AdminMembershipPlansScreen from './src/screens/AdminMembershipPlansScreen';
import {
  clearActiveCall,
  clearActiveAlert,
  registerForCallPushNotifications,
  setupNotificationResponseListener,
} from './src/services/callNotificationService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authAPI } from './src/services/api';
// TEMPORARY: Expo Go (SDK 53+) mein push notifications unsupported hain. App.js ki notification-related
// calls yahan guard ki ja rahi hain taaki Expo Go testing crash na kare.
// Development build / production build mein notifications normally kaam karengi.
import { isRunningInExpoGo } from './src/utils/expoEnv';

const Stack = createStackNavigator();
const Tab   = createBottomTabNavigator();
const RootStack = createStackNavigator();
const PERMISSIONS_DONE_KEY = '@qralertgo/permissions_done';
const LOGO = require('./assets/icon.png');

function MainTabs() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.container}>
      <Appbar.Header style={styles.header}>
        <Image source={LOGO} style={styles.headerLogo} />
        <Text style={styles.headerTitle}>Karo Alert</Text>
      </Appbar.Header>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          tabBarIcon: function tabBarIcon({ focused, color, size }) {
            let iconName;
            if (route.name === 'Home') {
              iconName = focused ? 'home' : 'home-outline';
            } else if (route.name === 'Vehicles') {
              iconName = focused ? 'car' : 'car-outline';
            } else if (route.name === 'Scanner') {
              iconName = focused ? 'qr-code' : 'qr-code-outline';
            } else if (route.name === 'Admin') {
              iconName = focused ? 'shield-checkmark' : 'shield-checkmark-outline';
            } else if (route.name === 'Plan') {
              iconName = focused ? 'card' : 'card-outline';
            } else {
              iconName = focused ? 'person' : 'person-outline';
            }
            return <Ionicons name={iconName} size={size} color={color} />;
          },
          tabBarActiveTintColor: '#FF6D00',
          tabBarInactiveTintColor: '#90A4AE',
          tabBarStyle: {
            backgroundColor: '#fff',
            borderTopColor: '#E8EDF2',
            elevation: 8,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: -2 },
            shadowOpacity: 0.1,
            shadowRadius: 4,
            paddingBottom: Math.max(insets.bottom, 4),
            height: 60 + insets.bottom,
          },
          headerShown: false,
        })}
      >
        <Tab.Screen name="Home" component={HomeScreen} options={{ title: 'Home' }} />
        <Tab.Screen name="Vehicles" component={VehiclesScreen} options={{ title: 'Vehicles' }} />
        <Tab.Screen name="Scanner" component={QRScannerScreen} options={{ title: 'Scanner' }} />
        {!user?.is_admin && (
          <Tab.Screen name="Plan" component={MembershipPlanScreen} options={{ title: 'Plan' }} />
        )}
        {user?.is_admin && (
          <Tab.Screen name="Admin" component={AdminDashboardScreen} options={{ title: 'Admin' }} />
        )}
        <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profile' }} />
      </Tab.Navigator>
    </View>
  );
}

function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
    </Stack.Navigator>
  );
}

function AppStack() {
  return (
    <RootStack.Navigator screenOptions={{ headerShown: false }}>
      <RootStack.Screen name="MainTabs" component={MainTabs} />
      <RootStack.Screen name="CommunicationSettings" component={CommunicationSettingsScreen} options={{ presentation: 'modal' }} />
      <RootStack.Screen name="MyPrivateCall" component={MyPrivateCallScreen} options={{ presentation: 'modal' }} />
      <RootStack.Screen name="PurchasePlan" component={PurchasePlanScreen} options={{ presentation: 'modal' }} />
      <RootStack.Screen name="AdminPrivateCallPlans" component={AdminPrivateCallPlansScreen} options={{ presentation: 'modal' }} />
      <RootStack.Screen name="AdminPrivateCallReports" component={AdminPrivateCallReportsScreen} options={{ presentation: 'modal' }} />
      <RootStack.Screen name="AdminMembershipPlans" component={AdminMembershipPlansScreen} options={{ presentation: 'modal' }} />
    </RootStack.Navigator>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  // App kholte hi pehle saari permissions maangi jaati hain; jab tak
  // permission process khatam nahi hota, koi bhi screen nahi dikhti.
  const [permissionsChecked, setPermissionsChecked] = useState(Platform.OS === 'web');

  useEffect(() => {
    (async function bootstrap() {
      try {
        const storedUser = await authStorage.getUser();
        if (storedUser) setUser(storedUser);
      } catch (e) {
        console.error('Failed to load user:', e);
      } finally {
        setAuthLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    let cancelled = false;

    (async () => {
      try {
        const done = await AsyncStorage.getItem(PERMISSIONS_DONE_KEY);
        if (done) return;

        const results = await Promise.allSettled([
          Camera.requestCameraPermissionsAsync(),
          requestRecordingPermissionsAsync(),
          // Gallery read permission is intentionally NOT requested:
          // QR upload uses the system Photo Picker (no gallery-wide access).
          // Sirf save (write-only) permission maangi jaati hai, jo Play Store
          // Data Safety ke hisaab se safe hai.
          MediaLibrary.requestPermissionsAsync(true, ['photo']),
          // TEMPORARY: Expo Go mein Notifications.requestPermissionsAsync() throw karta hai,
          // isliye Expo Go mein ise skip kiya ja raha hai.
          ...(isRunningInExpoGo()
            ? []
            : [Notifications.requestPermissionsAsync()]),
        ]);

        if (cancelled) return;

        const deniedForever = results.some(
          (r) =>
            r.status === 'fulfilled' &&
            !r.value.granted &&
            r.value.canAskAgain === false
        );

        await AsyncStorage.setItem(PERMISSIONS_DONE_KEY, 'true');

        if (deniedForever) {
          Alert.alert(
            'Enable All Permissions',
            'For full functionality:\n• Camera – QR scanning\n• Microphone – voice calls\n• Notifications – incoming alerts\n• Storage – save QR cards\n\nPlease allow all permissions in Settings.',
            [
              { text: 'Later', style: 'cancel' },
              { text: 'Open Settings', onPress: () => Linking.openSettings() },
            ]
          );
        }
      } catch (error) {
        console.error('Permission request failed:', error);
      } finally {
        if (!cancelled) setPermissionsChecked(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!user?.id || Platform.OS === 'web') return undefined;

    clearActiveCall();
    clearActiveAlert();
    registerForCallPushNotifications().catch(() => {});
    return setupNotificationResponseListener();
  }, [user?.id]);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        clearActiveCall();
        clearActiveAlert();
      }
    });

    return () => subscription.remove();
  }, []);

  const logout = async () => {
    try {
      await authAPI.unregisterPushToken();
    } catch (error) {
      console.warn('Push token unregister failed:', error?.message || error);
    }
    await authStorage.clearAuth();
    setUser(null);
  };

  if (authLoading || !permissionsChecked) {
    return (
      <View style={styles.loadingContainer}>
        <Text>Loading…</Text>
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <AuthContext.Provider value={{ user, setUser, logout }}>
        <SocketProvider>
          <VoiceCallProvider>
            <PaperProvider>
              <StatusBar barStyle="light-content" backgroundColor="#1565C0" />
              <NavigationContainer>
                {user ? <AppStack /> : <AuthStack />}
              </NavigationContainer>
              <IncomingAlertModal />
              <IncomingCallModal />
              <VoiceCallModal />
            </PaperProvider>
          </VoiceCallProvider>
        </SocketProvider>
      </AuthContext.Provider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: {
    backgroundColor: '#1565C0',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  headerLogo: {
    width: 34,
    height: 34,
    borderRadius: 8,
    marginLeft: 4,
    resizeMode: 'cover',
  },
  headerTitle: { color: 'white', fontSize: 18, fontWeight: 'bold', marginLeft: 10 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
