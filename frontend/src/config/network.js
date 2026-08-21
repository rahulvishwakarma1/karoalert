const PRODUCTION_API_ORIGIN = 'https://app.shreesswpl.com';

const normalizeConfiguredUrl = (value) => {
  if (!value) return null;
  const trimmed = value.trim().replace(/\/+$/, '');
  return trimmed.length > 0 ? trimmed : null;
};

const getConfiguredBaseUrl = () => {
  const configured = normalizeConfiguredUrl(process.env.EXPO_PUBLIC_API_URL);
  if (!configured) return null;
  return configured.replace(/\/api$/, '');
};

export const getApiBaseUrl = () => {
  const configured = getConfiguredBaseUrl();
  return `${configured || PRODUCTION_API_ORIGIN}/api`;
};

export const getSocketBaseUrl = () => {
  const configured = getConfiguredBaseUrl();
  return configured || PRODUCTION_API_ORIGIN;
};
