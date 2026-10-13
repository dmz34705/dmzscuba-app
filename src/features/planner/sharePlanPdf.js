import { SEGMENT_TYPES, STATUS_LABELS, formatDay, formatRange, formatTime, planTimeline, planTitle } from './model';
import { PAGINATE_SCRIPT, bookingEntries, directionsPlace, escapeHtml, mapsLinks, ongoingItems, renderFacts, renderInsurance, requirementList, route, segmentFacts, segmentName, segmentTime, telHref } from './planShareParts';
import { DMZ_LOGO_DATA_URI } from './dmzLogoData';
import { PHONE_PAGE, buildPhoneShareHtml } from './sharePlanPhone';

// Letter for email and print; phone-screen pages for reading on a phone.
export const SHARE_FORMATS = Object.freeze({ document: { width: 612, height: 792 }, phone: PHONE_PAGE });

function renderSegment({ leg, variant }, { date, operator = {} } = {}) {
  const details = [
    route(leg),
    leg.provider && leg.provider !== leg.title ? escapeHtml(leg.provider) : '',
  ].filter(Boolean).join(' <span class="sep">·</span> ');
  const facts = segmentFacts(leg, variant, date, operator);
  return `<div class="item${facts.length ? ' has-glance' : ''}" data-unit>
    <div class="time">${escapeHtml(segmentTime(leg, variant))}</div>
    <div class="item-main">
      <div class="item-top"><span class="type">${escapeHtml(SEGMENT_TYPES[leg.type]?.label || 'Item')}</span><span class="item-title">${escapeHtml(segmentName(leg, variant))}</span></div>
      ${details ? `<div class="item-detail">${details}</div>` : ''}
      ${variant === 'start' && leg.notes ? `<div class="item-notes">${escapeHtml(leg.notes)}</div>` : ''}
      ${mapsLinks(directionsPlace(leg, variant))}
    </div>
    ${facts.length ? `<div class="glance">${renderFacts(facts)}</div>` : ''}
  </div>`;
}

// A hotel or rental car between its first and last day sits in one strip under the date,
// side by side on the wide page, instead of a full row repeated every day.
function renderDay(day, operator) {
  const scheduled = day.entries.filter((entry) => entry.variant !== 'continuing');
  const ongoing = ongoingItems(day.entries, day.date, operator);
  return `<section class="day" data-group>
    <div class="day-head"><div><span class="day-number" data-continued="DAY ${day.index} · CONTINUED">DAY ${day.index}</span><h2>${escapeHtml(formatDay(day.date, { weekday: true, year: true }))}</h2></div>${scheduled.length ? `<span class="day-count">${scheduled.length} ${scheduled.length === 1 ? 'item' : 'items'}</span>` : ''}</div>
    ${ongoing.length ? `<div class="ongoing">${ongoing.map(({ tag, name, position }) => `<div class="ongoing-item"><span class="ongoing-tag">${escapeHtml(tag)}</span><span class="ongoing-name">${escapeHtml(name)}</span>${position ? `<span class="ongoing-when">${escapeHtml(position)}</span>` : ''}</div>`).join('')}</div>` : ''}
    <div class="day-items" data-units>${scheduled.map((entry) => renderSegment(entry, { date: day.date, operator })).join('')}</div>
    ${day.entries.length ? '' : '<div class="empty">Nothing scheduled yet.</div>'}
  </section>`;
}

const fact = (label, value, wide = false) => value ? `<div class="fact${wide ? ' fact-wide' : ''}"><span>${escapeHtml(label)}</span><strong>${value}</strong></div>` : '';
const telLink = (phone) => `<a href="${escapeHtml(telHref(phone))}">${escapeHtml(phone)}</a>`;
// A labelled block whose rows can split across pages; the label repeats as "continued".
const group = (label, className, units) => units.length
  ? `<div class="section-block" data-group data-label="${escapeHtml(label)}"><div class="section-label label">${escapeHtml(label)}</div><section class="${className}" data-units>${units.join('')}</section></div>`
  : '';
const intro = (kicker, heading, note) => `<div class="section-intro" data-keep-next><div><span>${kicker}</span><h2>${heading}</h2></div><p>${note}</p></div>`;

export function planPdfFileName(plan, format = 'document') {
  const name = planTitle(plan).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 55) || 'dive-plan';
  return `dmz-scuba-${name}${format === 'phone' ? '-phone' : ''}.pdf`;
}

