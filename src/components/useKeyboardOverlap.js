// How much of the screen the keyboard is currently covering, in points.
//
// Used instead of KeyboardAvoidingView, which compares its own measured frame
// against the keyboard in window coordinates — something an iOS pageSheet
// Modal (presented in its own window) can throw off. Measuring the overlap
// against the bottom of the window sidesteps that, and stays correct for a
// split or floating keyboard, where the keyboard's own height is not the
// amount of screen it actually covers.
//
// Apply the result as paddingBottom on a flex:1 container and the content
// above it reflows into the space that's left.

import { useEffect, useState } from 'react';
import { Keyboard, useWindowDimensions } from 'react-native';

export default function useKeyboardOverlap() {
  const { height: windowHeight } = useWindowDimensions();
  const [overlap, setOverlap] = useState(0);

  useEffect(() => {
    const onFrame = (event) => {
      const endY = event?.endCoordinates?.screenY;
      setOverlap(typeof endY === 'number' ? Math.max(0, windowHeight - endY) : 0);
    };
    // "will" events fire before the keyboard animates, so layout moves in step
    // with it rather than snapping once it has landed. WillChangeFrame also
    // catches mid-session height changes, like the autocorrect bar appearing.
    const shown = Keyboard.addListener('keyboardWillChangeFrame', onFrame);
    const hidden = Keyboard.addListener('keyboardWillHide', () => setOverlap(0));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, [windowHeight]);

  return overlap;
}
