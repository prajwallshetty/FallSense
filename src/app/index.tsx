import { View } from 'react-native';
import { colors } from '../theme';

// The root layout's navigation guard redirects from here based on auth/profile state.
export default function Index() {
  return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
}
