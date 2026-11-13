'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.AccessRequestRepository = void 0;
const drizzle_orm_1 = require('drizzle-orm');
const access_request_1 = require('../../schema/access-request');
function buildWhereClause(where) {
  return where.length > 0 ? (0, drizzle_orm_1.and)(...where) : undefined;
}
class AccessRequestRepository {
  db;
  constructor(db) {
    this.db = db;
  }
  async list(params) {
    const { where, limit, offset = 0 } = params;
    return await this.db
      .select()
      .from(access_request_1.accessRequest)
      .where(buildWhereClause(where))
      .orderBy(
        (0, drizzle_orm_1.desc)(access_request_1.accessRequest.createdAt),
        (0, drizzle_orm_1.desc)(access_request_1.accessRequest.id),
      )
      .limit(limit)
      .offset(offset);
  }
  async count(where) {
    const [{ cnt }] = await this.db
      .select({ cnt: (0, drizzle_orm_1.count)() })
      .from(access_request_1.accessRequest)
      .where(buildWhereClause(where));
    return Number(cnt);
  }
  async getById(accessRequestId) {
    const [row] = await this.db
      .select()
      .from(access_request_1.accessRequest)
      .where((0, drizzle_orm_1.eq)(access_request_1.accessRequest.id, accessRequestId))
      .limit(1);
    return row ?? null;
  }
  async getPendingByRequesterEmail(email) {
    const [row] = await this.db
      .select()
      .from(access_request_1.accessRequest)
      .where(
        (0, drizzle_orm_1.and)(
          (0, drizzle_orm_1.eq)(access_request_1.accessRequest.requesterEmail, email),
          (0, drizzle_orm_1.eq)(access_request_1.accessRequest.status, 'pending'),
        ),
      )
      .limit(1);
    return row ?? null;
  }
  async getLatestByRequesterEmail(email) {
    const [row] = await this.db
      .select()
      .from(access_request_1.accessRequest)
      .where((0, drizzle_orm_1.eq)(access_request_1.accessRequest.requesterEmail, email))
      .orderBy(
        (0, drizzle_orm_1.desc)(access_request_1.accessRequest.updatedAt),
        (0, drizzle_orm_1.desc)(access_request_1.accessRequest.createdAt),
        (0, drizzle_orm_1.desc)(access_request_1.accessRequest.id),
      )
      .limit(1);
    return row ?? null;
  }
  async create(input) {
    const now = new Date();
    const [row] = await this.db
      .insert(access_request_1.accessRequest)
      .values({
        ...input,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return row;
  }
  async updateStatus(params) {
    const updateData = {
      status: params.status,
      updatedAt: new Date(),
    };
    if (params.reviewerEmail !== undefined) updateData.reviewerEmail = params.reviewerEmail;
    if (params.reviewerN8nUserId !== undefined) updateData.reviewerN8nUserId = params.reviewerN8nUserId;
    if (params.denyReason !== undefined) updateData.denyReason = params.denyReason;
    const [row] = await this.db
      .update(access_request_1.accessRequest)
      .set(updateData)
      .where(
        (0, drizzle_orm_1.and)(
          (0, drizzle_orm_1.eq)(access_request_1.accessRequest.id, params.accessRequestId),
          ...(params.currentStatus
            ? [(0, drizzle_orm_1.eq)(access_request_1.accessRequest.status, params.currentStatus)]
            : []),
        ),
      )
      .returning();
    return row ?? null;
  }
}
exports.AccessRequestRepository = AccessRequestRepository;
