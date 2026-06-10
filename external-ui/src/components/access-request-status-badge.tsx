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
        <Badge variant="secondary" className="gap-1">
          <IconClock size={14} aria-hidden="true" />
          Pending
        </Badge>
      );
    case 'approved':
      return (
        <Badge className="gap-1 bg-green-600 text-white">
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
