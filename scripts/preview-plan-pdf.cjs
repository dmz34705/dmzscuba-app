// Render the same HTML used by Expo Print into a desktop PDF for visual QA.
// PLAYWRIGHT_MODULE may point at the bundled Playwright package when it is not installed locally.
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { loadSourceModule } = require('./lib/load-source-module.cjs');

const root = path.resolve(__dirname, '../src');
const { normalizePlan } = loadSourceModule(path.join(root, 'features/planner/model.js'), root);
const { SHARE_FORMATS, buildPlanShareHtml } = loadSourceModule(path.join(root, 'features/planner/sharePlanPdf.js'), root);
const output = path.resolve(process.argv[2] || 'output/pdf/dmz-scuba-share-preview.pdf');
const scratch = path.resolve('tmp/pdfs/dmz-scuba-share-preview.html');

const plan = normalizePlan({
  kind: 'trip', status: 'booked', title: 'Cozumel Reef Week', startDate: '2026-11-07', endDate: '2026-11-14', dives: 8,
  destination: { name: 'Cozumel', area: 'Quintana Roo', country: 'Mexico' },
  operator: { name: 'Dressel Divers', meetingPoint: 'Iberostar Cozumel dive pier', phone: '+52 987 872 0823', email: 'cozumel@dresseldivers.com', website: 'dresseldivers.com', confirmation: 'DMZ-CZM-1107' },
  requirements: { certs: ['advanced', 'nitrox'], minDives: 20, recentMonths: 12, insurance: true, medical: true, waiver: true },
  segments: [
    { type: 'drive', title: 'Drive to airport', startDate: '2026-11-07', startTime: '03:45', from: 'Home', to: 'ORD Economy Parking' },
    { type: 'flight', title: 'AA 2812 to Miami', startDate: '2026-11-07', startTime: '06:10', endDate: '2026-11-07', endTime: '10:05', from: 'ORD', to: 'MIA', reference: 'H7K2P9' },
    { type: 'flight', title: 'AA 2216 to Cozumel', startDate: '2026-11-07', startTime: '11:25', endDate: '2026-11-07', endTime: '13:15', from: 'MIA', to: 'CZM', reference: 'H7K2P9' },
    { type: 'transfer', title: 'Airport transfer', startDate: '2026-11-07', startTime: '14:00', from: 'CZM arrivals', to: 'Iberostar Cozumel', provider: 'Amstar' },
    { type: 'stay', title: 'Iberostar Cozumel', startDate: '2026-11-07', startTime: '15:00', endDate: '2026-11-14', endTime: '11:00', reference: 'IB-442190' },
    { type: 'diving', title: 'Palancar Gardens and Santa Rosa Wall', startDate: '2026-11-08', startTime: '07:30', from: 'Resort dive pier', provider: 'Dressel Divers', dives: 2, notes: 'Bring Nitrox card and analyze both cylinders before departure.' },
    { type: 'diving', title: 'Colombia Deep and Punta Sur', startDate: '2026-11-09', startTime: '07:30', from: 'Resort dive pier', provider: 'Dressel Divers', dives: 2 },
    { type: 'activity', title: 'San Miguel dinner', startDate: '2026-11-09', startTime: '18:30', from: 'Hotel lobby' },
    { type: 'diving', title: 'Paso del Cedral and Yucab', startDate: '2026-11-10', startTime: '07:30', from: 'Resort dive pier', provider: 'Dressel Divers', dives: 2 },
    { type: 'diving', title: 'Paradise Reef night dive', startDate: '2026-11-11', startTime: '17:30', from: 'Resort dive pier', provider: 'Dressel Divers', dives: 2 },
    { type: 'flight', title: 'AA 2217 to Miami', startDate: '2026-11-14', startTime: '12:55', endDate: '2026-11-14', endTime: '14:40', from: 'CZM', to: 'MIA', reference: 'H7K2P9' },
  ],
  tasks: [{ label: 'Confirm Nitrox tanks', done: true }, { label: 'Complete operator waiver', done: false }, { label: 'Download offline itinerary', done: false }],
  notes: 'Meet at the dive pier 30 minutes before each boat departure. Gratuities and marine park fees are not included in the package.',
}, new Date(2026, 9, 13));

