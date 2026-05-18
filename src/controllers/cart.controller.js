// src/controllers/cart.controller.js
import asyncHandler from 'express-async-handler'
import Cart from '../models/Cart.js'
import Product from '../models/Product.js'
import ApiError from '../utils/apiError.js'
import sendResponse from '../utils/apiResponse.js'

// helper — يحسب السعر الصح للمنتج
const resolveProductPrice = (product) =>
  product.priceAfterDiscount ?? product.price

// helper — يعمل populate ويحدث الأسعار أوتوماتيك
const getUpdatedCart = async (userId) => {
  const cart = await Cart.findOne({ user: userId }).populate(
    'items.product',
    'name images price priceAfterDiscount stock isActive'
  )
  if (!cart) return null

  // حدث السعر من المنتج الحالي
  let changed = false
  for (const item of cart.items) {
    if (!item.product) continue
    const currentPrice = resolveProductPrice(item.product)
    if (item.price !== currentPrice) {
      item.price = currentPrice
      changed = true
    }
  }
  if (changed) await cart.save()

  const totalPrice = cart.items.reduce(
    (sum, item) => sum + item.price * item.quantity, 0
  )

  return { cart, totalPrice }
}

// GET /cart
export const getCart = asyncHandler(async (req, res) => {
  const result = await getUpdatedCart(req.user._id)

  if (!result) {
    return sendResponse(res, {
      data: { items: [], totalPrice: 0 }
    })
  }

  sendResponse(res, {
    data: {
      _id:        result.cart._id,
      items:      result.cart.items,
      totalPrice: result.totalPrice,
    }
  })
})

// POST /cart
export const addToCart = asyncHandler(async (req, res) => {
  const { productId, quantity = 1 } = req.body

  const product = await Product.findById(productId)
  if (!product || !product.isActive)
    throw new ApiError('Product not found', 404)

  if (product.stock < quantity)
    throw new ApiError('Not enough stock', 400)

  let cart = await Cart.findOne({ user: req.user._id })

  if (!cart) {
    cart = await Cart.create({
      user: req.user._id,
      items: [{
        product:  productId,
        quantity,
        price:    resolveProductPrice(product),
      }]
    })
  } else {
    const existingItem = cart.items.find(
      i => i.product.toString() === productId
    )

    if (existingItem) {
      const newQty = existingItem.quantity + quantity
      if (product.stock < newQty)
        throw new ApiError('Not enough stock', 400)
      existingItem.quantity = newQty
      existingItem.price    = resolveProductPrice(product)
    } else {
      cart.items.push({
        product:  productId,
        quantity,
        price:    resolveProductPrice(product),
      })
    }

    await cart.save()
  }

  const result = await getUpdatedCart(req.user._id)

  sendResponse(res, {
    statusCode: 201,
    message: 'Item added to cart',
    data: {
      _id:        result.cart._id,
      items:      result.cart.items,
      totalPrice: result.totalPrice,
    }
  })
})

// PUT /cart/:itemId
export const updateCartItem = asyncHandler(async (req, res) => {
  const { quantity } = req.body

  const cart = await Cart.findOne({ user: req.user._id })
  if (!cart) throw new ApiError('Cart not found', 404)

  const item = cart.items.id(req.params.itemId)
  if (!item) throw new ApiError('Item not found in cart', 404)

  const product = await Product.findById(item.product)
  if (!product || !product.isActive)
    throw new ApiError('Product not found', 404)

  if (product.stock < quantity)
    throw new ApiError('Not enough stock', 400)

  item.quantity = quantity
  item.price    = resolveProductPrice(product)
  await cart.save()

  const result = await getUpdatedCart(req.user._id)

  sendResponse(res, {
    message: 'Cart updated',
    data: {
      _id:        result.cart._id,
      items:      result.cart.items,
      totalPrice: result.totalPrice,
    }
  })
})

// DELETE /cart/:itemId
export const removeCartItem = asyncHandler(async (req, res) => {
  const cart = await Cart.findOne({ user: req.user._id })
  if (!cart) throw new ApiError('Cart not found', 404)

  const item = cart.items.id(req.params.itemId)
  if (!item) throw new ApiError('Item not found in cart', 404)

  item.deleteOne()
  await cart.save()

  const result = await getUpdatedCart(req.user._id)
  const totalPrice = result?.totalPrice ?? 0

  sendResponse(res, {
    message: 'Item removed from cart',
    data: {
      _id:        cart._id,
      items:      cart.items,
      totalPrice,
    }
  })
})

// DELETE /cart
export const clearCart = asyncHandler(async (req, res) => {
  await Cart.findOneAndDelete({ user: req.user._id })
  sendResponse(res, { message: 'Cart cleared' })
})
