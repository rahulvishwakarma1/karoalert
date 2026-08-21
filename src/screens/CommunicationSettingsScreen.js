import React, { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ActivityIndicator, Card, Switch, Appbar } from 'react-native-paper';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAuth } from '../context/AuthContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { communicationAPI } from '../services/api';

const TOGGLES = [
  { key: 'alert_owner', label: 'Alert Owner', icon: 'bell-ring', color: '#D84315', desc: 'Scanner can ring/alert you' },
  { key: 'app_call', label: 'App Call', icon: 'phone-classic', color: '#7B1FA2', desc: 'Scanner can call via app' },
  { key: 'normal_call', label: 'Normal Call', icon: 'phone', color: '#2E7D32', desc: 'Scanner can see your number & call' },
  { key: 'private_call', label: 'Private Call / Hidden Number Call', icon: 'shield-checkmark', color: '#1565C0', desc: 'Scanner can call without seeing your number' },
  { key: 'emergency_call', label: 'Emergency Call', icon: 'medical-bag', color: '#C62828', desc: 'Scanner can call emergency number' },
  { key: 'private_emergency', label: 'Private Emergency Call', icon: 'shield-medical', color: '#E65100', desc: 'Scanner can call emergency without seeing any number' },
];

const FOOTER_TABS = [
  { key: 'Home', icon: 'home-outline', label: 'Home' },
  { key: 'Vehicles', icon: 'car-outline', label: 'Vehicles' },
  { key: 'Scanner', icon: 'qr-code-outline', label: 'Scanner' },
  { key: 'Plan', icon: 'card-outline', label: 'Plan' },
  { key: 'Profile', icon: 'person-outline', label: 'Profile' },
];

const CommunicationSettingsScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadSettings = useCallback(async () => {
    try {
      const settingsRes = await communicationAPI.getSettings();
      setSettings(settingsRes.data.settings);
    } catch (error) {
      Alert.alert('Error', 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  const toggleSetting = async (key) => {
    const newValue = !settings[key];
    setSaving(true);
    try {
      const res = await communicationAPI.updateSettings({ [key]: newValue });
      setSettings(res.data.settings);
    } catch (error) {
      Alert.alert('Error', 'Failed to update setting');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingScreen}>
        <Appbar.Header style={styles.headerBar}>
          <Appbar.BackAction color="#fff" onPress={() => navigation.goBack()} />
          <Appbar.Content title="Communication Settings" color="#fff" />
        </Appbar.Header>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#1565C0" />
        </View>
      </View>
    );
  }

  const adminTabs = user?.is_admin
    ? FOOTER_TABS.filter(t => t.key !== 'Plan')
    : FOOTER_TABS.filter(t => t.key !== 'Admin');

  return (
    <View style={styles.screen}>
      <Appbar.Header style={styles.headerBar}>
        <Appbar.BackAction color="#fff" onPress={() => navigation.goBack()} />
        <Appbar.Content title="Communication Settings" color="#fff" />
      </Appbar.Header>

      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Ionicons name="settings-outline" size={28} color="#fff" />
          <Text style={styles.headerTitle}>Communication Settings</Text>
          <Text style={styles.headerSub}>Control what options appear when someone scans your QR code</Text>
        </View>

        {TOGGLES.map((t) => (
          <Card key={t.key} style={styles.card}>
            <Card.Content style={styles.cardContent}>
              <View style={styles.toggleRow}>
                <View style={[styles.iconWrap, { backgroundColor: t.color + '20' }]}>
                  <Ionicons name={t.icon} size={22} color={t.color} />
                </View>
                <View style={styles.toggleInfo}>
                  <Text style={styles.toggleLabel}>{t.label}</Text>
                  <Text style={styles.toggleDesc}>{t.desc}</Text>
                </View>
                <Switch
                  value={!!settings[t.key]}
                  onValueChange={() => toggleSetting(t.key)}
                  disabled={saving}
                  color={t.color}
                />
              </View>
            </Card.Content>
          </Card>
        ))}

        <View style={styles.noteBox}>
          <Ionicons name="information-circle-outline" size={18} color="#1565C0" />
          <Text style={styles.noteText}>
            Changes apply immediately. Old QR codes will follow the latest hide/show settings. QR image never changes.
          </Text>
        </View>

      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 8 }]}>
        {adminTabs.map((tab) => {
          const isActive = false;
          return (
            <TouchableOpacity
              key={tab.key}
              style={styles.footerTab}
              onPress={() => navigation.navigate('MainTabs', { screen: tab.key })}
            >
              <Ionicons name={tab.icon} size={22} color={isActive ? '#1565C0' : '#9CA3AF'} />
              <Text style={[styles.footerLabel, isActive && styles.footerLabelActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F5F7FA' },
  container: { flex: 1 },
  content: { paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingScreen: { flex: 1, backgroundColor: '#F5F7FA' },
  headerBar: {
    backgroundColor: '#1565C0',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  header: {
    backgroundColor: '#1565C0',
    padding: 20,
    paddingTop: 32,
    paddingBottom: 24,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    alignItems: 'center',
  },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '800', marginTop: 8 },
  headerSub: { color: '#90CAF9', fontSize: 13, textAlign: 'center', marginTop: 4, lineHeight: 18 },
  card: { margin: 16, marginBottom: 0, borderRadius: 12, elevation: 2, backgroundColor: '#fff' },

  cardContent: { paddingVertical: 12 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap: { width: 42, height: 42, borderRadius: 21, justifyContent: 'center', alignItems: 'center' },
  toggleInfo: { flex: 1 },
  toggleLabel: { fontSize: 14, fontWeight: '700', color: '#111827' },
  toggleDesc: { fontSize: 11, color: '#6B7280', marginTop: 2 },

  noteBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    margin: 16,
    marginBottom: 4,
    padding: 14,
    backgroundColor: '#E8EAF6',
    borderRadius: 10,
  },
  noteText: { flex: 1, fontSize: 12, color: '#374151', lineHeight: 17 },

  footer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingTop: 6,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  footerTab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  footerLabel: {
    fontSize: 10,
    color: '#9CA3AF',
    fontWeight: '600',
    marginTop: 2,
  },
  footerLabelActive: {
    color: '#1565C0',
  },
});

export default CommunicationSettingsScreen;
