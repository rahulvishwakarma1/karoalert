import React, { useEffect, useRef, useState } from 'react';
import { Alert, Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ActivityIndicator, Button, Card, Appbar } from 'react-native-paper';
import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
import { useAuth } from '../context/AuthContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { privateCallAPI } from '../services/api';

const isExpoGo = Constants?.appOwnership === 'expo';

const buildRazorpayHtml = (options) => `<!doctype html>
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

const FOOTER_TABS = [
  { key: 'Home', icon: 'home-outline', label: 'Home' },
  { key: 'Vehicles', icon: 'car-outline', label: 'Vehicles' },
  { key: 'Scanner', icon: 'qr-code-outline', label: 'Scanner' },
  { key: 'Plan', icon: 'card-outline', label: 'Plan' },
  { key: 'Profile', icon: 'person-outline', label: 'Profile' },
];

const PurchasePlanScreen = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
    const { user } = useAuth();
  const purchaseType = route?.params?.type || 'caller_seconds';
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [checkoutHtml, setCheckoutHtml] = useState(null);
  const [CheckoutWebView, setCheckoutWebView] = useState(null);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const checkoutPromiseRef = useRef(null);

  useEffect(() => {
    loadPlans();
  }, []);

  const loadPlans = async () => {
    try {
      const res = await privateCallAPI.getPlans();
      setPlans(res.data.plans || []);
    } catch (error) {
      Alert.alert('Error', 'Failed to load plans');
    } finally {
      setLoading(false);
    }
  };

  const handlePayment = async (plan) => {
    if (paying) return;
    setSelectedPlan(plan);
    setPaying(true);

    try {
      const orderRes = await privateCallAPI.createPurchaseOrder(plan.id);
      const { key_id, order } = orderRes.data;

      const options = {
        key: key_id,
        order_id: order.id,
        amount: order.amount,
        currency: order.currency,
        name: 'KaroAlert',
        description: purchaseType === 'owner_service' ? `${plan.name} - Owner Service` : `${plan.name} - Call Seconds`,
        prefill: { name: '', email: '', contact: '' },
        notes: { plan_id: String(plan.id), type: purchaseType },
        theme: { color: '#1565C0' },
      };

      if (Platform.OS === 'web') {
        if (!window.Razorpay) {
          await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://checkout.razorpay.com/v1/checkout.js';
            script.onload = resolve;
            script.onerror = () => reject(new Error('Unable to load Razorpay'));
            document.body.appendChild(script);
          });
        }
        await new Promise((resolve, reject) => {
          const checkout = new window.Razorpay({
            ...options,
            handler: async (payment) => {
              try {
                await processSuccess(payment, plan);
                resolve();
              } catch (e) { reject(e); }
            },
            modal: { ondismiss: () => reject(new Error('Payment cancelled')) },
          });
          checkout.open();
        });
      } else {
        if (isExpoGo) {
          throw new Error('Payment needs a development build');
        }
        const module = await import('react-native-webview');
        setCheckoutWebView(() => module.WebView || module.default);
        const payment = await new Promise((resolve, reject) => {
          checkoutPromiseRef.current = { resolve, reject };
          setCheckoutHtml(buildRazorpayHtml(options));
        });
        await processSuccess(payment, plan);
      }
    } catch (error) {
      Alert.alert('Payment Failed', error.message || 'Payment was cancelled');
    } finally {
      setPaying(false);
      setSelectedPlan(null);
    }
  };

  const processSuccess = async (payment, plan) => {
    try {
      await privateCallAPI.recordPurchaseSuccess({
        razorpay_payment_id: payment.razorpay_payment_id,
        razorpay_order_id: payment.razorpay_order_id,
        razorpay_signature: payment.razorpay_signature,
        plan_id: plan.id,
        type: purchaseType,
      });
      Alert.alert('Success', 'Payment successful!', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (error) {
      if (error.response?.status === 409) {
        Alert.alert('Already Processed', 'This payment was already processed.');
      } else {
        throw error;
      }
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
      if (data.type === 'success') pending.resolve(data.payment);
      else if (data.type === 'cancel') pending.reject(new Error('Payment cancelled'));
      else pending.reject(new Error(data.message || 'Payment failed'));
    } catch (error) {
      const pending = checkoutPromiseRef.current;
      closeCheckout();
      pending?.reject?.(error);
    }
  };

  const adminTabs = user?.is_admin
    ? FOOTER_TABS.filter(t => t.key !== 'Plan')
    : FOOTER_TABS.filter(t => t.key !== 'Admin');

  if (loading) {
    return (
      <View style={styles.loadingScreen}>
        <Appbar.Header style={styles.headerBar}>
          <Appbar.BackAction color="#fff" onPress={() => navigation.goBack()} />
          <Appbar.Content title={purchaseType === 'owner_service' ? 'Activate Owner Service' : 'Buy Call Seconds'} color="#fff" />
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
        <Appbar.Content title={purchaseType === 'owner_service' ? 'Activate Owner Service' : 'Buy Call Seconds'} color="#fff" />
      </Appbar.Header>

      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Modal visible={!!checkoutHtml} animationType="slide" onRequestClose={closeCheckout}>
          <View style={styles.checkoutHeader}>
            <Text style={styles.checkoutTitle}>Payment</Text>
            <TouchableOpacity style={styles.checkoutClose} onPress={() => {
              const pending = checkoutPromiseRef.current;
              closeCheckout();
              pending?.reject?.(new Error('Payment cancelled'));
            }}>
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

        <View style={styles.header}>
          <Ionicons name="cart-outline" size={28} color="#fff" />
          <Text style={styles.headerTitle}>
            {purchaseType === 'owner_service' ? 'Activate Owner Service' : 'Buy Call Seconds'}
          </Text>
          <Text style={styles.headerSub}>
            {purchaseType === 'owner_service'
              ? 'Recharge to let others call you privately via Private Call'
              : 'Purchase seconds to make private calls'}
          </Text>
        </View>

        {plans.map((plan) => (
          <Card key={plan.id} style={styles.planCard}>
            <Card.Content>
              <View style={styles.planHeader}>
                <View style={styles.planIcon}>
                  <Ionicons name="timer" size={24} color="#1565C0" />
                </View>
                <View style={styles.planInfo}>
                  <Text style={styles.planName}>{plan.name}</Text>
                  {plan.description ? <Text style={styles.planDesc}>{plan.description}</Text> : null}
                </View>
              </View>

              <View style={styles.planDetails}>
                <View style={styles.planDetailItem}>
                  <Text style={styles.planDetailLabel}>Price</Text>
                  <Text style={styles.planDetailValue}>Rs {plan.price}</Text>
                </View>
                <View style={styles.planDetailItem}>
                  <Text style={styles.planDetailLabel}>Display Time</Text>
                  <Text style={styles.planDetailValue}>{plan.display_minutes} Minutes</Text>
                </View>
                <View style={styles.planDetailItem}>
                  <Text style={styles.planDetailLabel}>Actual Balance</Text>
                  <Text style={styles.planDetailValue}>{plan.actual_seconds} Seconds</Text>
                </View>
              </View>

              <Button
                mode="contained"
                buttonColor="#1565C0"
                textColor="#fff"
                style={styles.buyBtn}
                loading={paying && selectedPlan?.id === plan.id}
                disabled={paying}
                onPress={() => handlePayment(plan)}
              >
                {paying && selectedPlan?.id === plan.id ? 'Processing...' : `Buy Now - Rs ${plan.price}`}
              </Button>
            </Card.Content>
          </Card>
        ))}

        {plans.length === 0 && (
          <View style={styles.emptyBox}>
            <Ionicons name="alert-circle-outline" size={32} color="#9CA3AF" />
            <Text style={styles.emptyText}>No plans available</Text>
          </View>
        )}
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
  headerSub: { color: '#90CAF9', fontSize: 13, textAlign: 'center', marginTop: 4, lineHeight: 18 },
  planCard: { margin: 16, marginBottom: 0, borderRadius: 12, backgroundColor: '#fff', elevation: 2 },
  planHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  planIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#E8EAF6', justifyContent: 'center', alignItems: 'center' },
  planInfo: { flex: 1 },
  planName: { fontSize: 16, fontWeight: '800', color: '#111827' },
  planDesc: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  planDetails: { gap: 8, marginBottom: 14, backgroundColor: '#F9FAFB', borderRadius: 8, padding: 12 },
  planDetailItem: { flexDirection: 'row', justifyContent: 'space-between' },
  planDetailLabel: { fontSize: 13, color: '#6B7280', fontWeight: '600' },
  planDetailValue: { fontSize: 13, color: '#111827', fontWeight: '700' },
  buyBtn: { borderRadius: 8 },
  checkoutHeader: {
    height: 56, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  checkoutTitle: { color: '#111827', fontSize: 16, fontWeight: '800' },
  checkoutClose: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#E8EAF6', justifyContent: 'center', alignItems: 'center' },
  emptyBox: { alignItems: 'center', marginTop: 40 },
  emptyText: { color: '#9CA3AF', fontSize: 14, marginTop: 8 },
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

export default PurchasePlanScreen;
