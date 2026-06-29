import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getConfig } from '../services/backend/config';
import { setFeatureFlags } from '../state/feature-flags';

export function useFeatureFlagLoader() {
  const { data } = useQuery({
    queryKey: ['app-config'],
    queryFn: ({ signal }) => getConfig({ signal }),
    staleTime: Infinity,
    retry: 1,
  });

  useEffect(() => {
    if (data) setFeatureFlags(data.featureFlags);
  }, [data]);
}
