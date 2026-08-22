// src/models/ContentPage.js
import mongoose from 'mongoose';

export const CONTENT_PAGE_SLUGS = [
  'about',
  'terms',
  'privacy',
  'refund-policy',
  'shipping-policy',
];

const sectionSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true, maxlength: 60 },
    title: { type: String, default: '', trim: true, maxlength: 200 },
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
    /** Main HTML/text body (policies + optional About intro). */
    content: { type: String, default: '', trim: true, maxlength: 100000 },
    /** Structured blocks — used heavily by About; optional for policies. */
    sections: {
      type: [sectionSchema],
      default: [],
    },
    isPublished: { type: Boolean, default: true },
  },
  { timestamps: true },
);

const DEFAULT_PAGES = [
  {
    slug: 'about',
    title: 'About Oxxila',
    subtitle: 'Pharmaceutical authority meets premium skincare excellence.',
    content: '',
    sections: [
      {
        key: 'intro',
        title: 'About Oxxila',
        body: 'Oxxila Pharma is an Egyptian pharmaceutical skincare company built on rigorous science, regulatory compliance, and clinical integrity.',
        image: '',
      },
      {
        key: 'quality',
        title: 'Quality & Compliance',
        body: 'Every product in our portfolio meets pharmaceutical-grade standards enforced through regulatory oversight and certified manufacturing.',
        image: '',
      },
      {
        key: 'medical',
        title: 'Medically Aligned Solutions',
        body: 'We collaborate with dermatology experts and clinical advisors to ensure every recommendation reflects evidence-based skincare science.',
        image: '',
      },
      {
        key: 'infrastructure',
        title: 'Infrastructure & Reach',
        body: 'From manufacturing partners to distribution, our infrastructure is built for reliability, traceability, and scale across Egypt.',
        image: '',
      },
      {
        key: 'authenticity',
        title: 'Authenticity Guarantee',
        body: 'We stand behind every product we sell with authenticity checks and transparent sourcing.',
        image: '',
      },
    ],
  },
  {
    slug: 'terms',
    title: 'Terms & Conditions',
    subtitle: '',
    content: 'Update these Terms & Conditions from the admin dashboard.',
    sections: [],
  },
  {
    slug: 'privacy',
    title: 'Privacy Policy',
    subtitle: '',
    content: 'Update this Privacy Policy from the admin dashboard.',
    sections: [],
  },
  {
    slug: 'refund-policy',
    title: 'Refund Policy',
    subtitle: '',
    content: 'Update this Refund Policy from the admin dashboard.',
    sections: [],
  },
  {
    slug: 'shipping-policy',
    title: 'Shipping Policy',
    subtitle: '',
    content: 'Update this Shipping Policy from the admin dashboard.',
    sections: [],
  },
];

/** Seed missing pages (idempotent). */
contentPageSchema.statics.ensureDefaults = async function ensureDefaults() {
  await Promise.all(
    DEFAULT_PAGES.map((page) =>
      this.updateOne({ slug: page.slug }, { $setOnInsert: page }, { upsert: true }),
    ),
  );
};

contentPageSchema.statics.isValidSlug = function isValidSlug(slug) {
  return CONTENT_PAGE_SLUGS.includes(slug);
};

const ContentPage = mongoose.model('ContentPage', contentPageSchema);
export default ContentPage;
