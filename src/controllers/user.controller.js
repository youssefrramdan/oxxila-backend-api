// src/controllers/user.controller.js
export {
  getAllUsers,
  getSpecificUser,
  createUser,
  updateUser,
  deleteUser,
  activateSpecificUser,
  changeUserPassword,
} from './userAdmin.controller.js';

export {
  getMe,
  getMyAddresses,
  addMyAddress,
  updateMyAddress,
  deleteMyAddress,
  updateMe,
  uploadMyAvatar,
  updateMyPassword,
  deactivateMe,
  activateMe,
} from './userProfile.controller.js';
