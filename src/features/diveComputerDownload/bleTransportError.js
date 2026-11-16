// A Bluetooth failure that happened in JS (a rejected write or a notification
// error) while a native libdivecomputer operation was running. Without this the
// native side just waits for a reply that never comes and later reports a
// generic timeout, hiding what actually went wrong.
export class BleTransportError extends Error {
  constructor(kind, cause) {
    super(transportMessage(kind, cause));
    this.name = 'BleTransportError';
    this.code = kind === 'write' ? 'BLE_WRITE_FAILED' : 'BLE_NOTIFY_FAILED';
    this.kind = kind;
    this.detail = String(cause?.message || cause || '').slice(0, 300);
  }
}

export function transportMessage(kind, cause) {
  const text = String(cause?.message || cause || '').toLowerCase();
  if (/disconnect|not connected|was cancelled|is not connected/.test(text)) {
    return 'The dive computer disconnected during the transfer. Dives received so far are saved. Keep the computer close to the phone, reconnect, and try again.';
  }
  if (/powered off|poweredoff|bluetooth is off|unauthorized/.test(text)) {
    return 'Bluetooth turned off or lost permission during the transfer. Dives received so far are saved. Turn Bluetooth on, reconnect, and try again.';
  }
  return kind === 'write'
    ? 'The phone could not send a command to the dive computer. Dives received so far are saved. Reconnect and try again.'
    : 'The phone stopped receiving data from the dive computer. Dives received so far are saved. Reconnect and try again.';
}
