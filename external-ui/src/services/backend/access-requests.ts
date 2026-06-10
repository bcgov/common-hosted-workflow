import { instance } from './axios';

export type AccessRequestStatus = 'pending' | 'approved' | 'denied';

export type AccessRequestListItem = {
  id: string;
  requesterEmail: string;
  justification: string;
  status: AccessRequestStatus;
  reviewerEmail: string | null;
  reviewerN8nUserId: string | null;
  denyReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateAccessRequestResponse = {
  success: true;
  message: string;
  accessRequest: AccessRequestListItem;
};

export type GetMyAccessRequestResponse = {
  accessRequest: AccessRequestListItem | null;
};

export type ListAccessRequestsResponse = {
  items: AccessRequestListItem[];
  total: number;
};

export type ReviewAccessRequestResponse = {
  success: true;
  message: string;
  accessRequest: AccessRequestListItem;
};

export async function createAccessRequest(justification: string, params?: { signal?: AbortSignal }) {
  return instance
    .post<CreateAccessRequestResponse>('/ui-api/access-requests', { justification }, { signal: params?.signal })
    .then((res) => res.data);
}

export async function getMyAccessRequest(params?: { signal?: AbortSignal }) {
  return instance
    .get<GetMyAccessRequestResponse>('/ui-api/access-requests/my', { signal: params?.signal })
    .then((res) => res.data);
}

export async function listAccessRequests(
  query?: { status?: string; limit?: number; offset?: number },
  params?: { signal?: AbortSignal },
) {
  return instance
    .get<ListAccessRequestsResponse>('/ui-api/access-requests', {
      params: query,
      signal: params?.signal,
    })
    .then((res) => res.data);
}

export async function reviewAccessRequest(
  accessRequestId: string,
  action: 'approve' | 'deny',
  denyReason?: string,
  params?: { signal?: AbortSignal },
) {
  return instance
    .post<ReviewAccessRequestResponse>(
      `/ui-api/access-requests/${encodeURIComponent(accessRequestId)}/review`,
      { action, denyReason },
      { signal: params?.signal },
    )
    .then((res) => res.data);
}
