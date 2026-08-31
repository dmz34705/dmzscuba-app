export const NUMBER_KEYBOARD_ACCESSORY_ID = 'dmz-number-keyboard-accessory';

const NUMBER_KEYBOARD_TYPES = new Set([
  'decimal-pad',
  'number-pad',
  'numeric',
  'phone-pad',
]);

export function usesNumberKeyboard(keyboardType) {
  return NUMBER_KEYBOARD_TYPES.has(keyboardType);
}
