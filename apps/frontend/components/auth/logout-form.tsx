import { Button } from '@/components/ui/button';

export function LogoutForm() {
  return (
    <form action="/api/auth/logout" method="post">
      <Button type="submit" variant="secondary">
        Se déconnecter
      </Button>
    </form>
  );
}
