// Pieces shared by the document (Letter) and phone layouts of a shared plan PDF.
import { CERT_REQUIREMENTS, SEGMENT_TYPES, daysBetween, formatDay, formatTime } from './model';
import { insuranceTypeLabel, policyTermForDate, policyTitle, renewalPeriodLabel } from '../insurance/model';

export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));

export const sameText = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
// A rental car picked up and returned at the same counter reads once, not as a long A → A route.
export const route = leg => (leg.from && leg.to && sameText(leg.from, leg.to)
  ? `${leg.type === 'car' ? 'Pick-up &amp; return' : 'At'} ${escapeHtml(leg.from)}`
  : [leg.from, leg.to].filter(Boolean).map(escapeHtml).join(' <span class="route-arrow">→</span> '));
export const segmentName = (leg, variant) => {
  const name = leg.title || leg.provider || SEGMENT_TYPES[leg.type]?.label || 'Itinerary item';
  if (variant === 'continuing') return `${leg.type === 'liveaboard' ? 'On board' : leg.type === 'car' ? 'Rental car' : 'Staying'} · ${name}`;
  if (variant === 'end') return `${leg.type === 'stay' ? 'Check out' : leg.type === 'car' ? 'Return car' : leg.type === 'liveaboard' ? 'Disembark' : 'Ends'} · ${name}`;
  return name;
};
export const segmentTime = (leg, variant) => variant === 'continuing'
  ? 'All day'
  : formatTime(variant === 'end' ? leg.endTime : leg.startTime) || 'Any time';
export const telHref = phone => `tel:${String(phone).replace(/[^\d+]/g, '')}`;
export const when = (date, time, sameDayAs) => [date && date !== sameDayAs ? formatDay(date, { weekday: true }) : '', formatTime(time)].filter(Boolean).join(' · ');

// The facts someone needs at the counter or on the phone: confirmation, a number to call,
// and when this item wraps up. Later rows repeat the confirmation and phone on purpose: that
// is the day you are standing at checkout or the rental return.
export function segmentFacts(leg, variant, date, operator) {
  const facts = [];
  if (leg.reference) facts.push({ label: 'Confirmation', value: escapeHtml(leg.reference), tone: 'code' });
  // Dive days usually go out with the trip's operator, whose number lives on the plan.
  const phone = leg.phone || (SEGMENT_TYPES[leg.type]?.diving && operator.phone && (!leg.provider || sameText(leg.provider, operator.name)) ? operator.phone : '');
  if (phone) facts.push({ label: 'Phone', value: `<a href="${escapeHtml(telHref(phone))}">${escapeHtml(phone)}</a>`, tone: 'phone' });
  const spans = SEGMENT_TYPES[leg.type]?.overnight || SEGMENT_TYPES[leg.type]?.spans;
  const length = daysBetween(leg.startDate, leg.endDate);
  if (spans && length > 0) {
    const unit = leg.type === 'car' ? 'day' : 'night';
    const count = leg.type === 'car' ? length + 1 : length;
    const position = (daysBetween(leg.startDate, date) ?? 0) + 1;
    if (variant === 'continuing') facts.push({ label: leg.type === 'car' ? 'Rental' : 'Stay', value: `${unit === 'day' ? 'Day' : 'Night'} ${position} of ${count}` });
    else if (variant === 'start') facts.push({ label: leg.type === 'car' ? 'Rental' : 'Stay', value: `${count} ${unit}${count === 1 ? '' : 's'}` });
  }
  const endLabel = { stay: 'Check out', car: 'Return', liveaboard: 'Disembark', flight: 'Arrives', drive: 'Arrive', transfer: 'Arrives', ferry: 'Arrives', diving: 'Back on shore' }[leg.type] || 'Ends';
  // Ongoing days already say "night 3 of 7"; the checkout time lives on the first and last rows.
  const ends = variant === 'start' ? when(leg.endDate, leg.endTime, leg.startDate) : '';
  if (ends) facts.push({ label: endLabel, value: escapeHtml(ends) });
  if (variant === 'start' && leg.dives) facts.push({ label: 'Dives', value: String(leg.dives) });
  return facts;
}

export const renderFacts = facts => facts.map(({ label, value, tone }) => `<div class="glance-row${tone ? ` glance-${tone}` : ''}"><span>${escapeHtml(label)}</span><strong>${value}</strong></div>`).join('');

