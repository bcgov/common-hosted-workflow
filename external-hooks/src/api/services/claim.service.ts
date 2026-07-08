import { inArray } from 'drizzle-orm';
import { actionRequest, type ActionRequest } from '../../db/schema/workflow-interaction-layer';
import { buildActorMatcherClause } from './actor-matcher-clause';
import { isSharedActorType } from './action-state-machine';
import type { ActionRequestRepository } from '../../db/repository/custom/action-request';
import type { ActorMatchers } from '../types/actor-matchers';
import { AppError } from '../utils/errors';

export interface ClaimParams {
  actionId: string;
  actorEmail: string;
  actorMatchers: ActorMatchers;
  allowedProjectIds: string[];
}

export interface UnclaimParams {
  actionId: string;
  actorEmail: string;
  actorMatchers: ActorMatchers;
  allowedProjectIds: string[];
}

export interface StartActionParams {
  actionId: string;
  actorEmail: string;
  allowedProjectIds: string[];
}

export class ClaimService {
  constructor(private readonly actionRequestRepository: ActionRequestRepository) {}

  /** pending → claimed: sets claimed_by + claimed_at atomically */
  async claim(params: ClaimParams): Promise<ActionRequest> {
    const action = await this.fetchAndValidateEligibility(
      params.actionId,
      params.allowedProjectIds,
      params.actorMatchers,
    );

    if (!isSharedActorType(action.actorType)) {
      throw new AppError(409, 'Action does not require claiming');
    }

    if (action.status !== 'pending') {
      throw new AppError(409, 'Action is not available for claiming');
    }

    const result = await this.actionRequestRepository.claim({
      actionId: params.actionId,
      claimedBy: params.actorEmail,
      where: [inArray(actionRequest.projectId, params.allowedProjectIds)],
    });

    if (!result) {
      throw new AppError(409, 'Action is no longer available for claiming');
    }

    return result;
  }

  /** claimed|in_progress → pending: clears claimed_by + claimed_at atomically.
   *  Any eligible actor in the same role/group can unclaim — not just the claimer.
   */
  async unclaim(params: UnclaimParams): Promise<ActionRequest> {
    const action = await this.fetchAndValidateEligibility(
      params.actionId,
      params.allowedProjectIds,
      params.actorMatchers,
    );

    if (!isSharedActorType(action.actorType)) {
      throw new AppError(409, 'Action does not support unclaiming');
    }

    if (action.status !== 'claimed' && action.status !== 'in_progress') {
      throw new AppError(409, 'Action is not in a claimed or in-progress state');
    }

    const result = await this.actionRequestRepository.unclaim({
      actionId: params.actionId,
      where: [inArray(actionRequest.projectId, params.allowedProjectIds)],
    });

    if (!result) {
      throw new AppError(409, 'Action is no longer available for unclaiming');
    }

    return result;
  }

  /** claimed → in_progress: validates caller = claimed_by */
  async start(params: StartActionParams): Promise<ActionRequest> {
    const action = await this.fetchExistingAction(params.actionId, params.allowedProjectIds);

    if (action.status !== 'claimed') {
      throw new AppError(409, 'Action is not in a claimed state');
    }

    if (action.claimedBy !== params.actorEmail) {
      throw new AppError(403, 'Only the claiming actor can start this action');
    }

    const result = await this.actionRequestRepository.startAction({
      actionId: params.actionId,
      claimedBy: params.actorEmail,
      where: [inArray(actionRequest.projectId, params.allowedProjectIds)],
    });

    if (!result) {
      throw new AppError(409, 'Action is no longer available for starting');
    }

    return result;
  }

  /**
   * Two-step validation: first check existence (project scope only),
   * then check eligibility (project scope + actor matcher).
   * Returns the action if both pass; throws 404 or 403 otherwise.
   */
  private async fetchAndValidateEligibility(
    actionId: string,
    allowedProjectIds: string[],
    actorMatchers: ActorMatchers,
  ): Promise<ActionRequest> {
    await this.fetchExistingAction(actionId, allowedProjectIds);

    const actorClause = buildActorMatcherClause(actionRequest, actorMatchers);
    const eligible = await this.actionRequestRepository.getById({
      actionId,
      where: [inArray(actionRequest.projectId, allowedProjectIds), actorClause],
    });

    if (!eligible) {
      throw new AppError(403, 'Actor is not eligible for this action');
    }

    return eligible;
  }

  /** Fetch action by id scoped to allowed projects. Throws 404 if not found. */
  private async fetchExistingAction(actionId: string, allowedProjectIds: string[]): Promise<ActionRequest> {
    const action = await this.actionRequestRepository.getById({
      actionId,
      where: [inArray(actionRequest.projectId, allowedProjectIds)],
    });

    if (!action) {
      throw new AppError(404, 'Action not found');
    }

    return action;
  }
}
