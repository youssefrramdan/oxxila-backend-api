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
} from '../controllers/cart.controller.js'
import {
  addToCartValidator,
  updateCartItemValidator,
} from '../validators/cart.validator.js'

const router = express.Router()

router.use(protectedRoutes)

router.get('/',               getCart)
router.post('/',              addToCartValidator,        validate, addToCart)
router.put('/:itemId',        updateCartItemValidator,   validate, updateCartItem)
router.delete('/:itemId',     removeCartItem)
router.delete('/',            clearCart)

export default router