const insurance = [
  { id: 'dan', type: 'dive', provider: 'DAN', memberNumber: 'DAN-34705', startDate: '2025-01-01', endDate: '2025-12-31', autoRenews: true, renewalMonths: 12, emergencyPhone: '+1 919 684 9111' },
  { id: 'travel', type: 'travel', provider: 'Travel Guard', policyNumber: 'TG-827419', startDate: '2026-11-01', endDate: '2026-11-20', emergencyPhone: '+1 800 826 1300' },
];

const jupiterPlan = normalizePlan({
  kind: 'trip', status: 'booked', title: 'Jupiter Florida Recon', startDate: '2026-09-30', endDate: '2026-10-03',
  destination: { name: 'Jupiter', area: 'Florida' },
  operator: { name: 'Jupiter Dive Center', phone: '+1 (561) 745-7807' },
  segments: [
    { type: 'flight', title: 'AA 1831', provider: 'American Airlines', startDate: '2026-09-30', startTime: '09:29', endDate: '2026-09-30', endTime: '13:52', from: 'ORD', to: 'DJT', reference: 'QAUSMA', phone: '+1 800 433 7300' },
    { type: 'car', title: 'Volkswagen Jetta or similar', startDate: '2026-09-30', startTime: '12:36', endDate: '2026-10-03', endTime: '13:33', from: '2005 Belvedere Rd (at Florida Mango Rd), West Palm Beach, 33406, FL, Florida', to: '2005 Belvedere Rd (at Florida Mango Rd), West Palm Beach, 33406, FL, Florida', provider: 'Budget', reference: 'US267042270', phone: '+1 561 683 2401' },
    { type: 'stay', title: 'Super 8 by Wyndham North Palm Beach', startDate: '2026-09-30', startTime: '15:00', endDate: '2026-10-03', endTime: '11:00', from: '757 US Highway 1, North Palm Beach, FL, US', provider: 'Hopper', reference: '3VD53943CGT3', phone: '+1 561 842 3121', notes: '1 King Bed, Non-Smoking' },
    { type: 'activity', title: 'Check out rental property', startDate: '2026-09-30', startTime: '17:45', from: '5753 SE Mercedes Ave, Stuart, FL 34997', provider: 'Mia' },
    { type: 'activity', title: 'Jupiter Cove Apartments Tour', startDate: '2026-10-01', startTime: '10:00', from: '17825-18985 Thelma Avenue Jupiter FL 33458', provider: 'Jupiter Cove Apartments' },
    { type: 'flight', title: 'AA 1029', provider: 'American Airlines', startDate: '2026-10-03', startTime: '14:33', endDate: '2026-10-03', endTime: '16:40', from: 'DJT', to: 'ORD', reference: 'QAUSMA', phone: '+1 800 433 7300' },
  ],
}, new Date(2026, 9, 13));
const jupiterInsurance = [{ id: 'dan-jupiter', type: 'dive', provider: 'DAN', memberNumber: '2923960', startDate: '2025-10-01', endDate: '2026-09-30', autoRenews: true, renewalMonths: 12, emergencyPhone: '+1-919-684-9111' }];
const previewPlan = process.env.PREVIEW_FIXTURE === 'jupiter' ? jupiterPlan : plan;
const previewInsurance = process.env.PREVIEW_FIXTURE === 'jupiter' ? jupiterInsurance : insurance;

(async () => {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.mkdirSync(path.dirname(scratch), { recursive: true });
  // PREVIEW_FORMAT=phone renders the phone-screen layout instead of the Letter document.
  const format = process.env.PREVIEW_FORMAT === 'phone' ? 'phone' : 'document';
  const html = buildPlanShareHtml(previewPlan, { insurance: previewInsurance, generatedAt: new Date(2026, 9, 13), format });
  fs.writeFileSync(scratch, html);
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}) });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'load' });
  const { width, height } = SHARE_FORMATS[format];
  await page.pdf({ path: output, width: `${width / 72}in`, height: `${height / 72}in`, printBackground: true, preferCSSPageSize: true });
  await browser.close();
  console.log(output);
})().catch((error) => { console.error(error); process.exitCode = 1; });
