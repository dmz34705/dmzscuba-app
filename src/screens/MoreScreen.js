import MenuPage from '../components/MenuPage';
import { GroupedSection, NavigationRow } from '../components/Ui';

export default function MoreScreen({ onOpen }) {
  return (
    <MenuPage title="More" subtitle="Your account and app preferences.">
      <GroupedSection title="Personal">
        <NavigationRow title="Account" body="Profile, certifications, and sign-in" onPress={() => onOpen('account')} />
        <NavigationRow title="Settings" body="Units, graph appearance, location, and backups" onPress={() => onOpen('settings')} last />
      </GroupedSection>
    </MenuPage>
  );
}
