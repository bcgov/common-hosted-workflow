import { FEATURE_FLAG_REGISTRY } from '../constants/feature-flag';

export class FeatureFlagService {
  private readonly flags: Record<string, boolean>;

  constructor(flagRegistry: Record<string, boolean> = FEATURE_FLAG_REGISTRY) {
    this.flags = { ...flagRegistry };
  }

  isFeatureEnabled(flagName: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.flags, flagName) ? this.flags[flagName] : false;
  }

  getAllFlags(): Record<string, boolean> {
    return { ...this.flags };
  }
}
