import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  Modal,
  Image,
  Share,
  RefreshControl,
  Platform,
  TouchableOpacity,
  KeyboardAvoidingView,
} from 'react-native';
import {
  Card,
  Title,
  Paragraph,
  Button,
  FAB,
  TextInput,
  ActivityIndicator,
  IconButton,
  Chip,
  Switch,
} from 'react-native-paper';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Constants from 'expo-constants';
import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';
import { vehiclesAPI, qrAPI, scanAPI, authAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import authStorage from '../utils/authStorage';

const ICONS = {
  Car: 'car',
  SUV: 'car-sport',
  Truck: 'truck',
  Motorcycle: 'bicycle',
  Van: 'car',
  Bus: 'bus',
  Bicycle: 'bicycle',
};

const TYPE_COLORS = {
  Car: '#1565C0',
  SUV: '#9C27B0',
  Truck: '#FF9800',
  Motorcycle: '#4CAF50',
  Van: '#00BCD4',
  Bus: '#F44336',
  Bicycle: '#795548',
  Other: '#607D8B',
};

const getVehicleIcon = (type) => ICONS[type] || 'car';

const QR_ORIENTATIONS = [
  { key: 'portrait', label: 'Vertical', icon: 'arrow-expand-vertical' },
  { key: 'landscape', label: 'Horizontal', icon: 'arrow-expand-horizontal' },
];

const QR_BRAND = 'KARO ALERT';
const QR_TAGLINE = 'SCAN TO ALERT & PROTECT';
const QR_CASE_PARKING_TITLE = 'Wrong Parking?';
const QR_CASE_PARKING_DESC = 'Scan to notify the owner';
const QR_CASE_EMERGENCY_TITLE = 'Accident / Emergency?';
const QR_CASE_EMERGENCY_DESC = 'Scan to alert emergency contact';
const QR_CASES_HI = 'गलत पार्किंग हो या दुर्घटना — QR स्कैन करें और सूचित करें।';
const QR_HINT = 'Download & stick this QR on your car or bike';
const QR_POWERED_BY = 'Powered by DITS Company';
const isExpoGo = Constants.appOwnership === 'expo';

const captureQrCard = async (ref, options) => {
  if (isExpoGo && Platform.OS !== 'web') {
    throw new Error('Image export needs a development build. Use PDF export in Expo Go.');
  }

  const { captureRef } = await import('react-native-view-shot');
  return captureRef(ref, options);
};

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const VehiclesScreen = ({ navigation }) => {
  const { user, setUser } = useAuth();
  const [vehicles, setVehicles] = useState([]);
  const [scans, setScans] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [selectedScans, setSelectedScans] = useState([]);
  const [qrImage, setQrImage] = useState(null);
  const [generatingQR, setGeneratingQR] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadComplete, setDownloadComplete] = useState(false);
  const [qrOrientation, setQrOrientation] = useState('landscape');
  const [qrSize, setQrSize] = useState('premium');
  const qrCardRef = useRef(null);

  const [formData, setFormData] = useState({
    vehicle_type: 'Car',
    vehicle_number: '',
    owner_name: '',
    mobile_number: '',
    hide_mobile_number: false,
    emergency_number: '',
    hide_emergency_number: false,
  });
  const [formErrors, setFormErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const isPlanExpired = user?.membership_expires_at
    ? new Date(user.membership_expires_at) <= new Date()
    : false;

  useEffect(() => {
    loadVehicles();
  }, []);

  const loadVehicles = async () => {
    try {
      const [vehRes, scanRes, notifRes] = await Promise.all([
        vehiclesAPI.getVehicles(),
        scanAPI.getMyScans().catch(() => ({ data: { scans: [] } })),
        scanAPI.getNotifications().catch(() => ({ data: { notifications: [] } })),
      ]);
      setVehicles(vehRes.data.vehicles);
      setScans(scanRes.data.scans || []);
      setNotifications(notifRes.data.notifications || []);
    } catch (error) {
      console.error('Error loading vehicles:', error);
      Alert.alert('Error', 'Failed to load vehicles');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadVehicles();
  }, []);

  const validateForm = () => {
    const errors = {};
    if (!formData.vehicle_type.trim()) {
      errors.vehicle_type = 'Vehicle type is required';
    }
    if (!formData.vehicle_number.trim()) {
      errors.vehicle_number = 'Vehicle number is required';
    } else if (formData.vehicle_number.trim().length < 2) {
      errors.vehicle_number = 'Vehicle number must be at least 2 characters';
    }
    if (!formData.owner_name.trim()) {
      errors.owner_name = 'Owner name is required';
    } else if (formData.owner_name.trim().length < 2) {
      errors.owner_name = 'Owner name must be at least 2 characters';
    }
    const mobileDigits = formData.mobile_number.replace(/\D/g, '');
    if (!mobileDigits) {
      errors.mobile_number = 'Mobile number is required';
    } else if (!/^\d{10}$/.test(mobileDigits)) {
      errors.mobile_number = 'Mobile number must be exactly 10 digits';
    }
    const emergencyDigits = formData.emergency_number.replace(/\D/g, '');
    if (emergencyDigits && !/^\d{10}$/.test(emergencyDigits)) {
      errors.emergency_number = 'Emergency number must be exactly 10 digits';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleAddVehicle = async () => {
    if (!validateForm()) return;
    setSubmitting(true);
    try {
      const vehiclePayload = {
        vehicle_type: formData.vehicle_type,
        vehicle_number: formData.vehicle_number,
        owner_name: formData.owner_name,
        mobile_number: formData.mobile_number.replace(/\D/g, ''),
        emergency_number: formData.emergency_number.replace(/\D/g, '') || null,
      };

      const response = await vehiclesAPI.createVehicle(vehiclePayload);
      const createdVehicle = response.data?.vehicle || response.data?.data?.vehicle;
      if (createdVehicle?.id && (formData.hide_mobile_number || formData.hide_emergency_number)) {
        await vehiclesAPI.updateVehicle(createdVehicle.id, {
          hide_mobile_number: formData.hide_mobile_number,
          hide_emergency_number: formData.hide_emergency_number,
        }).catch((privacyError) => {
          console.warn('Vehicle added, but privacy update failed:', privacyError.response?.data || privacyError.message);
        });
      }

      setShowAddModal(false);
      resetForm();
      loadVehicles();
    } catch (error) {
      const errorMessage = error.response?.data?.error ||
        error.response?.data?.errors?.[0]?.msg ||
        'Failed to add vehicle';
      Alert.alert('Error', errorMessage);
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData({
      vehicle_type: 'Car',
      vehicle_number: '',
      owner_name: '',
      mobile_number: '',
      hide_mobile_number: false,
      emergency_number: '',
      hide_emergency_number: false,
    });
    setFormErrors({});
  };

  const handleGenerateQR = async (vehicle) => {
    setSelectedVehicle(vehicle);
    setGeneratingQR(true);
    try {
      const profileRes = await authAPI.getProfile();
      const latestUser = profileRes.data.user;
      setUser(latestUser);
      await authStorage.storeUser(latestUser);

      if (latestUser.membership_status !== 'active' || !latestUser.can_create_qr) {
        Alert.alert(
          'Plan Required',
          'Your membership is inactive. Please activate the Rs 499 plan to create up to 3 QR codes.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'View Plan', onPress: () => navigation.navigate('Plan') },
          ]
        );
        return;
      }

      const response = await qrAPI.generateQR(vehicle.id);
      setQrImage(response.data.qr_code.qr_image);
      setShowQRModal(true);
      loadVehicles();
    } catch (error) {
      const errorMessage = error.response?.data?.error || 'Failed to generate QR code';
      if (error.response?.data?.code === 'QR_LIMIT_REACHED') {
        Alert.alert('QR Limit Reached', errorMessage);
      } else if (error.response?.status === 403 || error.response?.data?.code === 'MEMBERSHIP_REQUIRED') {
        Alert.alert('Plan Required', errorMessage, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'View Plan', onPress: () => navigation.navigate('Plan') },
        ]);
      } else {
        Alert.alert('Error', errorMessage);
      }
    } finally {
      setGeneratingQR(false);
    }
  };

  const handleShareQR = async () => {
    if (!qrImage || !selectedVehicle) return;

    try {
      const safeName = getQrSafeName();
      const baseName = `QR_${safeName}_${qrOrientation}_${qrSize}`;

      if (Platform.OS === 'web') {
        const source = `data:text/html;charset=utf-8,${encodeURIComponent(buildQrExportHtml())}`;
        const link = document.createElement('a');
        link.download = `${baseName}.html`;
        link.href = source;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
      }

      const pdf = await Print.printToFileAsync({
        html: buildQrExportHtml(),
      });
      const fileUri = pdf.uri;

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/pdf',
          UTI: 'com.adobe.pdf',
          dialogTitle: 'Share QR Tag',
        });
      } else {
        await Share.share({
          title: 'QR Tag',
          url: fileUri,
        });
      }
    } catch (error) {
      console.error('Error sharing QR code:', error);
      Alert.alert('Error', 'Failed to share QR code: ' + error.message);
    }
  };

  const getQrSafeName = () => {
    if (!selectedVehicle) return 'Vehicle';
    return `${selectedVehicle.vehicle_type}_${selectedVehicle.vehicle_number || 'Vehicle'}`
      .replace(/[^a-z0-9_-]+/gi, '_')
      .replace(/^_+|_+$/g, '') || 'Vehicle';
  };

  const buildQrExportHtml = (orientation = qrOrientation, size = qrSize) => {
    const vehicle = selectedVehicle;
    const accentColor = TYPE_COLORS[vehicle.vehicle_type] || '#1565C0';
    const number = escapeHtml(vehicle.vehicle_number || 'N/A');
    const type = escapeHtml(vehicle.vehicle_type || 'Vehicle');
    const poweredBy = escapeHtml(QR_POWERED_BY);
    const isPremium = size === 'premium';
    const isLandscape = orientation === 'landscape';
    const classes = ['tag', orientation, size].join(' ');

    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>KaroAlert - ${type} ${number}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 24px; background: #eef2f7; color: #111827; font-family: Arial, Helvetica, sans-serif; }
    .sheet { min-height: calc(100vh - 48px); display: grid; place-items: center; }
    .card { background: #fff; border: 2px dashed #cbd5e1; overflow: hidden; box-shadow: 0 18px 40px rgba(15,23,42,.16); display: flex; flex-direction: column; }
    .card.premium { border: 2px solid #d4af37; }
    .tag { width: 92mm; border-radius: 16px; }
    .tag.landscape { width: 148mm; flex-direction: row-reverse; flex-wrap: wrap; }
    .windshield { width: 148mm; min-height: 105mm; border-radius: 18px; }
    .windshield.portrait { width: 105mm; }
    .sticker { width: 58mm; border-radius: 12px; }
    .sticker.landscape { width: 120mm; }
    .header { background: #0f172a; color: #fff; padding: 10px 14px; width: 100%; display: flex; justify-content: center; }
    .card.premium .header { background: linear-gradient(135deg, #0f172a, #1e3a8a); }
    .brandRow { display: inline-flex; align-items: center; gap: 8px; }
    .brandIcon { width: 22px; height: 22px; }
    .sticker .brandIcon { width: 16px; height: 16px; }
    .brand { font-size: 15px; font-weight: 800; letter-spacing: 2px; line-height: 1.1; }
    .sub { margin-top: 2px; color: #94a3b8; font-size: 8px; letter-spacing: 2px; }
    .premiumBadge { display: inline-flex; align-items: center; gap: 3px; margin-left: 10px; background: #ffd700; color: #0f172a; font-size: 7px; font-weight: 800; letter-spacing: 1px; padding: 2px 7px; border-radius: 20px; }
    .qrArea { display: flex; justify-content: center; align-items: center; padding: 18px; background: #f8fafc; }
    .qrBox { display: flex; flex-direction: column; align-items: center; gap: 10px; }
    .card.premium .qrArea { background: #fffdf5; }
    .tag .qr { width: 56mm; height: 56mm; }
    .tag.premium .qr { width: 64mm; height: 64mm; }
    .tag.landscape .qr { width: 50mm; height: 50mm; }
    .tag.landscape.premium .qr { width: 56mm; height: 56mm; }
    .windshield .qr { width: 50mm; height: 50mm; }
    .qrinfo { display: none; color: ${accentColor}; font-size: 16px; font-weight: 900; letter-spacing: 1px; text-align: center; }
    .landscape .qrinfo { display: block; }
    .landscape .details { display: none; }
    .sticker .qr { width: 44mm; height: 44mm; }
    .main { padding: 12px 16px 14px; }
    .sticker .main { padding: 8px 10px 10px; }
    .landscape .main { flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 14px; padding: 18px; }
    .landscape .qrArea { width: 58%; border-left: 1px solid #e5e7eb; }
    .landscape.sticker .qrArea { width: 56%; }
    .details { text-align: center; }
    .vehicle { color: ${accentColor}; font-size: 22px; font-weight: 900; letter-spacing: 1px; }
    .tag .vehicle { font-size: 20px; }
    .sticker .vehicle { font-size: 14px; }
    .usecases { display: grid; gap: 8px; }
    .sticker .usecases { display: none; }
    .case { display: flex; align-items: center; gap: 10px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 8px 10px; }
    .caseIcon { font-size: 18px; }
    .caseTitle { font-size: 12px; font-weight: 800; color: #1e293b; }
    .caseDesc { font-size: 11px; color: #475569; margin-top: 1px; }
    .hintHi { margin-top: 4px; text-align: center; color: #64748b; font-size: 10px; }
    .footer { border-top: 1px solid #e5e7eb; background: #f8fafc; color: #64748b; padding: 9px 12px; text-align: center; font-size: 10px; font-weight: 700; width: 100%; }
    .card.premium .footer { background: #fffaf0; border-top-color: #e9d8a6; }
    .footSep { margin: 0 6px; color: #cbd5e1; }
    .sticker .footSep, .sticker .footHint { display: none; }
    @media print {
      body { padding: 0; background: #fff; }
      .sheet { min-height: 100vh; }
      .card { box-shadow: none; break-inside: avoid; }
    }
  </style>
</head>
<body>
  <main class="sheet">
    <section class="card ${classes}">
      <header class="header">
        <div class="brandRow">
          <svg class="brandIcon" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2l8 3v6c0 5-3.5 8.5-8 11-4.5-2.5-8-6-8-11V5l8-3z"/>
            <path d="M9 12l2 2 4-4"/>
          </svg>
          <div>
            <div class="brand">${QR_BRAND}</div>
            <div class="sub">${QR_TAGLINE}</div>
          </div>
          ${isPremium ? '<div class="premiumBadge">👑 PREMIUM</div>' : ''}
        </div>
      </header>
      <div class="qrArea">
        <div class="qrBox">
          <img class="qr" src="${qrImage}" alt="Vehicle QR code" />
          <div class="qrinfo">${type} - ${number}</div>
        </div>
      </div>
      <div class="main">
        <div class="details">
          <div class="vehicle">${type} - ${number}</div>
        </div>
        <div class="usecases">
          <div class="case">
            <div class="caseIcon">⚠️</div>
            <div class="caseText">
              <div class="caseTitle">${QR_CASE_PARKING_TITLE}</div>
              <div class="caseDesc">${QR_CASE_PARKING_DESC}</div>
            </div>
          </div>
          <div class="case">
            <div class="caseIcon">🚨</div>
            <div class="caseText">
              <div class="caseTitle">${QR_CASE_EMERGENCY_TITLE}</div>
              <div class="caseDesc">${QR_CASE_EMERGENCY_DESC}</div>
            </div>
          </div>
          <div class="hintHi">${QR_CASES_HI}</div>
        </div>
      </div>
      <footer class="footer">
        <span class="footHint">📲 ${QR_HINT}</span>
        <span class="footSep">•</span>
        <span>${poweredBy}</span>
      </footer>
    </section>
  </main>
</body>
</html>`;
  };

  const handleDownloadQR = async () => {
    if (!qrImage || !selectedVehicle || downloading) return;
    setDownloading(true);
    try {
      const safeName = getQrSafeName();
      const filename = `QR_${safeName}_${qrOrientation}_${qrSize}.jpg`;

      if (Platform.OS === 'web') {
        const link = document.createElement('a');
        link.download = filename;
        link.href = await captureQrCard(qrCardRef, {
          format: 'jpg',
          quality: 0.95,
          result: 'data-uri',
        });
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setDownloadComplete(true);
        setTimeout(() => setDownloadComplete(false), 2000);
        return;
      }

      const capturedUri = await captureQrCard(qrCardRef, {
        format: 'jpg',
        quality: 0.95,
        result: 'tmpfile',
      });

      if (!(await MediaLibrary.isAvailableAsync())) {
        throw new Error('Gallery is not available on this device.');
      }

      const permission = await MediaLibrary.requestPermissionsAsync(true, ['photo']);
      if (!permission.granted) {
        Alert.alert(
          'Gallery Permission Required',
          'Please allow KaroAlert to save photos, then tap Download again.'
        );
        return;
      }

      await MediaLibrary.saveToLibraryAsync(capturedUri);
      setDownloadComplete(true);
      setTimeout(() => setDownloadComplete(false), 2000);
      Alert.alert('Saved to Gallery', 'The complete QR card was saved as a JPEG.');
    } catch (error) {
      console.error('Error downloading QR code:', error);
      Alert.alert('Save Failed', error.message || 'Could not save the QR card to Gallery.');
    } finally {
      setDownloading(false);
    }
  };

  const handleDeleteVehicle = (vehicle) => {
    Alert.alert(
      'Delete Vehicle',
      `Remove ${vehicle.vehicle_type} (${vehicle.vehicle_number || 'N/A'})? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await vehiclesAPI.deleteVehicle(vehicle.id);
              loadVehicles();
            } catch (error) {
              Alert.alert('Error', error.response?.data?.error || 'Failed to delete vehicle');
            }
          },
        },
      ]
    );
  };

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

  const vehicleScans = (vehicleId) =>
    scans.filter((s) => s.vehicle_id === vehicleId);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1565C0" />
        <Text style={styles.loadingText}>Loading vehicles...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {vehicles.length === 0 ? (
        <ScrollView
          contentContainerStyle={styles.emptyContainer}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1565C0']} />
          }
        >
          <View style={styles.emptyIconWrap}>
            <Ionicons name="car-outline" size={64} color="#B0BEC5" />
          </View>
          <Title style={styles.emptyTitle}>No Vehicles Yet</Title>
          <Paragraph style={styles.emptyText}>
            Add your first vehicle to generate QR codes and start receiving parking alerts.
          </Paragraph>
          <Button
            mode="contained"
            textColor="#fff"
            onPress={() => setShowAddModal(true)}
            style={styles.emptyButton}
            icon="plus"
          >
            Add Your First Vehicle
          </Button>
        </ScrollView>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1565C0']} />
          }
        >
          <View style={styles.sectionHeader}>
            <Title style={styles.sectionTitle}>My Vehicles</Title>
            <Chip icon="car" mode="flat" style={styles.countChip}>
              {vehicles.length} {vehicles.length === 1 ? 'vehicle' : 'vehicles'}
            </Chip>
          </View>

          {vehicles.map((vehicle) => {
            const accentColor = TYPE_COLORS[vehicle.vehicle_type] || '#1565C0';
            return (
              <TouchableOpacity
                key={vehicle.id}
                activeOpacity={0.95}
                onLongPress={() => handleDeleteVehicle(vehicle)}
              >
                <Card style={styles.vehicleCard}>
                  <View style={[styles.accentBar, { backgroundColor: accentColor }]} />
                  <Card.Content style={styles.cardContent}>
                    <View style={styles.cardTop}>
                      <View style={[styles.iconCircle, { backgroundColor: accentColor + '20' }]}>
                        <Ionicons
                          name={getVehicleIcon(vehicle.vehicle_type)}
                          size={24}
                          color={accentColor}
                        />
                      </View>
                      <View style={styles.cardInfo}>
                        <View style={styles.typeRow}>
                          <Text style={styles.vehicleType}>{vehicle.vehicle_type}</Text>
                          {vehicle.qr_codes && vehicle.qr_codes.length > 0 && (
                            <View style={[styles.qrBadge, { backgroundColor: accentColor }]}>
                              <Ionicons name="checkmark-circle" size={12} color="#fff" />
                              <Text style={styles.qrBadgeText}>QR Active</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.vehicleNumber}>
                          <Ionicons name="receipt-outline" size={14} color="#666" />
                          {'  '}{vehicle.vehicle_number || 'No Number'}
                        </Text>
                      </View>
                      <View style={styles.cardActions}>
                        <IconButton
                          icon="qrcode"
                          size={22}
                          iconColor={accentColor}
                          onPress={() => handleGenerateQR(vehicle)}
                          disabled={generatingQR}
                          style={styles.actionBtn}
                        />
                        <IconButton
                          icon="trash-can-outline"
                          size={22}
                          iconColor="#EF5350"
                          onPress={() => handleDeleteVehicle(vehicle)}
                          style={styles.actionBtn}
                        />
                      </View>
                    </View>
                    <View style={styles.divider} />
                    <View style={styles.cardBottom}>
                      <View style={styles.detailItem}>
                        <Ionicons name="person-outline" size={14} color="#888" />
                        <Text style={styles.detailText}>
                          {vehicle.owner_name || 'No Owner'}
                        </Text>
                      </View>
                      <View style={styles.detailItem}>
                        <Ionicons name="call-outline" size={14} color="#888" />
                        <Text style={styles.detailText}>
                          {vehicle.mobile_number || 'No Mobile'}
                        </Text>
                      </View>
                      <View style={styles.detailItem}>
                        <Ionicons name="medical-outline" size={14} color="#888" />
                        <Text style={styles.detailText}>
                          {vehicle.emergency_number || 'No Emergency'}
                        </Text>
                      </View>
                      <View style={[
                        styles.privacyBadge,
                        vehicle.hide_mobile_number ? styles.privacyBadgeHidden : styles.privacyBadgePublic,
                      ]}>
                        <Ionicons
                          name={vehicle.hide_mobile_number ? 'eye-off-outline' : 'eye-outline'}
                          size={12}
                          color={vehicle.hide_mobile_number ? '#7B1FA2' : '#2E7D32'}
                        />
                        <Text style={[
                          styles.privacyBadgeText,
                          vehicle.hide_mobile_number ? styles.privacyBadgeTextHidden : styles.privacyBadgeTextPublic,
                        ]}>
                          {vehicle.hide_mobile_number ? 'Hidden from scanners' : 'Visible to scanners'}
                        </Text>
                      </View>
                      {vehicle.emergency_number && (
                        <View style={[
                          styles.privacyBadge,
                          vehicle.hide_emergency_number ? styles.privacyBadgeHidden : styles.privacyBadgeEmergency,
                        ]}>
                          <Ionicons
                            name={vehicle.hide_emergency_number ? 'eye-off-outline' : 'medical-outline'}
                            size={12}
                            color={vehicle.hide_emergency_number ? '#7B1FA2' : '#D84315'}
                          />
                          <Text style={[
                            styles.privacyBadgeText,
                            vehicle.hide_emergency_number ? styles.privacyBadgeTextHidden : styles.privacyBadgeTextEmergency,
                          ]}>
                            {vehicle.hide_emergency_number ? 'Emergency hidden' : 'Emergency visible'}
                          </Text>
                        </View>
                      )}
                      {vehicle.vehicle_model && (
                        <View style={styles.detailItem}>
                          <Ionicons name="options-outline" size={14} color="#888" />
                          <Text style={styles.detailText}>{vehicle.vehicle_model}</Text>
                        </View>
                      )}
                      {vehicle.vehicle_color && (
                        <View style={styles.detailItem}>
                          <View style={[styles.colorDot, { backgroundColor: vehicle.vehicle_color.toLowerCase() }]} />
                          <Text style={styles.detailText}>{vehicle.vehicle_color}</Text>
                        </View>
                      )}
                    </View>
                  </Card.Content>
                </Card>
              </TouchableOpacity>
            );
          })}

          <View style={styles.bottomSpacer} />
        </ScrollView>
      )}

      {vehicles.length > 0 && (
        <FAB
          style={styles.fab}
          icon="plus"
          onPress={() => setShowAddModal(true)}
          label="Add Vehicle"
          size="medium"
          color="white"
        />
      )}

      {/* Add Vehicle Modal */}
      <Modal
        visible={showAddModal}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <KeyboardAvoidingView
          style={styles.modalContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalHeader}>
            <View style={styles.modalHeaderLeft}>
              <View style={styles.modalIconWrap}>
                <Ionicons name="car" size={20} color="#fff" />
              </View>
              <Text style={styles.modalTitle}>Add New Vehicle</Text>
            </View>
            <TouchableOpacity
              onPress={() => { setShowAddModal(false); resetForm(); }}
              style={styles.modalCloseBtn}
            >
              <Ionicons name="close" size={22} color="#fff" />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.formContainer}
            contentContainerStyle={styles.formContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.formSectionLabel}>Vehicle Type</Text>
            <View style={[
              styles.inputWrap,
              formErrors.vehicle_type && styles.inputWrapError,
            ]}>
              <Ionicons name="car-outline" size={18} color="#5C6BC0" style={styles.inputIcon} />
              <TextInput
                value={formData.vehicle_type}
                onChangeText={(text) => setFormData({ ...formData, vehicle_type: text })}
                mode="flat"
                autoCapitalize="words"
                placeholder="e.g. Car, SUV, Truck"
                placeholderTextColor="#B0BEC5"
                error={!!formErrors.vehicle_type}
                style={styles.inputField}
                underlineStyle={styles.inputUnderline}
                theme={{ colors: { onSurface: '#1C1C1E', primary: '#1565C0', placeholder: '#B0BEC5' } }}
              />
            </View>
            {formErrors.vehicle_type && (
              <Text style={styles.errorText}>{formErrors.vehicle_type}</Text>
            )}

            <Text style={styles.formSectionLabel}>Vehicle Number</Text>
            <View style={[
              styles.inputWrap,
              formErrors.vehicle_number && styles.inputWrapError,
            ]}>
              <Ionicons name="receipt-outline" size={18} color="#5C6BC0" style={styles.inputIcon} />
              <TextInput
                value={formData.vehicle_number}
                onChangeText={(text) => setFormData({ ...formData, vehicle_number: text })}
                mode="flat"
                autoCapitalize="characters"
                placeholder="e.g. ABC 1234"
                placeholderTextColor="#B0BEC5"
                error={!!formErrors.vehicle_number}
                style={styles.inputField}
                underlineStyle={styles.inputUnderline}
                theme={{ colors: { onSurface: '#1C1C1E', primary: '#1565C0', placeholder: '#B0BEC5' } }}
              />
            </View>
            {formErrors.vehicle_number && (
              <Text style={styles.errorText}>{formErrors.vehicle_number}</Text>
            )}

            <Text style={styles.formSectionLabel}>Owner Name</Text>
            <View style={[
              styles.inputWrap,
              formErrors.owner_name && styles.inputWrapError,
            ]}>
              <Ionicons name="person-outline" size={18} color="#5C6BC0" style={styles.inputIcon} />
              <TextInput
                value={formData.owner_name}
                onChangeText={(text) => setFormData({ ...formData, owner_name: text })}
                mode="flat"
                autoCapitalize="words"
                placeholder="Full name"
                placeholderTextColor="#B0BEC5"
                error={!!formErrors.owner_name}
                style={styles.inputField}
                underlineStyle={styles.inputUnderline}
                theme={{ colors: { onSurface: '#1C1C1E', primary: '#1565C0', placeholder: '#B0BEC5' } }}
              />
            </View>
            {formErrors.owner_name && (
              <Text style={styles.errorText}>{formErrors.owner_name}</Text>
            )}

            <Text style={styles.formSectionLabel}>Mobile Number</Text>
            <View style={[
              styles.inputWrap,
              formErrors.mobile_number && styles.inputWrapError,
            ]}>
              <Ionicons name="call-outline" size={18} color="#5C6BC0" style={styles.inputIcon} />
              <TextInput
                value={formData.mobile_number}
                onChangeText={(text) => setFormData({ ...formData, mobile_number: text.replace(/\D/g, '').slice(0, 10) })}
                mode="flat"
                keyboardType="phone-pad"
                maxLength={10}
                placeholder="e.g. 9876543210"
                placeholderTextColor="#B0BEC5"
                error={!!formErrors.mobile_number}
                style={styles.inputField}
                underlineStyle={styles.inputUnderline}
                theme={{ colors: { onSurface: '#1C1C1E', primary: '#1565C0', placeholder: '#B0BEC5' } }}
              />
            </View>
            {formErrors.mobile_number && (
              <Text style={styles.errorText}>{formErrors.mobile_number}</Text>
            )}

            <View style={styles.privacyRow}>
              <View style={styles.privacyInfo}>
                <Text style={styles.privacyTitle}>Hide mobile number</Text>
                <Text style={styles.privacyDesc}>Scanners can use Alert or App Call without seeing your number.</Text>
              </View>
              <Switch
                value={formData.hide_mobile_number}
                onValueChange={(value) => setFormData({ ...formData, hide_mobile_number: value })}
              />
            </View>

            <Text style={styles.formSectionLabel}>Emergency Number</Text>
            <View style={[
              styles.inputWrap,
              formErrors.emergency_number && styles.inputWrapError,
            ]}>
              <Ionicons name="medical-outline" size={18} color="#5C6BC0" style={styles.inputIcon} />
              <TextInput
                value={formData.emergency_number}
                onChangeText={(text) => setFormData({ ...formData, emergency_number: text.replace(/\D/g, '').slice(0, 10) })}
                mode="flat"
                keyboardType="phone-pad"
                maxLength={10}
                placeholder="Optional emergency contact"
                placeholderTextColor="#B0BEC5"
                error={!!formErrors.emergency_number}
                style={styles.inputField}
                underlineStyle={styles.inputUnderline}
                theme={{ colors: { onSurface: '#1C1C1E', primary: '#1565C0', placeholder: '#B0BEC5' } }}
              />
            </View>
            {formErrors.emergency_number && (
              <Text style={styles.errorText}>{formErrors.emergency_number}</Text>
            )}

            <View style={styles.privacyRow}>
              <View style={styles.privacyInfo}>
                <Text style={styles.privacyTitle}>Hide emergency number</Text>
                <Text style={styles.privacyDesc}>Scanners will not see this emergency contact when enabled.</Text>
              </View>
              <Switch
                value={formData.hide_emergency_number}
                onValueChange={(value) => setFormData({ ...formData, hide_emergency_number: value })}
                disabled={!formData.emergency_number}
              />
            </View>

            <TouchableOpacity
              style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
              onPress={handleAddVehicle}
              disabled={submitting}
              activeOpacity={0.85}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={20} color="#fff" />
                  <Text style={styles.submitBtnText}>Add Vehicle</Text>
                </>
              )}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* QR Code Modal - QR Tag Design */}
      <Modal
        visible={showQRModal}
        animationType="fade"
        transparent={true}
        onDismiss={() => setShowQRModal(false)}
      >
        <View style={styles.qrOverlay}>
          <View style={styles.qrModal}>
            <View style={styles.qrModalHeader}>
              <View style={styles.qrModalHeaderLeft}>
                <MaterialCommunityIcons name="qrcode" size={20} color="#333" />
                <Text style={styles.qrModalTitle}>QR Card</Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowQRModal(false)}
                style={styles.qrModalClose}
              >
                <Ionicons name="close" size={20} color="#999" />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.qrModalScroll}
              contentContainerStyle={styles.qrModalScrollContent}
              bounces={false}
              showsVerticalScrollIndicator={false}
            >
              {qrImage && selectedVehicle && (
              <>
                {/* ── Printable Tag Preview ── */}
                <View style={styles.selectorGroup}>
                  <View style={styles.formatSelector}>
                    {QR_ORIENTATIONS.map((orientation) => {
                      const isActive = qrOrientation === orientation.key;
                      return (
                        <TouchableOpacity
                          key={orientation.key}
                          style={[styles.formatOption, isActive && styles.formatOptionActive]}
                          onPress={() => setQrOrientation(orientation.key)}
                          activeOpacity={0.85}
                        >
                          <MaterialCommunityIcons
                            name={orientation.icon}
                            size={17}
                            color={isActive ? '#fff' : '#1565C0'}
                          />
                          <Text style={[styles.formatOptionText, isActive && styles.formatOptionTextActive]}>
                            {orientation.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                <View
                  ref={qrCardRef}
                  collapsable={false}
                  style={[
                    styles.tagCard,
                    qrOrientation === 'landscape' && styles.tagCardLandscape,
                    qrSize === 'premium' && styles.tagCardPremium,
                  ]}
                >
                  <View style={[styles.tagHeader, qrSize === 'premium' && styles.tagHeaderPremium]}>
                    <Ionicons
                      name="shield-checkmark"
                      size={22}
                      color={qrSize === 'premium' ? '#FFD700' : '#fff'}
                    />
                    <View>
                      <Text style={styles.tagHeaderText}>{QR_BRAND}</Text>
                      <Text style={styles.tagHeaderSub}>
                        {QR_TAGLINE}
                      </Text>
                    </View>
                    {qrSize === 'premium' && (
                      <View style={styles.premiumBadge}>
                        <MaterialCommunityIcons name="crown" size={12} color="#0F172A" />
                        <Text style={styles.premiumBadgeText}>PREMIUM</Text>
                      </View>
                    )}
                  </View>

                  <View
                    style={[
                      qrOrientation === 'landscape' ? styles.tagBodyRow : styles.tagColumn,
                      qrOrientation === 'landscape' && styles.tagBodyRowReverse,
                    ]}
                  >
                    <View
                      style={qrOrientation === 'landscape' ? styles.tagQRSide : styles.tagQRWrap}
                    >
                      <Image
                        source={{ uri: qrImage }}
                        style={
                          qrOrientation === 'landscape'
                            ? styles.tagQRLandscape
                            : [
                                styles.tagQR,
                                qrSize === 'premium' && styles.tagQRPremium,
                              ]
                        }
                        resizeMode="contain"
                      />
                      {qrOrientation === 'landscape' && (
                        <Text
                          style={[
                            styles.tagQRLabel,
                            { color: TYPE_COLORS[selectedVehicle.vehicle_type] || '#1565C0' },
                          ]}
                          numberOfLines={1}
                        >
                          {selectedVehicle.vehicle_type} · {selectedVehicle.vehicle_number || 'N/A'}
                        </Text>
                      )}
                    </View>

                    <View
                      style={[
                        styles.tagInfo,
                        qrOrientation === 'landscape' && styles.tagInfoLandscape,
                      ]}
                    >
                      {qrOrientation !== 'landscape' && (
                        <View style={styles.tagVehicleRow}>
                          <Ionicons
                            name={getVehicleIcon(selectedVehicle.vehicle_type)}
                            size={16}
                            color={TYPE_COLORS[selectedVehicle.vehicle_type] || '#1565C0'}
                          />
                          <Text
                            style={[
                              styles.tagVehicleText,
                              { color: TYPE_COLORS[selectedVehicle.vehicle_type] || '#1565C0' },
                            ]}
                          >
                            {selectedVehicle.vehicle_type} · {selectedVehicle.vehicle_number || 'N/A'}
                          </Text>
                        </View>
                      )}

                      <View style={styles.useCaseRow}>
                        <View style={[styles.useCaseIconWrap, styles.useCaseIconWarn]}>
                          <Ionicons name="warning" size={16} color="#FF6D00" />
                        </View>
                        <View style={styles.useCaseText}>
                          <Text style={styles.useCaseTitle}>{QR_CASE_PARKING_TITLE}</Text>
                          <Text style={styles.useCaseDesc}>{QR_CASE_PARKING_DESC}</Text>
                        </View>
                      </View>
                      <View style={styles.useCaseRow}>
                        <View style={[styles.useCaseIconWrap, styles.useCaseIconDanger]}>
                          <Ionicons name="medkit" size={16} color="#D32F2F" />
                        </View>
                        <View style={styles.useCaseText}>
                          <Text style={styles.useCaseTitle}>{QR_CASE_EMERGENCY_TITLE}</Text>
                          <Text style={styles.useCaseDesc}>{QR_CASE_EMERGENCY_DESC}</Text>
                        </View>
                      </View>
                      <Text style={styles.tagInstructionHindi}>{QR_CASES_HI}</Text>
                    </View>
                  </View>

                  <View style={styles.tagFooter}>
                    <Ionicons name="download-outline" size={13} color="#888" />
                    <Text style={styles.tagFooterText}>{QR_HINT}</Text>
                  </View>
                </View>

                {/* ── Download Actions ── */}
                <View style={styles.downloadSection}>
                  <TouchableOpacity
                    style={[styles.downloadBtn, downloading && styles.downloadBtnDisabled]}
                    onPress={handleDownloadQR}
                    disabled={downloading}
                    activeOpacity={0.85}
                  >
                    {downloadComplete ? (
                      <>
                        <MaterialCommunityIcons name="check-circle" size={22} color="#fff" />
                        <Text style={styles.downloadBtnText}>Downloaded!</Text>
                      </>
                    ) : (
                      <>
                        <MaterialCommunityIcons
                          name={downloading ? 'loading' : 'download'}
                          size={22}
                          color="#fff"
                        />
                        <Text style={styles.downloadBtnText}>
                          {downloading
                            ? 'Downloading...'
                            : `Download ${qrSize === 'premium' ? 'Premium ' : ''}QR Tag`}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.shareBtn}
                    onPress={handleShareQR}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="share-social-outline" size={20} color="#555" />
                    <Text style={styles.shareBtnText}>Share</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Scan Activity Modal */}
      <Modal
        visible={showActivityModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onDismiss={() => setShowActivityModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <View style={styles.modalHeaderLeft}>
              <View style={styles.modalIconWrap}>
                <Ionicons name="scan-outline" size={20} color="#fff" />
              </View>
              <Text style={styles.modalTitle}>Scan Activity</Text>
            </View>
            <TouchableOpacity
              onPress={() => setShowActivityModal(false)}
              style={styles.modalCloseBtn}
            >
              <Ionicons name="close" size={22} color="#90CAF9" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.formContainer}>
            {selectedVehicle && (
              <View style={styles.activityVehicleInfo}>
                <View style={[styles.activityIconCircle, { backgroundColor: (TYPE_COLORS[selectedVehicle.vehicle_type] || '#1565C0') + '20' }]}>
                  <Ionicons name={getVehicleIcon(selectedVehicle.vehicle_type)} size={22} color={TYPE_COLORS[selectedVehicle.vehicle_type] || '#1565C0'} />
                </View>
                <View>
                  <Text style={styles.activityVehicleType}>{selectedVehicle.vehicle_type}</Text>
                  <Text style={styles.activityVehicleNumber}>{selectedVehicle.vehicle_number || 'N/A'}</Text>
                </View>
              </View>
            )}

            {selectedScans.length === 0 ? (
              <View style={styles.activityEmpty}>
                <Ionicons name="scan-outline" size={48} color="#B0BEC5" />
                <Text style={styles.activityEmptyTitle}>No Scans Yet</Text>
                <Text style={styles.activityEmptyDesc}>
                  When someone scans your QR code, it will appear here.
                </Text>
              </View>
            ) : (
              <>
                <Text style={styles.activityCount}>
                  {selectedScans.length} scan{selectedScans.length !== 1 ? 's' : ''} recorded
                </Text>
                {selectedScans.map((scan, idx) => (
                  <View key={scan.id || idx} style={styles.activityItem}>
                    <View style={styles.activityItemIcon}>
                      <Ionicons name="scan" size={18} color="#1565C0" />
                    </View>
                    <View style={styles.activityItemInfo}>
                      <Text style={styles.activityItemTime}>
                        {new Date(scan.scanned_at).toLocaleDateString()} {' '}
                        {new Date(scan.scanned_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                      <Text style={styles.activityItemLocation}>
                        {scan.owner_name ? `Scanned by ${scan.owner_name}` : 'QR code scanned'}
                      </Text>
                    </View>
                    <View style={[
                      styles.activityStatusBadge,
                      scan.notification_sent ? styles.activityStatusSent : styles.activityStatusPending,
                    ]}>
                      <Text style={[
                        styles.activityStatusText,
                        scan.notification_sent ? styles.activityStatusTextSent : styles.activityStatusTextPending,
                      ]}>
                        {scan.notification_sent ? 'Alerted' : 'Pending'}
                      </Text>
                    </View>
                  </View>
                ))}
              </>
            )}
          </ScrollView>
        </View>
      </Modal>

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
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyIconWrap: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#ECEFF1',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#37474F',
    marginBottom: 8,
  },
  emptyText: {
    textAlign: 'center',
    color: '#90A4AE',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 28,
    paddingHorizontal: 20,
  },
  emptyButton: {
    borderRadius: 12,
    paddingHorizontal: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  countChip: {
    backgroundColor: '#E3F2FD',
    height: 32,
  },
  vehicleCard: {
    marginBottom: 14,
    borderRadius: 14,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  accentBar: {
    width: '100%',
    height: 4,
  },
  cardContent: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  cardInfo: {
    flex: 1,
  },
  typeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  vehicleType: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  qrBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  qrBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  vehicleNumber: {
    fontSize: 14,
    color: '#666',
    marginTop: 3,
  },
  cardActions: {
    flexDirection: 'row',
    marginLeft: 4,
  },
  actionBtn: {
    margin: 0,
    width: 40,
    height: 40,
  },
  divider: {
    height: 1,
    backgroundColor: '#F0F0F0',
    marginVertical: 12,
  },
  cardBottom: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailText: {
    fontSize: 13,
    color: '#777',
  },
  privacyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  privacyBadgeHidden: {
    backgroundColor: '#F3E5F5',
  },
  privacyBadgePublic: {
    backgroundColor: '#E8F5E9',
  },
  privacyBadgeEmergency: {
    backgroundColor: '#FBE9E7',
  },
  privacyBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  privacyBadgeTextHidden: {
    color: '#7B1FA2',
  },
  privacyBadgeTextPublic: {
    color: '#2E7D32',
  },
  privacyBadgeTextEmergency: {
    color: '#D84315',
  },
  colorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  scanActivityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  scanActivityBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#F5F5F5',
  },
  scanActivityText: {
    fontSize: 13,
    fontWeight: '600',
  },
  scanActivityActions: {
    flexDirection: 'row',
    gap: 8,
  },
  scanTagBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#E8EAF6',
  },
  scanTagBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1565C0',
  },
  activityVehicleInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
  },
  activityIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  activityVehicleType: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  activityVehicleNumber: {
    fontSize: 13,
    color: '#777',
    marginTop: 2,
  },
  activityEmpty: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  activityEmptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#37474F',
    marginTop: 16,
    marginBottom: 6,
  },
  activityEmptyDesc: {
    textAlign: 'center',
    color: '#90A4AE',
    fontSize: 14,
    paddingHorizontal: 30,
  },
  activityCount: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1565C0',
    marginBottom: 12,
  },
  activityItem: {
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
  activityItemIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E8EAF6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  activityItemInfo: {
    flex: 1,
  },
  activityItemTime: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  activityItemLocation: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  activityStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginLeft: 8,
  },
  activityStatusSent: {
    backgroundColor: '#E8F5E9',
  },
  activityStatusPending: {
    backgroundColor: '#FFF3E0',
  },
  activityStatusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  activityStatusTextSent: {
    color: '#2E7D32',
  },
  activityStatusTextPending: {
    color: '#E65100',
  },
  bottomSpacer: {
    height: 40,
  },
  fab: {
    position: 'absolute',
    margin: 20,
    right: 0,
    bottom: 20,
    backgroundColor: '#1565C0',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    borderRadius: 16,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#F5F7FA',
    paddingTop: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#1565C0',
    elevation: 4,
    shadowColor: '#1565C0',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  modalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  modalIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#fff',
  },
  modalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  formContainer: {
    flex: 1,
  },
  formContent: {
    padding: 20,
    paddingBottom: 44,
  },
  formSectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1565C0',
    marginBottom: 8,
    marginTop: 16,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 4,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    borderWidth: 1.5,
    borderColor: '#E8EAF6',
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 14,
    marginBottom: 4,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    borderWidth: 1.5,
    borderColor: '#E8EAF6',
  },
  inputWrapError: {
    borderColor: '#EF5350',
  },
  inputIcon: {
    marginRight: 10,
  },
  inputField: {
    flex: 1,
    backgroundColor: 'transparent',
    fontSize: 15,
    paddingVertical: 12,
  },
  inputUnderline: {
    display: 'none',
  },
  errorText: {
    color: '#EF5350',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 4,
    marginBottom: 4,
    marginLeft: 4,
  },
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 14,
    borderWidth: 1.5,
    borderColor: '#E8EAF6',
  },
  privacyInfo: {
    flex: 1,
    paddingRight: 12,
  },
  privacyTitle: {
    color: '#1C1C1E',
    fontSize: 14,
    fontWeight: '700',
  },
  privacyDesc: {
    color: '#777',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
  planHint: {
    color: '#7B1FA2',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 8,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#1565C0',
    paddingVertical: 16,
    borderRadius: 14,
    marginTop: 32,
    elevation: 4,
    shadowColor: '#1565C0',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  submitBtnDisabled: {
    opacity: 0.7,
  },
  submitBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  qrOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  qrModal: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 20,
    width: '100%',
    maxWidth: 460,
    maxHeight: '92%',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 30,
    elevation: 12,
  },
  qrModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 16,
  },
  qrModalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  qrModalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
  },
  qrModalClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F0F0F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  qrModalScroll: {
    width: '100%',
  },
  qrModalScrollContent: {
    alignItems: 'center',
    paddingBottom: 4,
  },
  tagCard: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#E8E8E8',
    borderStyle: 'dashed',
    overflow: 'hidden',
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },
  tagCardLandscape: {
    maxWidth: 400,
    borderStyle: 'solid',
  },
  tagCardPremium: {
    borderColor: '#D4AF37',
    borderStyle: 'solid',
    shadowColor: '#D4AF37',
    shadowOpacity: 0.25,
  },
  tagHeaderPremium: {
    backgroundColor: '#1E3A8A',
  },
  premiumBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    backgroundColor: '#FFD700',
  },
  premiumBadgeText: {
    color: '#0F172A',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1,
  },
  selectorGroup: {
    width: '100%',
    marginBottom: 12,
  },
  tagColumn: {
    alignItems: 'center',
  },
  tagBodyRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  tagBodyRowReverse: {
    flexDirection: 'row-reverse',
  },
  tagQRSide: {
    width: '58%',
    minWidth: 150,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: '#FAFAFA',
    borderLeftWidth: 1,
    borderLeftColor: '#EEF0F2',
  },
  tagQRLandscape: {
    alignSelf: 'stretch',
    aspectRatio: 1,
  },
  tagQRLabel: {
    marginTop: 10,
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  tagQRPremium: {
    width: 240,
    height: 240,
  },
  tagInfoLandscape: {
    flex: 1,
    minWidth: 140,
    paddingHorizontal: 12,
    paddingVertical: 12,
    justifyContent: 'center',
    gap: 8,
  },
  tagHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0F172A',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  tagHeaderText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 2,
  },
  tagHeaderSub: {
    color: '#94A3B8',
    fontSize: 8,
    letterSpacing: 2,
    marginTop: 2,
  },
  tagQRWrap: {
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: '#FAFAFA',
  },
  tagQR: {
    width: 200,
    height: 200,
  },
  tagInfo: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  tagVehicleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  tagVehicleText: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  useCaseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  useCaseIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  useCaseIconWarn: {
    backgroundColor: '#FFF3E0',
  },
  useCaseIconDanger: {
    backgroundColor: '#FFEBEE',
  },
  useCaseText: {
    flex: 1,
  },
  useCaseTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1E293B',
  },
  useCaseDesc: {
    fontSize: 11,
    color: '#475569',
    marginTop: 1,
  },
  tagInstructionHindi: {
    color: '#607D8B',
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 16,
    textAlign: 'center',
    marginTop: 2,
  },
  tagFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    backgroundColor: '#F5F5F5',
    borderTopWidth: 1,
    borderTopColor: '#E8E8E8',
  },
  tagFooterText: {
    fontSize: 10,
    color: '#64748B',
    letterSpacing: 0.3,
    fontWeight: '700',
  },
  formatSelector: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  formatOption: {
    flexGrow: 1,
    minWidth: '46%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#C5CAE9',
    backgroundColor: '#F8F9FF',
  },
  formatOptionActive: {
    backgroundColor: '#1565C0',
    borderColor: '#1565C0',
  },
  formatOptionText: {
    color: '#1565C0',
    fontSize: 12,
    fontWeight: '800',
  },
  formatOptionTextActive: {
    color: '#fff',
  },
  downloadSection: {
    width: '100%',
    gap: 10,
  },
  downloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#1C1C1E',
    paddingVertical: 14,
    borderRadius: 14,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
  },
  downloadBtnDisabled: {
    opacity: 0.7,
  },
  downloadBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#F0F0F0',
    paddingVertical: 12,
    borderRadius: 14,
  },
  shareBtnText: {
    color: '#555',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default VehiclesScreen;
