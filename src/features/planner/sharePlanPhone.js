// The phone layout of a shared plan: screen-shaped pages, one column, large type. A PDF
// cannot reflow for the device opening it, so this is a separate export alongside the
// Letter document rather than a responsive version of it.
//
// Pages are not decided here. The HTML carries the content as an ordered flow and a small
// script lays it onto pages in the browser that renders the PDF, measuring each block as it
// goes, so every page fills to the footer in whatever engine (WebKit, Chromium) prints it.
import { SEGMENT_TYPES, STATUS_LABELS, formatDay, formatRange, formatTime, planTimeline, planTitle } from './model';
import { PAGINATE_SCRIPT, bookingEntries, directionsPlace, ongoingItems, escapeHtml, mapsLinks, renderFacts, renderInsurance, requirementList, route, segmentFacts, segmentName, segmentTime, telHref } from './planShareParts';
import { DMZ_LOGO_DATA_URI } from './dmzLogoData';

// iPhone-shaped pages (points), so a page fills the screen at fit-to-width.
export const PHONE_PAGE = Object.freeze({ width: 390, height: 844 });
// 844pt is 1125.33 CSS px. A page box even a fraction of a pixel taller than the paper
// spills onto a blank page after every page, so the box is floored to whole pixels.
const PAGE_HEIGHT_PX = Math.floor(PHONE_PAGE.height * 4 / 3);

const telLink = (phone) => `<a href="${escapeHtml(telHref(phone))}">${escapeHtml(phone)}</a>`;

function entryDetails(leg) {
  return [route(leg), leg.provider && leg.provider !== leg.title ? escapeHtml(leg.provider) : ''].filter(Boolean).join(' <span class="sep">·</span> ');
}

// A stay or rental car between its first and last day is a reminder, not a plan: one slim
// line under the date ("Staying · Super 8 · Night 2 of 3").
function renderOngoing(entries, date, operator) {
  const items = ongoingItems(entries, date, operator);
  if (!items.length) return '';
  return `<div class="ongoing">${items.map(({ tag, name, position }) => `<div class="ongoing-item"><span class="ongoing-tag">${escapeHtml(tag)}</span><span class="ongoing-name">${escapeHtml(name)}</span>${position ? `<span class="ongoing-when">${escapeHtml(position)}</span>` : ''}</div>`).join('')}</div>`;
}

function renderRow({ leg, variant }, date, operator) {
  const facts = segmentFacts(leg, variant, date, operator);
  const top = `<div class="row-top"><span class="row-time">${escapeHtml(segmentTime(leg, variant))}</span><span class="type">${escapeHtml(SEGMENT_TYPES[leg.type]?.label || 'Item')}</span>`;
  const details = entryDetails(leg);
  return `<div class="row" data-unit>
    ${top}${mapsLinks(directionsPlace(leg, variant))}</div>
    <div class="row-title">${escapeHtml(segmentName(leg, variant))}</div>
    ${details ? `<div class="row-detail">${details}</div>` : ''}
    ${variant === 'start' && leg.notes ? `<div class="row-notes">${escapeHtml(leg.notes)}</div>` : ''}
    ${facts.length ? `<div class="glance">${renderFacts(facts)}</div>` : ''}
  </div>`;
}

// Every confirmation and phone on the trip in one list, so the cover answers "what's
// the number for the hotel" without paging.
function bookingLines(plan) {
  return bookingEntries(plan).map(({ kind, name, provider, reference, phone }) => `<div class="booking" data-unit><div class="booking-main"><span>${escapeHtml(kind)}</span><strong>${escapeHtml(name)}</strong>${provider ? `<em>${escapeHtml(provider)}</em>` : ''}</div><div class="booking-side">${reference ? `<b>${escapeHtml(reference)}</b>` : ''}${phone ? telLink(phone) : ''}</div></div>`);
}

