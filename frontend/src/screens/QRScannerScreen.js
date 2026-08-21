import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  Vibration,
  Linking,
  PermissionsAndroid,
  Platform,
  TouchableOpacity,
} from 'react-native';
import {
  Card,
  Title,
  Paragraph,
  Button,
  ActivityIndicator,
  IconButton,
} from 'react-native-paper';
import { CameraView, useCameraPermissions, Camera } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import Ionicons from '@expo/vector-icons/Ionicons';
import { privateCallAPI, scanAPI, communicationAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useVoiceCall } from '../context/VoiceCallContext';
import {
  clearPendingQrCode,
  getPendingQrCode,
  subscribePendingQrCode,
} from '../services/callNotificationService';

const extractQrCodeId = (rawData) => {
  if (!rawData) return null;

  const value = String(rawData).trim();
  if (!value) return null;

  try {
    const parsed = JSON.parse(value);
    const candidate =
      parsed.qr_code_id ||
      parsed.qrCodeId ||
      parsed.qr_url ||
      parsed.qrUrl ||
      parsed.url;

    if (candidate) return extractQrCodeId(candidate);
  } catch (parseError) {
    // Plain URL/UUID payloads are handled below.
  }

  try {
    const parsedUrl = new URL(value);
    if (parsedUrl.hostname === 'play.google.com') {
      const qrParam = parsedUrl.searchParams.get('qr');
      if (qrParam && qrParam.trim()) return qrParam.trim();
    }
    const parts = parsedUrl.pathname.split('/').filter(Boolean);
    return decodeURIComponent(parts[parts.length - 1] || '').trim() || null;
  } catch (urlError) {
    const withoutQuery = value.split(/[?#]/)[0].replace(/\/+$/, '');
    const parts = withoutQuery.split('/').filter(Boolean);
    return decodeURIComponent(parts[parts.length - 1] || withoutQuery).trim() || null;
  }
};

const normalizePhoneForDial = (phoneNumber) => {
  const raw = String(phoneNumber || '').trim();
  if (!raw) return '';
  if (raw.startsWith('+')) return raw;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+91${digits}`;
  return digits || raw;
};

const QRScannerScreen = ({ navigation }) => {
  const { user } = useAuth();
  const socket = useSocket();
  const voiceCall = useVoiceCall();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [visibleOptions, setVisibleOptions] = useState([]);
  const [alertingOwner, setAlertingOwner] = useState(false);
  const [actionMessage, setActionMessage] = useState('');
  const [pendingCallId, setPendingCallId] = useState(null);
  const [pendingRequestId, setPendingRequestId] = useState(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState('');
  // Deep link (qralertgo://public/...) se aaya QR code turant scan karo
  const scannedRef = useRef(false);

  useEffect(() => {
    if (!permission) requestPermission();
  }, [permission, requestPermission]);

  useEffect(() => {
    if (!socket) return undefined;

    const handleAlertResponse = (data) => {
      setActionMessage(data.response_text || 'Owner responded to your alert.');
      setPendingRequestId(null);
    };

    const handleCallResponse = (data) => {
      if (data.response === 'missed' || data.response === 'cancelled' || data.response === 'rejected') {
        setActionMessage(data.message || 'Call request ended.');
        setPendingCallId(null);
      }
    };

    socket.on('alert_response', handleAlertResponse);
    socket.on('call_response', handleCallResponse);

    return () => {
      socket.off('alert_response', handleAlertResponse);
      socket.off('call_response', handleCallResponse);
    };
  }, [socket]);

  const hasPermission = permission?.granted;

  const handleBarCodeScanned = async ({ type, data }) => {
    if (scannedRef.current) return;

    scannedRef.current = true;
    setScanned(true);
    Vibration.vibrate(100); // Haptic feedback
    await performScan(data);
  };

  const performScan = async (rawData) => {
    try {
      const qrCodeId = extractQrCodeId(rawData);

      if (!qrCodeId) {
        throw new Error('Invalid QR code format');
      }

      setLoading(true);

      const [scanResponse, visibleRes] = await Promise.all([
        scanAPI.scanQR(qrCodeId),
        communicationAPI.getVisibleOptions(qrCodeId).catch(() => null),
      ]);

      setScanResult({
        ...scanResponse.data,
        qr_code_id: qrCodeId,
      });

      if (visibleRes?.data?.visible_options) {
        setVisibleOptions(visibleRes.data.visible_options);
      } else {
        setVisibleOptions([]);
      }

      // Vibrate in a ringing pattern instead of native audio (to avoid native module errors)
      Vibration.vibrate([0, 500, 200, 500, 200, 500]);
    } catch (error) {
      console.error('Scan error:', error);
      const errorMessage =
        error.response?.status === 404
          ? 'This QR code was not found or is no longer active. Generate a fresh QR code for the vehicle and scan that one.'
          : error.response?.data?.error || error.message || 'Failed to process QR code';
      Alert.alert(
        'Scan Failed',
        errorMessage,
        [
          {
            text: 'Try Again',
            onPress: () => {
              scannedRef.current = false;
              setScanned(false);
            },
          },
          {
            text: 'Cancel',
            onPress: () => navigation.goBack(),
          },
        ]
      );
    } finally {
      setLoading(false);
    }
  };

  // Deep link / landing page se aaya QR code → Scanner tab me aaate hi scan
  useEffect(() => {
    let active = true;

    const runPending = async (code) => {
      if (!active || !code) return;
      clearPendingQrCode();
      if (scannedRef.current) return;
      await performScan(code);
    };

    const unsubscribe = subscribePendingQrCode(runPending);

    const pending = getPendingQrCode();
    if (pending) runPending(pending);

    return () => {
      active = false;
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickQRImage = async () => {
    // Uses the Android/iOS system Photo Picker -> NO read-permission dialog
    // is required and the app never gets gallery-wide access.
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
    });

    if (result.canceled || !result.assets?.[0]?.uri) return;

    setLoading(true);
    try {
      const scanned = await Camera.scanFromURLAsync(result.assets[0].uri, ['qr']);
      if (!scanned?.length) {
        Alert.alert('No QR Found', 'No QR code was detected in the selected image.');
        setLoading(false);
        return;
      }
      await handleBarCodeScanned({ type: 'qr', data: scanned[0].data });
    } catch (error) {
      Alert.alert('Scan Failed', error.message || 'Could not read QR code from image.');
      setLoading(false);
    }
  };

  const resetScanner = () => {
    if (pendingCallId || pendingRequestId) cancelAppCall();
    scannedRef.current = false;
    setScanned(false);
    setScanResult(null);
    setVisibleOptions([]);
    setAlertingOwner(false);
    setActionMessage('');
    setPendingCallId(null);
    setPendingRequestId(null);
  };

  const retryCamera = async () => {
    setCameraError('');
    setCameraReady(false);
    if (!permission?.granted) {
      await requestPermission();
    }
  };

  const openDialer = async (phoneNumber, label) => {
    const dialNumber = normalizePhoneForDial(phoneNumber);
    if (!dialNumber) {
      setActionMessage(`${label} number is not available.`);
      return;
    }

    try {
      const dialUrl = `tel:${dialNumber}`;
      await Linking.openURL(dialUrl);
      setActionMessage(`${label} call opened.`);
    } catch (error) {
      setActionMessage(error.message || 'Could not open dialer.');
    }
  };

  const callOwner = async () => {
    const mobileNumber = scanResult?.vehicle?.mobile_number;
    if (!mobileNumber) {
      setActionMessage('No public contact number is available.');
      return;
    }
    await openDialer(mobileNumber, 'Owner');
  };

  const cancelAlertOwner = async () => {
    if (scanResult?.qr_code_id) {
      await scanAPI.cancelCall(null, scanResult.qr_code_id).catch(() => {});
    }
    setPendingCallId(null);
    setPendingRequestId(null);
    setActionMessage('');
  };

  const alertOwner = async () => {
    if (!scanResult?.qr_code_id) {
      setActionMessage('QR code not available.');
      return;
    }

    const scannerUserId = user?.id || user?.userId;
    if (!scannerUserId) {
      setActionMessage('Login to receive the owner response.');
      return;
    }

    try {
      setAlertingOwner(true);
      setActionMessage('');
      const response = await scanAPI.ringOwner(scanResult.qr_code_id, socket?.id, scannerUserId);
      if (response.data?.request_id) setPendingRequestId(response.data.request_id);
      setActionMessage(
        response.data?.push_sent
          ? 'Owner app is closed. Notification sent; waiting for owner to open it.'
          : 'Owner phone is ringing. Waiting for response...'
      );
    } catch (error) {
      setActionMessage(error.response?.data?.error || 'Owner could not be alerted right now.');
    } finally {
      setAlertingOwner(false);
    }
  };

  const callPrivate = async () => {
    if (!scanResult?.qr_code_id) {
      setActionMessage('QR code not available.');
      return;
    }

    try {
      setAlertingOwner(true);
      setActionMessage('');
      const response = await privateCallAPI.startPrivateCall(scanResult.qr_code_id);
      setActionMessage('Private call initiated. Connecting...');
    } catch (error) {
      const errData = error.response?.data;
      if (errData?.code === 'insufficient_balance') {
        setActionMessage('');
        navigation.navigate('PurchasePlan', { type: 'caller_seconds' });
        return;
      }
      setActionMessage(errData?.error || error.message || 'Could not start private call.');
    } finally {
      setAlertingOwner(false);
    }
  };

  const callPrivateEmergency = async () => {
    if (!scanResult?.qr_code_id) {
      setActionMessage('QR code not available.');
      return;
    }

    try {
      setAlertingOwner(true);
      setActionMessage('');
      await privateCallAPI.startPrivateCall(scanResult.qr_code_id, 'private_emergency');
      setActionMessage('Private emergency call initiated. Connecting...');
    } catch (error) {
      const errData = error.response?.data;
      if (errData?.code === 'insufficient_balance') {
        setActionMessage('');
        navigation.navigate('PurchasePlan', { type: 'caller_seconds' });
        return;
      }
      setActionMessage(errData?.error || error.message || 'Could not start private emergency call.');
    } finally {
      setAlertingOwner(false);
    }
  };

  const callEmergency = async () => {
    const emergencyNumber = scanResult?.vehicle?.emergency_number;
    if (!emergencyNumber) {
      setActionMessage('Emergency number is not available.');
      return;
    }
    await openDialer(emergencyNumber, 'Emergency');
  };

  const cancelAppCall = async () => {
    try {
      if (pendingCallId) {
        await scanAPI.cancelCall(pendingCallId, scanResult?.qr_code_id);
      } else if (scanResult?.qr_code_id) {
        await scanAPI.cancelCall(null, scanResult.qr_code_id);
      }
    } catch (error) {
      // Cancel failed silently
    }
    setPendingCallId(null);
    setPendingRequestId(null);
    setActionMessage('');
  };

  const callViaApp = async () => {
    if (!scanResult?.qr_code_id) {
      setActionMessage('QR code not available.');
      return;
    }

    try {
      setAlertingOwner(true);
      setActionMessage('Connecting app call...');
      const response = await voiceCall.startOutgoingCall(scanResult.qr_code_id);
      if (response.data?.call_id) setPendingCallId(response.data.call_id);
      setActionMessage(
        response.data?.push_sent
          ? 'Owner app is closed. Call notification sent; waiting for owner to open it.'
          : 'Calling via app. Waiting for response...'
      );
    } catch (error) {
      setActionMessage(error.response?.data?.error || error.message || 'Could not initiate call.');
    } finally {
      setAlertingOwner(false);
    }
  };

  if (hasPermission === null) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#1565C0" />
        <Text style={styles.permissionText}>Requesting camera permission...</Text>
      </View>
    );
  }

  if (hasPermission === false) {
    return (
      <View style={styles.container}>
        <Card style={styles.permissionCard}>
          <Card.Content style={styles.permissionContent}>
            <Title>Camera Permission Required</Title>
            <Paragraph style={styles.permissionText}>
              KaroAlert needs camera access to scan QR codes on vehicles.
            </Paragraph>
            <Button
              mode="contained"
              onPress={() => Linking.openSettings()}
              style={styles.settingsButton}
            >
              Open Settings
            </Button>
            <Button
              mode="text"
              onPress={() => navigation.goBack()}
              style={styles.backButton}
            >
              Go Back
            </Button>
          </Card.Content>
        </Card>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Title style={styles.title}>Scan QR Code</Title>
        <Paragraph style={styles.subtitle}>
          Point your camera at the vehicle's QR code
        </Paragraph>
      </View>

      <View style={styles.scannerContainer}>
        <CameraView
          active={!scanResult}
          facing="back"
          onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
          barcodeScannerSettings={{
            barcodeTypes: ['qr'],
          }}
          onCameraReady={() => {
            setCameraReady(true);
            setCameraError('');
          }}
          onMountError={(event) => {
            setCameraReady(false);
            setCameraError(event?.nativeEvent?.message || 'Camera preview could not start.');
          }}
          style={StyleSheet.absoluteFillObject}
        />
        
        <View style={styles.overlay}>
          <View style={styles.scanFrame} />
          <Text style={styles.scanText}>
            {scanned ? 'Processing...' : 'Align QR code within frame'}
          </Text>
          {!scanResult && (
            <TouchableOpacity style={styles.uploadButton} onPress={pickQRImage}>
              <Ionicons name="cloud-upload-outline" size={20} color="#fff" />
              <Text style={styles.uploadText}>Upload QR</Text>
            </TouchableOpacity>
          )}
        </View>

        {!cameraReady && !cameraError && (
          <View style={styles.cameraStatusOverlay}>
            <ActivityIndicator size="large" color="#1565C0" />
            <Text style={styles.cameraStatusText}>Starting camera...</Text>
          </View>
        )}

        {!!cameraError && (
          <View style={styles.cameraStatusOverlay}>
            <Text style={styles.cameraErrorTitle}>Camera preview not available</Text>
            <Text style={styles.cameraStatusText}>{cameraError}</Text>
            <Button mode="contained" onPress={retryCamera} style={styles.retryButton}>
              Retry Camera
            </Button>
            <Button mode="text" onPress={() => Linking.openSettings()}>
              Open Settings
            </Button>
          </View>
        )}
      </View>

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#1565C0" />
          <Text style={styles.loadingText}>Notifying vehicle owner...</Text>
        </View>
      )}

      {scanResult && (
        <View style={styles.resultOverlay}>
          <Card style={styles.resultCard}>
            <Card.Content>
              <View style={styles.resultHeader}>
                <IconButton
                  icon="check"
                  mode="contained"
                  containerColor="#E8F5E9"
                  iconColor="#2E7D32"
                  size={28}
                  style={styles.successIcon}
                />
                <Title style={styles.resultTitle}>Scan Successful</Title>
                <Paragraph style={styles.resultSubtitle}>Choose how to contact the owner</Paragraph>
              </View>

              <View style={styles.detailBox}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Vehicle</Text>
                  <Text style={styles.detailValue}>{scanResult.vehicle?.vehicle_number || scanResult.vehicle?.car_number || 'N/A'}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Owner</Text>
                  <Text style={styles.detailValue}>{scanResult.vehicle?.owner_name || scanResult.scan_info?.owner_name || 'N/A'}</Text>
                </View>
                <Text style={styles.resultTime}>
                  {scanResult.scan_info?.scan_time ? new Date(scanResult.scan_info.scan_time).toLocaleString() : new Date().toLocaleString()}
                </Text>
              </View>

              <View style={styles.dialerSection}>
                <Text style={styles.sectionLabel}>Quick Call</Text>
                <View style={styles.dialerRow}>
                  {visibleOptions.filter(o => o.id === 'normal_call').length > 0 && (
                    <TouchableOpacity
                      style={[styles.dialerBtn, { backgroundColor: '#2E7D32' }]}
                      onPress={callOwner}
                    >
                      <Ionicons name="phone" size={22} color="#fff" />
                      <Text style={styles.dialerBtnText}>Call Owner</Text>
                    </TouchableOpacity>
                  )}
                  {visibleOptions.filter(o => o.id === 'emergency_call').length > 0 && (
                    <TouchableOpacity
                      style={[styles.dialerBtn, { backgroundColor: '#C62828' }]}
                      onPress={callEmergency}
                    >
                      <Ionicons name="medical-bag" size={22} color="#fff" />
                      <Text style={styles.dialerBtnText}>Emergency</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              <View style={styles.actionGrid}>
                {visibleOptions.filter(o => o.id !== 'normal_call' && o.id !== 'emergency_call').map((opt) => {
                  const btnConfig = {
                    alert_owner: { color: '#D84315', icon: 'bell-ring', handler: alertOwner, label: 'Alert Owner' },
                    app_call: { color: '#7B1FA2', icon: 'phone-classic', handler: callViaApp, label: 'App Call' },
                    private_call: { color: '#1565C0', icon: 'shield-checkmark', handler: callPrivate, label: 'Private Call' },
                    private_emergency: { color: '#E65100', icon: 'shield-medical', handler: callPrivateEmergency, label: 'Private Emergency' },
                  }[opt.id];

                  if (!btnConfig) return null;

                  return (
                    <Button
                      key={opt.id}
                      mode="contained"
                      icon={btnConfig.icon}
                      buttonColor={btnConfig.color}
                      textColor="#fff"
                      style={styles.actionButton}
                      contentStyle={styles.actionButtonContent}
                      loading={alertingOwner}
                      disabled={alertingOwner}
                      onPress={btnConfig.handler}
                    >
                      {btnConfig.label}
                    </Button>
                  );
                })}
              </View>

              {!!actionMessage && (
                <View style={styles.actionMessageContainer}>
                  <Text style={styles.actionMessage}>{actionMessage}</Text>
                  {(pendingCallId || pendingRequestId) && (
                    <Button
                      mode="text"
                      textColor="#C62828"
                      onPress={() => {
                        if (pendingCallId) cancelAppCall();
                        else cancelAlertOwner();
                      }}
                      style={styles.cancelButton}
                    >
                      Cancel
                    </Button>
                  )}
                </View>
              )}

              <Button
                mode="outlined"
                onPress={resetScanner}
                style={styles.scanAgainButton}
              >
                Scan Another
              </Button>
            </Card.Content>
          </Card>
        </View>
      )}

      <View style={styles.footer}>
        <IconButton
          icon="close"
          size={32}
          onPress={() => navigation.goBack()}
          style={styles.closeButton}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  title: {
    color: 'white',
    fontSize: 24,
    fontWeight: 'bold',
  },
  subtitle: {
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 5,
    textAlign: 'center',
  },
  scannerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanFrame: {
    width: 250,
    height: 250,
    borderWidth: 3,
    borderColor: '#1565C0',
    borderRadius: 10,
    backgroundColor: 'rgba(21, 101, 192, 0.1)',
  },
  scanText: {
    color: 'white',
    marginTop: 20,
    fontSize: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 5,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20,
  },
  loadingText: {
    color: 'white',
    marginTop: 20,
    fontSize: 16,
  },
  resultOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20,
  },
  resultCard: {
    margin: 20,
    width: '90%',
    maxWidth: 380,
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  resultHeader: {
    alignItems: 'center',
    marginBottom: 14,
  },
  successIcon: {
    margin: 0,
    marginBottom: 6,
  },
  resultTitle: {
    textAlign: 'center',
    color: '#1B5E20',
    fontSize: 22,
    fontWeight: 'bold',
  },
  resultSubtitle: {
    color: '#607D8B',
    textAlign: 'center',
    marginTop: 2,
  },
  detailBox: {
    backgroundColor: '#F6F8FA',
    borderRadius: 8,
    padding: 14,
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    gap: 12,
  },
  detailLabel: {
    color: '#607D8B',
    fontSize: 13,
    fontWeight: '600',
  },
  detailValue: {
    color: '#111827',
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'right',
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 10,
  },
  contactTextWrap: {
    flex: 1,
  },
  contactButton: {
    borderColor: '#1565C0',
  },
  dialerSection: {
    marginBottom: 14,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 8,
  },
  dialerRow: {
    flexDirection: 'row',
    gap: 10,
  },
  dialerBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 10,
    elevation: 2,
  },
  dialerBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  noContactText: {
    color: '#6B7280',
    fontSize: 13,
    marginBottom: 8,
    textAlign: 'center',
  },
  resultText: {
    marginBottom: 5,
  },
  resultTime: {
    fontSize: 12,
    color: '#6B7280',
    fontStyle: 'italic',
    marginTop: 4,
    textAlign: 'center',
  },
  actionGrid: {
    gap: 10,
    marginBottom: 4,
  },
  actionButton: {
    borderRadius: 8,
  },
  actionButtonContent: {
    height: 46,
  },
  actionMessageContainer: {
    alignItems: 'center',
    marginTop: 8,
  },
  actionMessage: {
    color: '#374151',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  cancelButton: {
    marginTop: 4,
  },
  scanAgainButton: {
    marginTop: 10,
    borderRadius: 8,
  },
  footer: {
    position: 'absolute',
    bottom: 50,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  closeButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  cameraStatusOverlay: {
    position: 'absolute',
    left: 24,
    right: 24,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 5,
  },
  cameraErrorTitle: {
    color: 'white',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 10,
    textAlign: 'center',
  },
  cameraStatusText: {
    color: 'white',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 12,
    marginBottom: 12,
    textAlign: 'center',
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 24,
    marginTop: 16,
    gap: 8,
  },
  uploadText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  retryButton: {
    borderRadius: 8,
    marginTop: 4,
  },
  permissionCard: {
    margin: 20,
  },
  permissionContent: {
    alignItems: 'center',
    padding: 20,
  },
  permissionText: {
    textAlign: 'center',
    marginVertical: 20,
    lineHeight: 20,
  },
  settingsButton: {
    marginBottom: 10,
  },
  backButton: {
    marginTop: 10,
  },
});

export default QRScannerScreen;
