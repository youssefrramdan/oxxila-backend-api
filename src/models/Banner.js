// src/models/Banner.js
import mongoose from 'mongoose';

const LINK_TYPES = ['product', 'category', 'url', 'none'];

const bannerSchema = new mongoose.Schema(
  {
    image:    { type: String, required: [true, 'Image is required'], trim: true },
    title:    { type: String, default: null, trim: true, maxlength: 200 },
    linkType: { type: String, enum: LINK_TYPES, default: 'none' },
    linkId:   { type: mongoose.Schema.Types.ObjectId, default: null },
    externalUrl: { type: String, default: null, trim: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

bannerSchema.pre('validate', function () {
  const t = this.linkType;
  if (['product', 'category'].includes(t)) {
    if (!this.linkId) this.invalidate('linkId', 'linkId is required for this link type');
    this.externalUrl = null;
  } else if (t === 'url') {
    if (!this.externalUrl?.trim()) this.invalidate('externalUrl', 'externalUrl is required when linkType is url');
    this.linkId = null;
  } else {
    this.linkId = null;
    this.externalUrl = null;
  }
});

bannerSchema.index({ isActive: 1, createdAt: -1 });

export default mongoose.model('Banner', bannerSchema);
