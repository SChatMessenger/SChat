import { useIdentityStore } from '../../store';
import { OtpCodeScreen } from './OtpCodeScreen';
import { PhoneEntryScreen } from './PhoneEntryScreen';

export function IdentityScreen() {
  const step = useIdentityStore((s) => s.step);
  return step === 'phone' ? <PhoneEntryScreen /> : <OtpCodeScreen />;
}
