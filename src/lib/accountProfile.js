export const DEFAULT_PROFILE = {
  email: '',
  emergencyContactName: '',
  emergencyContactPhone: '',
  firstName: '',
  lastName: '',
  location: '',
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
  return '';
}
