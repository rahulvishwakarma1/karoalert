import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  Linking,
  Modal,
  TouchableOpacity,
} from 'react-native';
import {
  Card,
  Button,
  TextInput,
  ActivityIndicator,
} from 'react-native-paper';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useAuth } from '../context/AuthContext';
import authStorage from '../utils/authStorage';
import { authAPI, adminAPI } from '../services/api';

const ProfileScreen = ({ navigation }) => {
  const { user, setUser, logout } = useAuth();
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState({ name: '', phone: '' });
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [legalModal, setLegalModal] = useState(null);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const response = await authAPI.getProfile();
      const userData = response.data.user;
      setFormData({ name: userData.name, phone: userData.phone });
    } catch (error) {
      console.error('Error loading profile:', error);
      Alert.alert('Error', 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const validateForm = () => {
    const errors = {};
    const phoneDigits = formData.phone.replace(/\D/g, '');
    if (!formData.name.trim()) {
      errors.name = 'Name is required';
    } else if (formData.name.trim().length < 2) {
      errors.name = 'Name must be at least 2 characters';
    }
    if (!phoneDigits) {
      errors.phone = 'Phone number is required';
    } else if (!/^\d{10}$/.test(phoneDigits)) {
      errors.phone = 'Phone number must be exactly 10 digits';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleUpdateProfile = async () => {
    if (!validateForm()) return;
    setSaving(true);
    try {
      await authAPI.updateProfile({
        name: formData.name.trim(),
        phone: formData.phone.replace(/\D/g, ''),
      });
      const updatedUser = { ...user, ...formData };
      setUser(updatedUser);
      await authStorage.storeUser(updatedUser);
      setEditing(false);
    } catch (error) {
      const errorMessage = error.response?.data?.error || 'Failed to update profile';
      Alert.alert('Error', errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditing(false);
    loadProfile();
    setFormErrors({});
  };

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: logout,
        },
      ]
    );
  };

  const planExpiresAt = user?.membership_expires_at;
  const membershipActive =
    user?.membership_status === 'active' &&
    (!planExpiresAt || new Date(planExpiresAt) > new Date());
  const membershipStatusText = membershipActive
    ? planExpiresAt
      ? `Active till ${new Date(planExpiresAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`
      : 'Active'
    : 'Buy & activate any plan';

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account and all associated data. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => confirmDeletePassword(),
        },
      ]
    );
  };

  const [deleteModal, setDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleting, setDeleting] = useState(false);

  const confirmDeletePassword = () => {
    if (Platform.OS === 'ios') {
      Alert.prompt(
        'Enter Password',
        'Enter your password to confirm account deletion:',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete My Account',
            style: 'destructive',
            onPress: async (password) => {
              if (!password) {
                Alert.alert('Error', 'Password is required');
                return;
              }
              try {
                await authAPI.deleteAccount(password);
                Alert.alert('Account Deleted', 'Your account has been deleted successfully.');
                logout();
              } catch (error) {
                Alert.alert('Error', error.response?.data?.error || 'Failed to delete account');
              }
            },
          },
        ],
        'secure-text'
      );
    } else {
      setDeletePassword('');
      setDeleteModal(true);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletePassword) {
      Alert.alert('Error', 'Password is required');
      return;
    }
    setDeleting(true);
    try {
      await authAPI.deleteAccount(deletePassword);
      setDeleteModal(false);
      Alert.alert('Account Deleted', 'Your account has been deleted successfully.');
      logout();
    } catch (error) {
      Alert.alert('Error', error.response?.data?.error || 'Failed to delete account');
    } finally {
      setDeleting(false);
    }
  };

  const legalContent = {
    about: {
      title: 'About Us',
      body:
        'KaroAlert is developed and operated by DITS Company India Private Limited.\n\n' +
        'KaroAlert helps vehicle owners create QR code stickers, receive parking alerts, and lets people contact the vehicle owner instantly when parking issues occur. The app provides QR scanning, vehicle owner communication, membership plans, and private call services.\n\n' +
        'For any queries or support, contact us using the Contact Us section.',
    },
    contact: {
      title: 'Contact Us',
      body:
        'Company: DITS Company India Private Limited\n\n' +
        'Email: supportdesk@ditscompany.com\n' +
        'Email: hr@ditscompany.com\n\n' +
        'Phone: +91 97544-06105\n\n' +
        'Office Address:\n' +
        'Police Line Road, Nearby Radio Mann, Ramdwara, Haripura, Vidisha, Madhya Pradesh, India - 464001\n\n' +
        'We are available to assist you with any questions about the app, your account, privacy, or data deletion requests.',
    },
    privacy: {
      title: 'Privacy Policy',
      body:
        'This Privacy Policy explains how DITS Company India Private Limited ("we", "our", "the Company") collects, uses, stores, and protects your data when you use the KaroAlert app.\n\n' +
        'KaroAlert collects account details such as name, email, phone number, vehicle details, QR code information, scan history, and notification data only to provide parking alert, QR scan, and app communication features.\n\n' +
        'We do not sell personal data. Your phone number and vehicle information are used to identify vehicle owners and send parking-related alerts. Number visibility is controlled by your account permissions and admin settings.\n\n' +
        'The app uses device permissions such as camera access for QR scanning, notifications for alerts, microphone for voice calls, and network access for account and QR services. These permissions are used only for app functionality.\n\n' +
        'Your data is stored on our backend server and protected with account authentication. You can request account or data deletion by contacting us at supportdesk@ditscompany.com or through the app.\n\n' +
        'By using this app, you agree that your information will be used for QR parking alert services and related support.\n\n' +
        'For any privacy-related questions, contact us at supportdesk@ditscompany.com or hr@ditscompany.com.',
    },
    terms: {
      title: 'Terms of Service',
      body:
        'These Terms of Service govern your use of the KaroAlert app provided by DITS Company India Private Limited.\n\n' +
        'KaroAlert is provided to help users create vehicle QR codes, receive parking alerts, and contact vehicle owners when parking issues occur.\n\n' +
        'You agree to provide accurate account, phone, and vehicle information. You must not misuse QR codes, send false alerts, harass other users, or use the app for illegal activity.\n\n' +
        'Membership activation and QR permissions may require admin approval. Paid plan activation is completed only after payment verification by admin.\n\n' +
        'Service availability may depend on internet connection, device permissions, backend server availability, and third-party services such as notifications or messaging apps.\n\n' +
        'We may suspend accounts that misuse the service or violate these terms. Continued use of the app means you accept these terms.\n\n' +
        'For any questions regarding these terms, contact us at supportdesk@ditscompany.com.',
    },
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1565C0" />
        <Text style={styles.loadingText}>Loading profile...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      {/* ── Profile Header ── */}
      <View style={styles.profileHeader}>
        <View style={styles.avatarWrap}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {user?.name?.charAt(0)?.toUpperCase() || 'U'}
            </Text>
          </View>
          <View style={styles.statusDot} />
        </View>
        <Text style={styles.userName}>{user?.name}</Text>
        <Text style={styles.userEmail}>{user?.email}</Text>
        <View style={styles.userMeta}>
          <View style={styles.metaItem}>
            <Ionicons name="call-outline" size={14} color="#90CAF9" />
            <Text style={styles.metaText}>{user?.phone || 'No phone'}</Text>
          </View>
          {user?.created_at && (
            <View style={styles.metaItem}>
              <Ionicons name="calendar-outline" size={14} color="#90CAF9" />
              <Text style={styles.metaText}>
                Since {new Date(user.created_at).toLocaleDateString()}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* ── Profile Info / Edit Card ── */}
      <Card style={styles.sectionCard}>
        <View style={styles.cardAccent} />
        <Card.Content style={styles.cardContent}>
          <View style={styles.cardTitleRow}>
            <View style={styles.cardTitleLeft}>
              <Ionicons name="person-outline" size={18} color="#1565C0" />
              <Text style={styles.cardTitle}>Profile Information</Text>
            </View>
            {!editing && (
              <TouchableOpacity onPress={() => setEditing(true)} style={styles.editBtn}>
                <Ionicons name="pencil" size={16} color="#1565C0" />
                <Text style={styles.editBtnText}>Edit</Text>
              </TouchableOpacity>
            )}
          </View>

          {editing ? (
            <>
              <Text style={styles.fieldLabel}>Full Name</Text>
              <View style={[styles.inputWrap, formErrors.name && styles.inputWrapError]}>
                <Ionicons name="person-outline" size={18} color="#5C6BC0" style={styles.inputIcon} />
                <TextInput
                  value={formData.name}
                  onChangeText={(text) => setFormData({ ...formData, name: text })}
                  mode="flat"
                  autoCapitalize="words"
                  placeholder="Full name"
                  placeholderTextColor="#B0BEC5"
                  style={styles.inputField}
                  underlineStyle={styles.inputUnderline}
                  theme={{ colors: { onSurface: '#1C1C1E', primary: '#1565C0', placeholder: '#B0BEC5' } }}
                />
              </View>
              {formErrors.name && <Text style={styles.errorText}>{formErrors.name}</Text>}

              <Text style={styles.fieldLabel}>Phone Number</Text>
              <View style={[styles.inputWrap, formErrors.phone && styles.inputWrapError]}>
                <Ionicons name="call-outline" size={18} color="#5C6BC0" style={styles.inputIcon} />
                <TextInput
                  value={formData.phone}
                  onChangeText={(text) => setFormData({ ...formData, phone: text.replace(/\D/g, '').slice(0, 10) })}
                  mode="flat"
                  keyboardType="phone-pad"
                  maxLength={10}
                  placeholder="Phone number"
                  placeholderTextColor="#B0BEC5"
                  style={styles.inputField}
                  underlineStyle={styles.inputUnderline}
                  theme={{ colors: { onSurface: '#1C1C1E', primary: '#1565C0', placeholder: '#B0BEC5' } }}
                />
              </View>
              {formErrors.phone && <Text style={styles.errorText}>{formErrors.phone}</Text>}

              <View style={styles.editActions}>
                <TouchableOpacity
                  style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                  onPress={handleUpdateProfile}
                  disabled={saving}
                  activeOpacity={0.85}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle" size={18} color="#fff" />
                      <Text style={styles.saveBtnText}>Save Changes</Text>
                    </>
                  )}
                </TouchableOpacity>
                <TouchableOpacity style={styles.cancelBtn} onPress={handleCancelEdit} activeOpacity={0.85}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <View style={styles.infoList}>
              <View style={styles.infoRow}>
                <Ionicons name="person-outline" size={18} color="#1565C0" />
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Name</Text>
                  <Text style={styles.infoValue}>{user?.name}</Text>
                </View>
              </View>
              <View style={styles.infoDivider} />
              <View style={styles.infoRow}>
                <Ionicons name="mail-outline" size={18} color="#1565C0" />
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Email</Text>
                  <Text style={styles.infoValue}>{user?.email}</Text>
                </View>
              </View>
              <View style={styles.infoDivider} />
              <View style={styles.infoRow}>
                <Ionicons name="call-outline" size={18} color="#1565C0" />
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Phone</Text>
                  <Text style={styles.infoValue}>{user?.phone || 'Not set'}</Text>
                </View>
              </View>
              <View style={styles.infoDivider} />
              <View style={styles.infoRow}>
                <Ionicons name="calendar-outline" size={18} color="#1565C0" />
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Member Since</Text>
                  <Text style={styles.infoValue}>
                    {user?.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}
                  </Text>
                </View>
              </View>
            </View>
          )}
        </Card.Content>
      </Card>

      {/* ── Settings Card ── */}
      <Card style={styles.sectionCard}>
        <View style={styles.cardAccent} />
        <Card.Content style={styles.cardContent}>
          <View style={styles.cardTitleRow}>
            <Ionicons name="settings-outline" size={18} color="#1565C0" />
            <Text style={styles.cardTitle}>Settings</Text>
          </View>
          {!user?.is_admin && (
            <>
              <TouchableOpacity
                style={styles.menuRow}
                onPress={() => navigation.navigate('MainTabs', { screen: 'Plan' })}
              >
                <View style={styles.menuIconWrap}>
                  <Ionicons name="card-outline" size={20} color="#1565C0" />
                </View>
                <View style={styles.menuInfo}>
                  <Text style={styles.menuTitle}>Membership Plan</Text>
                  <Text style={[styles.menuDesc, membershipActive && styles.menuDescActive]}>
                    {membershipStatusText}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#B0BEC5" />
              </TouchableOpacity>
              <View style={styles.menuDivider} />
            </>
          )}
          <TouchableOpacity style={styles.menuRow} onPress={() => navigation.navigate('CommunicationSettings')}>
            <View style={styles.menuIconWrap}>
              <Ionicons name="settings-outline" size={20} color="#1565C0" />
            </View>
            <View style={styles.menuInfo}>
              <Text style={styles.menuTitle}>Communication Settings</Text>
              <Text style={styles.menuDesc}>Control QR scan visible options</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#B0BEC5" />
          </TouchableOpacity>
          <View style={styles.menuDivider} />
          <TouchableOpacity style={styles.menuRow} onPress={() => navigation.navigate('MyPrivateCall')}>
            <View style={styles.menuIconWrap}>
              <Ionicons name="shield-checkmark-outline" size={20} color="#1565C0" />
            </View>
            <View style={styles.menuInfo}>
              <Text style={styles.menuTitle}>My Private Call</Text>
              <Text style={styles.menuDesc}>Manage private call balance and service</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#B0BEC5" />
          </TouchableOpacity>
          <View style={styles.menuDivider} />
          <TouchableOpacity style={styles.menuRow} onPress={() => Alert.alert('Coming Soon', 'Notification settings will be available soon!')}>
            <View style={styles.menuIconWrap}>
              <Ionicons name="notifications-outline" size={20} color="#1565C0" />
            </View>
            <View style={styles.menuInfo}>
              <Text style={styles.menuTitle}>Notifications</Text>
              <Text style={styles.menuDesc}>Manage notification preferences</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#B0BEC5" />
          </TouchableOpacity>
          <View style={styles.menuDivider} />
          <TouchableOpacity style={styles.menuRow} onPress={() => setLegalModal('privacy')}>
            <View style={styles.menuIconWrap}>
              <Ionicons name="shield-outline" size={20} color="#1565C0" />
            </View>
            <View style={styles.menuInfo}>
              <Text style={styles.menuTitle}>Privacy Policy</Text>
              <Text style={styles.menuDesc}>View our privacy policy</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#B0BEC5" />
          </TouchableOpacity>
          <View style={styles.menuDivider} />
          <TouchableOpacity style={styles.menuRow} onPress={() => setLegalModal('terms')}>
            <View style={styles.menuIconWrap}>
              <Ionicons name="document-text-outline" size={20} color="#1565C0" />
            </View>
            <View style={styles.menuInfo}>
              <Text style={styles.menuTitle}>Terms of Service</Text>
              <Text style={styles.menuDesc}>View our terms of service</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#B0BEC5" />
          </TouchableOpacity>
        </Card.Content>
      </Card>

      {/* ── Support Card ── */}
      <Card style={styles.sectionCard}>
        <View style={styles.cardAccent} />
        <Card.Content style={styles.cardContent}>
          <View style={styles.cardTitleRow}>
            <Ionicons name="help-circle-outline" size={18} color="#1565C0" />
            <Text style={styles.cardTitle}>Support</Text>
          </View>
          <TouchableOpacity style={styles.menuRow} onPress={() => Linking.openURL('tel:9754406105')}>
            <View style={styles.menuIconWrap}>
              <Ionicons name="call-outline" size={20} color="#1565C0" />
            </View>
            <View style={styles.menuInfo}>
              <Text style={styles.menuTitle}>Contact Support</Text>
              <Text style={styles.menuDesc}>+91 97544-06105</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#B0BEC5" />
          </TouchableOpacity>
          <View style={styles.menuDivider} />
          <TouchableOpacity style={styles.menuRow} onPress={() => setLegalModal('about')}>
            <View style={styles.menuIconWrap}>
              <Ionicons name="information-circle-outline" size={20} color="#1565C0" />
            </View>
            <View style={styles.menuInfo}>
              <Text style={styles.menuTitle}>About Us</Text>
              <Text style={styles.menuDesc}>Learn about KaroAlert and DITS Company</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#B0BEC5" />
          </TouchableOpacity>
          <View style={styles.menuDivider} />
          <TouchableOpacity style={styles.menuRow} onPress={() => setLegalModal('contact')}>
            <View style={styles.menuIconWrap}>
              <Ionicons name="mail-outline" size={20} color="#1565C0" />
            </View>
            <View style={styles.menuInfo}>
              <Text style={styles.menuTitle}>Contact Us</Text>
              <Text style={styles.menuDesc}>Email, phone and office address</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#B0BEC5" />
          </TouchableOpacity>
          <View style={styles.menuDivider} />
          <TouchableOpacity style={styles.menuRow} onPress={() => Alert.alert('Rate App', 'Thank you for using KaroAlert!')}>
            <View style={styles.menuIconWrap}>
              <Ionicons name="star-outline" size={20} color="#1565C0" />
            </View>
            <View style={styles.menuInfo}>
              <Text style={styles.menuTitle}>Rate App</Text>
              <Text style={styles.menuDesc}>Rate us on the app store</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#B0BEC5" />
          </TouchableOpacity>
        </Card.Content>
      </Card>

      {/* ── Logout ── */}
      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.85}>
        <Ionicons name="log-out-outline" size={20} color="#EF5350" />
        <Text style={styles.logoutText}>Logout</Text>
      </TouchableOpacity>

      {/* ── Delete Account ── */}
      <TouchableOpacity style={styles.deleteBtn} onPress={handleDeleteAccount} activeOpacity={0.85}>
        <Ionicons name="trash-outline" size={20} color="#D32F2F" />
        <Text style={styles.deleteText}>Delete Account</Text>
      </TouchableOpacity>

      {/* ── Delete Password Modal ── */}
      <Modal visible={deleteModal} transparent animationType="fade" onRequestClose={() => setDeleteModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.legalModal}>
            <View style={styles.legalHeader}>
              <Text style={styles.legalTitle}>Confirm Deletion</Text>
              <TouchableOpacity onPress={() => setDeleteModal(false)} style={styles.legalCloseBtn}>
                <Ionicons name="close" size={20} color="#1C1C1E" />
              </TouchableOpacity>
            </View>
            <View style={styles.legalScroll}>
              <Text style={styles.legalBody}>Enter your password to permanently delete your account and all data.</Text>
              <TextInput
                value={deletePassword}
                onChangeText={setDeletePassword}
                mode="outlined"
                secureTextEntry
                placeholder="Enter password"
                style={{ marginTop: 16 }}
              />
            </View>
            <TouchableOpacity
              style={[styles.legalDoneBtn, { backgroundColor: '#D32F2F' }]}
              onPress={handleDeleteConfirm}
              disabled={deleting}
            >
              {deleting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.legalDoneText}>Delete My Account</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Text style={styles.versionText}>KaroAlert v1.0.0</Text>

      <View style={styles.bottomSpacer} />

      <Modal
        visible={!!legalModal}
        transparent
        animationType="fade"
        onRequestClose={() => setLegalModal(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.legalModal}>
            <View style={styles.legalHeader}>
              <Text style={styles.legalTitle}>{legalModal ? legalContent[legalModal].title : ''}</Text>
              <TouchableOpacity onPress={() => setLegalModal(null)} style={styles.legalCloseBtn}>
                <Ionicons name="close" size={20} color="#1C1C1E" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.legalScroll}>
              <Text style={styles.legalBody}>{legalModal ? legalContent[legalModal].body : ''}</Text>
            </ScrollView>
            <TouchableOpacity style={styles.legalDoneBtn} onPress={() => setLegalModal(null)}>
              <Text style={styles.legalDoneText}>I Understand</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7FA',
  },
  scrollContent: {
    paddingBottom: 40,
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

  // ── Profile Header ──
  profileHeader: {
    backgroundColor: '#000',
    paddingTop: 32,
    paddingBottom: 28,
    paddingHorizontal: 20,
    alignItems: 'center',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    marginBottom: 20,
  },
  avatarWrap: {
    position: 'relative',
    marginBottom: 14,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  avatarText: {
    fontSize: 32,
    fontWeight: '800',
    color: '#fff',
  },
  statusDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#4CAF50',
    borderWidth: 3,
    borderColor: '#000',
  },
  userName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 2,
  },
  userEmail: {
    fontSize: 14,
    color: '#90CAF9',
    fontWeight: '500',
    marginBottom: 10,
  },
  userMeta: {
    flexDirection: 'row',
    gap: 16,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  metaText: {
    fontSize: 12,
    color: '#90CAF9',
    fontWeight: '500',
  },

  // ── Section Card ──
  sectionCard: {
    borderRadius: 14,
    marginHorizontal: 16,
    marginBottom: 14,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  cardAccent: {
    height: 3,
    backgroundColor: '#1565C0',
  },
  cardContent: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  cardTitleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1C1C1E',
    flex: 1,
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E8EAF6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  editBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1565C0',
  },

  // ── Info List (view mode) ──
  infoList: {
    gap: 0,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 12,
    color: '#999',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoValue: {
    fontSize: 15,
    color: '#1C1C1E',
    fontWeight: '600',
    marginTop: 2,
  },
  infoDivider: {
    height: 1,
    backgroundColor: '#F0F0F0',
  },

  // ── Form (edit mode) ──
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1565C0',
    marginBottom: 8,
    marginTop: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
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
  editActions: {
    marginTop: 20,
    gap: 10,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1565C0',
    paddingVertical: 14,
    borderRadius: 12,
    elevation: 3,
    shadowColor: '#1565C0',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  saveBtnDisabled: {
    opacity: 0.7,
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  cancelBtn: {
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#F0F0F0',
  },
  cancelBtnText: {
    color: '#666',
    fontSize: 14,
    fontWeight: '600',
  },

  // ── Menu Rows (Settings / Support) ──
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  menuIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E8EAF6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuInfo: {
    flex: 1,
  },
  menuTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  menuDesc: {
    fontSize: 12,
    color: '#999',
    marginTop: 1,
  },
  menuDescActive: {
    color: '#2E7D32',
    fontWeight: '600',
  },
  menuDivider: {
    height: 1,
    backgroundColor: '#F0F0F0',
  },

  // ── Logout ──
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 8,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#fff',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    borderWidth: 1.5,
    borderColor: '#FFCDD2',
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 8,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#fff',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    borderWidth: 1.5,
    borderColor: '#FFCDD2',
  },
  deleteText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#D32F2F',
  },
  logoutText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#EF5350',
  },

  // ── Footer ──
  versionText: {
    textAlign: 'center',
    color: '#B0BEC5',
    fontSize: 12,
    marginTop: 20,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 18,
  },
  legalModal: {
    maxHeight: '82%',
    backgroundColor: '#fff',
    borderRadius: 14,
    overflow: 'hidden',
  },
  legalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#ECEFF1',
  },
  legalTitle: {
    flex: 1,
    color: '#1C1C1E',
    fontSize: 18,
    fontWeight: '800',
  },
  legalCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F5F7FA',
    justifyContent: 'center',
    alignItems: 'center',
  },
  legalScroll: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  legalBody: {
    color: '#374151',
    fontSize: 14,
    lineHeight: 21,
  },
  legalDoneBtn: {
    margin: 16,
    backgroundColor: '#1565C0',
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 13,
  },
  legalDoneText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },

  bottomSpacer: {
    height: 40,
  },
});

export default ProfileScreen;
