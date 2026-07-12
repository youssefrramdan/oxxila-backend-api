// src/models/Wishlist.js
import mongoose from 'mongoose'

const WishlistItemSchema = new mongoose.Schema({
  product:  { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  addedAt:  { type: Date, default: Date.now },
}, { _id: true })

const WishlistSchema = new mongoose.Schema({
  user:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  items: [WishlistItemSchema],
}, { timestamps: true })

export default mongoose.model('Wishlist', WishlistSchema)
