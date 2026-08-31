import { InputAccessoryView, Keyboard, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { NUMBER_KEYBOARD_ACCESSORY_ID } from '../lib/numberKeyboard';
import { colors } from '../theme';

export default function NumberKeyboardAccessory() {
  if (Platform.OS !== 'ios') return null;

  return (
    <InputAccessoryView nativeID={NUMBER_KEYBOARD_ACCESSORY_ID}>
      <View style={styles.toolbar}>
        <Pressable
          accessibilityLabel="Close number keyboard"
          accessibilityRole="button"
          hitSlop={8}
          onPress={Keyboard.dismiss}
          style={({ pressed }) => [styles.doneButton, pressed && styles.doneButtonPressed]}
        >
          <Text style={styles.doneText}>Done</Text>
        </Pressable>
      </View>
    </InputAccessoryView>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderTopColor: colors.lineStrong,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    minHeight: 46,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  doneButton: {
    alignItems: 'center',
    borderRadius: 9,
    justifyContent: 'center',
    minHeight: 36,
    minWidth: 64,
    paddingHorizontal: 12,
  },
  doneButtonPressed: {
    backgroundColor: colors.surfaceSoft,
  },
  doneText: {
    color: colors.cyan,
    fontSize: 16,
    fontWeight: '900',
  },
});