export function buildPlanShareHtml(plan, { generatedAt = new Date(), insurance = [], format = 'document' } = {}) {
  if (format === 'phone') return buildPhoneShareHtml(plan, { generatedAt, insurance });
  const timeline = planTimeline(plan);
  const trip = plan.kind === 'trip';
  const operator = plan.operator || {};
  const destination = plan.destination || {};
  const location = [destination.area, destination.country].filter((value, index, list) => value && list.indexOf(value) === index).join(' - ');
  const tasks = plan.tasks || [];
  const tripDays = timeline.days.length || 1;
  const diveLegs = (plan.segments || []).filter((leg) => SEGMENT_TYPES[leg.type]?.diving);
  const diveDays = new Set(diveLegs.map((leg) => leg.startDate).filter(Boolean)).size;
  const diveNames = [...new Set(diveLegs.map((leg) => leg.title).filter(Boolean))];
  const itineraryCount = (plan.segments || []).length;
  const requirementItems = requirementList(plan);
  const generated = generatedAt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const title = planTitle(plan);
  const operatorFacts = [
    fact('Dive operator', escapeHtml(operator.name), true), fact('Meeting point', escapeHtml(operator.meetingPoint), true),
    fact('Phone', operator.phone && telLink(operator.phone)), fact('Email', operator.email && `<a href="mailto:${escapeHtml(operator.email)}">${escapeHtml(operator.email)}</a>`),
    fact('Website', escapeHtml(operator.website)), fact('Booking confirmation', escapeHtml(operator.confirmation)),
  ].filter(Boolean).join('');
  const bookings = bookingEntries(plan).map(({ kind, name, provider, reference, phone }) => `<div class="booking" data-unit>
      <span class="booking-kind">${escapeHtml(kind)}</span>
      <span class="booking-name"><strong>${escapeHtml(name)}</strong>${provider ? `<em>${escapeHtml(provider)}</em>` : ''}</span>
      <span class="booking-ref">${escapeHtml(reference || '—')}</span>
      <span class="booking-phone">${phone ? telLink(phone) : '—'}</span>
    </div>`);
  const hero = `<section class="hero">
      <div class="hero-top"><div class="brand-lockup"><i class="brand-logo"></i><div class="brand-copy"><div class="brand-name"><b>DMZ</b><span>SCUBA</span></div><div class="brand-tag">DIVE · TRAVEL · EXPLORE</div></div></div><div class="status">${escapeHtml(STATUS_LABELS[plan.status] || 'Dive plan')}</div></div>
      <div class="kicker">${trip ? 'DIVE TRIP OPERATIONS BRIEF' : 'DIVE DAY OPERATIONS BRIEF'}</div>
      <h1>${escapeHtml(title)}</h1>
      <div class="destination">${escapeHtml([destination.name, location].filter(Boolean).join(' - ') || 'Destination to be confirmed')}</div>
      <div class="depth-lines"><i></i><i></i><i></i></div>
    </section>
    <section class="metrics">
      <div><span>DATES</span><strong>${escapeHtml(trip ? formatRange(plan.startDate, plan.endDate) : formatDay(plan.startDate, { weekday: true, year: true }))}</strong></div>
      <div><span>${trip ? 'TRIP LENGTH' : 'START'}</span><strong>${trip ? `${tripDays} ${tripDays === 1 ? 'day' : 'days'}` : escapeHtml(formatTime(plan.startTime) || 'Time not set')}</strong></div>
      <div><span>DIVING</span><strong>${plan.dives ? `${plan.dives} planned ${plan.dives === 1 ? 'dive' : 'dives'}` : diveDays ? `${diveDays} dive ${diveDays === 1 ? 'day' : 'days'}` : 'Not set'}</strong></div>
      <div><span>ITINERARY</span><strong>${itineraryCount} ${itineraryCount === 1 ? 'item' : 'items'}</strong></div>
    </section>`;

  // One ordered flow; the script in the page lays it onto Letter pages by measuring. The
  // itinerary and reference sections continue on the current page when there is room, so a
  // short trip still fits on one sheet and a long one never leaves a half-empty page.
  const flow = `<div data-cover data-page-label="${trip ? 'Dive trip brief' : 'Dive day brief'}">
      <div>${hero}</div>
      ${diveNames.length ? `<section class="focus"><div class="section-label">Dive focus</div><div class="chips">${diveNames.slice(0, 8).map((name) => `<span>${escapeHtml(name)}</span>`).join('')}</div></section>` : ''}
      ${group('Bookings', 'bookings', bookings)}
      ${operatorFacts ? `<div class="section-block"><div class="section-label">Contacts</div><section class="facts">${operatorFacts}</section></div>` : ''}
      ${group(`Insurance for this ${trip ? 'trip' : 'dive'}`, 'insurance-grid', insurance.map((policy) => renderInsurance(policy, plan.endDate || plan.startDate).replace('<div class="insurance-card">', '<div class="insurance-card" data-unit>')))}
    </div>
    <div data-page-label="Day-by-day itinerary">
      ${intro('SCHEDULE', 'Your plan, day by day', 'Times are local. Confirm live conditions and final instructions with the operator.')}
      ${timeline.days.map((day) => renderDay(day, operator)).join('')}
    </div>
    <div data-page-label="Essential details">
      ${requirementItems.length || tasks.length || plan.notes ? intro('REFERENCE', 'Ready when you need it', 'Key requirements and shared trip actions in one place.') : ''}
      ${group('Operator requirements', 'requirements', requirementItems.map((item) => `<div data-unit><span class="check"></span>${escapeHtml(item)}</div>`))}
      ${group(`Shared checklist · ${tasks.filter((task) => task.done).length}/${tasks.length} complete`, 'tasks', tasks.map((task) => `<div class="task ${task.done ? 'done' : ''}" data-unit><span class="task-mark"></span>${escapeHtml(task.label)}</div>`))}
      ${group('Plan notes', 'notes', plan.notes ? [`<div data-unit>${escapeHtml(plan.notes)}</div>`] : [])}
      <div class="disclaimer"><strong>Shared snapshot</strong> - Prepared ${escapeHtml(generated)}. Confirm departure times, meeting points, weather, dive conditions and operator instructions before travel.</div>
    </div>`;
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  @page { size: Letter; margin: 0; }
  html, body, * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  * { box-sizing: border-box; }
  body { background: #071525; color: #eaf2ff; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; font-size: 10px; line-height: 1.4; margin: 0; }
  a { color: inherit; text-decoration: none; }
  #flow { left: 0; position: absolute; top: 0; visibility: hidden; width: 8.5in; }
  .brand-logo { background-image: url('${DMZ_LOGO_DATA_URI}'); background-position: center; background-repeat: no-repeat; background-size: contain; display: block; flex: 0 0 auto; }
  .pdf-page { background: #071525; height: 11in; overflow: hidden; padding: 26pt 34pt 34pt; position: relative; width: 8.5in; }
  .pdf-page + .pdf-page { break-before: page; page-break-before: always; }
  .hero { background-color: #082f4f; border: 1px solid #28637d; border-radius: 18px; min-height: 196px; overflow: hidden; padding: 20px 23px; position: relative; }
  .hero:after { border: 44px solid rgba(112,221,246,.06); border-radius: 50%; content: ""; height: 230px; position: absolute; right: -85px; top: -98px; width: 230px; }
  .hero-top { align-items: center; display: flex; justify-content: space-between; margin-bottom: 22px; position: relative; z-index: 1; }
  .brand-lockup { align-items: center; display: flex; gap: 9px; }.brand-lockup .brand-logo { height: 43px; width: 43px; }
  .brand-copy { border-left: 1px solid rgba(201,235,255,.25); padding-left: 10px; }.brand-name { align-items: baseline; display: flex; gap: 6px; line-height: 1; }
  .brand-name b { color: #e21b23; font-size: 22px; font-style: italic; font-weight: 950; letter-spacing: -1.2px; }.brand-name span { font-size: 11px; font-weight: 950; letter-spacing: 2.8px; }
  .brand-tag { color: #70ddf6; font-size: 5.5px; font-weight: 900; letter-spacing: 1.35px; margin-top: 5px; }
  .status { background: rgba(112,221,246,.12); border: 1px solid rgba(112,221,246,.38); border-radius: 999px; color: #70ddf6; font-size: 8px; font-weight: 900; letter-spacing: .9px; padding: 6px 10px; text-transform: uppercase; }
  .kicker { color: #f0c84b; font-size: 8px; font-weight: 900; letter-spacing: 1.7px; }
  h1 { font-size: 30px; line-height: 1.02; letter-spacing: -1px; margin: 5px 0 7px; max-width: 500px; }
  .destination { color: #a7c4d8; font-size: 13px; }
  .depth-lines { bottom: 24px; display: flex; gap: 5px; position: absolute; right: 26px; }
  .depth-lines i { background: #70ddf6; border-radius: 3px; display: block; height: 4px; opacity: .7; width: 30px; }
  .depth-lines i:nth-child(2) { opacity: .4; width: 19px; }.depth-lines i:nth-child(3) { background: #e21b23; opacity: .9; width: 7px; }
  .metrics { background-color: #0b1c2e; border: 1px solid #233b4e; border-radius: 12px; display: grid; grid-template-columns: 1.4fr .8fr .8fr .8fr; margin: 9px 0 12px; overflow: hidden; }
  .metrics div { border-right: 1px solid #233b4e; padding: 8px 11px; }.metrics div:last-child { border: 0; }
  .metrics span { color: #6f8da2; display: block; font-size: 7px; font-weight: 900; letter-spacing: .9px; margin-bottom: 3px; }.metrics strong { font-size: 10px; }
  .section-label { color: #70ddf6; font-size: 8px; font-weight: 900; letter-spacing: 1.35px; margin: 0 0 6px 2px; text-transform: uppercase; }
  .section-block { margin-bottom: 12px; }
  .focus { margin: 0 0 12px; }.chips { display: flex; flex-wrap: wrap; gap: 5px; }.chips span { background-color: #10283d; border: 1px solid #28536a; border-radius: 999px; color: #bdd9e8; font-size: 8px; font-weight: 750; padding: 4px 8px; }
  .bookings { background-color: #0b1c2e; border: 1px solid #233b4e; border-radius: 12px; overflow: hidden; }
  .booking { align-items: baseline; display: grid; gap: 12px; grid-template-columns: 74px 1fr 128px 118px; padding: 7px 12px; }.booking + .booking { border-top: 1px solid #233b4e; }
  .booking-kind { color: #6f8da2; font-size: 7px; font-weight: 900; letter-spacing: .8px; text-transform: uppercase; }
  .booking-name strong { font-size: 10px; }.booking-name em { color: #a7c4d8; font-size: 8px; font-style: normal; margin-left: 6px; }
  .booking-ref { color: #f0c84b; font-family: "SF Mono", Menlo, Consolas, monospace; font-size: 9px; font-weight: 800; letter-spacing: .4px; }.booking-phone { color: #70ddf6; font-size: 9px; font-weight: 800; text-align: right; }
  .facts { background-color: #0b1c2e; border: 1px solid #233b4e; border-radius: 12px; display: grid; grid-template-columns: 1fr 1fr; overflow: hidden; }
  .fact { border-bottom: 1px solid #233b4e; padding: 6px 10px; }.fact:nth-child(odd) { border-right: 1px solid #233b4e; }.fact-wide { grid-column: span 2; border-right: 0 !important; }
  .fact span { color: #6f8da2; display: block; font-size: 7px; font-weight: 900; letter-spacing: .8px; text-transform: uppercase; }.fact strong { display: block; font-size: 9px; margin-top: 2px; overflow-wrap: anywhere; }.fact a { color: #70ddf6; }
  .page-head { align-items: center; border-bottom: 2px solid #28536a; display: flex; justify-content: space-between; margin-bottom: 14px; padding-bottom: 8px; }.page-head > div:last-child { text-align: right; }.page-label { color: #70ddf6; display: block; font-size: 7px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase; }.page-head strong { font-size: 10px; }
  .mini-brand { align-items: center; display: flex; font-size: 8px; font-weight: 950; gap: 7px; letter-spacing: 1.5px; }.mini-brand .brand-logo { height: 23px; width: 23px; }.mini-brand > span { display: block; }.mini-brand b { color: #e21b23; font-style: italic; }.mini-brand small { color: #6f8da2; display: block; font-size: 4.5px; font-weight: 900; letter-spacing: 1.1px; margin-top: 2px; }
  .section-intro { align-items: end; display: flex; justify-content: space-between; margin: 4px 0 10px; }.section-intro span { color: #e21b23; font-size: 7px; font-weight: 900; letter-spacing: 1.3px; }.section-intro h2 { font-size: 18px; letter-spacing: -.3px; margin: 1px 0 0; }.section-intro p { color: #a7c4d8; font-size: 8px; margin: 0; max-width: 225px; text-align: right; }
  .day { background-color: #0b1c2e; border: 1px solid #28536a; border-radius: 11px; margin-bottom: 7px; overflow: hidden; }
  .day-head { align-items: center; background-color: #10283d; border-bottom: 1px solid #28536a; display: flex; justify-content: space-between; padding: 5px 10px; }.day-head > div { align-items: baseline; display: flex; gap: 8px; }
  .day-number { color: #e21b23; font-size: 7px; font-weight: 950; letter-spacing: 1.1px; }
  h2 { font-size: 12px; margin: 0; }
  .day-count { color: #a7c4d8; font-size: 8px; font-weight: 700; }
  .ongoing { background-color: #0d2236; border-bottom: 1px solid #233b4e; display: flex; flex-wrap: wrap; gap: 3px 22px; padding: 4px 10px 4px 86px; }
  .ongoing-item { align-items: baseline; display: flex; gap: 6px; }.ongoing-tag { color: #70ddf6; font-size: 6px; font-weight: 950; letter-spacing: .8px; text-transform: uppercase; }
  .ongoing-name { font-size: 8.5px; font-weight: 750; }.ongoing-when { color: #a7c4d8; font-size: 8px; font-weight: 700; }.ongoing-when:before { color: #6f8da2; content: '· '; }
  .day-items:empty { display: none; }
  .item { column-gap: 12px; display: grid; grid-template-columns: 64px 1fr; padding: 6px 10px; }.item.has-glance { grid-template-columns: 64px 1fr 176px; }
  .item + .item { border-top: 1px solid #233b4e; }
  .time { font-size: 9px; font-weight: 850; padding-top: 2px; }
  .item-top { align-items: baseline; display: flex; gap: 8px; }
  .type { color: #1685c1; font-size: 6.5px; font-weight: 950; letter-spacing: .8px; text-transform: uppercase; }
  .item-title { font-size: 10px; font-weight: 850; }
  .item-detail { color: #a7c4d8; font-size: 8px; margin-top: 2px; }
  .route-arrow, .sep { color: #6f8da2; }
  .glance { align-self: start; background-color: #071525; border: 1px solid #233b4e; border-radius: 7px; padding: 3px 8px; }
  .glance-row { align-items: baseline; display: flex; gap: 8px; justify-content: space-between; padding: 2px 0; }.glance-row + .glance-row { border-top: 1px solid #172f42; }
  .glance-row span { color: #6f8da2; flex: 0 0 auto; font-size: 6px; font-weight: 900; letter-spacing: .7px; text-transform: uppercase; }
  .glance-row strong { font-size: 8px; font-weight: 800; overflow-wrap: anywhere; text-align: right; }
  .glance-code strong { color: #f0c84b; font-family: "SF Mono", Menlo, Consolas, monospace; font-size: 8.5px; letter-spacing: .4px; }.glance-phone strong { color: #70ddf6; }
  .maps { display: flex; gap: 10px; margin-top: 3px; }.maps a { color: #70ddf6; font-size: 7px; font-weight: 850; }.maps a:before { content: '↗ '; color: #6f8da2; }
  .item-notes { color: #a7c4d8; font-size: 8px; font-style: italic; margin-top: 3px; white-space: pre-wrap; }
  .empty { color: #7890a0; font-style: italic; padding: 10px; }
  .notes, .tasks, .requirements { background-color: #0b1c2e; border: 1px solid #28536a; border-radius: 12px; padding: 8px 13px; }
  .notes { white-space: pre-wrap; }
  .requirements { display: grid; gap: 6px; grid-template-columns: 1fr 1fr; }.requirements div { align-items: center; display: flex; }.check { background: #70e2a3; border-radius: 50%; display: inline-block; height: 7px; margin-right: 7px; width: 7px; }
  .insurance-grid { display: grid; gap: 8px; grid-template-columns: 1fr 1fr; }
  .insurance-card { background-color: #10283d; border: 1px solid #23445b; border-radius: 12px; padding: 10px 12px; }
  .insurance-kind { color: #70ddf6; font-size: 7px; font-weight: 950; letter-spacing: .8px; text-transform: uppercase; }
  .insurance-title { font-size: 11px; font-weight: 850; margin: 2px 0; }
  .insurance-detail { color: #a7c4d8; font-size: 8px; margin-top: 2px; }.insurance-phone { border-top: 1px solid rgba(201,235,255,.14); margin-top: 6px; padding-top: 6px; }
  .insurance-phone span { color: #6a8496; display: block; font-size: 7px; font-weight: 800; letter-spacing: .6px; text-transform: uppercase; }
  .insurance-phone strong { color: #f0c84b; display: block; font-size: 9px; margin-top: 2px; }
  .task { padding: 3px 0; }.task-mark { border: 1px solid #6f8da2; border-radius: 3px; display: inline-block; height: 10px; margin-right: 7px; position: relative; top: 1px; width: 10px; }
  .task.done { color: #6e8797; text-decoration: line-through; }.task.done .task-mark { background: #2a9d67; border-color: #2a9d67; }
  .disclaimer { background-color: #10283d; border-left: 3px solid #f0c84b; border-radius: 5px; color: #a7c4d8; font-size: 8px; margin-top: 4px; padding: 8px 10px; }.disclaimer strong { color: #eaf2ff; }
  .page-foot { bottom: 16pt; color: #6f8da2; display: flex; font-size: 7px; font-weight: 800; justify-content: space-between; left: 34pt; letter-spacing: .6px; position: absolute; right: 34pt; }
</style></head><body>
  <template id="page-template"><div class="pdf-page" data-reserve="48">
    <header class="page-head"><div class="mini-brand"><i class="brand-logo"></i><span><b>DMZ</b> SCUBA<small>DIVE OPERATIONS</small></span></div><div><span class="page-label"></span><strong>${escapeHtml(title)}</strong></div></header>
    <main></main>
    <footer class="page-foot"><span>DMZ SCUBA - SHARED DIVE PLAN</span><span class="page-count"></span></footer>
  </div></template>
  <div id="flow">${flow}</div>
  <script>${PAGINATE_SCRIPT}</script>
</body></html>`;
}

// Expo Print's iOS renderer drops links, so phone numbers and map directions would not be
// tappable. The local linked-pdf module keeps them; older builds and Android fall back.
async function linkedPdf(html, format) {
  try {
    const { linkedPdfAvailable, renderLinkedPdf } = require('../../../modules/linked-pdf');
    if (!linkedPdfAvailable && __DEV__) console.warn('This build has no linked-pdf module, so the shared PDF has no tappable links. Rebuild the app to include it.');
    const { width, height } = SHARE_FORMATS[format];
    // One page in CSS px. The phone page box is floored to whole pixels (see sharePlanPhone).
    return await renderLinkedPdf(html, { width: Math.round(width * 4 / 3), height: Math.floor(height * 4 / 3) });
  } catch (error) {
    console.warn('Linked PDF rendering failed; sharing without tappable links.', error);
    return null;
  }
}

export async function sharePlanPdf(plan, options = {}) {
  let Print, Sharing, FileSystem, Platform;
  try {
    Platform = require('react-native').Platform;
    if (Platform.OS !== 'web') {
      const { requireOptionalNativeModule } = require('expo-modules-core');
      if (!requireOptionalNativeModule('ExpoPrint')) {
        throw new Error('PDF sharing was added after this app was installed. Rebuild or reinstall the DMZ Scuba development app, then try again.');
      }
    }
    Print = require('expo-print');
    Sharing = require('expo-sharing');
    FileSystem = require('expo-file-system');
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error('PDF sharing is available after installing the latest DMZ Scuba app build.');
  }
  const html = buildPlanShareHtml(plan, options);
  if (Platform.OS === 'web') {
    await Print.printAsync({ html });
    return { printed: true };
  }
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
  const format = SHARE_FORMATS[options.format] ? options.format : 'document';
  const result = await linkedPdf(html, format) || await Print.printToFileAsync({ html, ...SHARE_FORMATS[format] });
  const source = new FileSystem.File(result.uri);
  const file = new FileSystem.File(FileSystem.Paths.cache, planPdfFileName(plan, format));
  await source.copy(file, { overwrite: true });
  await Sharing.shareAsync(file.uri, { UTI: 'com.adobe.pdf', mimeType: 'application/pdf', dialogTitle: `Share ${planTitle(plan)} itinerary` });
  return { uri: file.uri, numberOfPages: result.numberOfPages };
}
