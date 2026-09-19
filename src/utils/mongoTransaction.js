// src/utils/mongoTransaction.js
import mongoose from 'mongoose';

const TXN_TOPOLOGIES = new Set(['ReplicaSetWithPrimary', 'Sharded', 'LoadBalanced']);

/** Standalone mongod (production VPS) cannot run multi-document transactions. */
export const mongoSupportsTransactions = () => {
  const type = mongoose.connection?.client?.topology?.description?.type;
  return TXN_TOPOLOGIES.has(type);
};

/** Run `fn(session)` in a transaction when the topology allows it; otherwise `fn(undefined)`. */
export const runInTransaction = async (fn) => {
  if (!mongoSupportsTransactions()) return fn(undefined);

  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
};
