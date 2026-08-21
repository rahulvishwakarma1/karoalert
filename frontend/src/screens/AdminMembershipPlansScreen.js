import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Modal, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ActivityIndicator, Button, Card, Switch, TextInput, Title, Appbar } from 'react-native-paper';
import Ionicons from '@expo/vector-icons/Ionicons';
import { membershipPlanAPI } from '../services/api';

const AdminMembershipPlansScreen = ({ navigation }) => {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingPlan, setEditingPlan] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    description: '',
    price: '',
    duration_days: '',
    qr_limit: '',
    plan_order: '0',
  });

  const loadPlans = useCallback(async () => {
    try {
      const res = await membershipPlanAPI.getAdminPlans();
      setPlans(res.data.plans || []);
    } catch (error) {
      if (error.response?.status === 404) {
        Alert.alert('Not Available', 'Membership plan management is not yet enabled on the server.');
      } else {
        Alert.alert('Error', 'Failed to load membership plans');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadPlans(); }, [loadPlans]);

  const onRefresh = () => { setRefreshing(true); loadPlans(); };

  const openCreate = () => {
    setEditingPlan(null);
    setForm({ name: '', description: '', price: '', duration_days: '', qr_limit: '', plan_order: '0' });
    setModalVisible(true);
  };

  const openEdit = (plan) => {
    setEditingPlan(plan);
    setForm({
      name: plan.name || '',
      description: plan.description || '',
      price: String(plan.price || ''),
      duration_days: String(plan.duration_days || ''),
      qr_limit: String(plan.qr_limit || ''),
      plan_order: String(plan.plan_order || 0),
    });
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.price || !form.duration_days) {
      Alert.alert('Error', 'Please fill plan name, price, and duration');
      return;
    }

    const priceNum = parseFloat(form.price);
    const durationNum = parseInt(form.duration_days, 10);
    const qrLimitNum = parseInt(form.qr_limit || '3', 10);

    if (isNaN(priceNum) || priceNum <= 0) {
      Alert.alert('Error', 'Price must be a positive number');
      return;
    }
    if (isNaN(durationNum) || durationNum <= 0) {
      Alert.alert('Error', 'Duration must be a positive number of days');
      return;
    }
    if (isNaN(qrLimitNum) || qrLimitNum <= 0) {
      Alert.alert('Error', 'QR limit must be a positive number');
      return;
    }

    setSaving(true);
    try {
      const data = {
        name: form.name.trim(),
        description: form.description.trim(),
        price: priceNum,
        duration_days: durationNum,
        qr_limit: qrLimitNum,
        plan_order: parseInt(form.plan_order || '0', 10),
      };

      if (editingPlan) {
        await membershipPlanAPI.updatePlan(editingPlan.id, data);
      } else {
        await membershipPlanAPI.createPlan(data);
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
      await membershipPlanAPI.updatePlan(plan.id, { is_active: !plan.is_active });
      loadPlans();
    } catch (error) {
      Alert.alert('Error', 'Failed to toggle plan');
    }
  };

  const deletePlan = (plan) => {
    Alert.alert('Delete Plan', `Delete "${plan.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await membershipPlanAPI.deletePlan(plan.id);
            loadPlans();
          } catch (error) {
            Alert.alert('Error', 'Failed to delete plan');
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.loadingScreen}>
        <Appbar.Header style={styles.headerBar}>
          <Appbar.BackAction color="#fff" onPress={() => navigation.goBack()} />
          <Appbar.Content title="Membership Plans" color="#fff" />
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
        <Appbar.Content title="Membership Plans" color="#fff" />
      </Appbar.Header>

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Button
          mode="contained"
          buttonColor="#1565C0"
          textColor="#fff"
          style={styles.addBtn}
          icon="plus"
          onPress={openCreate}
        >
          Add New Plan
        </Button>

        {plans.length === 0 && (
          <View style={styles.emptyBox}>
            <Ionicons name="alert-circle-outline" size={32} color="#9CA3AF" />
            <Text style={styles.emptyText}>No membership plans created yet.</Text>
            <Text style={styles.emptyHint}>Add a plan to let users purchase QR access.</Text>
          </View>
        )}

        {plans.map((plan) => (
          <Card key={plan.id} style={styles.planCard}>
            <Card.Content>
              <View style={styles.planHeader}>
                <View style={styles.planInfo}>
                  <Text style={styles.planName}>{plan.name}</Text>
                  <Text style={styles.planMeta}>
                    Rs {plan.price} · {plan.duration_days} days · {plan.qr_limit || 3} QR
                    {plan.plan_order ? ` · Order ${plan.plan_order}` : ''}
                  </Text>
                </View>
                <Switch
                  value={!!plan.is_active}
                  onValueChange={() => togglePlan(plan)}
                  color="#2E7D32"
                />
              </View>
              {plan.description ? <Text style={styles.planDesc}>{plan.description}</Text> : null}
              <View style={styles.planActions}>
                <Button mode="text" onPress={() => openEdit(plan)} icon="pencil" textColor="#1565C0">
                  Edit
                </Button>
                <Button mode="text" onPress={() => deletePlan(plan)} icon="delete" textColor="#C62828">
                  Delete
                </Button>
              </View>
            </Card.Content>
          </Card>
        ))}

        <Modal visible={modalVisible} animationType="slide" onRequestClose={() => setModalVisible(false)}>
          <ScrollView style={styles.modalContainer} contentContainerStyle={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingPlan ? 'Edit Plan' : 'Add Plan'}</Text>
              <Button onPress={() => setModalVisible(false)}>Close</Button>
            </View>

            <TextInput
              mode="outlined"
              label="Plan Name *"
              value={form.name}
              onChangeText={(t) => setForm({ ...form, name: t })}
              style={styles.input}
              placeholder="e.g. Basic, Premium, Pro"
            />
            <TextInput
              mode="outlined"
              label="Description"
              value={form.description}
              onChangeText={(t) => setForm({ ...form, description: t })}
              style={styles.input}
              multiline
              placeholder="What does this plan include?"
            />
            <TextInput
              mode="outlined"
              label="Price (Rs) *"
              value={form.price}
              onChangeText={(t) => setForm({ ...form, price: t })}
              style={styles.input}
              keyboardType="decimal-pad"
              placeholder="499"
            />
            <TextInput
              mode="outlined"
              label="Duration (Days) *"
              value={form.duration_days}
              onChangeText={(t) => setForm({ ...form, duration_days: t })}
              style={styles.input}
              keyboardType="number-pad"
              placeholder="365"
            />
            <TextInput
              mode="outlined"
              label="QR Limit"
              value={form.qr_limit}
              onChangeText={(t) => setForm({ ...form, qr_limit: t })}
              style={styles.input}
              keyboardType="number-pad"
              placeholder="3"
            />
            <TextInput
              mode="outlined"
              label="Plan Order"
              value={form.plan_order}
              onChangeText={(t) => setForm({ ...form, plan_order: t })}
              style={styles.input}
              keyboardType="number-pad"
              placeholder="0"
            />

            <Button
              mode="contained"
              buttonColor="#1565C0"
              textColor="#fff"
              style={styles.saveBtn}
              loading={saving}
              disabled={saving}
              onPress={handleSave}
            >
              {saving ? 'Saving...' : editingPlan ? 'Update Plan' : 'Create Plan'}
            </Button>
          </ScrollView>
        </Modal>
      </ScrollView>
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
  emptyHint: { color: '#B0BEC5', fontSize: 12, marginTop: 4 },
  modalContainer: { flex: 1, backgroundColor: '#F5F7FA' },
  modalContent: { padding: 16 },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  input: { marginBottom: 10, backgroundColor: '#fff' },
  saveBtn: { borderRadius: 8, marginTop: 10 },
});

export default AdminMembershipPlansScreen;
