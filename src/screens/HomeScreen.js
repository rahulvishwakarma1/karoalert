import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import {
  Card,
  Title,
  Paragraph,
  Button,
  FAB,
  ActivityIndicator,
  Chip,
} from 'react-native-paper';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useAuth } from '../context/AuthContext';
import { vehiclesAPI, scanAPI } from '../services/api';


const TYPE_ICONS = {
  Car: 'car',
  SUV: 'car-sport',
  Truck: 'truck',
  Motorcycle: 'bicycle',
  Van: 'car',
  Bus: 'bus',
  Bicycle: 'bicycle',
};

const getVehicleIcon = (type) => TYPE_ICONS[type] || 'car';

const HomeScreen = ({ navigation }) => {
  const { user, logout } = useAuth();
  const [vehicles, setVehicles] = useState([]);
  const [scans, setScans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [vehRes, scanRes] = await Promise.all([
        vehiclesAPI.getVehicles(),
        scanAPI.getMyScans().catch(() => ({ data: { scans: [] } })),
      ]);

      setVehicles(vehRes.data.vehicles || []);
      setScans(scanRes.data.scans || []);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, []);

  const activeQRCount = vehicles.filter(
    (v) => v.qr_codes && v.qr_codes.length > 0
  ).length;

  const formatTime = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now - d;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return d.toLocaleDateString();
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1565C0" />
        <Text style={styles.loadingText}>Loading dashboard...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#1565C0']}
            tintColor="#1565C0"
          />
        }
      >
        {/* ── Welcome Header ── */}
        <View style={styles.welcomeCard}>
          <View style={styles.welcomeTop}>
            <View style={styles.avatarCircle}>
              <Ionicons name="person" size={24} color="#1565C0" />
            </View>
            <View style={styles.welcomeInfo}>
              <Text style={styles.welcomeGreeting}>Welcome back,</Text>
              <Text style={styles.welcomeName}>{user?.name || 'User'}</Text>
            </View>
            <TouchableOpacity onPress={logout} style={styles.logoutBtn}>
              <Ionicons name="log-out-outline" size={20} color="#90CAF9" />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Stats Row ── */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: '#1565C0' }]}>
            <MaterialCommunityIcons name="car-multiple" size={24} color="#42A5F5" />
            <Text style={styles.statNumber}>{vehicles.length}</Text>
            <Text style={styles.statLabel}>Vehicles</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: '#0D47A1' }]}>
            <MaterialCommunityIcons name="qrcode" size={24} color="#42A5F5" />
            <Text style={styles.statNumber}>{activeQRCount}</Text>
            <Text style={styles.statLabel}>QR Active</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: '#1565C0' }]}>
            <Ionicons name="scan-outline" size={24} color="#42A5F5" />
            <Text style={styles.statNumber}>{scans.length}</Text>
            <Text style={styles.statLabel}>Scans</Text>
          </View>
        </View>

        {/* ── Vehicles Section ── */}
        <View style={styles.sectionHeader}>
          <MaterialCommunityIcons name="car" size={18} color="#1565C0" />
          <Text style={styles.sectionTitle}>Your Vehicles</Text>
          {vehicles.length > 0 && (
            <Chip mode="flat" style={styles.sectionChip} textStyle={styles.sectionChipText}>
              {vehicles.length}
            </Chip>
          )}
        </View>

        {vehicles.length === 0 ? (
          <Card style={styles.emptyCard}>
            <Card.Content style={styles.emptyContent}>
              <View style={styles.emptyIconWrap}>
                <Ionicons name="car-outline" size={48} color="#B0BEC5" />
              </View>
              <Text style={styles.emptyTitle}>No Vehicles Yet</Text>
              <Text style={styles.emptyDesc}>
                Add your first vehicle to generate QR codes and receive parking alerts.
              </Text>
              <Button
                mode="contained"
                buttonColor="#FF6D00"
                textColor="#fff"
                onPress={() => navigation.navigate('Vehicles')}
                style={styles.emptyBtn}
                icon="plus"
              >
                Add Vehicle
              </Button>
            </Card.Content>
          </Card>
        ) : (
          vehicles.slice(0, 3).map((vehicle) => (
            <TouchableOpacity
              key={vehicle.id}
              activeOpacity={0.95}
              onPress={() => navigation.navigate('Vehicles')}
            >
              <Card style={styles.vehicleCard}>
                <View style={styles.vehicleAccent} />
                <Card.Content style={styles.vehicleCardContent}>
                  <View style={styles.vehicleCardTop}>
                    <View style={styles.vehicleIconCircle}>
                      <Ionicons
                        name={getVehicleIcon(vehicle.vehicle_type)}
                        size={22}
                        color="#1565C0"
                      />
                    </View>
                    <View style={styles.vehicleCardInfo}>
                      <View style={styles.vehicleTypeRow}>
                        <Text style={styles.vehicleType}>{vehicle.vehicle_type}</Text>
                        {vehicle.qr_codes && vehicle.qr_codes.length > 0 && (
                          <View style={styles.qrChip}>
                            <MaterialCommunityIcons name="check-circle" size={11} color="#fff" />
                            <Text style={styles.qrChipText}>QR Active</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.vehicleNumber}>
                        {vehicle.vehicle_number || 'No Number'}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color="#B0BEC5" />
                  </View>
                </Card.Content>
              </Card>
            </TouchableOpacity>
          ))
        )}

        {vehicles.length > 3 && (
          <TouchableOpacity onPress={() => navigation.navigate('Vehicles')}>
            <Text style={styles.viewAllLink}>View all {vehicles.length} vehicles</Text>
          </TouchableOpacity>
        )}

        <View style={styles.sectionHeader}>
          <Ionicons name="flash-outline" size={18} color="#1565C0" />
          <Text style={styles.sectionTitle}>Quick Actions</Text>
        </View>
        <View style={styles.quickActionsRow}>
          <TouchableOpacity style={styles.quickAction} onPress={() => navigation.navigate('CommunicationSettings')}>
            <View style={[styles.quickActionIcon, { backgroundColor: '#FFF3E0' }]}>
              <Ionicons name="settings-outline" size={22} color="#FF6D00" />
            </View>
            <Text style={styles.quickActionLabel}>Communication Settings</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickAction} onPress={() => navigation.navigate('MyPrivateCall')}>
            <View style={[styles.quickActionIcon, { backgroundColor: '#FFF3E0' }]}>
              <Ionicons name="shield-checkmark-outline" size={22} color="#FF6D00" />
            </View>
            <Text style={styles.quickActionLabel}>My Private Call</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>

      <FAB
        style={styles.fab}
        icon="plus"
        onPress={() => navigation.navigate('Vehicles')}
        label="Add Vehicle"
        size="medium"
        color="#fff"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7FA',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F7FA',
  },
  loadingText: {
    marginTop: 12,
    color: '#999',
    fontSize: 14,
  },

  // ── Welcome ──
  welcomeCard: {
    backgroundColor: '#FF6D00',
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    elevation: 4,
    shadowColor: '#FF6D00',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  welcomeTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  welcomeInfo: {
    flex: 1,
  },
  welcomeGreeting: {
    fontSize: 13,
    color: '#fff',
    fontWeight: '500',
  },
  welcomeName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
    marginTop: 1,
  },
  logoutBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ── Stats ──
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  statNumber: {
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
    marginTop: 6,
  },
  statLabel: {
    fontSize: 11,
    color: '#90CAF9',
    fontWeight: '600',
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // ── Section Header ──
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1C1C1E',
    flex: 1,
  },
  sectionChip: {
    backgroundColor: '#E8EAF6',
    height: 26,
  },
  sectionChipText: {
    fontSize: 12,
    color: '#1565C0',
    fontWeight: '600',
  },

  // ── Empty ──
  emptyCard: {
    borderRadius: 14,
    elevation: 2,
    marginBottom: 16,
  },
  emptyContent: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  emptyIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#ECEFF1',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#37474F',
    marginBottom: 6,
  },
  emptyDesc: {
    textAlign: 'center',
    color: '#90A4AE',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
    paddingHorizontal: 20,
  },
  emptyBtn: {
    borderRadius: 10,
    paddingHorizontal: 20,
  },

  // ── Vehicle Card ──
  vehicleCard: {
    borderRadius: 14,
    elevation: 2,
    marginBottom: 10,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  vehicleAccent: {
    height: 3,
    backgroundColor: '#1565C0',
  },
  vehicleCardContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  vehicleCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  vehicleIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#E8EAF6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  vehicleCardInfo: {
    flex: 1,
  },
  vehicleTypeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  vehicleType: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  qrChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#1565C0',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  qrChipText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
  },
  vehicleNumber: {
    fontSize: 13,
    color: '#777',
    marginTop: 2,
  },
  viewAllLink: {
    textAlign: 'center',
    color: '#1565C0',
    fontWeight: '600',
    fontSize: 14,
    marginTop: -4,
    marginBottom: 16,
    paddingVertical: 8,
  },

  // ── Scan Row ──
  scanRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
  },
  scanIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E8EAF6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  scanInfo: {
    flex: 1,
  },
  scanVehicle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  scanTime: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  notifSentChip: {
    backgroundColor: '#E8F5E9',
    height: 26,
  },
  notifSentText: {
    fontSize: 11,
    color: '#2E7D32',
    fontWeight: '600',
  },
  notifPendingChip: {
    backgroundColor: '#FFF3E0',
    height: 26,
  },
  notifPendingText: {
    fontSize: 11,
    color: '#E65100',
    fontWeight: '600',
  },

  // ── Notification Row ──
  notifRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
  },
  notifIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1565C0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    marginTop: 2,
  },
  notifInfo: {
    flex: 1,
  },
  notifMsg: {
    fontSize: 13,
    color: '#444',
    lineHeight: 18,
  },
  notifTime: {
    fontSize: 11,
    color: '#AAA',
    marginTop: 4,
  },

  bottomSpacer: {
    height: 40,
  },

  fab: {
    position: 'absolute',
    margin: 20,
    right: 0,
    bottom: 20,
    backgroundColor: '#FF6D00',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    borderRadius: 16,
  },
  quickActionsRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  quickAction: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
  },
  quickActionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  quickActionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#374151',
    textAlign: 'center',
  },
});

export default HomeScreen;
