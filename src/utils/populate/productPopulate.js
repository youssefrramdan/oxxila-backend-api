// src/utils/populate/productPopulate.js

export const productPopulate = [
  { path: 'category', select: 'name slug' },
  { path: 'subCategory', select: 'name slug' },
  { path: 'brand', select: 'name slug logo' },
];

export const productSelect =
  'name slug images price priceAfterDiscount offerEndsAt stock soldCount isBestSeller isBundle concerns isSensitiveSkin isCertified advantages composition certificationImage isActive views ratingsAverage ratingsQuantity category subCategory brand createdAt updatedAt';
