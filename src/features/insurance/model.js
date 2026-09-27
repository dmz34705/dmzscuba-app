// Insurance policies kept on this device: dive accident cover, travel, professional liability,
// equipment. Every field is typed in by the diver (nothing is read by AI); documents are the
// diver's own files. Pure and date-only safe; `today` is YYYY-MM-DD.

export const INSURANCE_TYPES = Object.freeze([
  { key: 'dive', label: 'Dive accident', hint: 'DAN, DiveAssure, PADI…' },
  { key: 'travel', label: 'Travel', hint: 'Trip cancellation, medical, evacuation' },
  { key: 'liability', label: 'Professional liability', hint: 'Instructor / divemaster cover' },
  { key: 'equipment', label: 'Equipment', hint: 'Gear loss, theft or damage' },
  { key: 'other', label: 'Other', hint: '' },
]);
export const insuranceTypeLabel = (key) => INSURANCE_TYPES.find((type) => type.key === key)?.label || 'Insurance';

// Within this many days of its end date a policy shows as expiring soon.
export const EXPIRING_DAYS = 30;

const clean = (value, max = 200) => String(value ?? '').trim().slice(0, max);
const day = (value) => (/^\d{4}-\d{2}-\d{2}$/.test(value || '') ? value : '');
const id = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const daysBetween = (from, to) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000);
export const createPolicyId = () => id('policy');
export const createDocumentId = () => id('doc');

export function normalizeDocument(value = {}) {
  const uri = clean(value.uri, 2000);
  if (!uri) return null;
  return {
    id: clean(value.id, 80) || createDocumentId(), uri, name: clean(value.name, 160) || 'Document',
    mimeType: clean(value.mimeType, 100), kind: value.kind === 'photo' ? 'photo' : 'file', size: Number(value.size) > 0 ? Number(value.size) : null,
  };
}

export function normalizePolicy(value = {}, now = new Date()) {
  const type = INSURANCE_TYPES.some((entry) => entry.key === value.type) ? value.type : 'dive';
  const startDate = day(value.startDate);
  const endDate = day(value.endDate) && (!startDate || value.endDate >= startDate) ? value.endDate : '';
  return {
    id: clean(value.id, 80) || createPolicyId(), type,
    provider: clean(value.provider, 120), policyNumber: clean(value.policyNumber, 80), memberNumber: clean(value.memberNumber, 80),
    startDate, endDate, autoRenews: value.autoRenews === true,
    emergencyPhone: clean(value.emergencyPhone, 60), covered: clean(value.covered, 200), notes: clean(value.notes, 2000),
    documents: (Array.isArray(value.documents) ? value.documents : []).map(normalizeDocument).filter(Boolean).slice(0, 30),
    createdAt: clean(value.createdAt, 40) || now.toISOString(), updatedAt: now.toISOString(),
  };
}

export function normalizeInsuranceState(value) {
  const policies = (Array.isArray(value?.policies) ? value.policies : []).map((policy) => normalizePolicy(policy, new Date(policy?.updatedAt || Date.now())));
  return { version: 1, policies };
}

export const policyTitle = (policy) => [policy.provider, insuranceTypeLabel(policy.type)].filter(Boolean).join(' · ') || 'Insurance policy';

// Where a policy stands today: not started yet, active, expiring soon, expired, or no end date.
// An auto-renewing policy never shows as expired or expiring.
export function policyStatus(policy, today) {
  if (policy.startDate && policy.startDate > today) return { key: 'upcoming', label: 'Starts later', tone: 'info' };
  if (!policy.endDate || policy.autoRenews) return { key: 'active', label: policy.autoRenews ? 'Active · renews' : 'Active', tone: 'good' };
  if (policy.endDate < today) return { key: 'expired', label: 'Expired', tone: 'danger' };
  const left = daysBetween(today, policy.endDate);
  if (left <= EXPIRING_DAYS) return { key: 'expiring', label: left === 0 ? 'Expires today' : `Expires in ${left} ${left === 1 ? 'day' : 'days'}`, tone: 'warning' };
  return { key: 'active', label: 'Active', tone: 'good' };
}

// Does the policy cover every day from `start` to `end`?
export function coversDates(policy, start, end) {
  if (!start) return false;
  const last = end || start;
  return (!policy.startDate || policy.startDate <= start) && (policy.autoRenews || !policy.endDate || policy.endDate >= last);
}

// The policies that go with a plan: dive-accident cover found automatically (any dive policy in
// force for part of the plan), plus the ones the diver attached (travel, liability…).
// `covering` is the dive policy that covers the whole plan, if any; `gaps` are dive policies that
// start late or end before the plan does.
export function policiesForPlan(plan, policies) {
  const start = plan.startDate, end = plan.endDate || plan.startDate;
  const overlaps = (policy) => start && (!policy.startDate || policy.startDate <= end) && (policy.autoRenews || !policy.endDate || policy.endDate >= start);
  const auto = policies.filter((policy) => policy.type === 'dive' && overlaps(policy));
  const covering = auto.find((policy) => coversDates(policy, start, end)) || null;
  const attachedIds = new Set(plan.insuranceIds || []);
  const attached = policies.filter((policy) => attachedIds.has(policy.id) && !auto.includes(policy));
  return { auto, attached, covering, gaps: covering ? [] : auto.filter((policy) => !coversDates(policy, start, end)) };
}