export function renderInsurance(policy, planEndDate) {
  const term = policyTermForDate(policy, planEndDate);
  const identifiers = [
    policy.policyNumber ? `Policy ${policy.policyNumber}` : '',
    policy.memberNumber ? `Member ${policy.memberNumber}` : '',
  ].filter(Boolean).map(escapeHtml).join(' <span class="sep">·</span> ');
  const coverage = policy.autoRenews
    ? `${renewalPeriodLabel(policy.renewalMonths)} auto-renewal${term.endDate ? ` · effective through ${formatDay(term.endDate, { year: true })}` : ''}`
    : term.endDate ? `Through ${formatDay(term.endDate, { year: true })}` : 'No expiration date recorded';
  return `<div class="insurance-card">
    <div class="insurance-kind">${escapeHtml(insuranceTypeLabel(policy.type))}</div>
    <div class="insurance-title">${escapeHtml(policyTitle(policy))}</div>
    ${identifiers ? `<div class="insurance-detail">${identifiers}</div>` : ''}
    <div class="insurance-detail">${escapeHtml(coverage)}</div>
    ${policy.emergencyPhone ? `<div class="insurance-phone"><span>Emergency assistance</span><strong><a href="${escapeHtml(telHref(policy.emergencyPhone))}">${escapeHtml(policy.emergencyPhone)}</a></strong></div>` : ''}
  </div>`;
}

export function requirementList(plan) {
  const certs = (plan.requirements?.certs || []).map((key) => CERT_REQUIREMENTS.find((entry) => entry.key === key)?.label).filter(Boolean);
  return [
    certs.length ? `Certification: ${certs.join(', ')}` : '',
    plan.requirements?.minDives ? `${plan.requirements.minDives}+ logged dives` : '',
    plan.requirements?.recentMonths ? `Dived within ${plan.requirements.recentMonths} months` : '',
    plan.requirements?.insurance ? 'Dive insurance' : '',
    plan.requirements?.medical ? 'Medical statement' : '',
    plan.requirements?.waiver ? 'Signed waiver' : '',
  ].filter(Boolean);
}

// Directions from a shared PDF. Both are plain https links: on a phone they open the Maps
// app, anywhere else the website. Only places a map can find get links; "Home" or
// "Resort dive pier" would just send someone to a search.
export function directionsPlace(leg, variant) {
  const place = String((variant === 'end' && leg.type === 'car' ? leg.to || leg.from : leg.from || leg.to) || '').trim();
  if (!place) return '';
  if (leg.type === 'flight' && /^[a-z]{3,4}$/i.test(place)) return `${place.toUpperCase()} airport`;
  return /\d/.test(place) || place.includes(',') ? place : '';
}

export function mapsLinks(place) {
  if (!place) return '';
  const query = encodeURIComponent(place);
  return `<div class="maps"><a href="https://maps.apple.com/?daddr=${query}">Apple Maps</a><a href="https://www.google.com/maps/dir/?api=1&amp;destination=${query}">Google Maps</a></div>`;
}

const ONGOING_TAGS = { stay: 'Staying', car: 'Car', liveaboard: 'On board' };

// What is still running on a day between its first and last (a hotel, a rental car), for the
// slim "Staying · Super 8 · Night 2 of 3" line both layouts show instead of repeating the
// full row. Its address, confirmation and phone stay on the first and last rows.
export function ongoingItems(entries, date, operator) {
  return entries.filter(({ variant }) => variant === 'continuing').map(({ leg, variant }) => ({
    tag: ONGOING_TAGS[leg.type] || SEGMENT_TYPES[leg.type]?.label || 'Ongoing',
    name: leg.title || leg.provider || SEGMENT_TYPES[leg.type]?.label || '',
    position: segmentFacts(leg, variant, date, operator).find((fact) => !fact.tone)?.value || '',
  }));
}

