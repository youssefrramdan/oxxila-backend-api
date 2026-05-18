// src/models/Cart.js
import mongoose from 'mongoose'

const CartItemSchema = new mongoose.Schema({
  product:  { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  quantity: { type: Number, required: true, min: 1, default: 1 },
  price:    { type: Number, required: true },
}, { _id: true })

const CartSchema = new mongoose.Schema({
  user:           { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  items:          [CartItemSchema],
  couponCode:     { type: String, default: null },
  couponId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Coupon', default: null },
  discountAmount: { type: Number, default: 0 },
}, { timestamps: true })

export default mongoose.model('Cart', CartSchema)
