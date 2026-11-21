import {
  Types,
  type FilterQuery,
  type HydratedDocument,
  type Model,
  type UpdateQuery,
} from 'mongoose';
import { can, type Action } from '@invoxa/shared';
import { errors } from './errors.js';
import type { TenantContext } from './tenant.js';

/**
 * The one scoped query helper. It injects the business ID into every filter and
 * never exposes a raw `find`, so a query cannot forget the tenant key.
 *
 * Usage: const clients = scoped(Client, context); clients.find({ archived: false })
 *
 * Mongoose models carry several generic parameters (query helpers, methods,
 * timestamps), which is why the model parameter is typed loosely while the
 * document type is inferred from it for every returned value.
 */
export interface ScopedRepository<TDoc> {
  find(filter?: FilterQuery<TDoc>, limit?: number): Promise<HydratedDocument<TDoc>[]>;
  findById(id: string): Promise<HydratedDocument<TDoc> | null>;
  findOne(filter: FilterQuery<TDoc>): Promise<HydratedDocument<TDoc> | null>;
  count(filter?: FilterQuery<TDoc>): Promise<number>;
  create(data: Partial<TDoc>): Promise<HydratedDocument<TDoc>>;
  updateById(id: string, update: UpdateQuery<TDoc>): Promise<HydratedDocument<TDoc> | null>;
  deleteById(id: string): Promise<HydratedDocument<TDoc> | null>;
}

export function scoped<TDoc>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: Model<TDoc, any, any, any, any>,
  context: TenantContext,
): ScopedRepository<TDoc> {
  const business = new Types.ObjectId(context.businessId);
  const withBusiness = (filter: FilterQuery<TDoc> = {}): FilterQuery<TDoc> => ({
    ...filter,
    business,
  });

  return {
    find: (filter = {}, limit) => {
      const query = model.find(withBusiness(filter));
      const limited = limit ? query.limit(limit) : query;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return limited.exec() as Promise<any>;
    },
    findById: (id) =>
      model.findOne(withBusiness({ _id: id } as FilterQuery<TDoc>)).exec() as Promise<never>,
    findOne: (filter) => model.findOne(withBusiness(filter)).exec() as Promise<never>,
    count: (filter = {}) => model.countDocuments(withBusiness(filter)).exec(),
    create: (data) => model.create({ ...data, business } as TDoc) as Promise<never>,
    updateById: (id, update) =>
      model
        .findOneAndUpdate(withBusiness({ _id: id } as FilterQuery<TDoc>), update, {
          new: true,
        })
        .exec() as Promise<never>,
    deleteById: (id) =>
      model
        .findOneAndDelete(withBusiness({ _id: id } as FilterQuery<TDoc>))
        .exec() as Promise<never>,
  };
}

/** Role check for a resource action, on top of the tenant check. */
export function assertAction(context: TenantContext, action: Action): void {
  if (!can(context.role, action)) {
    throw errors.forbidden();
  }
}
