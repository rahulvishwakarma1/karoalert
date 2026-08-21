import React, { useState, useRef } from 'react';
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
import { TextInput } from 'react-native-paper';
import Ionicons from '@expo/vector-icons/Ionicons';
import auth from '@react-native-firebase/auth';
import { authAPI } from '../services/api';

const { width } = Dimensions.get('window');
const LOGO = require('../../assets/icon.png');

const formatFirebasePhone = (digits) => `+91${digits}`;

const firebaseErrorMessage = (error, fallback) => {
  const code = error?.code || '';
  const messages = {
    'auth/invalid-phone-number': 'Invalid phone number. Please check and try again.',
    'auth/too-many-requests': 'Too many OTP requests. Please wait a few minutes and try again.',
    'auth/quota-exceeded': 'SMS quota exceeded for today. Please try again later.',
    'auth/network-request-failed': 'Network error. Check your internet connection and try again.',
    'auth/invalid-verification-code': 'Incorrect OTP. Enter the OTP from the latest SMS.',
    'auth/code-expired': 'This OTP has expired. Please request a new OTP.',
    'auth/session-expired': 'This OTP session expired. Please request a new OTP.',
    'auth/operation-not-allowed': 'Phone verification is not enabled. Please contact support.',
    'auth/too-many-verification-code-requests': 'Too many verification attempts. Please wait and try again.',
  };
  return messages[code] || fallback;
};

