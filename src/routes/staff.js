const express = require('express');
const mongoose = require('mongoose');
const User = require('../models/User');
const Role = require('../models/Role');
const Branch = require('../models/Branch');
const Order = require('../models/Order');
const Delivery = require('../models/Delivery');
const Pickup = require('../models/Pickup');
const Payment = require('../models/Payment');
const Driver = require('../models/Driver');
const { authenticate, requirePermission } = require('../middleware/auth');

const router = express.Router();

const formatUser = (user) => {
  const branchObjs = (user.branches && user.branches.length > 0)
    ? user.branches
    : (user.branch ? [user.branch] : []);
  
  const branchNames = branchObjs.map(b => (typeof b === 'object' && b ? b.name : String(b))).filter(Boolean);
  const branchIdStrs = branchObjs.map(b => (typeof b === 'object' && b ? b._id.toString() : String(b))).filter(Boolean);

  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    phone: user.phone || '',
    address: user.address || '',
    username: user.username,
    role: user.role ? user.role.name : '',
    branch: branchNames.join(', '),
    branches: branchNames,
    branchId: branchIdStrs[0] || '',
    branchIds: branchIdStrs,
    status: user.status,
    isLocked: user.isLocked,
    joiningDate: user.joiningDate ? user.joiningDate.toISOString().split('T')[0] : '',
    ordersHandled: user.ordersHandled || 0,
    deliveriesCompleted: user.deliveriesCompleted || 0,
    paymentsCollected: user.paymentsCollected || 0,
    recentActivity: user.recentActivity || '',
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
};

const formatUserWithStats = (user, orders, deliveries, pickups, payments) => {
  const name = user.name;
  const username = user.username;
  const isDeliveryStaff = user.role && user.role.name === 'Delivery Staff';

  let ordersHandled = 0;
  let deliveriesCompleted = 0;
  let paymentsCollected = 0;

  if (isDeliveryStaff) {
    // Delivery Staff stats:
    // 1. Orders Handled = count of completed pickups
    ordersHandled = pickups.filter(p => p.assignedStaff === name && (p.status === 'Completed' || p.status === 'Picked Up')).length;
    
    // 2. Deliveries Completed = count of delivered deliveries
    const completedDelvs = deliveries.filter(d => d.assignedStaff === name && d.status === 'Delivered');
    deliveriesCompleted = completedDelvs.length;

    // 3. Payments Collected = sum of payments for orders where this staff delivered the order
    const completedOrderNumbers = completedDelvs.map(d => d.orderNumber).filter(Boolean);
    const userPayments = payments.filter(p => completedOrderNumbers.includes(p.orderNumber));
    paymentsCollected = userPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
  } else {
    // Admin / Counter Staff stats:
    // 1. Orders Handled = count of orders created by this staff
    ordersHandled = orders.filter(o => o.createdBy === name || o.createdBy === username).length;
    
    // 2. Deliveries Completed = 0
    deliveriesCompleted = 0;

    // 3. Payments Collected = sum of payments for orders created by this staff
    const createdOrderNumbers = orders.filter(o => o.createdBy === name || o.createdBy === username).map(o => o.number).filter(Boolean);
    const userPayments = payments.filter(p => createdOrderNumbers.includes(p.orderNumber));
    paymentsCollected = userPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
  }

  const branchObjs = (user.branches && user.branches.length > 0)
    ? user.branches
    : (user.branch ? [user.branch] : []);
  
  const branchNames = branchObjs.map(b => (typeof b === 'object' && b ? b.name : String(b))).filter(Boolean);
  const branchIdStrs = branchObjs.map(b => (typeof b === 'object' && b ? b._id.toString() : String(b))).filter(Boolean);

  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    phone: user.phone || '',
    address: user.address || '',
    username: user.username,
    role: user.role ? user.role.name : '',
    branch: branchNames.join(', '),
    branches: branchNames,
    branchId: branchIdStrs[0] || '',
    branchIds: branchIdStrs,
    status: user.status,
    isLocked: user.isLocked,
    joiningDate: user.joiningDate ? user.joiningDate.toISOString().split('T')[0] : '',
    ordersHandled,
    deliveriesCompleted,
    paymentsCollected,
    recentActivity: user.recentActivity || (deliveriesCompleted > 0 ? `Completed ${deliveriesCompleted} deliveries` : 'Account created'),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
};

