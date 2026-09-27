// Turns a saved email (.eml) or pasted HTML into plain text the flight parser can read.
// Handles multipart messages, quoted-printable and base64 parts, UTF-8, and HTML-only emails
// (most airline confirmations). Pure JS so it runs the same on device and in tests.

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function base64Bytes(value) {
  const clean = String(value).replace(/[^A-Za-z0-9+/]/g, '');
  const bytes = [];
  for (let i = 0; i + 1 < clean.length; i += 4) {
    const n = [0, 1, 2, 3].map((k) => (i + k < clean.length ? B64.indexOf(clean[i + k]) : 0));
    bytes.push((n[0] << 2) | (n[1] >> 4));
    if (i + 2 < clean.length) bytes.push(((n[1] & 15) << 4) | (n[2] >> 2));
    if (i + 3 < clean.length) bytes.push(((n[2] & 3) << 6) | n[3]);
  }
  return bytes;
}

function quotedPrintableBytes(value) {
  const text = String(value).replace(/=\r?\n/g, '');
  const bytes = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '=' && /^[0-9A-Fa-f]{2}$/.test(text.slice(i + 1, i + 3))) { bytes.push(parseInt(text.slice(i + 1, i + 3), 16)); i += 2; }
    else bytes.push(text.charCodeAt(i) & 0xff);
  }
  return bytes;
}

// UTF-8 bytes → string (falls back to Latin-1 for bytes that aren't valid UTF-8).
export function utf8(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    const need = b >= 0xf0 && b < 0xf8 ? 3 : b >= 0xe0 ? 2 : b >= 0xc0 ? 1 : 0;
    if (b < 0x80 || !need) { out += String.fromCharCode(b); continue; }
    let code = b & (0x3f >> need);
    let valid = true;
    for (let k = 1; k <= need; k++) { const c = bytes[i + k]; if (c == null || (c & 0xc0) !== 0x80) { valid = false; break; } code = (code << 6) | (c & 0x3f); }
    if (!valid) { out += String.fromCharCode(b); continue; }
    out += String.fromCodePoint(code);
    i += need;
  }
  return out;
}

const ENTITIES = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", rarr: '→', ndash: '-', mdash: '-', middot: '·', bull: '•', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', hellip: '…', copy: '©', reg: '®', trade: '™' };

export function htmlToText(html) {
  return String(html || '')
    .replace(/<(script|style|head|title)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6]|table|section|header|footer)>/gi, '\n')
    .replace(/<\/(td|th)>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, name) => {
      if (name[0] === '#') { const code = name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10); return Number.isFinite(code) ? String.fromCodePoint(code) : ' '; }
      return ENTITIES[name.toLowerCase()] ?? ' ';
    })
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function splitHeaders(raw) {
  const text = String(raw).replace(/\r\n/g, '\n');
  const cut = text.indexOf('\n\n');
  const head = cut >= 0 ? text.slice(0, cut) : text;
  const body = cut >= 0 ? text.slice(cut + 2) : '';
  const headers = {};
  head.replace(/\n[ \t]+/g, ' ').split('\n').forEach((line) => {
    const i = line.indexOf(':');
    if (i > 0) headers[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
  });
  return { headers, body };
}

function decodePart(headers, body) {
  const encoding = (headers['content-transfer-encoding'] || '').toLowerCase();
  const bytes = encoding === 'base64' ? base64Bytes(body) : encoding === 'quoted-printable' ? quotedPrintableBytes(body) : null;
  if (!bytes) return body;
  return /charset="?(utf-8|utf8)/i.test(headers['content-type'] || '') || !/charset=/i.test(headers['content-type'] || '') ? utf8(bytes) : String.fromCharCode(...bytes);
}

// All text/plain and text/html parts of a MIME message, depth-first.
function collectParts(raw, parts = []) {
  const { headers, body } = splitHeaders(raw);
  const type = (headers['content-type'] || 'text/plain').toLowerCase();
  const boundary = /boundary="?([^";]+)"?/i.exec(headers['content-type'] || '')?.[1];
  if (type.startsWith('multipart/') && boundary) {
    body.split(`--${boundary}`).slice(1).forEach((chunk) => { if (!chunk.startsWith('--')) collectParts(chunk.replace(/^\n/, ''), parts); });
  } else if (type.startsWith('text/plain') || type.startsWith('text/html')) {
    if (!/attachment/i.test(headers['content-disposition'] || '')) parts.push({ html: type.startsWith('text/html'), text: decodePart(headers, body) });
  } else if (type.startsWith('message/rfc822')) {
    collectParts(body, parts);
  }
  return parts;
}

const looksLikeEml = (text) => /^(?:[A-Za-z-]+:.*\n)+/.test(String(text).replace(/\r\n/g, '\n').slice(0, 2000)) && /\ncontent-type:/i.test(`\n${String(text).slice(0, 5000)}`);
const looksLikeHtml = (text) => /<(html|body|table|div|p|br)\b/i.test(String(text).slice(0, 5000));

// Plain text from whatever the diver gave us: a raw .eml, pasted HTML, or pasted text.
// `sentDate` is the email's own date (YYYY-MM-DD), used to place dates printed without a year.
export function emailToText(raw) {
  const value = String(raw || '');
  if (looksLikeEml(value)) {
    const { headers } = splitHeaders(value);
    const parts = collectParts(value);
    // The HTML part usually carries the full itinerary; plain-text parts are sometimes a stub.
    const html = parts.filter((part) => part.html).map((part) => htmlToText(part.text)).join('\n\n');
    const plain = parts.filter((part) => !part.html).map((part) => part.text).join('\n\n');
    const text = html.length > plain.length * 0.8 ? html : plain || html;
    const sent = headers.date ? new Date(headers.date) : null;
    // The sender's name often is the only place the airline is spelled out.
    const sender = (headers.from || '').replace(/<[^>]*>/g, '').replace(/"/g, '').trim();
    return { text: [sender ? `From: ${sender}` : '', headers.subject ? `Subject: ${headers.subject}` : '', text].filter(Boolean).join('\n'), sentDate: sent && !Number.isNaN(sent.getTime()) ? sent.toISOString().slice(0, 10) : '' };
  }
  return { text: looksLikeHtml(value) ? htmlToText(value) : value, sentDate: '' };
}