// Every confirmation and phone on the trip, one entry per booking: flights bought on one
// confirmation share an entry. Both layouts list these on their cover.
export function bookingEntries(plan) {
  const byKey = new Map();
  for (const leg of plan.segments || []) {
    if (!leg.reference && !leg.phone) continue;
    const key = leg.reference ? `ref:${leg.reference.toUpperCase()}` : `leg:${leg.id}`;
    const entry = byKey.get(key) || { legs: [], reference: leg.reference, phone: '' };
    entry.legs.push(leg);
    entry.phone = entry.phone || leg.phone;
    byKey.set(key, entry);
  }
  return [...byKey.values()].map(({ legs, reference, phone }) => {
    const type = legs[0].type;
    const kind = legs.length > 1 && legs.every((leg) => leg.type === type) ? `${SEGMENT_TYPES[type]?.label || 'Item'}s` : SEGMENT_TYPES[type]?.label || 'Booking';
    const name = [...new Set(legs.map((leg) => leg.title || leg.provider).filter(Boolean))].join(' · ') || kind;
    const provider = legs[0].provider && legs[0].provider !== legs[0].title ? legs[0].provider : '';
    return { kind, name, provider, reference, phone };
  });
}

// Runs inside the PDF renderer, so page breaks come from real measurements in whatever
// engine prints the PDF. Moves each [data-group] from #flow onto copies of #page-template,
// unit by unit, starting a new page (and a "continued" copy of the group's heading) only
// when the next unit would cross the page's data-reserve (px kept clear for the footer).
// A block marked data-keep-next (a section heading) moves along with the group after it.
export const PAGINATE_SCRIPT = `(function () {
  var flow = document.getElementById('flow');
  var template = document.getElementById('page-template');
  var pages = [];
  var page = null;
  var each = function (list, fn) { Array.prototype.slice.call(list).forEach(fn); };
  function newPage(label, cover) {
    var node = template.content.firstElementChild.cloneNode(true);
    if (cover) node.removeChild(node.querySelector('.page-head'));
    else node.querySelector('.page-label').textContent = label;
    document.body.insertBefore(node, flow);
    page = { node: node, main: node.querySelector('main') };
    pages.push(page);
  }
  function full() {
    var last = page.main.lastElementChild;
    if (!last) return false;
    var reserve = Number(page.node.getAttribute('data-reserve')) || 54;
    var limit = page.node.getBoundingClientRect().top + page.node.offsetHeight - reserve;
    return last.getBoundingClientRect().bottom > limit;
  }
  function shell(group, continued) {
    var copy = group.cloneNode(true);
    var units = copy.querySelector('[data-units]') || copy;
    each(units.querySelectorAll(':scope > [data-unit]'), function (unit) { unit.remove(); });
    if (continued) {
      var mark = copy.querySelector('[data-continued]');
      if (mark) mark.textContent = mark.getAttribute('data-continued');
      var label = copy.querySelector('.label');
      if (label) label.textContent = group.getAttribute('data-label') + ' · continued';
    }
    page.main.appendChild(copy);
    return { node: copy, units: units, count: 0 };
  }
  // Moves something that does not fit to a fresh page, unless it is already alone there.
  function settle(node, label) {
    if (!full() || page.main.children.length === 1) return false;
    var lead = node.previousElementSibling;
    var keep = lead && lead.hasAttribute('data-keep-next') && page.main.children.length > 2 ? lead : null;
    node.remove();
    if (keep) keep.remove();
    newPage(label);
    if (keep) page.main.appendChild(keep);
    page.main.appendChild(node);
    return true;
  }
  function place(group, label) {
    var units = group.querySelector('[data-units]') || group;
    var list = Array.prototype.slice.call(units.querySelectorAll(':scope > [data-unit]'));
    var current = shell(group, false);
    if (!list.length) { settle(current.node, label); return; }
    list.forEach(function (unit) {
      current.units.appendChild(unit);
      current.count += 1;
      if (!full()) return;
      // A heading always travels with its first row; later rows continue under a copy.
      if (current.count === 1) { settle(current.node, label); return; }
      unit.remove();
      newPage(label);
      current = shell(group, true);
      current.units.appendChild(unit);
      current.count += 1;
    });
  }
  each(flow.children, function (section) {
    var label = section.getAttribute('data-page-label');
    if (section.hasAttribute('data-cover')) newPage(label, true);
    else if (section.hasAttribute('data-new-page') || !page) newPage(label);
    each(section.children, function (block) {
      if (block.hasAttribute('data-group')) place(block, label);
      else { page.main.appendChild(block); settle(block, label); }
    });
  });
  flow.remove();
  pages.forEach(function (entry, index) { entry.node.querySelector('.page-count').textContent = (index + 1) + ' / ' + pages.length; });
})();`;
