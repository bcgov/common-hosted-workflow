import { proxy, useSnapshot } from 'valtio';

type FeatureFlagState = {
  flags: Record<string, boolean>;
  isLoaded: boolean;
};

export const featureFlagState = proxy<FeatureFlagState>({
  flags: {},
  isLoaded: false,
});

export function setFeatureFlags(flags: Record<string, boolean>) {
  featureFlagState.flags = flags;
  featureFlagState.isLoaded = true;
}

export function useFeatureFlag(flagName: string): boolean {
  const snapshot = useSnapshot(featureFlagState);
  return snapshot.flags[flagName] ?? false;
}

export function useFeatureFlagsLoaded(): boolean {
  return useSnapshot(featureFlagState).isLoaded;
}
