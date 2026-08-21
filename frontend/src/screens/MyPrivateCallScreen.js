import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ActivityIndicator, Button, Card, Chip, Appbar } from 'react-native-paper';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAuth } from '../context/AuthContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSocket } from '../context/SocketContext';
import { privateCallAPI } from '../services/api';

const formatDateTime = (val) => {
  if (!val) return 'N/A';
  const d = typeof val === 'string' ? val.replace(' ', 'T') : val;
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? 'N/A' : dt.toLocaleString();
};

const FOOTER_TABS = [
  { key: 'Home', icon: 'home-outline', label: 'Home' },
  { key: 'Vehicles', icon: 'car-outline', label: 'Vehicles' },
  { key: 'Scanner', icon: 'qr-code-outline', label: 'Scanner' },
  { key: 'Plan', icon: 'card-outline', label: 'Plan' },
  { key: 'Profile', icon: 'person-outline', label: 'Profile' },
];

const MyPrivateCallScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const socket = useSocket();
  const [balance, setBalance] = useState(null);
  const [service, setService] = useState(null);
  const [callHistory, setCallHistory] = useState([]);
  const [purchaseHistory, setPurchaseHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [callLive, setCallLive] = useState(false);
  const [exhaustedMsg, setExhaustedMsg] = useState('');
  const appStateRef = useRef(AppState.currentState);

  const loadData = useCallback(async () => {
    try {
      const [balRes, svcRes, callRes, txnRes] = await Promise.all([
        privateCallAPI.getBalance().catch(() => ({ data: { balance: null } })),
        privateCallAPI.getOwnerService().catch(() => ({ data: { service: null } })),
        privateCallAPI.getCallHistory().catch(() => ({ data: { calls: [] } })),
        privateCallAPI.getPurchaseHistory().catch(() => ({ data: { transactions: [] } })),
      ]);
      setBalance(balRes.data.balance);
      setService(svcRes.data.service);
      setCallHistory(callRes.data.calls || []);
      setPurchaseHistory(txnRes.data.transactions || []);
    } catch (error) {
      Alert.alert('Error', 'Failed to load data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (!socket) return undefined;

    const onBalanceUpdate = (data) => {
      if (!data) return;

      if (data.status === 'active') {
        setCallLive(true);
        setExhaustedMsg('');
        setBalance((prev) => ({
          ...(prev || {}),
          remaining_seconds: typeof data.remaining_seconds === 'number' ? data.remaining_seconds : prev?.remaining_seconds,
          total_seconds_used: typeof data.total_seconds_used === 'number' ? data.total_seconds_used : prev?.total_seconds_used,
        }));
      } else if (data.status === 'exhausted') {
        setCallLive(false);
        setExhaustedMsg('Balance exhausted — call ended. Please buy more seconds.');
        loadData();
      } else if (data.status === 'ended') {
        setCallLive(false);
        loadData();
      }
    };

    socket.on('private_call_balance_update', onBalanceUpdate);
    return () => {
      socket.off('private_call_balance_update', onBalanceUpdate);
    };
  }, [socket, loadData]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      const wasActive = appStateRef.current === 'active';
      appStateRef.current = nextState;
      if (nextState === 'active' && !wasActive) {
        setCallLive(false);
        loadData();
      }
    });
    return () => subscription.remove();
  }, [loadData]);

  const onRefresh = () => { setRefreshing(true); loadData(); };

  const getStatusStyle = (status) => {
    switch (status) {
      case 'active': return { bg: '#E8F5E9', text: '#2E7D32', label: 'Active' };
      case 'expired': return { bg: '#FFF3E0', text: '#E65100', label: 'Expired' };
      default: return { bg: '#FFEBEE', text: '#C62828', label: 'Inactive' };
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingScreen}>
        <Appbar.Header style={styles.headerBar}>
          <Appbar.BackAction color="#fff" onPress={() => navigation.goBack()} />
          <Appbar.Content title="My Private Call" color="#fff" />
        </Appbar.Header>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#1565C0" />
        </View>
      </View>
    );
  }

  const svcStatus = getStatusStyle(service?.status || 'inactive');
  const adminTabs = user?.is_admin
    ? FOOTER_TABS.filter(t => t.key !== 'Plan')
    : FOOTER_TABS.filter(t => t.key !== 'Admin');

  return (
    <View style={styles.screen}>
      <Appbar.Header style={styles.headerBar}>
        <Appbar.BackAction color="#fff" onPress={() => navigation.goBack()} />
        <Appbar.Content title="My Private Call" color="#fff" />
      </Appbar.Header>

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.header}>
          <Ionicons name="shield-checkmark" size={28} color="#fff" />
          <Text style={styles.headerTitle}>My Private Call</Text>
        </View>

        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.sectionTitleRow}>
              <Ionicons name="timer-outline" size={20} color="#1565C0" />
              <Text style={styles.sectionTitle}>Caller Balance</Text>
            </View>
            <Text style={[styles.bigNumber, callLive && styles.bigNumberLive]}>{balance?.remaining_seconds || 0}</Text>
            <Text style={styles.bigLabel}>seconds remaining{callLive ? ' (live)' : ''}</Text>
            {callLive && (
              <View style={styles.liveBadge}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>Call active — balance ticking live</Text>
              </View>
            )}
            {!!exhaustedMsg && (
              <View style={styles.exhaustedBox}>
                <Ionicons name="alert-circle" size={16} color="#C62828" />
                <Text style={styles.exhaustedText}>{exhaustedMsg}</Text>
              </View>
            )}
            <View style={styles.statRow}>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{balance?.total_seconds_purchased || 0}</Text>
                <Text style={styles.statLabel}>Purchased</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{balance?.total_seconds_used || 0}</Text>
                <Text style={styles.statLabel}>Used</Text>
              </View>
            </View>
            <Button
              mode="contained"
              buttonColor="#1565C0"
              textColor="#fff"
              style={styles.actionBtn}
              icon="cart"
              onPress={() => navigation.navigate('PurchasePlan', { type: 'caller_seconds' })}
            >
              Buy Call Seconds
            </Button>
          </Card.Content>
        </Card>

        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.sectionTitleRow}>
              <Ionicons name="server-outline" size={20} color="#6A1B9A" />
              <Text style={styles.sectionTitle}>Owner Receiving Service</Text>
            </View>
            <View style={styles.statusRow}>
              <Chip style={[styles.statusChip, { backgroundColor: svcStatus.bg }]} textStyle={{ color: svcStatus.text, fontWeight: '700' }}>
                {svcStatus.label}
              </Chip>
            </View>
            <Text style={styles.infoText}>Last recharge: {formatDateTime(service?.last_recharge_at)}</Text>
            <Text style={styles.infoText}>Expires: {formatDateTime(service?.service_expires_at)}</Text>
            {service?.status !== 'active' && (
              <Text style={styles.warningText}>
                Private Call option will not appear on your QR code until service is active.
              </Text>
            )}
            <Button
              mode="contained"
              buttonColor="#6A1B9A"
              textColor="#fff"
              style={styles.actionBtn}
              icon="refresh"
              onPress={() => navigation.navigate('PurchasePlan', { type: 'owner_service' })}
            >
              {service?.status === 'active' ? 'Recharge Service' : 'Activate Service'}
            </Button>
          </Card.Content>
        </Card>

        {callHistory.length > 0 && (
          <Card style={styles.card}>
            <Card.Content>
              <View style={styles.sectionTitleRow}>
                <Ionicons name="call-outline" size={20} color="#374151" />
                <Text style={styles.sectionTitle}>Recent Calls</Text>
              </View>
              {callHistory.slice(0, 5).map((call) => (
                <View key={call.id} style={styles.callRow}>
                  <View style={styles.callInfo}>
                    <Text style={styles.callName}>{call.other_party_name}</Text>
                    <Text style={styles.callMeta}>
                      {call.direction === 'outgoing' ? 'Outgoing' : 'Incoming'} · {call.seconds_used || 0}s
                    </Text>
                  </View>
                  <Text style={[styles.callStatus, call.call_status === 'completed' ? styles.successText : styles.warnText]}>
                    {call.call_status}
                  </Text>
                </View>
              ))}
            </Card.Content>
          </Card>
        )}

        {purchaseHistory.length > 0 && (
          <Card style={styles.card}>
            <Card.Content>
              <View style={styles.sectionTitleRow}>
                <Ionicons name="receipt-outline" size={20} color="#374151" />
                <Text style={styles.sectionTitle}>Purchase History</Text>
              </View>
              {purchaseHistory.slice(0, 5).map((txn) => (
                <View key={txn.id} style={styles.callRow}>
                  <View style={styles.callInfo}>
                    <Text style={styles.callName}>{txn.plan_name}</Text>
                    <Text style={styles.callMeta}>
                      {txn.seconds_added}s added · {formatDateTime(txn.created_at)}
                    </Text>
                  </View>
                  <Text style={[styles.callStatus, { color: txn.status === 'paid' ? '#2E7D32' : '#C62828' }]}>
                    Rs {txn.amount}
                  </Text>
                </View>
              ))}
            </Card.Content>
          </Card>
        )}

        <View style={styles.bottomSpacer} />
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 8 }]}>
        {adminTabs.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={styles.footerTab}
            onPress={() => navigation.navigate('MainTabs', { screen: tab.key })}
          >
            <Ionicons name={tab.icon} size={22} color="#9CA3AF" />
            <Text style={styles.footerLabel}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
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
    alignItems: 'center',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '800', marginTop: 8 },
  card: { margin: 16, marginBottom: 0, borderRadius: 12, backgroundColor: '#fff', elevation: 2 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  bigNumber: { fontSize: 48, fontWeight: '900', color: '#1565C0', textAlign: 'center' },
  bigNumberLive: { color: '#D84315' },
  bigLabel: { fontSize: 14, color: '#6B7280', textAlign: 'center', marginBottom: 12 },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FFEBEE',
    borderRadius: 8,
    paddingVertical: 6,
    marginBottom: 10,
  },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#D84315' },
  liveText: { fontSize: 12, fontWeight: '700', color: '#D84315' },
  exhaustedBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFEBEE',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  exhaustedText: { flex: 1, fontSize: 12, fontWeight: '600', color: '#C62828' },
  statRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 12 },
  stat: { alignItems: 'center' },
  statValue: { fontSize: 18, fontWeight: '800', color: '#111827' },
  statLabel: { fontSize: 11, color: '#6B7280' },
  actionBtn: { borderRadius: 8, marginTop: 8 },
  statusRow: { marginBottom: 8 },
  statusChip: { alignSelf: 'flex-start' },
  infoText: { fontSize: 12, color: '#6B7280', marginTop: 4 },
  warningText: { fontSize: 12, color: '#D84315', fontWeight: '600', marginTop: 6 },
  callRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  callInfo: { flex: 1 },
  callName: { fontSize: 14, fontWeight: '600', color: '#111827' },
  callMeta: { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  callStatus: { fontSize: 12, fontWeight: '700' },
  successText: { color: '#2E7D32' },
  warnText: { color: '#D84315' },
  bottomSpacer: { height: 40 },
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

export default MyPrivateCallScreen;
