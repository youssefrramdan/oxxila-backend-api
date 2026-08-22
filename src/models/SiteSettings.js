// src/models/SiteSettings.js
import mongoose from 'mongoose';

const INSTAGRAM_SLOTS = 4;
const HOW_IT_WORKS_STEPS = 3;

const emptyInstagramPosts = () =>
  Array.from({ length: INSTAGRAM_SLOTS }, () => ({
    image: '',
    postUrl: '',
    alt: '',
  }));

const defaultHowItWorksSteps = () => [
  {
    title: 'Choose Your Skin Concern',
    description:
      'Select your main concern — acne, pigmentation, sensitivity, dryness, or pores — and we will instantly filter the right products for you.',
  },
  {
    title: 'Get Clear, Doctor-Based Explanations',
    description:
      'Understand ingredients and routines with expert-backed guidance tailored to your unique skin profile and goals.',
  },
  {
    title: 'One Step Checkout & Delivery',
    description:
      'Add to cart, checkout securely, and get dermatologist-trusted products delivered straight to your door.',
  },
];

const instagramPostSchema = new mongoose.Schema(
  {
    image: { type: String, default: '', trim: true },
    postUrl: { type: String, default: '', trim: true },
    alt: { type: String, default: '', trim: true, maxlength: 200 },
  },
  { _id: false },
);

const howItWorksStepSchema = new mongoose.Schema(
  {
    title: { type: String, default: '', trim: true, maxlength: 120 },
    description: { type: String, default: '', trim: true, maxlength: 1000 },
  },
  { _id: false },
);

const siteSettingsSchema = new mongoose.Schema(
  {
    /** Singleton guard — only one settings document. */
    singletonKey: {
      type: String,
      default: 'main',
      unique: true,
      immutable: true,
    },
    contact: {
      phone: { type: String, default: '080 152 111 55 17', trim: true },
      email: { type: String, default: 'contact@oxilla.com', trim: true, lowercase: true },
      location: { type: String, default: 'Texas, USA', trim: true },
      /** Digits / international number used for wa.me deep link (dashboard-editable). */
      whatsapp: { type: String, default: '', trim: true },
    },
    social: {
      facebook: { type: String, default: '', trim: true },
      twitter: { type: String, default: '', trim: true },
      instagram: { type: String, default: '', trim: true },
      linkedin: { type: String, default: '', trim: true },
      youtube: { type: String, default: '', trim: true },
    },
    /** Exactly 4 footer Instagram tiles (image + post link). */
    instagramPosts: {
      type: [instagramPostSchema],
      default: emptyInstagramPosts,
      validate: {
        validator: (posts) => Array.isArray(posts) && posts.length === INSTAGRAM_SLOTS,
        message: `instagramPosts must contain exactly ${INSTAGRAM_SLOTS} items`,
      },
    },
    /** Landing "How it works" section. */
    howItWorks: {
      title: { type: String, default: 'How it works', trim: true, maxlength: 120 },
      thumbnailImage: { type: String, default: '', trim: true },
      videoUrl: { type: String, default: '', trim: true },
      steps: {
        type: [howItWorksStepSchema],
        default: defaultHowItWorksSteps,
        validate: {
          validator: (steps) => Array.isArray(steps) && steps.length === HOW_IT_WORKS_STEPS,
          message: `howItWorks.steps must contain exactly ${HOW_IT_WORKS_STEPS} items`,
        },
      },
    },
  },
  { timestamps: true },
);

siteSettingsSchema.statics.INSTAGRAM_SLOTS = INSTAGRAM_SLOTS;
siteSettingsSchema.statics.HOW_IT_WORKS_STEPS = HOW_IT_WORKS_STEPS;

const normalizeInstagramPosts = (existing) => {
  const posts = emptyInstagramPosts();
  (existing || []).slice(0, INSTAGRAM_SLOTS).forEach((post, i) => {
    posts[i] = {
      image: post?.image ?? '',
      postUrl: post?.postUrl ?? '',
      alt: post?.alt ?? '',
    };
  });
  return posts;
};

const normalizeHowItWorks = (existing) => {
  const defaults = defaultHowItWorksSteps();
  const steps = defaults.map((fallback, i) => ({
    title: existing?.steps?.[i]?.title ?? fallback.title,
    description: existing?.steps?.[i]?.description ?? fallback.description,
  }));
  return {
    title: existing?.title?.trim() || 'How it works',
    thumbnailImage: existing?.thumbnailImage ?? '',
    videoUrl: existing?.videoUrl ?? '',
    steps,
  };
};

/** Get or create the singleton settings document. */
siteSettingsSchema.statics.getSingleton = async function getSingleton() {
  let doc = await this.findOne({ singletonKey: 'main' });
  if (doc) {
    let dirty = false;

    if (doc.contact && doc.contact.whatsapp === undefined) {
      doc.contact.whatsapp = '';
      dirty = true;
    }

    if (!Array.isArray(doc.instagramPosts) || doc.instagramPosts.length !== INSTAGRAM_SLOTS) {
      doc.instagramPosts = normalizeInstagramPosts(doc.instagramPosts);
      dirty = true;
    }

    if (
      !doc.howItWorks ||
      !Array.isArray(doc.howItWorks.steps) ||
      doc.howItWorks.steps.length !== HOW_IT_WORKS_STEPS
    ) {
      doc.howItWorks = normalizeHowItWorks(doc.howItWorks);
      dirty = true;
    }

    if (dirty) await doc.save();
    return doc;
  }

  doc = await this.create({
    singletonKey: 'main',
    contact: {
      phone: '080 152 111 55 17',
      email: 'contact@oxilla.com',
      location: 'Texas, USA',
      whatsapp: '',
    },
    social: {
      facebook: 'https://facebook.com',
      twitter: 'https://twitter.com',
      instagram: 'https://instagram.com',
      linkedin: 'https://linkedin.com',
      youtube: 'https://youtube.com',
    },
    instagramPosts: emptyInstagramPosts(),
    howItWorks: normalizeHowItWorks(null),
  });
  return doc;
};

const SiteSettings = mongoose.model('SiteSettings', siteSettingsSchema);
export default SiteSettings;
