import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Modal, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ActivityIndicator, Button, Card, Chip, SegmentedButtons, Switch, TextInput, Title } from 'react-native-paper';
import Ionicons from '@expo/vector-icons/Ionicons';
import { adminAPI, membershipPlanAPI } from '../services/api';

const Stat = ({ label, value, icon, color }) => (
  <View style={styles.statBox}>
    <Ionicons name={icon} size={20} color={color} />
    <Text style={styles.statValue}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

const isUserPlanActive = (user) =>
  user.membership_active ?? (
    user.membership_status === 'active' &&
    (!user.membership_expires_at || new Date(user.membership_expires_at) > new Date())
  );

const formatDate = (value) => {
  if (!value) return 'Not set';
  const normalized = typeof value === 'string' ? value.replace(' ', 'T') : value;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return 'Not set';
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const formatDateTime = (value) => {
  if (!value) return 'Not set';
  const normalized = typeof value === 'string' ? value.replace(' ', 'T') : value;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return 'Not set';
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const AdminDashboardScreen = ({ navigation }) => {
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatingId, setUpdatingId] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [membershipPlans, setMembershipPlans] = useState([]);
  const [activateModalVisible, setActivateModalVisible] = useState(false);
  const [activateTarget, setActivateTarget] = useState(null);
  const [selectedActivationPlan, setSelectedActivationPlan] = useState(null);
  const [adminProfile, setAdminProfile] = useState(null);
  const [subAdmins, setSubAdmins] = useState([]);
  const [subAdminModalVisible, setSubAdminModalVisible] = useState(false);
  const [subAdminForm, setSubAdminForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [subAdminSaving, setSubAdminSaving] = useState(false);
  const [subAdminDeleting, setSubAdminDeleting] = useState(null);

  const loadDashboard = useCallback(async () => {
    try {
      const [statsRes, usersRes] = await Promise.all([
        adminAPI.getStats(),
        adminAPI.getUsers(),
      ]);
      setStats(statsRes.data.stats);
      setUsers(usersRes.data.users || []);
    } catch (error) {
      Alert.alert('Admin Error', error.response?.data?.error || 'Failed to load dashboard');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }

    try {
      const plansRes = await membershipPlanAPI.getAdminPlans();
      setMembershipPlans(plansRes.data.plans || []);
    } catch (error) {
      setMembershipPlans([]);
    }
  }, []);

  const loadAdminSection = useCallback(async () => {
    try {
      const profileRes = await adminAPI.getAdminProfile();
      const profile = profileRes.data.profile;
      setAdminProfile(profile);
      if (profile?.role === 'admin') {
        try {
          const subAdminsRes = await adminAPI.getSubAdmins();
          setSubAdmins(subAdminsRes.data.sub_admins || []);
        } catch (error) {
          setSubAdmins([]);
        }
      } else {
        setSubAdmins([]);
      }
    } catch (error) {
      setAdminProfile(null);
      setSubAdmins([]);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
    loadAdminSection();
  }, [loadDashboard, loadAdminSection]);

  const onRefresh = () => {
    setRefreshing(true);
    loadDashboard();
    loadAdminSection();
  };

  const updateUser = async (user, patch) => {
    try {
      setUpdatingId(user.id);
      await adminAPI.updatePermissions(user.id, patch);
      setUsers((current) =>
        current.map((item) => (item.id === user.id ? { ...item, ...patch } : item))
      );
      loadDashboard();
    } catch (error) {
      Alert.alert('Update Failed', error.response?.data?.error || 'Could not update permission');
    } finally {
      setUpdatingId(null);
    }
  };

  const deleteUser = (user) => {
    Alert.alert(
      'Delete User',
      `Delete ${user.name}? This will remove their vehicles, QR codes, and scan data.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setUpdatingId(user.id);
              await adminAPI.deleteUser(user.id);
              setUsers((current) => current.filter((item) => item.id !== user.id));
              loadDashboard();
            } catch (error) {
              Alert.alert('Delete Failed', error.response?.data?.error || 'Could not delete user');
            } finally {
              setUpdatingId(null);
            }
          },
        },
      ]
    );
  };

  const openActivateModal = (user) => {
    setActivateTarget(user);
    setSelectedActivationPlan(membershipPlans.length > 0 ? membershipPlans[0] : null);
    setActivateModalVisible(true);
  };

  const handleManualActivate = async () => {
    if (!activateTarget) return;
    const plan = selectedActivationPlan;

    setUpdatingId(activateTarget.id);
    try {
      if (plan && plan.id && membershipPlans.length > 0) {
        await adminAPI.activateMembership(activateTarget.id, { plan_id: plan.id });
      } else {
        await adminAPI.updatePermissions(activateTarget.id, {
          membership_status: 'active',
          can_create_qr: true,
          can_hide_number: true,
        });
      }
      setActivateModalVisible(false);
      setActivateTarget(null);
      loadDashboard();
    } catch (error) {
      Alert.alert('Activation Failed', error.response?.data?.error || 'Could not activate membership');
    } finally {
      setUpdatingId(null);
    }
  };

  const createSubAdmin = async () => {
    const name = subAdminForm.name.trim();
    const email = subAdminForm.email.trim().toLowerCase();
    const phone = subAdminForm.phone.replace(/\D/g, '');
    const password = subAdminForm.password;

    if (name.length < 2) {
      Alert.alert('Error', 'Name must be at least 2 characters');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      Alert.alert('Error', 'Enter a valid email address');
      return;
    }
    if (!/^\d{10}$/.test(phone)) {
      Alert.alert('Error', 'Phone number must be exactly 10 digits');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }

    setSubAdminSaving(true);
    try {
      await adminAPI.createSubAdmin({ name, email, phone, password });
      setSubAdminModalVisible(false);
      setSubAdminForm({ name: '', email: '', phone: '', password: '' });
      loadAdminSection();
      Alert.alert('Success', 'Sub-admin created successfully');
    } catch (error) {
      Alert.alert('Error', error.response?.data?.error || 'Failed to create sub-admin');
    } finally {
      setSubAdminSaving(false);
    }
  };

  const deleteSubAdmin = (subAdmin) => {
    Alert.alert(
      'Delete Sub-Admin',
      `Delete ${subAdmin.name}? They will lose admin access immediately.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setSubAdminDeleting(subAdmin.id);
            try {
              await adminAPI.deleteSubAdmin(subAdmin.id);
              setSubAdmins((current) => current.filter((item) => item.id !== subAdmin.id));
              Alert.alert('Deleted', 'Sub-admin deleted successfully');
            } catch (error) {
              Alert.alert('Error', error.response?.data?.error || 'Failed to delete sub-admin');
            } finally {
              setSubAdminDeleting(null);
            }
          },
        },
      ]
    );
  };

  const isSuperAdmin = adminProfile?.role === 'admin';

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Loading admin dashboard...</Text>
      </View>
    );
  }

  const filteredUsers = users.filter((user) => {
    const query = search.trim().toLowerCase();
    const matchesSearch =
      !query ||
      [user.name, user.email, user.phone, user.password, user.car_number]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && isUserPlanActive(user)) ||
      (statusFilter === 'inactive' && !isUserPlanActive(user));
    return matchesSearch && matchesStatus;
  });

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.adminLinks}>
        <Button mode="contained" buttonColor="#FF6D00" textColor="#fff" icon="card" style={styles.adminLinkBtn}
          onPress={() => navigation.navigate('AdminMembershipPlans')}>
          Membership Plans
        </Button>
        <Button mode="contained" buttonColor="#1565C0" textColor="#fff" icon="grid" style={styles.adminLinkBtn}
          onPress={() => navigation.navigate('AdminPrivateCallPlans')}>
          Call Plans
        </Button>
        <Button mode="contained" buttonColor="#6A1B9A" textColor="#fff" icon="stats-chart" style={styles.adminLinkBtn}
          onPress={() => navigation.navigate('AdminPrivateCallReports')}>
          Call Reports
        </Button>
      </View>
      <Title style={styles.title}>Admin Dashboard</Title>

      {adminProfile && (
        <Card style={styles.adminProfileCard}>
          <Card.Content>
            <View style={styles.adminProfileHeader}>
              <View style={styles.adminAvatar}>
                <Text style={styles.adminAvatarText}>
                  {adminProfile.name?.charAt(0)?.toUpperCase() || 'A'}
                </Text>
              </View>
              <View style={styles.adminProfileInfo}>
                <Text style={styles.adminProfileName}>{adminProfile.name}</Text>
                <Text style={styles.adminProfileMeta}>{adminProfile.email}</Text>
                <Text style={styles.adminProfileMeta}>{adminProfile.phone || 'No phone'}</Text>
              </View>
              <Chip
                compact
                style={isSuperAdmin ? styles.superAdminChip : styles.subAdminChip}
                textStyle={isSuperAdmin ? styles.superAdminText : styles.subAdminText}
              >
                {isSuperAdmin ? 'Admin' : 'Sub Admin'}
              </Chip>
            </View>
          </Card.Content>
        </Card>
      )}

      <View style={styles.statsGrid}>
        <Stat label="Registered" value={stats?.total_users || 0} icon="people" color="#1565C0" />
        <Stat label="Active Plans" value={stats?.active_members || 0} icon="card" color="#2E7D32" />
        <Stat label="Plan Revenue" value={`Rs ${stats?.paid_amount || 0}`} icon="wallet" color="#6A1B9A" />
        <Stat label="Private Revenue" value={`Rs ${stats?.private_revenue || 0}`} icon="cash" color="#00897B" />
        <Stat label="QR Active" value={stats?.active_qrs || 0} icon="qr-code" color="#6A1B9A" />
        <Stat label="Vehicles" value={stats?.total_vehicles || 0} icon="car" color="#EF6C00" />
      </View>

      {isSuperAdmin && (
        <Card style={styles.subAdminCard}>
          <Card.Content>
            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionTitle}>Sub Admins</Text>
                <Text style={styles.sectionSubtitle}>Admins with limited access</Text>
              </View>
              <Button
                mode="contained"
                buttonColor="#1565C0"
                textColor="#fff"
                compact
                icon="account-plus"
                onPress={() => setSubAdminModalVisible(true)}
              >
                Add Sub Admin
              </Button>
            </View>

            {subAdmins.length === 0 ? (
              <Text style={styles.emptySubText}>No sub-admins created yet.</Text>
            ) : (
              subAdmins.map((sub) => (
                <View key={sub.id} style={styles.subAdminRow}>
                  <View style={styles.subAdminAvatar}>
                    <Text style={styles.subAdminAvatarText}>
                      {sub.name?.charAt(0)?.toUpperCase() || 'S'}
                    </Text>
                  </View>
                  <View style={styles.subAdminInfo}>
                    <Text style={styles.subAdminName}>{sub.name}</Text>
                    <Text style={styles.subAdminMeta}>{sub.email}</Text>
                    <Text style={styles.subAdminMeta}>{sub.phone}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => deleteSubAdmin(sub)}
                    disabled={subAdminDeleting === sub.id}
                    style={styles.subAdminDelete}
                  >
                    {subAdminDeleting === sub.id ? (
                      <ActivityIndicator size="small" color="#D32F2F" />
                    ) : (
                      <Ionicons name="trash-outline" size={18} color="#D32F2F" />
                    )}
                  </TouchableOpacity>
                </View>
              ))
            )}
          </Card.Content>
        </Card>
      )}

      <TextInput
        mode="outlined"
        value={search}
        onChangeText={setSearch}
        placeholder="Search name, email, phone, vehicle"
        left={<TextInput.Icon icon="magnify" />}
        style={styles.searchInput}
      />
      <SegmentedButtons
        value={statusFilter}
        onValueChange={setStatusFilter}
        style={styles.filterButtons}
        buttons={[
          { value: 'all', label: 'All' },
          { value: 'active', label: 'Active' },
          { value: 'inactive', label: 'Inactive' },
        ]}
      />

      {filteredUsers.map((user) => {
        const isUpdating = updatingId === user.id;
        const isActive = isUserPlanActive(user);

        return (
          <Card key={user.id} style={styles.userCard}>
            <Card.Content>
              <View style={styles.userHeader}>
                <View style={styles.userInfo}>
                  <Text style={styles.name}>{user.name}</Text>
                  <Text style={styles.meta}>{user.email}</Text>
                  <Text style={styles.meta}>{user.phone}</Text>
                  <Text style={styles.meta}>Registered: {formatDateTime(user.created_at)}</Text>
                  <Text style={styles.passwordText}>Password: {user.password || '-'}</Text>
                </View>
                <Chip
                  compact
                  style={[styles.statusChip, isActive ? styles.activeChip : styles.inactiveChip]}
                  textStyle={isActive ? styles.activeText : styles.inactiveText}
                >
                  {isActive ? 'Active' : 'Inactive'}
                </Chip>
              </View>

              <View style={styles.countRow}>
                <Text style={styles.countText}>{user.vehicle_count} vehicles</Text>
                <Text style={styles.countText}>{user.qr_count} QR</Text>
                <Text style={styles.countText}>{user.active_qr_count} active</Text>
              </View>

              {user.latest_payment_status === 'paid' && (
                <View style={styles.paymentPaidBox}>
                  <Ionicons name="checkmark-circle" size={17} color="#00897B" />
                  <View style={styles.paymentInfo}>
                    <Text style={styles.paymentPaidText}>
                      Payment done: {user.latest_payment_currency || 'INR'} {user.latest_payment_amount || '499.00'}
                    </Text>
                    <Text style={styles.paymentIdText}>
                      Plan bought: {formatDateTime(user.latest_payment_at)}
                    </Text>
                    <Text style={styles.paymentIdText}>
                      Razorpay ID: {user.latest_payment_id}
                    </Text>
                    <Text style={styles.paymentIdText}>
                      Plan valid until: {formatDate(user.membership_expires_at)}
                    </Text>
                  </View>
                </View>
              )}

              <View style={styles.permissionRow}>
                <View style={styles.planSection}>
                  <Text style={styles.permissionTitle}>Membership Plan</Text>
                  <Text style={styles.permissionDesc}>
                    {isActive
                      ? `Active until: ${formatDate(user.membership_expires_at)}`
                      : 'Inactive - user cannot create QR codes'}
                  </Text>
                </View>
                {isActive ? (
                  <Chip compact style={styles.planActiveChip} textStyle={styles.planActiveText}>Active</Chip>
                ) : (
                  <Button
                    mode="contained"
                    buttonColor="#FF6D00"
                    textColor="#fff"
                    compact
                    loading={isUpdating}
                    disabled={isUpdating || user.is_admin}
                    onPress={() => openActivateModal(user)}
                    style={styles.activateBtn}
                  >
                    Activate
                  </Button>
                )}
              </View>

              <View style={styles.permissionRow}>
                <View>
                  <Text style={styles.permissionTitle}>QR create permission</Text>
                  <Text style={styles.permissionDesc}>Allow this user to generate vehicle QR codes.</Text>
                </View>
                <Switch
                  value={!!user.can_create_qr}
                  disabled={isUpdating || !isActive || user.is_admin}
                  onValueChange={(value) => updateUser(user, { can_create_qr: value })}
                />
              </View>

              <View style={styles.permissionRow}>
                <View>
                  <Text style={styles.permissionTitle}>Hide/show number</Text>
                  <Text style={styles.permissionDesc}>Allow privacy toggle for mobile number.</Text>
                </View>
                <Switch
                  value={!!user.can_hide_number}
                  disabled={isUpdating || user.is_admin}
                  onValueChange={(value) => updateUser(user, { can_hide_number: value })}
                />
              </View>

              {isUpdating && <ActivityIndicator style={styles.inlineLoader} />}
              {!user.is_admin && (
                <Button
                  mode="outlined"
                  textColor="#D32F2F"
                  style={styles.deleteButton}
                  onPress={() => deleteUser(user)}
                  disabled={isUpdating}
                >
                  Delete User
                </Button>
              )}
            </Card.Content>
          </Card>
        );
      })}

      {filteredUsers.length === 0 && (
        <Text style={styles.emptyText}>No users match this filter.</Text>
      )}

      <Button mode="outlined" onPress={onRefresh} style={styles.refreshButton}>
        Refresh
      </Button>

      <Modal visible={activateModalVisible} transparent animationType="fade" onRequestClose={() => setActivateModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Activate Membership</Text>
            <Text style={styles.modalSubtitle}>
              {activateTarget?.name || 'User'}
            </Text>

            {membershipPlans.length > 0 ? (
              <View style={styles.planSelectSection}>
                <Text style={styles.planSelectLabel}>Select Plan</Text>
                {membershipPlans.map((plan) => {
                  const isSel = selectedActivationPlan?.id === plan.id;
                  return (
                    <TouchableOpacity
                      key={plan.id}
                      style={[styles.planSelectItem, isSel && styles.planSelectItemActive]}
                      onPress={() => setSelectedActivationPlan(plan)}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.planSelectRadio, isSel && styles.planSelectRadioActive]}>
                        {isSel && <View style={styles.planSelectRadioDot} />}
                      </View>
                      <View style={styles.planSelectInfo}>
                        <Text style={styles.planSelectName}>{plan.name}</Text>
                        <Text style={styles.planSelectMeta}>Rs {plan.price} · {plan.duration_days} days</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              <View style={styles.planSelectSection}>
                <Text style={styles.planSelectLabel}>No plans configured</Text>
                <Text style={styles.planSelectHint}>Default activation (no plan) will be used.</Text>
              </View>
            )}

            <View style={styles.modalActions}>
              <Button mode="outlined" onPress={() => setActivateModalVisible(false)} style={styles.modalCancelBtn}>
                Cancel
              </Button>
              <Button
                mode="contained"
                buttonColor="#FF6D00"
                textColor="#fff"
                loading={updatingId === activateTarget?.id}
                disabled={updatingId === activateTarget?.id}
                onPress={handleManualActivate}
                style={styles.modalConfirmBtn}
              >
                Activate
              </Button>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={subAdminModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSubAdminModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Create Sub Admin</Text>
            <Text style={styles.modalSubtitle}>
              Sub-admins can manage users but cannot create other sub-admins or view admin profiles.
            </Text>

            <TextInput
              mode="outlined"
              label="Full Name"
              value={subAdminForm.name}
              onChangeText={(text) => setSubAdminForm({ ...subAdminForm, name: text })}
              autoCapitalize="words"
              style={styles.subFormInput}
            />
            <TextInput
              mode="outlined"
              label="Email"
              value={subAdminForm.email}
              onChangeText={(text) => setSubAdminForm({ ...subAdminForm, email: text })}
              keyboardType="email-address"
              autoCapitalize="none"
              style={styles.subFormInput}
            />
            <TextInput
              mode="outlined"
              label="Phone Number"
              value={subAdminForm.phone}
              onChangeText={(text) => setSubAdminForm({ ...subAdminForm, phone: text.replace(/\D/g, '').slice(0, 10) })}
              keyboardType="phone-pad"
              maxLength={10}
              style={styles.subFormInput}
            />
            <TextInput
              mode="outlined"
              label="Password"
              value={subAdminForm.password}
              onChangeText={(text) => setSubAdminForm({ ...subAdminForm, password: text })}
              secureTextEntry
              autoCapitalize="none"
              style={styles.subFormInput}
            />

            <View style={styles.modalActions}>
              <Button mode="outlined" onPress={() => setSubAdminModalVisible(false)} style={styles.modalCancelBtn}>
                Cancel
              </Button>
              <Button
                mode="contained"
                buttonColor="#1565C0"
                textColor="#fff"
                loading={subAdminSaving}
                disabled={subAdminSaving}
                onPress={createSubAdmin}
                style={styles.modalConfirmBtn}
              >
                Create
              </Button>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  content: { padding: 16, paddingBottom: 110 },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, color: '#6B7280' },
  adminLinks: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  adminLinkBtn: { flex: 1, borderRadius: 8 },
  title: { fontSize: 22, fontWeight: '800', marginBottom: 14, color: '#111827' },
  adminProfileCard: {
    marginBottom: 12,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderLeftWidth: 4,
    borderLeftColor: '#FF6D00',
  },
  adminProfileHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  adminAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#1565C0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  adminAvatarText: { fontSize: 20, fontWeight: '800', color: '#fff' },
  adminProfileInfo: { flex: 1 },
  adminProfileName: { fontSize: 16, fontWeight: '800', color: '#111827' },
  adminProfileMeta: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  superAdminChip: { backgroundColor: '#FFF3E0', height: 28 },
  subAdminChip: { backgroundColor: '#E8EAF6', height: 28 },
  superAdminText: { color: '#E65100', fontWeight: '700', fontSize: 11 },
  subAdminText: { color: '#283593', fontWeight: '700', fontSize: 11 },
  subAdminCard: {
    marginBottom: 14,
    borderRadius: 12,
    backgroundColor: '#fff',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    gap: 10,
  },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: '#111827' },
  sectionSubtitle: { fontSize: 11, color: '#6B7280', marginTop: 2 },
  emptySubText: { fontSize: 13, color: '#9CA3AF', fontWeight: '600', textAlign: 'center', paddingVertical: 10 },
  subAdminRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  subAdminAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#E8EAF6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  subAdminAvatarText: { fontSize: 16, fontWeight: '800', color: '#283593' },
  subAdminInfo: { flex: 1 },
  subAdminName: { fontSize: 14, fontWeight: '700', color: '#111827' },
  subAdminMeta: { fontSize: 12, color: '#6B7280', marginTop: 1 },
  subAdminDelete: { padding: 8 },
  subFormInput: { marginBottom: 10, backgroundColor: '#fff' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  searchInput: { backgroundColor: '#fff', marginBottom: 10 },
  filterButtons: { marginBottom: 12 },
  statBox: {
    width: '48%',
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  statValue: { fontSize: 24, fontWeight: '800', color: '#111827', marginTop: 6 },
  statLabel: { fontSize: 12, color: '#6B7280', fontWeight: '700', marginTop: 2 },
  userCard: { marginBottom: 12, borderRadius: 8, backgroundColor: '#fff' },
  userHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  userInfo: { flex: 1 },
  name: { fontSize: 16, fontWeight: '800', color: '#111827' },
  meta: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  passwordText: { fontSize: 12, color: '#111827', marginTop: 4, fontWeight: '700' },
  statusChip: { height: 30 },
  activeChip: { backgroundColor: '#E8F5E9' },
  inactiveChip: { backgroundColor: '#FFF3E0' },
  activeText: { color: '#2E7D32', fontWeight: '700' },
  inactiveText: { color: '#E65100', fontWeight: '700' },
  countRow: { flexDirection: 'row', gap: 10, marginTop: 12, marginBottom: 6 },
  countText: { color: '#374151', fontSize: 12, fontWeight: '700' },
  paymentPaidBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#E0F2F1',
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
    marginBottom: 4,
  },
  paymentInfo: { flex: 1 },
  paymentPaidText: { color: '#00695C', fontSize: 12, fontWeight: '800' },
  paymentIdText: { color: '#00796B', fontSize: 11, fontWeight: '600', marginTop: 2 },
  permissionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    gap: 12,
  },
  planSection: { flex: 1 },
  permissionTitle: { fontSize: 13, color: '#111827', fontWeight: '800' },
  permissionDesc: { fontSize: 11, color: '#6B7280', marginTop: 2, maxWidth: 230 },
  planActiveChip: { backgroundColor: '#E8F5E9', height: 30 },
  planActiveText: { color: '#2E7D32', fontWeight: '700' },
  activateBtn: { borderRadius: 8 },
  inlineLoader: { marginTop: 6 },
  deleteButton: { borderRadius: 8, marginTop: 8, borderColor: '#FFCDD2' },
  emptyText: { textAlign: 'center', color: '#6B7280', marginVertical: 18, fontWeight: '700' },
  refreshButton: { borderRadius: 8, marginTop: 6 },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center', padding: 20,
  },
  modalCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 24,
    width: '100%', maxWidth: 400, elevation: 8,
  },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#111827', textAlign: 'center' },
  modalSubtitle: { fontSize: 14, color: '#6B7280', textAlign: 'center', marginTop: 4, marginBottom: 16 },
  planSelectSection: { marginBottom: 16 },
  planSelectLabel: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 8 },
  planSelectHint: { fontSize: 12, color: '#9CA3AF' },
  planSelectItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 12, borderRadius: 10, borderWidth: 1.5, borderColor: '#E5E7EB', marginBottom: 8,
  },
  planSelectItemActive: { borderColor: '#FF6D00', backgroundColor: '#FFF8F0' },
  planSelectRadio: {
    width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#B0BEC5',
    justifyContent: 'center', alignItems: 'center',
  },
  planSelectRadioActive: { borderColor: '#FF6D00' },
  planSelectRadioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#FF6D00' },
  planSelectInfo: { flex: 1 },
  planSelectName: { fontSize: 14, fontWeight: '700', color: '#111827' },
  planSelectMeta: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  modalCancelBtn: { flex: 1, borderRadius: 8 },
  modalConfirmBtn: { flex: 1, borderRadius: 8 },
});

export default AdminDashboardScreen;
