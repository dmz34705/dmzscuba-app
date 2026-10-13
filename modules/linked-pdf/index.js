import { requireOptionalNativeModule } from 'expo-modules-core';

// Expo Print draws pages through UIPrintPageRenderer, which drops every link, so phone
// numbers and map directions in a shared PDF would not be tappable. This module renders
// each fixed-size `.pdf-page` with WKWebView.createPDF, which keeps them. Null when the
// installed build predates the module (or off iOS); callers fall back to Expo Print.
const module = requireOptionalNativeModule('LinkedPdf');

export const linkedPdfAvailable = Boolean(module);

// width/height are one page in CSS px; resolves to { uri, numberOfPages }.
export function renderLinkedPdf(html, { width, height }) {
  return module ? module.render(html, width, height) : Promise.resolve(null);
}
