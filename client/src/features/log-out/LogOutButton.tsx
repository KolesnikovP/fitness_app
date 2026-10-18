import { useAuth } from '@/entities/auth';
import { Button } from '@/shared/ui';

export function LogOutButton() {
  const { logOut } = useAuth();
  return <Button label="Log out" variant="secondary" onPress={logOut} />;
}
