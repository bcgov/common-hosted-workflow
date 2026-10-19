import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useIsGoldDr } from '../../state/session';

export function GoldDrBanner() {
  const goldDr = useIsGoldDr();

  if (!goldDr) {
    return null;
  }

  return (
    <Alert variant="warning" className="rounded-none border-x-0 border-t-0" data-testid="golddr-banner">
      <AlertTitle>Maintenance mode</AlertTitle>
      <AlertDescription>
        The service is running on the disaster-recovery site. Data created now will not be kept when service returns to
        the primary site.
      </AlertDescription>
    </Alert>
  );
}
