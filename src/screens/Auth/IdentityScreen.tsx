import { useIdentityStore } from '../../store';
import { OtpCodeScreen } from './OtpCodeScreen';
import { PasscodeScreen } from './PasscodeScreen';
import { PhoneEntryScreen } from './PhoneEntryScreen';
import { ProfileSetupScreen } from './ProfileSetupScreen';
import { ResetPasscodeScreen } from './ResetPasscodeScreen';
import { WelcomeScreen } from './WelcomeScreen';

export function IdentityScreen() {
  const step = useIdentityStore((s) => s.step);
  switch (step) {
    case 'phone':
      return <PhoneEntryScreen />;
    case 'code':
      return <OtpCodeScreen />;
    case 'profile':
      return <ProfileSetupScreen />;
    case 'passcode':
      return <PasscodeScreen />;
    case 'passcodeReset':
      return <ResetPasscodeScreen />;
    case 'welcome':
      return <WelcomeScreen />;
    default: {
      const _exhaustive: never = step;
      return _exhaustive;
    }
  }
}
