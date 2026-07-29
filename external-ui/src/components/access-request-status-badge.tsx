import { IconCheck, IconClock } from '@tabler/icons-react';
import { Badge } from '@/components/ui/badge';
import type { AccessRequestStatus } from '../services/backend/access-requests';

interface AccessRequestStatusBadgeProps {
  status: AccessRequestStatus;
}

export function AccessRequestStatusBadge({ status }: AccessRequestStatusBadgeProps) {
  switch (status) {
    case 'pending':
      return (
        <Badge variant="warning" className="gap-1">
          <IconClock size={14} aria-hidden="true" />
          Pending
        </Badge>
      );
    case 'approved':
      return (
        <Badge variant="success" className="gap-1">
          <IconCheck size={14} aria-hidden="true" />
          Approved
        </Badge>
      );
    case 'denied':
      return (
        <Badge variant="destructive" className="gap-1">
          Denied
        </Badge>
      );
  }
}
