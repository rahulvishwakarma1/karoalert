import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Modal, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ActivityIndicator, Button, Card, Title, Appbar, TextInput } from 'react-native-paper';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAuth } from '../context/AuthContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { privateCallAPI } from '../services/api';

const FOOTER_TABS = [
  { key: 'Home', icon: 'home-outline', label: 'Home' },
  { key: 'Vehicles', icon: 'car-outline', label: 'Vehicles' },
  { key: 'Scanner', icon: 'qr-code-outline', label: 'Scanner' },
  { key: 'Plan', icon: 'card-outline', label: 'Plan' },
  { key: 'Profile', icon: 'person-outline', label: 'Profile' },
];

const StatBox = ({ label, value, icon, color }) => (
  <View style={s.statBox}>
    <Ionicons name={icon} size={20} color={color} />
    <Text style={s.statValue}>{value}</Text>
    <Text style={s.statLabel}>{label}</Text>
  </View>
);

const AdminPrivateCallReportsScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const adminTabs = user?.is_admin
    ? FOOTER_TABS.filter(t => t.key !== 'Plan')
    : FOOTER_TABS.filter(t => t.key !== 'Admin');
  const [reports, setReports] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [grantUser, setGrantUser] = useState(null);
  const [grantSeconds, setGrantSeconds] = useState('');
  const [grantDays, setGrantDays] = useState('');
  const [granting, setGranting] = useState(false);

  const loadReports = useCallback(async () => {
    try {
      const res = await privateCallAPI.getAdminReports();
      setReports(res.data.reports);
    } catch (error) {
      Alert.alert('Error', 'Failed to load reports');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadReports(); }, [loadReports]);
  const onRefresh = () => { setRefreshing(true); loadReports(); };

  const openGrant = (targetUser) => {
    setGrantUser(targetUser);
    setGrantSeconds('');
    setGrantDays('');
  };

  const submitGrant = async () => {
    if (!grantUser) return;
    const seconds = parseInt(grantSeconds || '0', 10) || 0;
    const days = parseInt(grantDays || '0', 10) || 0;
    if (seconds <= 0 && days <= 0) {
      Alert.alert('Error', 'Enter seconds or validity days');
      return;
    }
    setGranting(true);
    try {
      await privateCallAPI.grantUserAccess({ user_id: grantUser.id, seconds, days });
      setGrantUser(null);
      await loadReports();
      Alert.alert('Success', 'Private call access granted');
    } catch (error) {
      Alert.alert('Error', error.response?.data?.error || 'Failed to grant access');
    } finally {
      setGranting(false);
    }
  };

  if (loading) {
    return (
      <View style={s.loadingScreen}>
        <Appbar.Header style={s.headerBar}>
          <Appbar.BackAction color="#fff" onPress={() => navigation.goBack()} />
          <Appbar.Content title="Private Call Reports" color="#fff" />
        </Appbar.Header>
        <View style={s.center}>
          <ActivityIndicator size="large" color="#1565C0" />
        </View>
      </View>
    );
  }

  return (
    <View style={s.screen}>
      <Appbar.Header style={s.headerBar}>
        <Appbar.BackAction color="#fff" onPress={() => navigation.goBack()} />
        <Appbar.Content title="Private Call Reports" color="#fff" />
      </Appbar.Header>

      <Modal visible={!!grantUser} transparent animationType="fade" onRequestClose={() => setGrantUser(null)}>
        <View style={s.modalBackdrop}>
          <View style={s.grantModal}>
            <Text style={s.grantTitle}>Grant Private Call</Text>
            <Text style={s.grantSub}>{grantUser?.name} ({grantUser?.phone})</Text>
            <TextInput
              mode="outlined"
              label="Seconds to add"
              value={grantSeconds}
              onChangeText={(t) => setGrantSeconds(t.replace(/\D/g, ''))}
              keyboardType="number-pad"
              style={s.input}
            />
            <TextInput
              mode="outlined"
              label="Validity days to add"
              value={grantDays}
              onChangeText={(t) => setGrantDays(t.replace(/\D/g, ''))}
              keyboardType="number-pad"
              style={s.input}
            />
            <Button mode="contained" buttonColor="#1565C0" textColor="#fff" loading={granting} disabled={granting} onPress={submitGrant}>
              Grant
            </Button>
            <Button mode="text" onPress={() => setGrantUser(null)} disabled={granting}>Cancel</Button>
          </View>
        </View>
      </Modal>

      <ScrollView
        style={s.container}
        contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Text style={s.sectionLabel}>Revenue</Text>
        <View style={s.statsGrid}>
          <StatBox label="Total Revenue" value={`Rs ${reports?.revenue?.total_revenue || 0}`} icon="wallet" color="#1565C0" />
          <StatBox label="Transactions" value={reports?.revenue?.total_transactions || 0} icon="receipt" color="#1565C0" />
        </View>

        <Text style={s.sectionLabel}>Plan Sales</Text>
        {reports?.plan_sales?.length > 0 ? (
          <Card style={s.card}>
            <Card.Content>
              {reports.plan_sales.map((plan, i) => (
                <View key={plan.id || i} style={s.saleRow}>
                  <Text style={s.saleName}>{plan.name}</Text>
                  <View style={s.saleStats}>
                    <Text style={s.saleCount}>{plan.sales_count} sold</Text>
                    <Text style={s.saleRevenue}>Rs {plan.revenue}</Text>
                  </View>
                </View>
              ))}
            </Card.Content>
          </Card>
        ) : (
          <Text style={s.noData}>No sales data</Text>
        )}

        <Text style={s.sectionLabel}>Usage</Text>
        <View style={s.statsGrid}>
          <StatBox label="Seconds Purchased" value={reports?.seconds?.total_seconds_purchased || 0} icon="arrow-up-circle" color="#2E7D32" />
          <StatBox label="Seconds Used" value={reports?.seconds?.total_seconds_used || 0} icon="arrow-down-circle" color="#D84315" />
        </View>

        <Text style={s.sectionLabel}>Users</Text>
        <View style={s.statsGrid}>
          <StatBox label="Active Users" value={reports?.users?.active || 0} icon="checkmark-circle" color="#2E7D32" />
          <StatBox label="Expired Users" value={reports?.users?.expired || 0} icon="alert-circle" color="#E65100" />
        </View>

        <Text style={s.sectionLabel}>All Users</Text>
        {reports?.users?.all?.length > 0 ? (
          <Card style={s.card}>
            <Card.Content>
              {reports.users.all.map((item) => (
                <View key={item.id} style={s.userRow}>
                  <View style={s.userInfo}>
                    <Text style={s.userName}>{item.name || 'User'}</Text>
                    <Text style={s.userMeta}>{item.phone || item.email || 'No contact'}</Text>
                    <Text style={s.userMeta}>
                      Balance {item.remaining_seconds}s · Used {item.total_seconds_used}s · Calls {item.total_calls}
                    </Text>
                    <Text style={s.userMeta}>
                      Valid until {item.service_expires_at ? new Date(item.service_expires_at).toLocaleDateString() : 'Not set'}
                    </Text>
                  </View>
                  <Button mode="outlined" compact onPress={() => openGrant(item)}>Grant</Button>
                </View>
              ))}
            </Card.Content>
          </Card>
        ) : (
          <Text style={s.noData}>No users found</Text>
        )}

        <Text style={s.sectionLabel}>Calls</Text>
        <View style={s.statsGrid}>
          <StatBox label="Today's Calls" value={reports?.calls?.today || 0} icon="call" color="#1565C0" />
          <StatBox label="Monthly Calls" value={reports?.calls?.monthly || 0} icon="calendar" color="#6A1B9A" />
          <StatBox label="Failed Calls" value={reports?.calls?.failed || 0} icon="close-circle" color="#C62828" />
        </View>

        <Button mode="outlined" onPress={onRefresh} style={s.refresh}>Refresh</Button>
      </ScrollView>

      <View style={[s.footer, { paddingBottom: insets.bottom + 8 }]}>
        {adminTabs.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={s.footerTab}
            onPress={() => navigation.navigate('MainTabs', { screen: tab.key })}
          >
            <Ionicons name={tab.icon} size={22} color="#9CA3AF" />
            <Text style={s.footerLabel}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
};

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F5F7FA' },
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
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
  sectionLabel: { fontSize: 14, fontWeight: '700', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 1, marginTop: 16, marginBottom: 8 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statBox: {
    width: '48%', backgroundColor: '#fff', borderRadius: 8, padding: 14,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  statValue: { fontSize: 22, fontWeight: '800', color: '#111827', marginTop: 6 },
  statLabel: { fontSize: 11, color: '#6B7280', fontWeight: '700', marginTop: 2 },
  card: { borderRadius: 8, backgroundColor: '#fff', marginBottom: 8 },
  saleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  saleName: { fontSize: 14, fontWeight: '600', color: '#111827', flex: 1 },
  saleStats: { alignItems: 'flex-end' },
  saleCount: { fontSize: 12, color: '#6B7280' },
  saleRevenue: { fontSize: 13, fontWeight: '700', color: '#111827' },
  noData: { color: '#9CA3AF', fontSize: 13, textAlign: 'center', marginVertical: 12 },
  refresh: { borderRadius: 8, marginTop: 16 },
  userRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#F3F4F6', gap: 10 },
  userInfo: { flex: 1 },
  userName: { fontSize: 14, fontWeight: '700', color: '#111827' },
  userMeta: { fontSize: 11, color: '#6B7280', marginTop: 2 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 18 },
  grantModal: { backgroundColor: '#fff', borderRadius: 10, padding: 16 },
  grantTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  grantSub: { fontSize: 13, color: '#6B7280', marginTop: 4, marginBottom: 12 },
  input: { marginBottom: 10, backgroundColor: '#fff' },
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
});

export default AdminPrivateCallReportsScreen;