const contact = (label, value) => value ? `<div class="contact" data-unit><span>${escapeHtml(label)}</span><strong>${value}</strong></div>` : '';
// A labelled panel whose rows can split across pages; the label repeats as "continued".
const panel = (label, units, className = 'panel') => units.length
  ? `<div data-group data-label="${escapeHtml(label)}"><div class="label">${escapeHtml(label)}</div><section class="${className}" data-units>${units.join('')}</section></div>`
  : '';

export function buildPhoneShareHtml(plan, { generatedAt = new Date(), insurance = [] } = {}) {
  const timeline = planTimeline(plan);
  const trip = plan.kind === 'trip';
  const operator = plan.operator || {};
  const destination = plan.destination || {};
  const title = planTitle(plan);
  const location = [destination.name, destination.area, destination.country].filter((value, index, list) => value && list.indexOf(value) === index).join(', ');
  const tripDays = timeline.days.length || 1;
  const itineraryCount = (plan.segments || []).length;
  const generated = generatedAt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const requirementItems = requirementList(plan);
  const tasks = plan.tasks || [];
  const contacts = [
    contact('Dive operator', escapeHtml(operator.name)), contact('Meeting point', escapeHtml(operator.meetingPoint)),
    contact('Phone', operator.phone && telLink(operator.phone)),
    contact('Email', operator.email && `<a href="mailto:${escapeHtml(operator.email)}">${escapeHtml(operator.email)}</a>`), contact('Booking confirmation', escapeHtml(operator.confirmation)),
  ].filter(Boolean);

  const hero = `<section class="hero">
      <div class="brand-lockup"><i class="brand-logo"></i><div class="brand-copy"><div class="brand-name"><b>DMZ</b><span>SCUBA</span></div><div class="brand-tag">DIVE · TRAVEL · EXPLORE</div></div><span class="status">${escapeHtml(STATUS_LABELS[plan.status] || 'Dive plan')}</span></div>
      <div class="kicker">${trip ? 'DIVE TRIP BRIEF' : 'DIVE DAY BRIEF'}</div>
      <h1>${escapeHtml(title)}</h1>
      <div class="destination">${escapeHtml(location || 'Destination to be confirmed')}</div>
    </section>
    <section class="metrics">
      <div><span>DATES</span><strong>${escapeHtml(trip ? formatRange(plan.startDate, plan.endDate) : formatDay(plan.startDate, { weekday: true, year: true }))}</strong></div>
      <div><span>${trip ? 'LENGTH' : 'START'}</span><strong>${trip ? `${tripDays} ${tripDays === 1 ? 'day' : 'days'}` : escapeHtml(formatTime(plan.startTime) || 'Not set')}</strong></div>
      <div><span>DIVES</span><strong>${plan.dives ? plan.dives : 'Not set'}</strong></div>
      <div><span>ITINERARY</span><strong>${itineraryCount} ${itineraryCount === 1 ? 'item' : 'items'}</strong></div>
    </section>`;
  const policies = insurance.map((policy) => renderInsurance(policy, plan.endDate || plan.startDate).replace('<div class="insurance-card">', '<div class="insurance-card" data-unit>'));
  const disclaimer = `<div class="disclaimer"><strong>Shared snapshot</strong> · Prepared ${escapeHtml(generated)}. Confirm times, meeting points, weather and operator instructions before you go.</div>`;
  const days = timeline.days.map((day) => {
    const ongoing = day.entries.filter((entry) => entry.variant === 'continuing');
    const scheduled = day.entries.filter((entry) => entry.variant !== 'continuing');
    return `<section class="day" data-group>
      <div class="day-head"><span class="day-number" data-continued="DAY ${day.index} · CONTINUED">DAY ${day.index}</span><h2>${escapeHtml(formatDay(day.date, { weekday: true, year: true }))}</h2></div>
      ${renderOngoing(ongoing, day.date, operator)}
      <div data-units>${scheduled.map((entry) => renderRow(entry, day.date, operator)).join('')}</div>
      ${day.entries.length ? '' : '<div class="empty">Nothing scheduled.</div>'}
    </section>`;
  });

  const flow = `<div data-cover data-page-label="${trip ? 'Dive trip brief' : 'Dive day brief'}">
      <div>${hero}</div>
      ${panel('Bookings', bookingLines(plan), 'contacts')}
      ${panel('Contacts', contacts, 'contacts')}
      ${panel('Insurance', policies, 'policies')}
      <div>${disclaimer}</div>
    </div>
    <div data-new-page data-page-label="Day by day">${days.join('')}</div>
    <div data-page-label="Reference">
      ${panel('Operator requirements', requirementItems.map((item) => `<div class="req" data-unit><span class="check"></span>${escapeHtml(item)}</div>`))}
      ${panel(`Checklist · ${tasks.filter((task) => task.done).length}/${tasks.length} complete`, tasks.map((task) => `<div class="task ${task.done ? 'done' : ''}" data-unit><span class="task-mark"></span>${escapeHtml(task.label)}</div>`))}
      ${panel('Plan notes', plan.notes ? [`<div class="notes" data-unit>${escapeHtml(plan.notes)}</div>`] : [])}
    </div>`;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  @page { size: ${PHONE_PAGE.width}pt ${PHONE_PAGE.height}pt; margin: 0; }
  html, body, * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  * { box-sizing: border-box; }
  body { background: #071525; color: #eaf2ff; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; font-size: 15px; line-height: 1.32; margin: 0; }
  a { color: inherit; text-decoration: none; }
  #flow { left: 0; position: absolute; top: 0; visibility: hidden; width: ${PHONE_PAGE.width}pt; }
  .pdf-page { background: #071525; height: ${PAGE_HEIGHT_PX}px; overflow: hidden; padding: 22px 16px 46px; position: relative; width: ${PHONE_PAGE.width}pt; }
  .pdf-page + .pdf-page { break-before: page; page-break-before: always; }
  .brand-logo { background-image: url('${DMZ_LOGO_DATA_URI}'); background-position: center; background-repeat: no-repeat; background-size: contain; display: block; flex: 0 0 auto; }
  .hero { background-color: #082f4f; border: 1px solid #28637d; border-radius: 18px; padding: 14px 16px 16px; }
  .brand-lockup { align-items: center; display: flex; gap: 10px; margin-bottom: 12px; }.brand-lockup .brand-logo { height: 40px; width: 40px; }
  .brand-copy { border-left: 1px solid rgba(201,235,255,.25); flex: 1; padding-left: 10px; }.brand-name { align-items: baseline; display: flex; gap: 6px; line-height: 1; }
  .brand-name b { color: #e21b23; font-size: 24px; font-style: italic; font-weight: 950; letter-spacing: -1.2px; }.brand-name span { font-size: 13px; font-weight: 950; letter-spacing: 3px; }
  .brand-tag { color: #70ddf6; font-size: 7px; font-weight: 900; letter-spacing: 1.4px; margin-top: 6px; }
  .status { border: 1px solid rgba(112,221,246,.45); border-radius: 999px; color: #70ddf6; font-size: 10px; font-weight: 900; letter-spacing: .9px; padding: 6px 11px; text-transform: uppercase; }
  .kicker { color: #f0c84b; font-size: 11px; font-weight: 900; letter-spacing: 1.7px; }
  h1 { font-size: 30px; letter-spacing: -1px; line-height: 1.05; margin: 4px 0 5px; }
  .destination { color: #a7c4d8; font-size: 16px; }
  .metrics { background-color: #0b1c2e; border: 1px solid #233b4e; border-radius: 14px; display: grid; grid-template-columns: 1fr 1fr; margin: 10px 0 14px; overflow: hidden; }
  .metrics div { border-bottom: 1px solid #233b4e; padding: 7px 14px; }.metrics div:nth-child(odd) { border-right: 1px solid #233b4e; }.metrics div:nth-last-child(-n+2) { border-bottom: 0; }
  .metrics span, .contact span { color: #6f8da2; display: block; font-size: 10px; font-weight: 900; letter-spacing: .9px; margin-bottom: 2px; text-transform: uppercase; }.metrics strong { font-size: 16px; }
  .label { color: #70ddf6; font-size: 11px; font-weight: 900; letter-spacing: 1.4px; margin: 0 0 7px 2px; text-transform: uppercase; }
  .contacts, .panel { background-color: #0b1c2e; border: 1px solid #233b4e; border-radius: 14px; margin-bottom: 14px; }
  .contact { padding: 8px 14px; }.contact + .contact { border-top: 1px solid #233b4e; }.contact strong { display: block; font-size: 16px; overflow-wrap: anywhere; }.contact a { color: #70ddf6; }
  .booking { align-items: flex-start; display: flex; gap: 12px; justify-content: space-between; padding: 9px 14px; }.booking + .booking { border-top: 1px solid #233b4e; }
  .booking-main { min-width: 0; }.booking-main span { color: #6f8da2; display: block; font-size: 10px; font-weight: 900; letter-spacing: .9px; text-transform: uppercase; }.booking-main strong { display: block; font-size: 16px; }.booking-main em { color: #a7c4d8; display: block; font-size: 13px; font-style: normal; }
  .booking-side { flex: 0 0 auto; text-align: right; }.booking-side b { color: #f0c84b; display: block; font-family: "SF Mono", Menlo, Consolas, monospace; font-size: 15px; letter-spacing: .4px; }.booking-side a { color: #70ddf6; display: block; font-size: 14px; font-weight: 800; margin-top: 3px; }
  .policies { margin-bottom: 14px; }
  .insurance-card { background-color: #10283d; border: 1px solid #23445b; border-radius: 14px; padding: 11px 14px; }.insurance-card + .insurance-card { margin-top: 8px; }
  .insurance-kind { color: #70ddf6; font-size: 10px; font-weight: 950; letter-spacing: .8px; text-transform: uppercase; }.insurance-title { font-size: 17px; font-weight: 850; margin: 2px 0; }
  .insurance-detail { color: #a7c4d8; font-size: 13px; margin-top: 1px; }.sep { color: #6f8da2; }
  .insurance-phone { border-top: 1px solid rgba(201,235,255,.14); margin-top: 7px; padding-top: 7px; }.insurance-phone span { color: #6f8da2; display: block; font-size: 10px; font-weight: 800; letter-spacing: .6px; text-transform: uppercase; }.insurance-phone strong { color: #f0c84b; font-size: 17px; }
  .page-head { align-items: center; border-bottom: 2px solid #28536a; display: flex; justify-content: space-between; margin-bottom: 12px; padding-bottom: 8px; }
  .mini-brand { align-items: center; display: flex; font-size: 12px; font-weight: 950; gap: 8px; letter-spacing: 1.5px; }.mini-brand .brand-logo { height: 26px; width: 26px; }.mini-brand b { color: #e21b23; font-style: italic; }
  .page-head > div:last-child { text-align: right; }.page-label { color: #70ddf6; display: block; font-size: 10px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase; }.page-head strong { font-size: 14px; }
  .day { background-color: #0b1c2e; border: 1px solid #28536a; border-radius: 14px; margin-bottom: 10px; overflow: hidden; }
  .day-head { align-items: baseline; background-color: #10283d; border-bottom: 1px solid #28536a; display: flex; gap: 10px; padding: 8px 14px; }.day-number { color: #e21b23; font-size: 10px; font-weight: 950; letter-spacing: 1.1px; }
  h2 { font-size: 16px; margin: 0; }
  .row { padding: 10px 14px; }.row + .row { border-top: 1px solid #233b4e; }
  .row-top { align-items: center; display: flex; gap: 10px; }.row-time { font-size: 15px; font-weight: 850; }.type { color: #1685c1; font-size: 10px; font-weight: 950; letter-spacing: .8px; text-transform: uppercase; }
  .row-title { font-size: 17px; font-weight: 850; margin-top: 2px; }
  .row-detail { color: #a7c4d8; font-size: 13px; margin-top: 2px; }.route-arrow { color: #6f8da2; }
  .row-notes { color: #a7c4d8; font-size: 13px; font-style: italic; margin-top: 3px; white-space: pre-wrap; }
  .maps { display: flex; gap: 6px; margin-left: auto; }.maps a { border: 1px solid #28536a; border-radius: 999px; color: #70ddf6; font-size: 11px; font-weight: 800; padding: 3px 9px; }
  .glance { background-color: #071525; border: 1px solid #233b4e; border-radius: 10px; display: grid; gap: 0 12px; grid-template-columns: 1fr 1fr; margin-top: 7px; padding: 4px 11px; }
  .glance-row { padding: 3px 0; }.glance-row span { color: #6f8da2; display: block; font-size: 9px; font-weight: 900; letter-spacing: .7px; text-transform: uppercase; }
  .glance-row strong { display: block; font-size: 14px; font-weight: 800; overflow-wrap: anywhere; }
  .glance-code strong { color: #f0c84b; font-family: "SF Mono", Menlo, Consolas, monospace; letter-spacing: .4px; }.glance-phone strong { color: #70ddf6; }
  .ongoing { background-color: #0d2236; border-bottom: 1px solid #233b4e; padding: 5px 14px; }.ongoing + [data-units]:empty { display: none; }
  .ongoing-item { align-items: baseline; display: flex; gap: 8px; padding: 2px 0; }
  .ongoing-tag { color: #70ddf6; flex: 0 0 52px; font-size: 9px; font-weight: 950; letter-spacing: .8px; text-transform: uppercase; }
  .ongoing-name { color: #eaf2ff; flex: 1; font-size: 13px; font-weight: 750; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ongoing-when { color: #a7c4d8; flex: 0 0 auto; font-size: 12px; font-weight: 700; }
  .empty { color: #6f8da2; font-style: italic; padding: 12px 14px; }
  .panel { padding: 6px 14px; }.notes { font-size: 14px; padding: 6px 0; white-space: pre-wrap; }
  .req, .task { align-items: center; display: flex; font-size: 14px; padding: 5px 0; }.check { background: #70e2a3; border-radius: 50%; flex: 0 0 auto; height: 9px; margin-right: 10px; width: 9px; }
  .task-mark { border: 1.5px solid #6f8da2; border-radius: 4px; flex: 0 0 auto; height: 14px; margin-right: 10px; width: 14px; }.task.done { color: #6f8da2; text-decoration: line-through; }.task.done .task-mark { background: #2a9d67; border-color: #2a9d67; }
  .disclaimer { background-color: #10283d; border-left: 3px solid #f0c84b; border-radius: 8px; color: #a7c4d8; font-size: 12px; padding: 10px 13px; }.disclaimer strong { color: #eaf2ff; }
  .page-foot { bottom: 18px; color: #6f8da2; display: flex; font-size: 10px; font-weight: 800; justify-content: space-between; left: 16px; letter-spacing: .6px; position: absolute; right: 16px; }
</style></head><body>
  <template id="page-template"><div class="pdf-page" data-reserve="54">
    <header class="page-head"><div class="mini-brand"><i class="brand-logo"></i><span><b>DMZ</b> SCUBA</span></div><div><span class="page-label"></span><strong>${escapeHtml(title)}</strong></div></header>
    <main></main>
    <footer class="page-foot"><span>DMZ SCUBA</span><span class="page-count"></span></footer>
  </div></template>
  <div id="flow">${flow}</div>
  <script>${PAGINATE_SCRIPT}</script>
</body></html>`;
}
