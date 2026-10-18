import { useSession } from '@/entities/session';
import { Button } from '@/shared/ui';

export function LogOutButton() {
  const { logOut } = useSession();
  return <Button label="Log out" variant="secondary" onPress={logOut} />;
}
