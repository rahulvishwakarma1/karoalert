import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = 'auth_token';
const USER_KEY  = 'user_data';

const storage = {
  async storeToken(token) {
    try { await AsyncStorage.setItem(TOKEN_KEY, token); } catch (e) { console.error(e); }
  },
  async getToken() {
    try { return await AsyncStorage.getItem(TOKEN_KEY); } catch (e) { return null; }
  },
  async storeUser(user) {
    try { await AsyncStorage.setItem(USER_KEY, JSON.stringify(user)); } catch (e) { console.error(e); }
  },
  async getUser() {
    try {
      const raw = await AsyncStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  },
  async removeToken() { try { await AsyncStorage.removeItem(TOKEN_KEY); } catch (e) {} },
  async removeUser()  { try { await AsyncStorage.removeItem(USER_KEY); } catch (e) {} },
  async getItem(key) {
    try { return await AsyncStorage.getItem(key); } catch (e) { return null; }
  },
  async setItem(key, value) {
    try { await AsyncStorage.setItem(key, value); } catch (e) { console.error(e); }
  },
  async removeItem(key) {
    try { await AsyncStorage.removeItem(key); } catch (e) {}
  },
  async clearAuth()   { await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]); }
};

export default storage;
