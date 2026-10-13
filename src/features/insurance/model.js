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

export const RENEWAL_PERIODS = Object.freeze([
  { key: 1, label: 'Monthly' },
  { key: 3, label: 'Every 3 months' },
  { key: 6, label: 'Every 6 months' },
  { key: 12, label: 'Yearly' },
  { key: 24, label: 'Every 2 years' },
]);
export const renewalPeriodLabel = (months) => RENEWAL_PERIODS.find((period) => period.key === months)?.label || 'Yearly';

// Within this many days of its end date a policy shows as expiring soon.
export const EXPIRING_DAYS = 30;

const clean = (value, max = 200) => String(value ?? '').trim().slice(0, max);
const day = (value) => (/^\d{4}-\d{2}-\d{2}$/.test(value || '') ? value : '');
const id = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const daysBetween = (from, to) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000);
const addDays = (value, amount) => {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
};
const addMonths = (value, amount) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  if (!match) return '';
  const sourceYear = Number(match[1]), sourceMonth = Number(match[2]) - 1, sourceDay = Number(match[3]);
  const monthIndex = sourceYear * 12 + sourceMonth + amount;
  const year = Math.floor(monthIndex / 12), month = ((monthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0, 12)).getUTCDate();
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(Math.min(sourceDay, lastDay)).padStart(2, '0')}`;
};
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
    // Older auto-renewing records did not store a cadence. They migrate to annual renewal,
    // which matches the common DAN membership/policy cycle and the old UI's implied behavior.
    renewalMonths: RENEWAL_PERIODS.some((period) => period.key === Number(value.renewalMonths)) ? Number(value.renewalMonths) : 12,
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

// The renewal term containing `onDate`. The entered dates remain the first known term, while
// every consumer gets an up-to-date window without silently rewriting the user's source data.
export function policyTermForDate(policy, onDate) {
  const startDate = day(policy?.startDate), endDate = day(policy?.endDate), target = day(onDate);
  if (!policy?.autoRenews || !endDate || !target || target <= endDate) return { startDate, endDate, cycle: 0 };
  const months = RENEWAL_PERIODS.some((period) => period.key === Number(policy.renewalMonths)) ? Number(policy.renewalMonths) : 12;
  const endParts = endDate.split('-').map(Number), targetParts = target.split('-').map(Number);
  const elapsedMonths = (targetParts[0] - endParts[0]) * 12 + targetParts[1] - endParts[1];
  let cycle = Math.max(1, Math.floor(elapsedMonths / months));
  while (addMonths(endDate, cycle * months) < target) cycle += 1;
  while (cycle > 1 && addMonths(endDate, (cycle - 1) * months) >= target) cycle -= 1;
  const previousEnd = addMonths(endDate, (cycle - 1) * months);
  return { startDate: addDays(previousEnd, 1), endDate: addMonths(endDate, cycle * months), cycle };
}

// Where a policy stands today: not started yet, active, expiring soon, expired, or no end date.
// An auto-renewing policy never shows as expired or expiring.
export function policyStatus(policy, today) {
  if (policy.startDate && policy.startDate > today) return { key: 'upcoming', label: 'Starts later', tone: 'info' };
  if (policy.autoRenews) return { key: 'active', label: 'Active · auto-renews', tone: 'good', term: policyTermForDate(policy, today) };
  if (!policy.endDate) return { key: 'active', label: 'Active', tone: 'good' };
  if (policy.endDate < today) return { key: 'expired', label: 'Expired', tone: 'danger' };
  const left = daysBetween(today, policy.endDate);
  if (left <= EXPIRING_DAYS) return { key: 'expiring', label: left === 0 ? 'Expires today' : `Expires in ${left} ${left === 1 ? 'day' : 'days'}`, tone: 'warning' };
  return { key: 'active', label: 'Active', tone: 'good' };
}

// Does the policy cover every day from `start` to `end`?
export function coversDates(policy, start, end) {
  if (!start) return false;
  const last = end || start;
  const effectiveEnd = policy.autoRenews ? policyTermForDate(policy, last).endDate : policy.endDate;
  return (!policy.startDate || policy.startDate <= start) && (!effectiveEnd || effectiveEnd >= last);
}

// The policies that go with a plan: dive-accident cover found automatically (any dive policy in
// force for part of the plan), plus the ones the diver attached (travel, liability…).
// `covering` is the dive policy that covers the whole plan, if any; `gaps` are dive policies that
// start late or end before the plan does.
export function policiesForPlan(plan, policies) {
  const start = plan.startDate, end = plan.endDate || plan.startDate;
  const overlaps = (policy) => {
    const effectiveEnd = policy.autoRenews ? policyTermForDate(policy, start).endDate : policy.endDate;
    return start && (!policy.startDate || policy.startDate <= end) && (!effectiveEnd || effectiveEnd >= start);
  };
  const auto = policies.filter((policy) => policy.type === 'dive' && overlaps(policy));
  const covering = auto.find((policy) => coversDates(policy, start, end)) || null;
  const attachedIds = new Set(plan.insuranceIds || []);
  const attached = policies.filter((policy) => attachedIds.has(policy.id) && !auto.includes(policy));
  return { auto, attached, covering, gaps: covering ? [] : auto.filter((policy) => !coversDates(policy, start, end)) };
}
