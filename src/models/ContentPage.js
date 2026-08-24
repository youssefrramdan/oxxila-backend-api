// src/models/ContentPage.js
import mongoose from 'mongoose';

export const CONTENT_PAGE_SLUGS = [
  'about',
  'terms',
  'privacy',
  'refund-policy',
  'shipping-policy',
];

export const CONTENT_SECTION_LAYOUTS = ['intro', 'cards', 'split', 'cta', 'text'];

const PAGE_SHELL_TITLES = {
  about: 'About',
  terms: 'Terms & Conditions',
  privacy: 'Privacy Policy',
  'refund-policy': 'Refund Policy',
  'shipping-policy': 'Shipping Policy',
};

const sectionItemSchema = new mongoose.Schema(
  {
    title: { type: String, default: '', trim: true, maxlength: 200 },
    description: { type: String, default: '', trim: true, maxlength: 2000 },
  },
  { _id: false },
);

const sectionSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true, maxlength: 60 },
    layout: {
      type: String,
      enum: CONTENT_SECTION_LAYOUTS,
      default: 'text',
    },
    title: { type: String, default: '', trim: true, maxlength: 200 },
    subtitle: { type: String, default: '', trim: true, maxlength: 500 },
    /** Plain text body (paragraphs separated by newlines). */
    body: { type: String, default: '', trim: true, maxlength: 20000 },
    image: { type: String, default: '', trim: true },
    items: { type: [sectionItemSchema], default: [] },
    buttonLabel: { type: String, default: '', trim: true, maxlength: 120 },
    buttonHref: { type: String, default: '', trim: true, maxlength: 500 },
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
    content: { type: String, default: '', trim: true, maxlength: 100000 },
    sections: {
      type: [sectionSchema],
      default: [],
    },
    isPublished: { type: Boolean, default: true },
  },
  { timestamps: true },
);

/** Empty shells only — never overwrites seeded / admin CMS data. */
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