const RegisterScreen = ({ navigation }) => {
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const confirmationRef = useRef(null);

  const nameRef = useRef(null);
  const emailRef = useRef(null);
  const phoneRef = useRef(null);
  const passwordRef = useRef(null);
  const confirmPasswordRef = useRef(null);
  const otpRef = useRef(null);

  const validateForm = () => {
    const newErrors = {};
    const normalizedEmail = email.trim().toLowerCase();
    const phoneDigits = phone.replace(/\D/g, '');

    if (!name.trim()) {
      newErrors.name = 'Name is required';
    } else if (name.trim().length < 2) {
      newErrors.name = 'Name must be at least 2 characters';
    }

    if (!normalizedEmail) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      newErrors.email = 'Enter a valid email address';
    }

    if (!phoneDigits) {
      newErrors.phone = 'Phone number is required';
    } else if (!/^\d{10}$/.test(phoneDigits)) {
      newErrors.phone = 'Phone number must be exactly 10 digits';
    }

    if (!password) {
      newErrors.password = 'Password is required';
    } else if (password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }

    if (!confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your password';
    } else if (password !== confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const sendOtp = async () => {
    Keyboard.dismiss();
    if (!validateForm()) return;

    setLoading(true);
    try {
      const phoneDigits = phone.replace(/\D/g, '');
      const confirmation = await auth().signInWithPhoneNumber(formatFirebasePhone(phoneDigits));
      confirmationRef.current = confirmation;
      setOtp('');
      setErrors({});
      setStep(2);
      Alert.alert('OTP Sent', 'OTP sent to your mobile number via SMS.');
    } catch (error) {
      if (error.response?.status === 409) {
        Alert.alert(
          'Already Registered',
          'An account with this email or phone already exists. Please login instead.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Go to Login',
              onPress: () => navigation.navigate('Login', { email: email.trim().toLowerCase() }),
            },
          ],
        );
      } else {
        Alert.alert('OTP Failed', firebaseErrorMessage(error, 'Failed to send OTP. Please try again.'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    Keyboard.dismiss();
    const otpDigits = otp.replace(/\D/g, '');
    if (!/^\d{6}$/.test(otpDigits)) {
      setErrors({ ...errors, otp: 'Enter the 6 digit OTP' });
      return;
    }

    const confirmation = confirmationRef.current;
    if (!confirmation) {
      Alert.alert('Session Expired', 'OTP session expired. Please request a new OTP.');
      setStep(1);
      return;
    }

    setLoading(true);
    try {
      await confirmation.confirm(otpDigits);
      const idToken = await auth().currentUser?.getIdToken();
      if (!idToken) {
        throw new Error('Unable to obtain verification token');
      }
      await authAPI.registerVerifyFirebase({
        phone: phone.replace(/\D/g, ''),
        firebase_token: idToken,
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
      });
      Alert.alert(
        'Success',
        'Phone verified! Your account is created. Please login.',
        [
          {
            text: 'OK',
            onPress: () => navigation.navigate('Login', { email: email.trim().toLowerCase() }),
          },
        ],
      );
    } catch (error) {
      if (error.response?.status === 409) {
        Alert.alert(
          'Already Registered',
          'An account with this email or phone already exists. Please login instead.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Go to Login',
              onPress: () => navigation.navigate('Login', { email: email.trim().toLowerCase() }),
            },
          ],
        );
      } else if (error.response?.status === 400) {
        Alert.alert('Verification Failed', error.response.data?.error || 'Invalid or expired OTP.');
      } else {
        Alert.alert('Verification Failed', firebaseErrorMessage(error, 'Invalid or expired OTP.'));
      }
    } finally {
      setLoading(false);
    }
  };

  const phoneDigits = phone.replace(/\D/g, '');
  const maskedPhone = phoneDigits.length === 10 ? `XXXXXX${phoneDigits.slice(-4)}` : phoneDigits;

  const renderInput = (icon, label, value, onChangeText, options = {}) => (
    <View style={styles.inputContainer}>
      <Ionicons name={icon} size={20} color="#90A4AE" style={styles.inputIcon} />
      <TextInput
        ref={options.ref}
        label={label}
        value={value}
        onChangeText={(text) => {
          onChangeText(text);
          if (options.errorKey && errors[options.errorKey]) {
            setErrors({ ...errors, [options.errorKey]: null });
          }
        }}
        mode="flat"
        keyboardType={options.keyboardType || 'default'}
        autoCapitalize={options.autoCapitalize || 'none'}
        autoComplete={options.autoComplete}
        secureTextEntry={options.secureTextEntry}
        error={!!options.error}
        maxLength={options.maxLength}
        style={styles.input}
        returnKeyType={options.returnKeyType || 'next'}
        onSubmitEditing={options.onSubmitEditing}
        blurOnSubmit={options.blurOnSubmit !== undefined ? options.blurOnSubmit : false}
        underlineColor="transparent"
        activeUnderlineColor="#1565C0"
        theme={{ colors: { primary: '#1565C0', placeholder: '#90A4AE' } }}
        right={
          options.secureTextEntry ? (
            <TextInput.Icon
              icon={options.showValue ? 'eye' : 'eye-off'}
              onPress={() => options.toggleShow()}
              color="#90A4AE"
            />
          ) : options.rightIcon ? (
            <TextInput.Icon icon={options.rightIcon} color="#90A4AE" />
          ) : null
        }
      />
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topSection}>
          <View style={styles.bgCircle1} />
          <View style={styles.bgCircle2} />
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Image source={LOGO} style={styles.logo} />
          <Text style={styles.appName}>Karo Alert</Text>
          <Text style={styles.tagline}>Create your account</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.stepsRow}>
            <View style={[styles.stepDot, styles.stepDotActive]} />
            <View style={[styles.stepLine, step >= 2 && styles.stepLineActive]} />
            <View style={[styles.stepDot, step >= 2 && styles.stepDotActive]} />
          </View>

          {step === 1 ? (
            <>
              {renderInput('person-outline', 'Full Name', name, setName, {
                ref: nameRef,
                autoCapitalize: 'words',
                error: errors.name,
                errorKey: 'name',
                onSubmitEditing: () => emailRef.current?.focus(),
              })}
              {errors.name && <Text style={styles.error}>{errors.name}</Text>}

              {renderInput('mail-outline', 'Email Address', email, setEmail, {
                ref: emailRef,
                keyboardType: 'email-address',
                autoComplete: 'email',
                error: errors.email,
                errorKey: 'email',
                onSubmitEditing: () => phoneRef.current?.focus(),
              })}
              {errors.email && <Text style={styles.error}>{errors.email}</Text>}

              <View style={styles.hintRow}>
                <Ionicons name="key-outline" size={16} color="#FF6D00" />
                <Text style={styles.hintText}>
                  Password recovery OTP will be sent to this email. Use your own
                  Gmail / email address.
                </Text>
              </View>

              {renderInput('call-outline', 'Phone Number', phone, (text) => {
                setPhone(text.replace(/\D/g, '').slice(0, 10));
              }, {
                ref: phoneRef,
                keyboardType: 'phone-pad',
                maxLength: 10,
                autoComplete: 'tel',
                error: errors.phone,
                errorKey: 'phone',
                onSubmitEditing: () => passwordRef.current?.focus(),
              })}
              {errors.phone && <Text style={styles.error}>{errors.phone}</Text>}

              <View style={styles.hintRow}>
                <Ionicons name="phone-portrait-outline" size={16} color="#FF6D00" />
                <Text style={styles.hintText}>
                  Registration OTP will be sent to this mobile number.
                </Text>
              </View>

              {renderInput('lock-closed-outline', 'Password', password, setPassword, {
                ref: passwordRef,
                secureTextEntry: !showPassword,
                autoCapitalize: 'none',
                autoComplete: 'password',
                error: errors.password,
                errorKey: 'password',
                showValue: showPassword,
                toggleShow: () => setShowPassword(!showPassword),
                onSubmitEditing: () => confirmPasswordRef.current?.focus(),
              })}
              {errors.password && <Text style={styles.error}>{errors.password}</Text>}

              {renderInput('lock-closed-outline', 'Confirm Password', confirmPassword, setConfirmPassword, {
                ref: confirmPasswordRef,
                secureTextEntry: !showConfirmPassword,
                autoCapitalize: 'none',
                autoComplete: 'password',
                error: errors.confirmPassword,
                errorKey: 'confirmPassword',
                showValue: showConfirmPassword,
                toggleShow: () => setShowConfirmPassword(!showConfirmPassword),
                onSubmitEditing: sendOtp,
                returnKeyType: 'done',
              })}
              {errors.confirmPassword && <Text style={styles.error}>{errors.confirmPassword}</Text>}

              <View style={styles.termsRow}>
                <Ionicons name="information-circle-outline" size={16} color="#78909C" />
                <Text style={styles.termsText}>
                  By signing up, you agree to our{' '}
                  <Text style={styles.termsLink}>Terms of Service</Text>
                  {' '}and{' '}
                  <Text style={styles.termsLink}>Privacy Policy</Text>
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.registerBtn, loading && styles.registerBtnDisabled]}
                onPress={sendOtp}
                disabled={loading}
                activeOpacity={0.8}
              >
                {loading ? (
                  <Text style={styles.registerBtnText}>Sending OTP...</Text>
                ) : (
                  <View style={styles.registerBtnContent}>
                    <Text style={styles.registerBtnText}>Send OTP</Text>
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
                style={styles.loginBtn}
                onPress={() => navigation.navigate('Login')}
                activeOpacity={0.7}
              >
                <Text style={styles.loginBtnText}>
                  Already have an account? <Text style={styles.loginBtnBold}>Sign In</Text>
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={styles.otpInfoRow}>
                <Ionicons name="phone-portrait-outline" size={18} color="#FF6D00" />
                <Text style={styles.otpInfoText}>
                  An OTP has been sent to{' '}
                  <Text style={styles.otpPhone}>{maskedPhone}</Text>. Enter it below
                  to verify your mobile number.
                </Text>
              </View>

              {renderInput('keypad-outline', 'Enter OTP', otp, (text) => {
                setOtp(text.replace(/\D/g, '').slice(0, 6));
              }, {
                ref: otpRef,
                keyboardType: 'number-pad',
                maxLength: 6,
                error: errors.otp,
                errorKey: 'otp',
                onSubmitEditing: handleVerifyOtp,
                returnKeyType: 'done',
              })}
              {errors.otp && <Text style={styles.error}>{errors.otp}</Text>}

              <TouchableOpacity
                style={[styles.registerBtn, loading && styles.registerBtnDisabled]}
                onPress={handleVerifyOtp}
                disabled={loading}
                activeOpacity={0.8}
              >
                {loading ? (
                  <Text style={styles.registerBtnText}>Verifying...</Text>
                ) : (
                  <View style={styles.registerBtnContent}>
                    <Text style={styles.registerBtnText}>Verify & Create Account</Text>
                    <Ionicons name="checkmark-circle" size={20} color="#fff" />
                  </View>
                )}
              </TouchableOpacity>

              <View style={styles.otpActionsRow}>
                <TouchableOpacity
                  style={styles.otpActionBtn}
                  onPress={sendOtp}
                  disabled={loading}
                  activeOpacity={0.7}
                >
                  <Ionicons name="refresh" size={16} color="#1565C0" />
                  <Text style={styles.resendText}>Resend OTP</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.otpActionBtn}
                  onPress={() => setStep(1)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="create-outline" size={16} color="#78909C" />
                  <Text style={styles.editText}>Edit Details</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#EEF2F7',
  },
  scrollContainer: {
    flexGrow: 1,
    paddingBottom: 30,
  },
  topSection: {
    backgroundColor: '#1565C0',
    paddingTop: 50,
    paddingBottom: 36,
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
    left: -40,
  },
  bgCircle2: {
    position: 'absolute',
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(255,255,255,0.05)',
    bottom: -30,
    right: -30,
  },
  backBtn: {
    position: 'absolute',
    top: 50,
    left: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    width: 80,
    height: 80,
    borderRadius: 20,
    marginBottom: 12,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  appName: {
    fontSize: 26,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 1,
  },
  tagline: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 4,
  },
  card: {
    backgroundColor: '#fff',
    marginTop: -20,
    marginHorizontal: 20,
    borderRadius: 20,
    padding: 24,
    elevation: 8,
    shadowColor: '#1565C0',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  stepsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  stepDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#E0E0E0',
  },
  stepDotActive: {
    backgroundColor: '#FF6D00',
    width: 28,
    borderRadius: 5,
  },
  stepLine: {
    width: 40,
    height: 2,
    backgroundColor: '#E0E0E0',
    marginHorizontal: 6,
  },
  stepLineActive: {
    backgroundColor: '#FF6D00',
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
  termsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 8,
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFF3E0',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FFE0B2',
    padding: 10,
    marginBottom: 12,
  },
  hintText: {
    color: '#E65100',
    fontSize: 12,
    marginLeft: 8,
    lineHeight: 18,
    flex: 1,
  },
  otpInfoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#E3F2FD',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BBDEFB',
    padding: 10,
    marginBottom: 12,
  },
  otpInfoText: {
    color: '#0D47A1',
    fontSize: 12,
    marginLeft: 8,
    lineHeight: 18,
    flex: 1,
  },
  otpPhone: {
    fontWeight: '700',
  },
  otpActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  otpActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 6,
    gap: 6,
  },
  resendText: {
    color: '#1565C0',
    fontSize: 14,
    fontWeight: '600',
  },
  editText: {
    color: '#78909C',
    fontSize: 14,
    fontWeight: '600',
  },
  termsText: {
    color: '#78909C',
    fontSize: 12,
    marginLeft: 6,
    lineHeight: 18,
  },
  termsLink: {
    color: '#1565C0',
    fontWeight: '600',
  },
  registerBtn: {
    backgroundColor: '#FF6D00',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#FF6D00',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  registerBtnDisabled: {
    opacity: 0.7,
  },
  registerBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  registerBtnText: {
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
  loginBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#F5F7FA',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  loginBtnText: {
    color: '#546E7A',
    fontSize: 14,
  },
  loginBtnBold: {
    color: '#1565C0',
    fontWeight: '700',
  },
});

export default RegisterScreen;