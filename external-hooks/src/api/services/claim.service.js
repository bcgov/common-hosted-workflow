'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.ClaimService = void 0;
const drizzle_orm_1 = require('drizzle-orm');
const workflow_interaction_layer_1 = require('../../db/schema/workflow-interaction-layer');
const actor_matcher_clause_1 = require('./actor-matcher-clause');
const action_state_machine_1 = require('./action-state-machine');
const errors_1 = require('../utils/errors');
class ClaimService {
  actionRequestRepository;
  constructor(actionRequestRepository) {
    this.actionRequestRepository = actionRequestRepository;
  }
  /** pending → claimed: sets claimed_by + claimed_at atomically */
  async claim(params) {
    const action = await this.fetchAndValidateEligibility(
      params.actionId,
      params.allowedProjectIds,
      params.actorMatchers,
    );
    if (!(0, action_state_machine_1.isSharedActorType)(action.actorType)) {
      throw new errors_1.AppError(409, 'Action does not require claiming');
    }
    if (action.status !== 'pending') {
      throw new errors_1.AppError(409, 'Action is not available for claiming');
    }
    const result = await this.actionRequestRepository.claim({
      actionId: params.actionId,
      claimedBy: params.actorEmail,
      where: [
        (0, drizzle_orm_1.inArray)(workflow_interaction_layer_1.actionRequest.projectId, params.allowedProjectIds),
      ],
    });
    if (!result) {
      throw new errors_1.AppError(409, 'Action is no longer available for claiming');
    }
    return result;
  }
  /** claimed|in_progress → pending: clears claimed_by + claimed_at atomically.
   *  Any eligible actor in the same role/group can unclaim — not just the claimer.
   */
  async unclaim(params) {
    const action = await this.fetchAndValidateEligibility(
      params.actionId,
      params.allowedProjectIds,
      params.actorMatchers,
    );
    if (!(0, action_state_machine_1.isSharedActorType)(action.actorType)) {
      throw new errors_1.AppError(409, 'Action does not support unclaiming');
    }
    if (action.status !== 'claimed' && action.status !== 'in_progress') {
      throw new errors_1.AppError(409, 'Action is not in a claimed or in-progress state');
    }
    const result = await this.actionRequestRepository.unclaim({
      actionId: params.actionId,
      where: [
        (0, drizzle_orm_1.inArray)(workflow_interaction_layer_1.actionRequest.projectId, params.allowedProjectIds),
      ],
    });
    if (!result) {
      throw new errors_1.AppError(409, 'Action is no longer available for unclaiming');
    }
    return result;
  }
  /** claimed → in_progress: validates caller = claimed_by */
  async start(params) {
    const action = await this.fetchExistingAction(params.actionId, params.allowedProjectIds);
    if (action.status !== 'claimed') {
      throw new errors_1.AppError(409, 'Action is not in a claimed state');
    }
    if (action.claimedBy !== params.actorEmail) {
      throw new errors_1.AppError(403, 'Only the claiming actor can start this action');
    }
    const result = await this.actionRequestRepository.startAction({
      actionId: params.actionId,
      claimedBy: params.actorEmail,
      where: [
        (0, drizzle_orm_1.inArray)(workflow_interaction_layer_1.actionRequest.projectId, params.allowedProjectIds),
      ],
    });
    if (!result) {
      throw new errors_1.AppError(409, 'Action is no longer available for starting');
    }
    return result;
  }
  /**
   * Two-step validation: first check existence (project scope only),
   * then check eligibility (project scope + actor matcher).
   * Returns the action if both pass; throws 404 or 403 otherwise.
   */
  async fetchAndValidateEligibility(actionId, allowedProjectIds, actorMatchers) {
    await this.fetchExistingAction(actionId, allowedProjectIds);
    const actorClause = (0, actor_matcher_clause_1.buildActorMatcherClause)(
      workflow_interaction_layer_1.actionRequest,
      actorMatchers,
    );
    const eligible = await this.actionRequestRepository.getById({
      actionId,
      where: [
        (0, drizzle_orm_1.inArray)(workflow_interaction_layer_1.actionRequest.projectId, allowedProjectIds),
        actorClause,
      ],
    });
    if (!eligible) {
      throw new errors_1.AppError(403, 'Actor is not eligible for this action');
    }
    return eligible;
  }
  /** Fetch action by id scoped to allowed projects. Throws 404 if not found. */
  async fetchExistingAction(actionId, allowedProjectIds) {
    const action = await this.actionRequestRepository.getById({
      actionId,
      where: [(0, drizzle_orm_1.inArray)(workflow_interaction_layer_1.actionRequest.projectId, allowedProjectIds)],
    });
    if (!action) {
      throw new errors_1.AppError(404, 'Action not found');
    }
    return action;
  }
}
exports.ClaimService = ClaimService;
