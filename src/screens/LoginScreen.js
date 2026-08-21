import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  Image,
  Dimensions,
  TouchableOpacity,
} from 'react-native';
import { TextInput, Button, Switch } from 'react-native-paper';
import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../context/AuthContext';
import authStorage from '../utils/authStorage';
import { authAPI } from '../services/api';

const { width } = Dimensions.get('window');
const LOGO = require('../../assets/icon.png');

const LoginScreen = ({ navigation, route }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [rememberEmail, setRememberEmail] = useState(false);
  const [updateMode, setUpdateMode] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [updateLoading, setUpdateLoading] = useState(false);
  const { setUser } = useAuth();

  const emailRef = useRef(null);
  const passwordRef = useRef(null);

  useEffect(() => {
    const registeredEmail = route?.params?.email;
    if (registeredEmail) {
      setEmail(registeredEmail);
      return;
    }
    loadSavedEmail();
  }, []);

  const loadSavedEmail = async () => {
    try {
      const saved = await authStorage.getToken();
      if (saved) return;
      const remembered = await authStorage.getItem('remembered_email');
      if (remembered) {
        setEmail(remembered);
        setRememberEmail(true);
      }
    } catch (e) {}
  };

  const validateForm = () => {
    const newErrors = {};
    if (!email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim().toLowerCase())) {
      newErrors.email = 'Enter a valid email address';
    }
    if (!password) {
      newErrors.password = 'Password is required';
    } else if (password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleLogin = async () => {
    if (loading) return;
    Keyboard.dismiss();
    if (!validateForm()) return;

    setLoading(true);
    try {
      const response = await authAPI.login(email.trim().toLowerCase(), password);
      const { token, user } = response.data;

      await authStorage.storeToken(token);
      await authStorage.storeUser(user);

      if (rememberEmail) {
        try {
          await AsyncStorage.setItem('remembered_email', email.trim().toLowerCase());
        } catch (e) {}
      } else {
        try {
          await AsyncStorage.removeItem('remembered_email');
        } catch (e) {}
      }

      setUser(user);
    } catch (error) {
      const res = error.response?.data;
      const status = error.response?.status;
      let msg = 'Login failed. Please try again.';

      if (res?.errors && Array.isArray(res.errors)) {
        msg = res.errors.map((e) => e.msg).join('\n');
      } else if (res?.error) {
        msg = res.error;
      } else if (error.code === 'ECONNABORTED') {
        msg = 'Request timed out. Check the backend URL and network.';
      } else if (!error.response) {
        msg = 'Cannot reach the backend. Check the API URL on your Expo device.';
      }

      console.error('Login failed:', { status, message: error.message, response: res });
      Alert.alert('Login Failed', msg);
    } finally {
      setLoading(false);
    }
  };

  const getErrorMessage = (error, fallback) => {
    const res = error.response?.data;
    if (res?.errors && Array.isArray(res.errors)) {
      return res.errors.map((e) => e.msg).join('\n');
    }
    return res?.error || fallback;
  };

  const handleRequestPasswordOtp = async () => {
    const registeredEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(registeredEmail)) {
      setErrors({ ...errors, email: 'Enter your registered email first' });
      return;
    }
    Keyboard.dismiss();
    setUpdateLoading(true);
    try {
      const response = await authAPI.requestPasswordOtp(registeredEmail);
      setOtpSent(true);
      Alert.alert('OTP Sent', response.data?.message || 'OTP sent to your registered email.');
    } catch (error) {
      Alert.alert('OTP Failed', getErrorMessage(error, 'Failed to send email OTP.'));
    } finally {
      setUpdateLoading(false);
    }
  };

  const handleUpdatePassword = async () => {
    const registeredEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(registeredEmail)) {
      setErrors({ ...errors, email: 'Enter your registered email first' });
      return;
    }
    if (!/^\d{4}$/.test(otp.trim())) {
      Alert.alert('Invalid OTP', 'Enter the 4 digit OTP sent to your email.');
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert('Invalid Password', 'Password must be at least 6 characters.');
      return;
    }
    Keyboard.dismiss();
    setUpdateLoading(true);
    try {
      const response = await authAPI.updatePassword(registeredEmail, otp.trim(), newPassword);
      setPassword(newPassword);
      setOtp('');
      setNewPassword('');
      setOtpSent(false);
      setUpdateMode(false);
      Alert.alert('Password Updated', response.data?.message || 'Please login with your new password.');
    } catch (error) {
      Alert.alert('Update Failed', getErrorMessage(error, 'Failed to update password.'));
    } finally {
      setUpdateLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topSection}>
          <View style={styles.bgCircle1} />
          <View style={styles.bgCircle2} />
          <Image source={LOGO} style={styles.logo} />
          <Text style={styles.appName}>Karo Alert</Text>
          <Text style={styles.tagline}>Never get blocked in again!</Text>
          <View style={styles.taglineRow}>
            <View style={styles.tagDot} />
            <Text style={styles.tagItem}>Alert</Text>
            <View style={[styles.tagDot, styles.tagDotOrange]} />
            <Text style={styles.tagItem}>Protect</Text>
            <View style={[styles.tagDot, styles.tagDotGreen]} />
            <Text style={styles.tagItem}>Stay Safe</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Welcome Back</Text>
          <Text style={styles.cardSubtitle}>Sign in to your account</Text>

          <View style={styles.inputContainer}>
            <Ionicons name="mail-outline" size={20} color="#90A4AE" style={styles.inputIcon} />
            <TextInput
              ref={emailRef}
              label="Email"
              value={email}
              onChangeText={(text) => {
                setEmail(text.trim());
                if (errors.email) setErrors({ ...errors, email: null });
              }}
              mode="flat"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              error={!!errors.email}
              style={styles.input}
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
              blurOnSubmit={false}
              underlineColor="transparent"
              activeUnderlineColor="#1565C0"
              theme={{ colors: { primary: '#1565C0', placeholder: '#90A4AE' } }}
            />
          </View>
          {errors.email && <Text style={styles.error}>{errors.email}</Text>}

          <View style={styles.inputContainer}>
            <Ionicons name="lock-closed-outline" size={20} color="#90A4AE" style={styles.inputIcon} />
            <TextInput
              ref={passwordRef}
              label="Password"
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                if (errors.password) setErrors({ ...errors, password: null });
              }}
              mode="flat"
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              error={!!errors.password}
              style={styles.input}
              returnKeyType="done"
              onSubmitEditing={handleLogin}
              underlineColor="transparent"
              activeUnderlineColor="#1565C0"
              theme={{ colors: { primary: '#1565C0', placeholder: '#90A4AE' }}
              }
              right={
                <TextInput.Icon
                  icon={showPassword ? 'eye-off' : 'eye'}
                  onPress={() => setShowPassword(!showPassword)}
                  color="#90A4AE"
                />
              }
            />
          </View>
          {errors.password && <Text style={styles.error}>{errors.password}</Text>}

          <View style={styles.optionsRow}>
            <TouchableOpacity
              style={styles.rememberRow}
              onPress={() => setRememberEmail(!rememberEmail)}
              activeOpacity={0.7}
            >
              <View style={[styles.checkbox, rememberEmail && styles.checkboxActive]}>
                {rememberEmail && <Ionicons name="checkmark" size={14} color="#fff" />}
              </View>
              <Text style={styles.rememberLabel}>Remember me</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => {
              setUpdateMode(!updateMode);
              setOtpSent(false);
              setOtp('');
              setNewPassword('');
            }}>
              <Text style={styles.forgotText}>Forgot Password?</Text>
            </TouchableOpacity>
          </View>

          {updateMode && (
            <View style={styles.updateBox}>
              <TouchableOpacity
                style={styles.otpBtn}
                onPress={handleRequestPasswordOtp}
                disabled={updateLoading && !otpSent}
              >
                <Text style={styles.otpBtnText}>
                  {updateLoading && !otpSent ? 'Sending...' : 'Send Email OTP'}
                </Text>
              </TouchableOpacity>

              {otpSent && (
                <>
                  <View style={styles.inputContainer}>
                    <Ionicons name="keypad-outline" size={20} color="#90A4AE" style={styles.inputIcon} />
                    <TextInput
                      label="Email OTP"
                      value={otp}
                      onChangeText={(text) => setOtp(text.replace(/\D/g, '').slice(0, 4))}
                      mode="flat"
                      keyboardType="number-pad"
                      style={styles.input}
                      underlineColor="transparent"
                      activeUnderlineColor="#1565C0"
                      theme={{ colors: { primary: '#1565C0', placeholder: '#90A4AE' } }}
                    />
                  </View>
                  <View style={styles.inputContainer}>
                    <Ionicons name="lock-closed-outline" size={20} color="#90A4AE" style={styles.inputIcon} />
                    <TextInput
                      label="New Password"
                      value={newPassword}
                      onChangeText={setNewPassword}
                      mode="flat"
                      secureTextEntry
                      autoCapitalize="none"
                      style={styles.input}
                      underlineColor="transparent"
                      activeUnderlineColor="#1565C0"
                      theme={{ colors: { primary: '#1565C0', placeholder: '#90A4AE' } }}
                    />
                  </View>
                  <TouchableOpacity
                    style={styles.updateBtn}
                    onPress={handleUpdatePassword}
                    disabled={updateLoading}
                  >
                    <Text style={styles.updateBtnText}>
                      {updateLoading ? 'Updating...' : 'Update Password'}
                    </Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}

          <TouchableOpacity
            style={[styles.loginBtn, loading && styles.loginBtnDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <Text style={styles.loginBtnText}>Logging in...</Text>
            ) : (
              <View style={styles.loginBtnContent}>
                <Text style={styles.loginBtnText}>Sign In</Text>
                <Ionicons name="arrow-forward" size={20} color="#fff" />
              </View>
            )}
          </TouchableOpacity>

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>OR</Text>
            <View style={styles.dividerLine} />
          </View>

          <TouchableOpacity
            style={styles.registerBtn}
            onPress={() => navigation.navigate('Register')}
            activeOpacity={0.7}
          >
            <Text style={styles.registerBtnText}>
              Don't have an account? <Text style={styles.registerBtnBold}>Sign Up</Text>
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.footer}>
          Alert - Protect - Stay Safe
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#EEF2F7',
  },
  scroll: {
    flexGrow: 1,
    paddingBottom: 30,
  },
  topSection: {
    backgroundColor: '#1565C0',
    paddingTop: 60,
    paddingBottom: 40,
    paddingHorizontal: 24,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  bgCircle1: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.08)',
    top: -60,
    right: -40,
  },
  bgCircle2: {
    position: 'absolute',
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(255,255,255,0.05)',
    bottom: -30,
    left: -30,
  },
  logo: {
    width: 90,
    height: 90,
    borderRadius: 22,
    marginBottom: 14,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  appName: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 1,
  },
  tagline: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 6,
  },
  taglineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    gap: 6,
  },
  tagDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FF8F00',
  },
  tagDotOrange: {
    backgroundColor: '#FF8F00',
  },
  tagDotGreen: {
    backgroundColor: '#66BB6A',
  },
  tagItem: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: '#fff',
    marginTop: -20,
    marginHorizontal: 20,
    borderRadius: 20,
    padding: 28,
    elevation: 8,
    shadowColor: '#1565C0',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1565C0',
    textAlign: 'center',
  },
  cardSubtitle: {
    fontSize: 14,
    color: '#78909C',
    textAlign: 'center',
    marginBottom: 24,
    marginTop: 4,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F7FA',
    borderRadius: 12,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: '#E8EDF2',
  },
  inputIcon: {
    paddingLeft: 14,
  },
  input: {
    flex: 1,
    backgroundColor: 'transparent',
    fontSize: 15,
  },
  error: {
    color: '#E53935',
    fontSize: 12,
    marginTop: 2,
    marginBottom: 8,
    marginLeft: 4,
  },
  optionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#B0BEC5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  checkboxActive: {
    backgroundColor: '#1565C0',
    borderColor: '#1565C0',
  },
  rememberLabel: {
    color: '#546E7A',
    fontSize: 13,
  },
  forgotText: {
    color: '#FF6D00',
    fontSize: 13,
    fontWeight: '600',
  },
  updateBox: {
    marginBottom: 12,
  },
  otpBtn: {
    backgroundColor: '#FFF3E0',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#FFB74D',
  },
  otpBtnText: {
    color: '#E65100',
    fontWeight: '600',
    fontSize: 14,
  },
  updateBtn: {
    backgroundColor: '#1565C0',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  updateBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  loginBtn: {
    backgroundColor: '#FF6D00',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 4,
    elevation: 4,
    shadowColor: '#FF6D00',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  loginBtnDisabled: {
    opacity: 0.7,
  },
  loginBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  loginBtnText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 18,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E0E0E0',
  },
  dividerText: {
    color: '#B0BEC5',
    fontSize: 12,
    fontWeight: '600',
    marginHorizontal: 12,
  },
  registerBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#F5F7FA',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  registerBtnText: {
    color: '#546E7A',
    fontSize: 14,
  },
  registerBtnBold: {
    color: '#1565C0',
    fontWeight: '700',
  },
  footer: {
    textAlign: 'center',
    color: '#B0BEC5',
    fontSize: 12,
    marginTop: 24,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
});

export default LoginScreen;
