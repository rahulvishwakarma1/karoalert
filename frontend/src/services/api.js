import axios from 'axios';
import storage from '../utils/authStorage';
import { getApiBaseUrl } from '../config/network';

const API_BASE_URL = getApiBaseUrl();

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
});

// Attach Bearer token on every request
api.interceptors.request.use(
  async (config) => {
    const token = await storage.getToken();
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (err) => Promise.reject(err)
);

// Auto-logout on 401
api.interceptors.response.use(
  (r) => r,
  async (err) => {
    if (err.response?.status === 401) {
      await storage.clearAuth();
    }
    return Promise.reject(err);
  }
);

// ── Auth ───────────────────────────────────────────────────────────────
export const authAPI = {
  login(identifier, password) {
    return api.post('/auth/login', { identifier, password });
  },
  registerSendOtp({ name, email, phone, password, car_number = null }) {
    return api.post('/auth/register/send-otp', { name, email, phone, password, car_number });
  },
  registerVerifyOtp(phone, otp) {
    return api.post('/auth/register/verify-otp', { phone, otp });
  },
  registerVerifyFirebase({ phone, firebase_token, name, email, password, car_number = null }) {
    return api.post('/auth/register/verify-otp', { phone, firebase_token, name, email, password, car_number });
  },
  requestPasswordOtp(email) {
    return api.post('/auth/forgot-password/request-otp', { email });
  },
  updatePassword(email, otp, newPassword) {
    return api.post('/auth/forgot-password/reset', { email, otp, newPassword });
  },
  getProfile() {
    return api.get('/auth/profile');
  },
  updateProfile({ name, phone, car_number } = {}) {
    return api.put('/auth/profile', { name, phone, car_number });
  },
  registerPushToken(pushToken, expoPushToken = null) {
    return api.post('/auth/push-token', { pushToken, expoPushToken });
  },
  unregisterPushToken() {
    return api.delete('/auth/push-token');
  },
};

// ── Scan / Public ───────────────────────────────────────────────────────
export const scanAPI = {
  getOwnerDetails(qrCodeId) {
    // Public endpoint — no auth header needed
    return api.get(`/scan/public/${qrCodeId}`, {
      headers: { Authorization: '' }   // clear any stored token for public route
    });
  },
  scanQR(qr_code_id) {
    return api.post('/scan/scan', { qr_code_id });
  },
  ringOwner(qr_code_id, scanner_socket_id, scanner_user_id) {
    return api.post('/scan/ring', { qr_code_id, scanner_socket_id, scanner_user_id });
  },
  startTwilioCall({ qrCodeId, callerPhone, roomId }) {
    return api.post('/start-call', {
      qr_code_id: qrCodeId,
      caller_phone: callerPhone,
      roomId,
    });
  },
  sendNotification(ownerId, message) {
    return api.post('/scan/notify', { owner_id: ownerId, message });
  },
  getNotifications() {
    return api.get('/scan/notifications');
  },
  getMyScans() {
    return api.get('/scan/history');
  },
  initiateCall(qrCodeId, socketId, userId) {
    return api.post('/scan/call', { qr_code_id: qrCodeId, scanner_socket_id: socketId, scanner_user_id: userId });
  },
  cancelCall(callId, qrCodeId) {
    return api.post('/scan/cancel-call', { call_id: callId, qr_code_id: qrCodeId });
  },
};

// ── Vehicles ────────────────────────────────────────────────────────────
export const vehiclesAPI = {
  getVehicles() {
    return api.get('/vehicles');
  },
  getVehicle(id) {
    return api.get(`/vehicles/${id}`);
  },
  createVehicle(data) {
    return api.post('/vehicles', data);
  },
  updateVehicle(id, data) {
    return api.put(`/vehicles/${id}`, data);
  },
  deleteVehicle(id) {
    return api.delete(`/vehicles/${id}`);
  },
};

// ── QR Codes ─────────────────────────────────────────────────────────────
export const qrAPI = {
  generateQR(vehicleId) {
    return api.post('/qr/generate', { vehicle_id: vehicleId });
  },
  getMyQR() {
    return api.get('/qr/my-qr');
  },
  regenerateQR() {
    return api.post('/qr/regenerate');
  },
  getVehicleQRs(vehicleId) {
    return api.get(`/qr/vehicle/${vehicleId}`);
  },
  deactivateQR(qrCodeId) {
    return api.put(`/qr/deactivate/${qrCodeId}`);
  },
  activateQR(qrCodeId) {
    return api.put(`/qr/activate/${qrCodeId}`);
  },
};

export const paymentAPI = {
  createRazorpayOrder(planId) {
    return api.post('/payments/razorpay/create-order', planId ? { plan_id: planId } : {});
  },
  recordRazorpaySuccess(data) {
    return api.post('/payments/razorpay/success', data);
  },
};

export const membershipPlanAPI = {
  getPlans() {
    return api.get('/membership/plans');
  },
  getAdminPlans() {
    return api.get('/membership/plans/all');
  },
  createPlan(data) {
    return api.post('/membership/plans', data);
  },
  updatePlan(id, data) {
    return api.put(`/membership/plans/${id}`, data);
  },
  deletePlan(id) {
    return api.delete(`/membership/plans/${id}`);
  },
};

export const adminAPI = {
  getStats() {
    return api.get('/admin/stats');
  },
  getUsers() {
    return api.get('/admin/users');
  },
  getAdminProfile() {
    return api.get('/admin/profile');
  },
  getSubAdmins() {
    return api.get('/admin/sub-admins');
  },
  createSubAdmin(data) {
    return api.post('/admin/sub-admins', data);
  },
  updateSubAdmin(id, data) {
    return api.put(`/admin/sub-admins/${id}`, data);
  },
  deleteSubAdmin(id) {
    return api.delete(`/admin/sub-admins/${id}`);
  },
  updatePermissions(userId, data) {
    return api.put(`/admin/users/${userId}/permissions`, data);
  },
  activateMembership(userId, data) {
    return api.post(`/admin/users/${userId}/activate-membership`, data);
  },
  deleteUser(userId) {
    return api.delete(`/admin/users/${userId}`);
  },
  deleteAccount(password) {
    return api.delete('/auth/account', { data: { password } });
  },
};

export const communicationAPI = {
  getSettings() {
    return api.get('/communication-settings');
  },
  updateSettings(data) {
    return api.put('/communication-settings', data);
  },
  getVisibleOptions(qrCodeId) {
    return api.get(`/communication-settings/visible-options/${qrCodeId}`);
  },
};

export const privateCallAPI = {
  getPlans() {
    return api.get('/private-call/plans');
  },
  getAdminPlans() {
    return api.get('/private-call/plans/all');
  },
  createPlan(data) {
    return api.post('/private-call/plans', data);
  },
  updatePlan(id, data) {
    return api.put(`/private-call/plans/${id}`, data);
  },
  deletePlan(id) {
    return api.delete(`/private-call/plans/${id}`);
  },
  getBalance() {
    return api.get('/private-call/balance');
  },
  getOwnerService() {
    return api.get('/private-call/owner-service');
  },
  createPurchaseOrder(planId) {
    return api.post('/private-call/purchase/create-order', { plan_id: planId });
  },
  recordPurchaseSuccess(data) {
    return api.post('/private-call/purchase/success', data);
  },
  startPrivateCall(qrCodeId, callType = 'private_call') {
    return api.post('/private-call/start-call', { qr_code_id: qrCodeId, call_type: callType });
  },
  endCall(callId) {
    return api.post(`/private-call/end-call/${callId}`);
  },
  getCallHistory() {
    return api.get('/private-call/history');
  },
  getPurchaseHistory() {
    return api.get('/private-call/purchase-history');
  },
  getAdminReports() {
    return api.get('/private-call/admin/reports');
  },
  grantUserAccess(data) {
    return api.post('/private-call/admin/grant-access', data);
  },
};

export const turnAPI = {
  getCredentials() {
    return api.get('/turn-credentials', { timeout: 6000 });
  },
};

export default api;
