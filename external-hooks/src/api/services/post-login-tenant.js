"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runPostLoginTenantWork = runPostLoginTenantWork;
exports.runPostLoginTenantWorkAsync = runPostLoginTenantWorkAsync;
const logger_1 = require("../utils/logger");
const log = (0, logger_1.createLogger)('PostLoginTenant');
/**
 * One post-login operation for tenant role/group pre-warming and
 * tenant-project synchronization.
 *
 * - Fetches the CSTAR tenant list once and reuses it for both
 *   pre-warm and sync to avoid duplicate CSTAR tenants calls.
 * - Runs pre-warm and sync concurrently via Promise.allSettled so a
 *   failure in one does not cancel the other.
 * - Failures are logged consistently with logger.error but never
 *   thrown — login success is not blocked by background tenant work
 *   (documented login-success contract).
 * - No CSTAR call is made when accessToken is missing or CSTAR is
 *   not configured (graceful no-op).
 * - Safe to call fire-and-forget (caller may not await); returned
 *   promise resolves after both complete (or log failures).
 */
async function runPostLoginTenantWork(params) {
    const { email, ssoUserId, accessToken, n8nUserId, tenantService, tenantProjectSyncService, cstarService, tenants: preFetchedTenants, } = params;
    if (!accessToken) {
        log.debug('Post-login tenant work skipped: no access token', { email });
        return;
    }
    if (!cstarService.isConfigured()) {
        log.debug('Post-login tenant work skipped: CSTAR not configured', { email });
        return;
    }
    let tenants = preFetchedTenants;
    if (!tenants) {
        try {
            tenants = await cstarService.getUserTenants({ ssoUserId, accessToken });
        }
        catch (error) {
            log.error('Tenant post-login: failed to fetch tenants', { email, ssoUserId, error: String(error) });
            return;
        }
    }
    const results = await Promise.allSettled([
        tenantService.prewarmTenantRolesAndGroups({ email, ssoUserId, accessToken, tenants }).catch((err) => {
            // Defensive: prewarm already propagates rejection, but ensure it is captured as settled
            throw err;
        }),
        tenantProjectSyncService.syncTenantsForUser({ ssoUserId, n8nUserId, accessToken, tenants }),
    ]);
    const [prewarmResult, syncResult] = results;
    if (prewarmResult.status === 'rejected') {
        log.error('Tenant roles pre-warm failed', { email, error: String(prewarmResult.reason) });
    }
    if (syncResult.status === 'rejected') {
        log.error('Tenant project sync failed', { email, error: String(syncResult.reason) });
    }
}
/**
 * Fire-and-forget wrapper with consistent error logging.
 * Use from login coordinator where tenant work must not block login.
 */
function runPostLoginTenantWorkAsync(params) {
    runPostLoginTenantWork(params).catch((err) => {
        // Should already be logged via settled handling, but catch unexpected throw
        log.error('Tenant post-login work unexpected failure', { email: params.email, error: String(err) });
    });
}
