// src/routes/cart.routes.js
import express from 'express'
import { protectedRoutes } from '../middlewares/auth.middleware.js'
import validate from '../middlewares/validate.middleware.js'
import {
  getCart,
  addToCart,
  updateCartItem,
  removeCartItem,
  clearCart,
  applyCoupon,
  removeCoupon,
  previewGuestCart,
  previewGuestCoupon,
  mergeGuestCart,
} from '../controllers/cart.controller.js'
import {
  addToCartValidator,
  updateCartItemValidator,
  applyCouponValidator,
} from '../validators/cart.validator.js'

const router = express.Router()

// Public: guests price their localStorage cart (no account needed to shop).
router.post('/preview',      previewGuestCart)
router.post('/coupon/preview', previewGuestCoupon)

router.use(protectedRoutes)

router.post('/merge',         mergeGuestCart)

router.get('/',               getCart)
router.post('/',              addToCartValidator,        validate, addToCart)
router.put('/:itemId',        updateCartItemValidator,   validate, updateCartItem)
router.delete('/:itemId',     removeCartItem)
router.post('/coupon',        applyCouponValidator, validate, applyCoupon)
router.delete('/coupon',      removeCoupon)
router.delete('/',            clearCart)

export default router
