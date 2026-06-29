import { FEATURE_FLAG_CONFIG } from '../../config';
import { parseFeatureFlagConfig } from '../helpers/config-resolver';

export const FEATURE_FLAG_REGISTRY: Record<string, boolean> = parseFeatureFlagConfig(FEATURE_FLAG_CONFIG);
