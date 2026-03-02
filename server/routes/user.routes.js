const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');

// @route   GET api/users/pending
// @desc    Get all user requests awaiting approval
// @access  Private (Admin only)
router.get('/pending', authenticate, authorize('admin'), userController.getPendingUsers);

// @route   GET api/users/approved
// @desc    Get all approved users (access logs)
// @access  Private (Admin only)
router.get('/approved', authenticate, authorize('admin'), userController.getApprovedUsers);

// @route   PUT api/users/approve/:userId
// @desc    Approve a user's registration
// @access  Private (Admin only)
router.put('/approve/:userId', authenticate, authorize('admin'), userController.approveUser);

// @route   DELETE api/users/reject/:userId
// @desc    Reject and delete a user's registration
// @access  Private (Admin only)
router.delete('/reject/:userId', authenticate, authorize('admin'), userController.rejectUser);

// @route   PUT api/users/profile
// @desc    Update logged-in user's profile (full_name, avatar_url)
// @access  Private
router.put('/profile', authenticate, userController.updateProfile);

// @route   PUT api/users/password
// @desc    Change logged-in user's password
// @access  Private
router.put('/password', authenticate, userController.updatePassword);


module.exports = router;