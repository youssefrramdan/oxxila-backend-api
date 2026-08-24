// src/models/ContentPage.js
import mongoose from 'mongoose';

export const CONTENT_PAGE_SLUGS = [
  'about',
  'terms',
  'privacy',
  'refund-policy',
  'shipping-policy',
];

const PAGE_SHELL_TITLES = {
  about: 'About',
  terms: 'Terms & Conditions',
  privacy: 'Privacy Policy',
  'refund-policy': 'Refund Policy',
  'shipping-policy': 'Shipping Policy',
};

const sectionSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true, maxlength: 60 },
    title: { type: String, default: '', trim: true, maxlength: 200 },
    /** Plain text or JSON payload for structured About blocks — never required as HTML. */
    body: { type: String, default: '', trim: true, maxlength: 20000 },
    image: { type: String, default: '', trim: true },
  },
  { _id: false },
);

const contentPageSchema = new mongoose.Schema(
  {
    slug: {
      type: String,
      required: true,
      unique: true,
      enum: CONTENT_PAGE_SLUGS,
      index: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    subtitle: { type: String, default: '', trim: true, maxlength: 500 },
    /** Optional intro text (plain). Prefer `sections` for storefront body. */
    content: { type: String, default: '', trim: true, maxlength: 100000 },
    sections: {
      type: [sectionSchema],
      default: [],
    },
    isPublished: { type: Boolean, default: true },
  },
  { timestamps: true },
);

/**
 * Create empty shells for missing slugs only — never overwrites CMS data.
 * Real copy is seeded once (or edited in admin).
 */
contentPageSchema.statics.ensureDefaults = async function ensureDefaults() {
  for (const slug of CONTENT_PAGE_SLUGS) {
    const exists = await this.exists({ slug });
    if (exists) continue;
    await this.create({
      slug,
      title: PAGE_SHELL_TITLES[slug] ?? slug,
      subtitle: '',
      content: '',
      sections: [],
      isPublished: true,
    });
  }
};

contentPageSchema.statics.isValidSlug = function isValidSlug(slug) {
  return CONTENT_PAGE_SLUGS.includes(slug);
};

const ContentPage = mongoose.model('ContentPage', contentPageSchema);
export default ContentPage;
