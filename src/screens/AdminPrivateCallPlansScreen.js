import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Modal, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ActivityIndicator, Button, Card, Switch, TextInput, Title, Appbar } from 'react-native-paper';
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

const AdminPrivateCallPlansScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const adminTabs = user?.is_admin
    ? FOOTER_TABS.filter(t => t.key !== 'Plan')
    : FOOTER_TABS.filter(t => t.key !== 'Admin');
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingPlan, setEditingPlan] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '', description: '', price: '', display_minutes: '', actual_seconds: '', plan_order: '0',
  });

  const loadPlans = useCallback(async () => {
    try {
      const res = await privateCallAPI.getAdminPlans();
      setPlans(res.data.plans || []);
    } catch (error) {
      Alert.alert('Error', 'Failed to load plans');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadPlans(); }, [loadPlans]);

  const onRefresh = () => { setRefreshing(true); loadPlans(); };

  const openCreate = () => {
    setEditingPlan(null);
    setForm({ name: '', description: '', price: '', display_minutes: '', actual_seconds: '', plan_order: '0' });
    setModalVisible(true);
  };

  const openEdit = (plan) => {
    setEditingPlan(plan);
    setForm({
      name: plan.name,
      description: plan.description || '',
      price: String(plan.price),
      display_minutes: String(plan.display_minutes),
      actual_seconds: String(plan.actual_seconds),
      plan_order: String(plan.plan_order || 0),
    });
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.price || !form.display_minutes || !form.actual_seconds) {
      Alert.alert('Error', 'Please fill all required fields');
      return;
    }
    setSaving(true);
    try {
      const data = {
        name: form.name,
        description: form.description,
        price: parseFloat(form.price),
        display_minutes: parseFloat(form.display_minutes),
        actual_seconds: parseInt(form.actual_seconds),
        plan_order: parseInt(form.plan_order || 0),
      };

      if (editingPlan) {
        await privateCallAPI.updatePlan(editingPlan.id, data);
      } else {
        await privateCallAPI.createPlan(data);
      }
      setModalVisible(false);
      loadPlans();
    } catch (error) {
      Alert.alert('Error', error.response?.data?.error || 'Failed to save plan');
    } finally {
      setSaving(false);
    }
  };

  const togglePlan = async (plan) => {
    try {
      await privateCallAPI.updatePlan(plan.id, { is_active: !plan.is_active });
      loadPlans();
    } catch (error) {
      Alert.alert('Error', 'Failed to toggle plan');
    }
  };

  const deletePlan = (plan) => {
    Alert.alert('Delete Plan', `Delete "${plan.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await privateCallAPI.deletePlan(plan.id);
          loadPlans();
        } catch (error) {
          Alert.alert('Error', 'Failed to delete plan');
        }
      }},
    ]);
  };

  if (loading) {
    return (
      <View style={styles.loadingScreen}>
        <Appbar.Header style={styles.headerBar}>
          <Appbar.BackAction color="#fff" onPress={() => navigation.goBack()} />
          <Appbar.Content title="Private Call Plans" color="#fff" />
        </Appbar.Header>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#1565C0" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Appbar.Header style={styles.headerBar}>
        <Appbar.BackAction color="#fff" onPress={() => navigation.goBack()} />
        <Appbar.Content title="Private Call Plans" color="#fff" />
      </Appbar.Header>

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Button mode="contained" buttonColor="#1565C0" textColor="#fff" style={styles.addBtn} icon="plus" onPress={openCreate}>
          Add New Plan
        </Button>

        {plans.map((plan) => (
          <Card key={plan.id} style={styles.planCard}>
            <Card.Content>
              <View style={styles.planHeader}>
                <View style={styles.planInfo}>
                  <Text style={styles.planName}>{plan.name}</Text>
                  <Text style={styles.planMeta}>Rs {plan.price} · {plan.actual_seconds}s · Order {plan.plan_order}</Text>
                </View>
                <Switch value={!!plan.is_active} onValueChange={() => togglePlan(plan)} color="#2E7D32" />
              </View>
              {plan.description ? <Text style={styles.planDesc}>{plan.description}</Text> : null}
              <View style={styles.planActions}>
                <Button mode="text" onPress={() => openEdit(plan)} icon="pencil" textColor="#1565C0">Edit</Button>
                <Button mode="text" onPress={() => deletePlan(plan)} icon="delete" textColor="#C62828">Delete</Button>
              </View>
            </Card.Content>
          </Card>
        ))}

        {plans.length === 0 && (
          <View style={styles.emptyBox}>
            <Ionicons name="alert-circle-outline" size={32} color="#9CA3AF" />
            <Text style={styles.emptyText}>No plans created yet.</Text>
          </View>
        )}

        <Modal visible={modalVisible} animationType="slide" onRequestClose={() => setModalVisible(false)}>
          <ScrollView style={styles.modalContainer} contentContainerStyle={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingPlan ? 'Edit Plan' : 'Add Plan'}</Text>
              <Button onPress={() => setModalVisible(false)}>Close</Button>
            </View>

            <TextInput mode="outlined" label="Plan Name" value={form.name} onChangeText={(t) => setForm({...form, name: t})} style={styles.input} />
            <TextInput mode="outlined" label="Description" value={form.description} onChangeText={(t) => setForm({...form, description: t})} style={styles.input} multiline />
            <TextInput mode="outlined" label="Price (Rs)" value={form.price} onChangeText={(t) => setForm({...form, price: t})} style={styles.input} keyboardType="decimal-pad" />
            <TextInput mode="outlined" label="Display Minutes" value={form.display_minutes} onChangeText={(t) => setForm({...form, display_minutes: t})} style={styles.input} keyboardType="decimal-pad" />
            <TextInput mode="outlined" label="Actual Seconds" value={form.actual_seconds} onChangeText={(t) => setForm({...form, actual_seconds: t})} style={styles.input} keyboardType="number-pad" />
            <TextInput mode="outlined" label="Plan Order" value={form.plan_order} onChangeText={(t) => setForm({...form, plan_order: t})} style={styles.input} keyboardType="number-pad" />

            <Button mode="contained" buttonColor="#1565C0" textColor="#fff" style={styles.saveBtn} loading={saving} disabled={saving} onPress={handleSave}>
              {saving ? 'Saving...' : editingPlan ? 'Update Plan' : 'Create Plan'}
            </Button>
          </ScrollView>
        </Modal>
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
  addBtn: { borderRadius: 8, marginBottom: 12, marginTop: 16 },
  planCard: { marginBottom: 10, borderRadius: 8, backgroundColor: '#fff' },
  planHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  planInfo: { flex: 1 },
  planName: { fontSize: 15, fontWeight: '700', color: '#111827' },
  planMeta: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  planDesc: { fontSize: 12, color: '#374151', marginTop: 6 },
  planActions: { flexDirection: 'row', marginTop: 6, gap: 8 },
  emptyBox: { alignItems: 'center', marginTop: 40 },
  emptyText: { color: '#9CA3AF', fontSize: 14, marginTop: 8 },
  modalContainer: { flex: 1, backgroundColor: '#F5F7FA' },
  modalContent: { padding: 16 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  input: { marginBottom: 10, backgroundColor: '#fff' },
  saveBtn: { borderRadius: 8, marginTop: 10 },
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

export default AdminPrivateCallPlansScreen;
