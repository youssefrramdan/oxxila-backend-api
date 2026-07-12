// src/routes/wishlist.routes.js
import express from 'express'
import { protectedRoutes } from '../middlewares/auth.middleware.js'
import validate from '../middlewares/validate.middleware.js'
import {
  getWishlist,
  addToWishlist,
  removeFromWishlist,
  clearWishlist,
} from '../controllers/wishlist.controller.js'
import {
  addToWishlistValidator,
  removeFromWishlistValidator,
} from '../validators/wishlist.validator.js'

const router = express.Router()

router.use(protectedRoutes)

router.get('/', getWishlist)
router.post('/', addToWishlistValidator, validate, addToWishlist)
router.delete('/', clearWishlist)
router.delete('/:productId', removeFromWishlistValidator, validate, removeFromWishlist)

export default router
