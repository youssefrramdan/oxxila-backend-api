// src/utils/populate/productPopulate.js

export const productPopulate = [
  { path: 'category', select: 'name nameEn nameAr slug' },
  { path: 'subCategory', select: 'name nameEn nameAr slug' },
  { path: 'brand', select: 'name nameEn nameAr slug logo' },
];

export const productSelect =
  'name nameEn nameAr slug images price priceAfterDiscount offerEndsAt stock soldCount isBestSeller isBundle concerns isSensitiveSkin isCertified advantages composition certificationImage isActive views ratingsAverage ratingsQuantity category subCategory brand createdAt updatedAt';
