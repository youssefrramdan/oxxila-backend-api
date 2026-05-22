// src/utils/toPlainDoc.js

/** Mongoose document → plain object; already-plain / lean docs pass through. */
export const toPlainDoc = (doc) =>
  typeof doc?.toObject === 'function' ? doc.toObject() : doc;