// @route   GET /api/staff
// @desc    Get all staff/users
router.get('/', authenticate, requirePermission('manage_staff'), async (req, res) => {
  try {
    const resolveBranch = require('../utils/resolveBranch');
    const { branchId } = req.query;
    const headerBranch = req.headers['x-selected-branch'];
    const selectedBranch = (headerBranch && headerBranch !== 'All') ? headerBranch : (branchId && branchId !== 'All' ? branchId : null);

    const activeBranchParam = selectedBranch || (req.activeBranch ? req.activeBranch._id : null) || (req.user && req.user.role?.name !== 'Super Admin' && req.user.branch ? req.user.branch : null);

    let query = {};
    if (activeBranchParam && activeBranchParam !== 'All') {
      const branchDoc = await resolveBranch(activeBranchParam);
      if (branchDoc) {
        const bId = branchDoc._id;
        query = { $or: [{ branch: bId }, { branches: bId }] };
      } else if (mongoose.Types.ObjectId.isValid(activeBranchParam)) {
        const bId = new mongoose.Types.ObjectId(activeBranchParam);
        query = { $or: [{ branch: bId }, { branches: bId }] };
      } else {
        return res.json([]);
      }
    } else {
      // For Super Admin or 'All' branches: filter out staff of deleted branches
      const branches = await Branch.find().select('_id');
      const branchIds = branches.map(b => b._id).filter(id => id && mongoose.Types.ObjectId.isValid(id));
      
      const superAdminRole = await Role.findOne({ name: 'Super Admin' });
      const superAdminRoleId = superAdminRole ? superAdminRole._id : null;

      query = {
        $or: [
          { branch: { $in: branchIds } },
          { branches: { $in: branchIds } },
          { branch: null }
        ]
      };

      if (superAdminRoleId) {
        query.$or.push({ role: superAdminRoleId });
      }
    }
    const users = await User.find(query)
      .populate('role')
      .populate('branch')
      .populate('branches')
      .sort({ createdAt: -1 });

    const orders = await Order.find();
    const deliveries = await Delivery.find();
    const pickups = await Pickup.find();
    const payments = await Payment.find();

    const formattedUsers = users.map(u => formatUserWithStats(u, orders, deliveries, pickups, payments));
    res.json(formattedUsers);
  } catch (error) {
    console.error('Get staff error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// @route   POST /api/staff
// @desc    Create staff/user
router.post('/', authenticate, requirePermission('manage_staff'), async (req, res) => {
  try {
    const { name, email, phone, address, username, password, roleName, branchId, branchIds, status } = req.body;

    let finalUsername = username;
    if (!finalUsername && email) {
      finalUsername = email.split('@')[0];
    }

    if (!name || !email || !finalUsername || !password || !roleName) {
      return res.status(400).json({ message: 'Name, email, username, password, and role are required.' });
    }

    const role = await Role.findOne({ name: roleName });
    if (!role) {
      return res.status(400).json({ message: `Role '${roleName}' not found.` });
    }

    let inputBranchIds = branchIds || (branchId ? [branchId] : []);
    if (!Array.isArray(inputBranchIds)) {
      inputBranchIds = [inputBranchIds];
    }

    if (req.user.role.name !== 'Super Admin' && req.user.branch) {
      const userBranchIdStr = req.user.branch._id ? req.user.branch._id.toString() : req.user.branch.toString();
      inputBranchIds = [userBranchIdStr];
    }

    const validBranchObjectIds = [];
    for (const bId of inputBranchIds) {
      if (bId && mongoose.Types.ObjectId.isValid(bId)) {
        const foundB = await Branch.findById(bId);
        if (foundB) {
          validBranchObjectIds.push(foundB._id);
        }
      }
    }

    // Check duplicate user with email or username
    const normalizedEmail = email.toLowerCase().trim();
    const normalizedUsername = finalUsername.trim();
    const existingUser = await User.findOne({
      $or: [{ email: normalizedEmail }, { username: normalizedUsername }]
    });
    if (existingUser) {
      return res.status(400).json({ message: 'A user with this email or username is already assigned.' });
    }

    const user = new User({
      name,
      email,
      phone,
      address,
      username: finalUsername,
      passwordHash: password, // will be hashed in pre-save hook
      role: role._id,
      branch: validBranchObjectIds[0] || null,
      branches: validBranchObjectIds,
      status: status || 'Active'
    });

    await user.save();

    // If role is Delivery Staff or Driver, automatically create Driver profile
    if (role.name === 'Delivery Staff' || role.name === 'Driver') {
      try {
        let branchName = '';
        if (validBranchObjectIds.length > 0) {
          const bObj = await Branch.findById(validBranchObjectIds[0]);
          if (bObj) branchName = bObj.name;
        }
        if (!branchName && req.user && req.user.branch) {
          const bObj = await Branch.findById(req.user.branch);
          if (bObj) branchName = bObj.name;
        }

        const allDrivers = await Driver.find({});
        let maxNum = 100;
        for (const d of allDrivers) {
          if (d.driverNo) {
            const match = d.driverNo.match(/DRV-(\d+)/);
            if (match) {
              const num = parseInt(match[1], 10);
              if (num > maxNum) maxNum = num;
            }
          }
        }
        let nextNum = maxNum + 1;
        let unique = false;
        let finalDriverNo = '';
        while (!unique) {
          finalDriverNo = `DRV-${nextNum}`;
          const conflict = await Driver.findOne({ driverNo: finalDriverNo });
          if (!conflict) {
            unique = true;
          } else {
            nextNum++;
          }
        }

        const newDriver = new Driver({
          user: user._id,
          driverNo: finalDriverNo,
          driverName: user.name,
          mobile: user.phone || '',
          branch: branchName || 'Main',
          status: user.status === 'Active' ? 'Available' : 'Off Duty',
          carNo: '',
          civilId: '',
          nationality: '',
          addressNotes: user.address || '',
          areas: []
        });
        await newDriver.save();
      } catch (driverErr) {
        console.error('Error auto-creating driver for staff:', driverErr);
      }
    }
    
    // Populate populated fields for formatting
    const populated = await User.findById(user._id).populate('role').populate('branch').populate('branches');
    res.status(201).json(formatUser(populated));
  } catch (error) {
    console.error('Create staff error:', error);
    if (error.code === 11000) {
      return res.status(400).json({ message: 'A user with this email or username is already assigned.' });
    }
    res.status(500).json({ message: 'Internal server error' });
  }
});

// @route   PUT /api/staff/:id
// @desc    Update staff/user info
router.put('/:id', authenticate, requirePermission('manage_staff'), async (req, res) => {
  try {
    const { name, email, phone, address, username, roleName, branchId, branchIds, status, password } = req.body;

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'Staff member not found.' });
    }

    if (name) user.name = name;
    if (email) user.email = email;
    if (phone !== undefined) user.phone = phone;
    if (address !== undefined) user.address = address;
    if (username) user.username = username;
    if (status) user.status = status;
    if (password) user.passwordHash = password; // triggers pre-save hook re-hash

    if (roleName) {
      const role = await Role.findOne({ name: roleName });
      if (role) {
        user.role = role._id;
      }
    }

    if (branchIds !== undefined || branchId !== undefined) {
      let inputBranchIds = branchIds !== undefined ? branchIds : (branchId ? [branchId] : []);
      if (!Array.isArray(inputBranchIds)) {
        inputBranchIds = [inputBranchIds];
      }
      if (req.user.role.name !== 'Super Admin' && req.user.branch) {
        const userBranchIdStr = req.user.branch._id ? req.user.branch._id.toString() : req.user.branch.toString();
        inputBranchIds = [userBranchIdStr];
      }

      const validBranchObjectIds = [];
      for (const bId of inputBranchIds) {
        if (bId && mongoose.Types.ObjectId.isValid(bId)) {
          const foundB = await Branch.findById(bId);
          if (foundB) {
            validBranchObjectIds.push(foundB._id);
          }
        }
      }
      user.branches = validBranchObjectIds;
      user.branch = validBranchObjectIds[0] || null;
    }

    await user.save();

    // Keep linked Driver profile in sync
    try {
      let linkedDriver = await Driver.findOne({ user: user._id });
      if (!linkedDriver) {
        linkedDriver = await Driver.findOne({ driverName: user.name });
      }

      if (linkedDriver) {
        if (name) linkedDriver.driverName = name;
        if (phone !== undefined) linkedDriver.mobile = phone;
        if (status) {
          linkedDriver.status = status === 'Active' ? 'Available' : 'Off Duty';
        }
        if (user.branch) {
          const bObj = await Branch.findById(user.branch);
          if (bObj) linkedDriver.branch = bObj.name;
        }
        if (!linkedDriver.user) linkedDriver.user = user._id;
        await linkedDriver.save();
      } else if (roleName === 'Delivery Staff' || roleName === 'Driver') {
        let branchName = '';
        if (user.branch) {
          const bObj = await Branch.findById(user.branch);
          if (bObj) branchName = bObj.name;
        }
        const allDrivers = await Driver.find({});
        let maxNum = 100;
        for (const d of allDrivers) {
          if (d.driverNo) {
            const match = d.driverNo.match(/DRV-(\d+)/);
            if (match) {
              const num = parseInt(match[1], 10);
              if (num > maxNum) maxNum = num;
            }
          }
        }
        let nextNum = maxNum + 1;
        let unique = false;
        let finalDriverNo = '';
        while (!unique) {
          finalDriverNo = `DRV-${nextNum}`;
          const conflict = await Driver.findOne({ driverNo: finalDriverNo });
          if (!conflict) unique = true;
          else nextNum++;
        }
        const newDriver = new Driver({
          user: user._id,
          driverNo: finalDriverNo,
          driverName: user.name,
          mobile: user.phone || '',
          branch: branchName || 'Main',
          status: user.status === 'Active' ? 'Available' : 'Off Duty',
          carNo: '',
          civilId: '',
          nationality: '',
          addressNotes: user.address || '',
          areas: []
        });
        await newDriver.save();
      }
    } catch (driverSyncErr) {
      console.error('Error syncing driver for staff update:', driverSyncErr);
    }

    const populated = await User.findById(user._id).populate('role').populate('branch').populate('branches');
    res.json(formatUser(populated));
  } catch (error) {
    console.error('Update staff error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// @route   PUT /api/staff/:id/lock
// @desc    Lock/Unlock staff account
router.put('/:id/lock', authenticate, requirePermission('manage_staff'), async (req, res) => {
  try {
    const { isLocked } = req.body;
    
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'Staff member not found.' });
    }

    user.isLocked = !!isLocked;
    if (isLocked) {
      user.status = 'Suspended';
    } else {
      user.status = 'Active';
    }

    await user.save();
    const populated = await User.findById(user._id).populate('role').populate('branch');
    res.json(formatUser(populated));
  } catch (error) {
    console.error('Lock staff error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// @route   DELETE /api/staff/:id
// @desc    Delete staff/user account
router.delete('/:id', authenticate, requirePermission('manage_staff'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'Staff member not found.' });
    }

    await Driver.deleteMany({ user: user._id });
    await User.deleteOne({ _id: user._id });
    res.json({ message: 'Staff account deleted successfully.' });
  } catch (error) {
    console.error('Delete staff error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
