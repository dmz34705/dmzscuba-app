export const DEFAULT_PROFILE = {
  certificationAgency: '',
  certificationLevel: '',
  certificationNumber: '',
  defaultPpO2: '1.4',
  defaultRmv: '18',
  email: '',
  emergencyContactName: '',
  emergencyContactPhone: '',
  firstName: '',
  lastName: '',
  location: '',
  loggedDives: '',
  phone: '',
  preferredName: '',
};

export function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim());
}

export function validateLogin({ email, password }) {
  if (!validateEmail(email)) return 'Enter a valid email address.';
  if (!password) return 'Enter your password.';
  return '';
}

export function validateCreateAccount({ firstName, lastName, email, password, confirmPassword }) {
  if (!String(firstName).trim() || !String(lastName).trim()) return 'Enter your first and last name.';
  if (!validateEmail(email)) return 'Enter a valid email address.';
  if (String(password).length < 12) return 'Use at least 12 characters for your password.';
  if (password !== confirmPassword) return 'The passwords do not match.';
  return '';
}

export function validateProfile(profile) {
  if (!String(profile?.firstName || '').trim() || !String(profile?.lastName || '').trim()) {
    return 'First and last name are required.';
  }
  const loggedDives = Number(profile?.loggedDives || 0);
  if (!Number.isInteger(loggedDives) || loggedDives < 0 || loggedDives > 100000) {
    return 'Logged dives must be a whole number between 0 and 100,000.';
  }
  const defaultPpO2 = Number(profile?.defaultPpO2);
  if (!Number.isFinite(defaultPpO2) || defaultPpO2 < 0.5 || defaultPpO2 > 2) {
    return 'Working ppO2 must be between 0.5 and 2.0 ATA.';
  }
  const defaultRmv = Number(profile?.defaultRmv);
  if (!Number.isFinite(defaultRmv) || defaultRmv < 1 || defaultRmv > 200) {
    return 'Planning RMV must be between 1 and 200 L/min.';
  }
  return '';
}
