import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Button, Card, Title } from 'react-native-paper';
import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
import { authAPI, paymentAPI, membershipPlanAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import authStorage from '../utils/authStorage';

const FALLBACK_PLAN = {
  id: 'qr_membership_499',
  name: 'Membership Plan',
  price: 499,
  duration_days: 365,
  qr_limit: 3,
  description: 'One plan for QR parking access',
};

const isExpoGo = Constants.appOwnership === 'expo';

const formatPlanDate = (value) => {
  if (!value) return 'Not available';
  const normalized = typeof value === 'string' ? value.replace(' ', 'T') : value;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return 'Not available';
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const logPaymentFlow = (stage, details = {}) => {
  console.log('[MembershipPayment]', stage, details);
};

const loadRazorpayScript = () =>
  new Promise((resolve, reject) => {
    if (Platform.OS !== 'web') { resolve(true); return; }
    if (window.Razorpay) { resolve(true); return; }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => reject(new Error('Unable to load Razorpay Checkout'));
    document.body.appendChild(script);
  });

const buildRazorpayCheckoutHtml = (options) => `<!doctype html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
</head>
<body style="margin:0;background:#f5f7fa;font-family:Arial,sans-serif;">
  <div style="height:100vh;display:grid;place-items:center;color:#1565C0;font-weight:700;">Opening payment...</div>
  <script>
    const options = ${JSON.stringify(options)};
    options.handler = function(response) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'success', payment: response }));
    };
    options.modal = {
      ondismiss: function() {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'cancel' }));
      }
    };
    window.onload = function() {
      try {
        const checkout = new Razorpay(options);
        checkout.open();
      } catch (error) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', message: error.message }));
      }
    };
  </script>
</body>
</html>`;

const MembershipPlanScreen = ({ navigation }) => {
  const { user, setUser } = useAuth();
  const [paying, setPaying] = useState(false);
  const [checkoutHtml, setCheckoutHtml] = useState(null);
  const [CheckoutWebView, setCheckoutWebView] = useState(null);
  const checkoutPromiseRef = useRef(null);

  const [plans, setPlans] = useState([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState(null);

  const planExpiresAt = user?.membership_expires_at;
  const isPlanExpired = !!planExpiresAt && new Date(planExpiresAt) <= new Date();
  const isPlanActive =
    user?.membership_status === 'active' && !!user?.can_create_qr && !isPlanExpired;

  useEffect(() => {
    let isMounted = true;

    const refreshProfile = async () => {
      try {
        const response = await authAPI.getProfile();
        if (!isMounted || !response.data?.user) return;
        await authStorage.storeUser(response.data.user);
        setUser(response.data.user);
      } catch (error) {
        logPaymentFlow('profile_refresh_failed', {
          message: error.response?.data?.error || error.message,
        });
      }
    };

    refreshProfile();
    return () => { isMounted = false; };
  }, [setUser]);

  useEffect(() => {
    let isMounted = true;

    const fetchPlans = async () => {
      try {
        const res = await membershipPlanAPI.getPlans();
        const apiPlans = res.data.plans || [];
        if (isMounted && apiPlans.length > 0) {
          const activePlans = apiPlans.filter((p) => p.is_active !== false);
          setPlans(activePlans.length > 0 ? activePlans : apiPlans);
        } else if (isMounted) {
          setPlans([FALLBACK_PLAN]);
        }
      } catch (error) {
        logPaymentFlow('plans_fetch_failed', { status: error.response?.status });
        if (isMounted) setPlans([FALLBACK_PLAN]);
      } finally {
        if (isMounted) setPlansLoading(false);
      }
    };

    fetchPlans();
    return () => { isMounted = false; };
  }, []);

  useEffect(() => {
    if (!selectedPlan && plans.length > 0) {
      setSelectedPlan(plans[0]);
    }
  }, [plans, selectedPlan]);

  const recordPayment = async (payment, plan) => {
    const response = await paymentAPI.recordRazorpaySuccess({
      razorpay_payment_id: payment.razorpay_payment_id,
      razorpay_order_id: payment.razorpay_order_id,
      razorpay_signature: payment.razorpay_signature,
      plan_id: plan.id,
    });

    if (response.data?.user) {
      await authStorage.storeUser(response.data.user);
      setUser(response.data.user);
    }

    Alert.alert(
      'Payment Successful',
      `Your ${plan.name} plan is now active!`,
      [{ text: 'OK', onPress: () => navigation?.goBack?.() }]
    );
  };

  const handlePayment = async () => {
    if (paying || !selectedPlan) return;
    setPaying(true);

    try {
      const orderResponse = await paymentAPI.createRazorpayOrder(selectedPlan.id);
      const { key_id, order } = orderResponse.data;

      const options = {
        key: key_id,
        order_id: order.id,
        amount: order.amount,
        currency: order.currency,
        name: 'KaroAlert',
        description: selectedPlan.name,
        prefill: {
          name: user?.name || '',
          email: user?.email || '',
          contact: user?.phone || '',
        },
        notes: {
          user_id: String(user?.id || ''),
          plan_id: String(selectedPlan.id || ''),
        },
        method: { upi: true, card: true, netbanking: true, wallet: true },
        config: {
          display: {
            blocks: {
              upi: { name: 'Pay using UPI', instruments: [{ method: 'upi' }] },
              other: {
                name: 'Other payment methods',
                instruments: [{ method: 'card' }, { method: 'netbanking' }, { method: 'wallet' }],
              },
            },
            sequence: ['block.upi', 'block.other'],
            preferences: { show_default_blocks: true },
          },
        },
        theme: { color: '#1565C0' },
      };

      if (Platform.OS === 'web') {
        await loadRazorpayScript();
        await new Promise((resolve, reject) => {
          const checkout = new window.Razorpay({
            ...options,
            handler: async (payment) => {
              try {
                await recordPayment(payment, selectedPlan);
                resolve();
              } catch (error) { reject(error); }
            },
            modal: { ondismiss: () => reject(new Error('Payment cancelled')) },
          });
          checkout.open();
        });
      } else {
        if (isExpoGo) {
          throw new Error('Razorpay in-app checkout needs a development build.');
        }
        const module = await import('react-native-webview');
        setCheckoutWebView(() => module.WebView || module.default);
        const payment = await new Promise((resolve, reject) => {
          checkoutPromiseRef.current = { resolve, reject };
          setCheckoutHtml(buildRazorpayCheckoutHtml(options));
        });
        await recordPayment(payment, selectedPlan);
      }
    } catch (error) {
      let message = error.response?.data?.error || error.message || 'Payment failed or was cancelled.';
      if (error.code === 'ECONNABORTED') {
        message = 'Request timed out. Check the backend URL and network.';
      } else if (!error.response) {
        message = 'Cannot reach the backend. Check the API URL on your Expo device.';
      }
      Alert.alert('Payment Not Completed', message);
    } finally {
      setPaying(false);
    }
  };

  const closeCheckout = () => {
    setCheckoutHtml(null);
    checkoutPromiseRef.current = null;
  };

  const handleCheckoutMessage = (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      const pending = checkoutPromiseRef.current;
      closeCheckout();
      if (!pending) return;
      if (data.type === 'success') {
        pending.resolve(data.payment);
      } else if (data.type === 'cancel') {
        pending.reject(new Error('Payment cancelled'));
      } else {
        pending.reject(new Error(data.message || 'Payment failed'));
      }
    } catch (error) {
      const pending = checkoutPromiseRef.current;
      closeCheckout();
      pending?.reject?.(error);
    }
  };

  const currentPlan = selectedPlan || plans[0] || FALLBACK_PLAN;

  if (plansLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1565C0" />
        <Text style={styles.loadingText}>Loading plans...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.containerContent}
      keyboardShouldPersistTaps="handled"
    >
      <Modal visible={!!checkoutHtml} animationType="slide" onRequestClose={() => {
        const pending = checkoutPromiseRef.current;
        closeCheckout();
        pending?.reject?.(new Error('Payment cancelled'));
      }}>
        <View style={styles.checkoutHeader}>
          <Text style={styles.checkoutTitle}>Razorpay Payment</Text>
          <TouchableOpacity
            style={styles.checkoutClose}
            onPress={() => {
              const pending = checkoutPromiseRef.current;
              closeCheckout();
              pending?.reject?.(new Error('Payment cancelled'));
            }}
          >
            <Ionicons name="close" size={22} color="#1565C0" />
          </TouchableOpacity>
        </View>
        {checkoutHtml && CheckoutWebView && (
          <CheckoutWebView
            originWhitelist={['*']}
            source={{ html: checkoutHtml }}
            onMessage={handleCheckoutMessage}
            javaScriptEnabled
            domStorageEnabled
            startInLoadingState
          />
        )}
      </Modal>

      {isPlanActive ? (
        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.iconWrap}>
              <Ionicons name="checkmark-circle-outline" size={34} color="#2E7D32" />
            </View>
            <Title style={styles.title}>Active Plan</Title>
            <Text style={styles.activeStatus}>Your QR parking membership is active</Text>

            <View style={styles.activePlanBox}>
              <View style={styles.activePlanRow}>
                <Text style={styles.activePlanLabel}>Plan</Text>
                <Text style={styles.activePlanValue}>{user?.active_plan?.name || currentPlan.name}</Text>
              </View>
              <View style={styles.activePlanRow}>
                <Text style={styles.activePlanLabel}>Status</Text>
                <Text style={styles.activePlanValueGreen}>Active</Text>
              </View>
              <View style={styles.activePlanRow}>
                <Text style={styles.activePlanLabel}>QR limit</Text>
                <Text style={styles.activePlanValue}>
                  {user?.active_plan?.qr_limit || currentPlan.qr_limit || 3} active QR codes
                </Text>
              </View>
              <View style={styles.activePlanRow}>
                <Text style={styles.activePlanLabel}>Valid until</Text>
                <Text style={styles.activePlanValue}>{formatPlanDate(planExpiresAt)}</Text>
              </View>
            </View>

            <View style={styles.paymentBox}>
              <Text style={styles.paymentTitle}>Plan Active</Text>
              <Text style={styles.paymentText}>
                You can create QR codes until {formatPlanDate(planExpiresAt)}. Choose any plan below to renew or switch anytime.
              </Text>
            </View>
          </Card.Content>
        </Card>
      ) : null}

      {plans.length > 1 && (
        <Text style={styles.sectionTitle}>Choose a Plan</Text>
      )}

      {plans.map((plan) => {
        const isSelected = selectedPlan?.id === plan.id;
        return (
          <TouchableOpacity
            key={plan.id}
            style={[styles.planOption, isSelected && styles.planOptionSelected]}
            onPress={() => setSelectedPlan(plan)}
            activeOpacity={0.7}
          >
            <View style={styles.planOptionHeader}>
              <View style={[styles.planRadio, isSelected && styles.planRadioActive]}>
                {isSelected && <View style={styles.planRadioDot} />}
              </View>
              <View style={styles.planOptionInfo}>
                <Text style={styles.planOptionName}>{plan.name}</Text>
                <Text style={styles.planOptionDesc}>{plan.description || 'QR parking access'}</Text>
              </View>
              <Text style={styles.planOptionPrice}>Rs {plan.price}</Text>
            </View>
            <View style={styles.planOptionDetails}>
              <View style={styles.planDetailChip}>
                <Ionicons name="time-outline" size={14} color="#6B7280" />
                <Text style={styles.planDetailText}>{plan.duration_days || 365} days</Text>
              </View>
              <View style={styles.planDetailChip}>
                <Ionicons name="qr-code-outline" size={14} color="#6B7280" />
                <Text style={styles.planDetailText}>{plan.qr_limit || 3} QR codes</Text>
              </View>
            </View>
          </TouchableOpacity>
        );
      })}

      {currentPlan && (
        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.iconWrap}>
              <Ionicons name="card-outline" size={34} color="#1565C0" />
            </View>
            <Title style={styles.title}>{currentPlan.name}</Title>
            <Text style={styles.price}>Rs {currentPlan.price}</Text>
            <Text style={styles.subtitle}>
              {currentPlan.duration_days || 365} days validity · {currentPlan.qr_limit || 3} QR codes
            </Text>

            <View style={styles.features}>
              <Text style={styles.feature}>Create up to {currentPlan.qr_limit || 3} active vehicle QR codes</Text>
              <Text style={styles.feature}>Plan validity: {currentPlan.duration_days || 365} days from payment</Text>
              <Text style={styles.feature}>Receive scan alerts</Text>
              <Text style={styles.feature}>Use app-to-app calling</Text>
              <Text style={styles.feature}>Payment activates QR permission automatically</Text>
            </View>

            <Button
              mode="contained"
              buttonColor="#FF6D00"
              textColor="#fff"
              style={styles.payBtn}
              loading={paying}
              disabled={paying}
              onPress={handlePayment}
            >
              {paying
                ? 'Opening Payment...'
                : isPlanActive
                  ? `Renew / Switch - Rs ${currentPlan.price}`
                  : `Pay Rs ${currentPlan.price}`}
            </Button>

            <View style={styles.paymentBox}>
              <Text style={styles.paymentTitle}>Razorpay Gateway</Text>
              <Text style={styles.paymentText}>
                Razorpay payment activates QR permission automatically after successful payment.
              </Text>
            </View>
          </Card.Content>
        </Card>
      )}

      {plans.length === 0 && !isPlanActive && (
        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.iconWrap}>
              <Ionicons name="card-outline" size={34} color="#1565C0" />
            </View>
            <Title style={styles.title}>Membership Plan</Title>
            <Text style={styles.price}>Rs {FALLBACK_PLAN.price}</Text>
            <Text style={styles.subtitle}>One plan for QR parking access</Text>

            <View style={styles.features}>
              <Text style={styles.feature}>Create up to {FALLBACK_PLAN.qr_limit} active vehicle QR codes</Text>
              <Text style={styles.feature}>Plan validity: 1 year from payment date</Text>
              <Text style={styles.feature}>Receive scan alerts</Text>
              <Text style={styles.feature}>Use app-to-app calling</Text>
              <Text style={styles.feature}>Payment activates QR permission automatically</Text>
            </View>

            <Button
              mode="contained"
              buttonColor="#FF6D00"
              textColor="#fff"
              style={styles.payBtn}
              loading={paying}
              disabled={paying}
              onPress={handlePayment}
            >
              {paying ? 'Opening Payment...' : 'Pay with Razorpay'}
            </Button>

            <View style={styles.paymentBox}>
              <Text style={styles.paymentTitle}>Razorpay Gateway</Text>
              <Text style={styles.paymentText}>
                Razorpay payment activates QR permission automatically after successful payment.
              </Text>
            </View>
          </Card.Content>
        </Card>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  containerContent: { flexGrow: 1, padding: 16, paddingBottom: 30 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F5F7FA' },
  loadingText: { marginTop: 12, color: '#6B7280', fontSize: 14 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#111827', marginBottom: 12, marginTop: 4 },
  card: { width: '100%', borderRadius: 12, backgroundColor: '#fff', marginBottom: 16, elevation: 2 },
  iconWrap: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: '#E8EAF6',
    justifyContent: 'center', alignItems: 'center', alignSelf: 'center', marginBottom: 14,
  },
  title: { textAlign: 'center', fontSize: 22, fontWeight: '800', color: '#111827' },
  price: { textAlign: 'center', fontSize: 38, fontWeight: '900', color: '#1565C0', marginTop: 8 },
  subtitle: { textAlign: 'center', color: '#6B7280', marginTop: 4, marginBottom: 18 },
  activeStatus: { textAlign: 'center', color: '#2E7D32', fontSize: 14, fontWeight: '600', marginTop: 4, marginBottom: 16 },
  features: { gap: 10, marginBottom: 22 },
  feature: { color: '#374151', fontSize: 14, fontWeight: '600', flexShrink: 1 },
  payBtn: { borderRadius: 8, paddingVertical: 4 },
  activePlanBox: {
    borderWidth: 1, borderColor: '#A7F3D0', borderRadius: 8,
    backgroundColor: '#ECFDF5', padding: 14,
  },
  activePlanRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 6 },
  activePlanLabel: { color: '#047857', fontSize: 13, fontWeight: '700' },
  activePlanValue: { color: '#064E3B', fontSize: 13, fontWeight: '800', textAlign: 'right', flexShrink: 1 },
  activePlanValueGreen: { color: '#2E7D32', fontSize: 13, fontWeight: '800', textAlign: 'right' },
  planOption: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 10,
    borderWidth: 2, borderColor: '#E5E7EB', elevation: 1,
  },
  planOptionSelected: { borderColor: '#1565C0', backgroundColor: '#F0F7FF' },
  planOptionHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  planRadio: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#B0BEC5',
    justifyContent: 'center', alignItems: 'center',
  },
  planRadioActive: { borderColor: '#1565C0' },
  planRadioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#1565C0' },
  planOptionInfo: { flex: 1 },
  planOptionName: { fontSize: 16, fontWeight: '700', color: '#111827' },
  planOptionDesc: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  planOptionPrice: { fontSize: 20, fontWeight: '900', color: '#FF6D00' },
  planOptionDetails: { flexDirection: 'row', gap: 12, marginTop: 12 },
  planDetailChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#F5F7FA', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16,
  },
  planDetailText: { fontSize: 12, color: '#6B7280', fontWeight: '600' },
  checkoutHeader: {
    height: 56, paddingHorizontal: 16, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  checkoutTitle: { color: '#111827', fontSize: 16, fontWeight: '800' },
  checkoutClose: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: '#E8EAF6',
    justifyContent: 'center', alignItems: 'center',
  },
  paymentBox: { backgroundColor: '#E8EAF6', borderRadius: 8, marginTop: 16, padding: 14 },
  paymentTitle: { color: '#1565C0', fontSize: 16, fontWeight: '800', marginBottom: 8, textAlign: 'center' },
  paymentText: { color: '#374151', fontSize: 13, lineHeight: 19, textAlign: 'center' },
});

export default MembershipPlanScreen;
