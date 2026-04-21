// src/models/User.js
import { Schema, model } from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: 2,
      maxlength: 60,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    password: {
      type: String,
      minlength: 8,
      select: false,
    },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
    },
    authProvider: {
      type: String,
      enum: ['local', 'google', 'facebook'],
      default: 'local',
    },
    googleId: { type: String, unique: true, sparse: true, select: false },
    facebookId: { type: String, unique: true, sparse: true, select: false },
    avatar: { type: String, default: '' },
    // Cloudinary public_id for the current avatar. Kept server-side only so
    // we can destroy the old asset when the user uploads a new one.
    avatarPublicId: { type: String, default: '', select: false },
    active: { type: Boolean, default: true },

    // Password management
    passwordChangedAt: Date,
    passwordResetToken: { type: String, select: false },
    passwordResetExpires: { type: Date, select: false },
  },
  { timestamps: true }
);

// Hash the password whenever it changes. Skip for OAuth-only accounts (no password set).
userSchema.pre('save', async function () {
  if (!this.isModified('password') || !this.password) return;
  this.password = await bcrypt.hash(this.password, 12);
  if (!this.isNew) this.passwordChangedAt = Date.now() - 1000;
});

userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

// Returns true if the user changed password after the JWT was issued.
userSchema.methods.changedPasswordAfter = function (jwtIat) {
  if (!this.passwordChangedAt) return false;
  const changedTs = Math.floor(this.passwordChangedAt.getTime() / 1000);
  return jwtIat < changedTs;
};

// Never leak sensitive fields when serializing to JSON.
userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.password;
    delete ret.passwordResetToken;
    delete ret.passwordResetExpires;
    delete ret.avatarPublicId;
    delete ret.__v;
    return ret;
  },
});

export default model('User', userSchema);
