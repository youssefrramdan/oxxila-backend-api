// src/utils/bilingualName.js
import slugify from 'slugify';

/**
 * Normalize create/update body so nameEn/nameAr are canonical.
 * Legacy `name` maps to nameEn when nameEn is missing.
 */
export function normalizeBilingualNameBody(body = {}) {
  const next = { ...body };
  if (
    (next.nameEn == null || String(next.nameEn).trim() === '') &&
    typeof next.name === 'string' &&
    next.name.trim()
  ) {
    next.nameEn = next.name.trim();
  }
  if (typeof next.nameEn === 'string' && next.nameEn.trim()) {
    next.name = next.nameEn.trim();
  }
  if (typeof next.nameAr === 'string') {
    next.nameAr = next.nameAr.trim();
  }
  return next;
}

/** Sync alias + slug from nameEn on a Mongoose document (pre-save). */
export function syncBilingualNameOnSave(doc) {
  const en = (doc.nameEn || doc.name || '').trim();
  if (en) {
    doc.nameEn = en;
    doc.name = en;
  }
  if (doc.nameAr == null) doc.nameAr = '';
  if (doc.isModified('nameEn') || doc.isModified('name')) {
    doc.slug = slugify(en, { lower: true, strict: true });
  }
}

/**
 * Sync alias + slug on findOneAndUpdate / findByIdAndUpdate payloads.
 * Mutates the update object in place.
 */
export function syncBilingualNameOnUpdate(update = {}) {
  const $set = update.$set ? { ...update.$set } : {};
  const root = { ...update };
  delete root.$set;
  delete root.$unset;
  delete root.$inc;
  delete root.$push;
  delete root.$pull;
  delete root.$addToSet;

  const nameEnRaw = $set.nameEn ?? root.nameEn ?? $set.name ?? root.name;
  if (typeof nameEnRaw === 'string' && nameEnRaw.trim()) {
    const nameEn = nameEnRaw.trim();
    $set.nameEn = nameEn;
    $set.name = nameEn;
    $set.slug = slugify(nameEn, { lower: true, strict: true });
  }

  if (typeof ($set.nameAr ?? root.nameAr) === 'string') {
    $set.nameAr = String($set.nameAr ?? root.nameAr).trim();
  }

  if (Object.keys($set).length) {
    update.$set = { ...(update.$set || {}), ...$set };
    // Avoid duplicate root keys conflicting with $set
    delete update.name;
    delete update.nameEn;
    delete update.nameAr;
    delete update.slug;
  }
}

export function bilingualNameSelect(extra = '') {
  const base = 'name nameEn nameAr slug';
  return extra ? `${base} ${extra}` : base;
}
