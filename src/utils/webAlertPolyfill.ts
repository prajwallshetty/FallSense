// react-native-web implements Alert.alert as a no-op, so on web every confirmation dialog
// (SOS, resolve, remove watch, sign out) silently did nothing. Native platforms are unaffected.
import { Alert, AlertButton, Platform } from 'react-native';

export function installWebAlertPolyfill(): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  Alert.alert = (title: string, message?: string, buttons?: AlertButton[]) => {
    const text = [title, message].filter(Boolean).join('\n\n');
    if (!buttons || buttons.length === 0) {
      window.alert(text);
      return;
    }
    const actions = buttons.filter((b) => b.style !== 'cancel');
    const cancel = buttons.find((b) => b.style === 'cancel');
    if (actions.length <= 1) {
      if (window.confirm(text)) actions[0]?.onPress?.();
      else cancel?.onPress?.();
      return;
    }
    const choice = window.prompt(`${text}\n\n${actions.map((b, i) => `${i + 1}. ${b.text}`).join('\n')}\n\nType a number:`);
    const picked = choice ? actions[Number.parseInt(choice, 10) - 1] : undefined;
    if (picked) picked.onPress?.();
    else cancel?.onPress?.();
  };
}
