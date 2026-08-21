import React, { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View, Dimensions } from 'react-native';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useVoiceCall } from '../context/VoiceCallContext';

const { width, height } = Dimensions.get('window');

const STATUS_LABELS = {
  ringing: 'Calling...',
  connecting: 'Connecting...',
  connected: '',
  ended: 'Call Ended',
};

const formatDuration = (totalSeconds) => {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const two = (value) => String(value).padStart(2, '0');

  if (hours > 0) return `${hours}:${two(minutes)}:${two(seconds)}`;
  return `${two(minutes)}:${two(seconds)}`;
};

const VoiceCallModal = () => {
  const voiceCall = useVoiceCall();
  const state = voiceCall?.callState || { status: 'idle' };
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaker, setIsSpeaker] = useState(false);

  useEffect(() => {
    if (state.status !== 'connected' || !state.connectedAt) {
      setDurationSeconds(0);
      return undefined;
    }

    const updateDuration = () => {
      setDurationSeconds(Math.max(0, Math.floor((Date.now() - state.connectedAt) / 1000)));
    };

    updateDuration();
    const intervalId = setInterval(updateDuration, 1000);
    return () => clearInterval(intervalId);
  }, [state.status, state.connectedAt]);

  useEffect(() => {
    setIsMuted(false);
    setIsSpeaker(false);
  }, [state.status]);

  if (state.status === 'idle') return null;

  const isRinging = state.status === 'ringing';
  const isConnecting = state.status === 'connecting';
  const isConnected = state.status === 'connected';
  const isEnded = state.status === 'ended';

  const callerName =
    state.role === 'caller'
      ? state.target_name || state.owner_name || state.caller_name || 'Unknown'
      : state.caller_name || state.target_name || 'Unknown';
  const initials = callerName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={voiceCall.endCall}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.topArea}>
            <View style={styles.avatarContainer}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initials}</Text>
              </View>
              {(isRinging || isConnecting) && <View style={styles.pulseRing} />}
              {(isRinging || isConnecting) && <View style={[styles.pulseRing, styles.pulseRing2]} />}
            </View>

            <Text style={styles.callerName}>{callerName}</Text>

            {isConnected ? (
              <Text style={styles.durationText}>{formatDuration(durationSeconds)}</Text>
            ) : (
              <Text style={styles.statusText}>
                {STATUS_LABELS[state.status] || 'Voice Call'}
              </Text>
            )}

            {isConnected && (
              <View style={styles.connectionInfo}>
                <View style={styles.connectionDot} />
                <Text style={styles.connectionText}>Encrypted</Text>
              </View>
            )}
          </View>

          {isConnected && (
            <View style={styles.controlsGrid}>
              <TouchableOpacity
                style={[styles.controlBtn, isMuted && styles.controlBtnActive]}
                onPress={() => setIsMuted(!isMuted)}
                activeOpacity={0.7}
              >
                <View style={[styles.controlIconBg, isMuted && styles.controlIconBgActive]}>
                  <Ionicons
                    name={isMuted ? 'mic-off' : 'mic'}
                    size={24}
                    color={isMuted ? '#fff' : '#fff'}
                  />
                </View>
                <Text style={styles.controlLabel}>{isMuted ? 'Unmute' : 'Mute'}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.controlBtn, isSpeaker && styles.controlBtnActive]}
                onPress={() => setIsSpeaker(!isSpeaker)}
                activeOpacity={0.7}
              >
                <View style={[styles.controlIconBg, isSpeaker && styles.controlIconBgActive]}>
                  <Ionicons
                    name={isSpeaker ? 'volume-high' : 'volume-medium'}
                    size={24}
                    color="#fff"
                  />
                </View>
                <Text style={styles.controlLabel}>Speaker</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.controlBtn} activeOpacity={0.7}>
                <View style={styles.controlIconBg}>
                  <Ionicons name="keypad" size={24} color="#fff" />
                </View>
                <Text style={styles.controlLabel}>Keypad</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.bottomArea}>
            {isEnded ? (
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={voiceCall.endCall}
                activeOpacity={0.8}
              >
                <Text style={styles.closeBtnText}>Close</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.callActions}>
                {isConnected && (
                  <TouchableOpacity
                    style={styles.addCallBtn}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="person-add" size={20} color="#fff" />
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.endCallBtn}
                  onPress={voiceCall.endCall}
                  activeOpacity={0.8}
                >
                  <Icon name="phone-hangup" size={32} color="#fff" />
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
  },
  container: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 30,
    paddingTop: 60,
    paddingBottom: 50,
  },
  topArea: {
    alignItems: 'center',
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: '#1565C0',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 10,
    shadowColor: '#1565C0',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
  },
  avatarText: {
    fontSize: 40,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 2,
  },
  pulseRing: {
    position: 'absolute',
    width: 130,
    height: 130,
    borderRadius: 65,
    borderWidth: 2,
    borderColor: 'rgba(21,101,192,0.4)',
    top: -10,
  },
  pulseRing2: {
    width: 150,
    height: 150,
    borderRadius: 75,
    borderColor: 'rgba(21,101,192,0.2)',
    top: -20,
  },
  callerName: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
    textAlign: 'center',
  },
  statusText: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '400',
  },
  durationText: {
    fontSize: 42,
    fontWeight: '300',
    color: '#fff',
    fontVariant: ['tabular-nums'],
    letterSpacing: 2,
  },
  connectionInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 6,
  },
  connectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#66BB6A',
  },
  connectionText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    fontWeight: '500',
  },
  controlsGrid: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 36,
    paddingVertical: 20,
  },
  controlBtn: {
    alignItems: 'center',
    gap: 8,
  },
  controlBtnActive: {},
  controlIconBg: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  controlIconBgActive: {
    backgroundColor: '#1565C0',
  },
  controlLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '500',
  },
  bottomArea: {
    alignItems: 'center',
  },
  callActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 32,
  },
  endCallBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#E53935',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#E53935',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  addCallBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtn: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingVertical: 16,
    paddingHorizontal: 60,
    borderRadius: 30,
  },
  closeBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default VoiceCallModal;
