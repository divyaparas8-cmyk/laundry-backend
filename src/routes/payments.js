const express = require('express');
const Payment = require('../models/Payment');
const Order = require('../models/Order');
const { authenticate, requirePermission } = require('../middleware/auth');
const notify = require('../utils/notify');

const router = express.Router();

const formatPayment = (payment) => {
  const isOrderPopulated = payment.order && typeof payment.order === 'object' && payment.order._id;
  const orderIdStr = isOrderPopulated ? payment.order._id.toString() : (payment.order ? payment.order.toString() : '');
  const branchIdStr = payment.branch 
    ? payment.branch.toString() 
    : (isOrderPopulated && payment.order.branchId ? payment.order.branchId.toString() : '');

  return {
    id: payment._id.toString(),
    paymentId: payment.paymentId,
    orderId: orderIdStr,
    branchId: branchIdStr,
    orderNumber: payment.orderNumber,
    customerName: payment.customerName,
    customer: payment.customerName,
    date: payment.date,
    amount: payment.amount,
    method: payment.method,
    status: payment.status,
    orderTotal: isOrderPopulated ? payment.order.totalAmount : null,
    orderPaymentStatus: isOrderPopulated ? payment.order.paymentStatus : null,
    orderAmountPaid: isOrderPopulated ? payment.order.amountPaid : null,
    createdAt: payment.createdAt,
    updatedAt: payment.updatedAt
  };
};

// @route   GET /api/payments
// @desc    Get all payments ledger
router.get('/', authenticate, async (req, res) => {
  try {
    const { branchId } = req.query;
    const headerBranch = req.headers['x-selected-branch'];
    const selectedBranch = (headerBranch && headerBranch !== 'All') ? headerBranch : (branchId && branchId !== 'All' ? branchId : null);

    const Branch = require('../models/Branch');
    const Customer = require('../models/Customer');
    const branches = await Branch.find().select('_id name nameAr arabicName');
    const branchIds = branches.map(b => b._id);

    const targetBranchId = selectedBranch || req.activeBranch?._id || (req.user && req.user.role !== 'Super Admin' && req.user.branch ? req.user.branch : null);

    let query = {};

    if (targetBranchId && targetBranchId !== 'All') {
      const resolveBranch = require('../utils/resolveBranch');
      const targetBranchObj = await resolveBranch(targetBranchId);
      if (!targetBranchObj) {
        return res.json([]);
      }

      const tId = targetBranchObj._id;
      const bNameLower = String(targetBranchObj.name || '').toLowerCase();
      const bNameArLower = String(targetBranchObj.nameAr || targetBranchObj.arabicName || '').toLowerCase();

      const isCarpetBranch = bNameLower.includes('carpet') || bNameLower.includes('rug') || bNameArLower.includes('سجاد');
      const isShoeBranch = bNameLower.includes('shoe') || bNameLower.includes('footwear') || bNameArLower.includes('أحذية') || bNameArLower.includes('حذاء') || bNameArLower.includes('جوتي');
      const isWorkshopBranch = bNameLower.includes('workshop') || bNameArLower.includes('ورشة');

      const orderQuery = {
        $or: [
          { branchId: tId },
          { sharedBranches: tId },
          { transferredTo: tId }
        ]
      };

      if (isCarpetBranch) {
        orderQuery.$or.push({ 'itemDetails.name': { $regex: /carpet|سجاد|rug/i } });
        orderQuery.$or.push({ 'itemDetails.nameAr': { $regex: /سجاد|carpet/i } });
      }
      if (isShoeBranch) {
        orderQuery.$or.push({ 'itemDetails.name': { $regex: /shoe|sneaker|boot|footwear|أحذية|حذاء|جوتي|شوز/i } });
        orderQuery.$or.push({ 'itemDetails.nameAr': { $regex: /أحذية|حذاء|جوتي|شوز|shoe/i } });
      }
      if (isWorkshopBranch) {
        orderQuery.$or.push({ status: { $in: ['Preparing in workshop', 'In Workshop'] } });
        orderQuery.$or.push({ 'itemDetails.name': { $regex: /carpet|curtain|blanket|heavy|سجاد|ستائر|بطانية|لحاف/i } });
      }

      const orders = await Order.find(orderQuery).select('_id number');
      const orderIds = orders.map(o => o._id);
      const orderNumbers = orders.map(o => o.number).filter(Boolean);

      const customers = await Customer.find({ branch: tId }).select('_id');
      const balOrderNumbers = customers.map(c => `BAL-${c._id.toString()}`);

      query = {
        $or: [
          { branch: tId },
          { order: { $in: orderIds } },
          { orderNumber: { $in: [...orderNumbers, ...balOrderNumbers] } }
        ]
      };
    } else {
      // For Super Admin / All: filter out payments from deleted branches
      const orders = await Order.find({ branchId: { $in: branchIds } }).select('_id');
      const orderIds = orders.map(o => o._id);
      
      const customers = await Customer.find({ branch: { $in: branchIds } }).select('_id');
      const balOrderNumbers = customers.map(c => `BAL-${c._id.toString()}`);

      query = {
        $or: [
          { order: { $in: orderIds } },
          { branch: { $in: branchIds } },
          { orderNumber: { $in: balOrderNumbers } }
        ]
      };
    }

    const payments = await Payment.find(query).populate('order').sort({ createdAt: -1 });
    res.json(payments.map(formatPayment));
  } catch (error) {
    console.error('Get payments error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// @route   POST /api/payments
// @desc    Register a new payment checkout register
router.post('/', authenticate, requirePermission('manage_payments'), async (req, res) => {
  try {
    const { orderId, orderNumber, customerName, amount, method, status } = req.body;

    if (!orderId || !orderNumber || !customerName || amount === undefined) {
      return res.status(400).json({ message: 'Missing payment details.' });
    }

    const latestPayment = await Payment.findOne().sort({ createdAt: -1 });
    let nextNum = 1;
    if (latestPayment && latestPayment.paymentId) {
      const match = latestPayment.paymentId.match(/PAY-(\d+)/);
      if (match) {
        nextNum = parseInt(match[1], 10) + 1;
      }
    }
    const paymentId = `PAY-${String(nextNum).padStart(4, '0')}`;

    let branchId = null;
    if (orderId) {
      const order = await Order.findById(orderId);
      if (order) {
        branchId = order.branchId;
      }
    }

    const payment = new Payment({
      paymentId,
      order: orderId,
      orderNumber,
      customerName,
      date: new Date().toISOString().split('T')[0],
      amount,
      method: method || 'Pending',
      status: status || 'Pending',
      branch: branchId
    });

    await payment.save();

    await notify(
      'Payment Received',
      `Payment of ${amount} received for order ${orderNumber}.`,
      'system',
      payment.branch || req.user.branch
    );

    // Sync with order payment status, amountPaid, and customer balance
    if (payment.order && payment.status === 'Paid') {
      const order = await Order.findById(payment.order);
      if (order) {
        order.amountPaid = (order.amountPaid || 0) + payment.amount;
        if (order.amountPaid >= order.totalAmount) {
          order.paymentStatus = 'Paid';
        } else {
          order.paymentStatus = 'Partial';
        }
        await order.save();

        const Customer = require('../models/Customer');
        const customer = await Customer.findById(order.customer);
        if (customer) {
          customer.balance = Math.max(0, (customer.balance || 0) - payment.amount);
          await customer.save();
        }
      }
    }

    if (payment.order) {
      await payment.populate('order');
    }
    res.status(201).json(formatPayment(payment));
  } catch (error) {
    console.error('Create payment error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// @route   PUT /api/payments/:id
// @desc    Update checkout payment method and details
router.put('/:id', authenticate, requirePermission('manage_payments'), async (req, res) => {
  try {
    const { method, status, amount, date } = req.body;
    if (!method) {
      return res.status(400).json({ message: 'Payment method is required.' });
    }

    const payment = await Payment.findById(req.params.id);
    if (!payment) {
      return res.status(404).json({ message: 'Payment ledger entry not found.' });
    }

    const mongoose = require('mongoose');
    const oldStatus = payment.status;
    const newStatus = status || 'Paid';
    const oldAmount = payment.amount;
    const newAmount = amount !== undefined ? Number(amount) : oldAmount;

    const wasPaid = oldStatus === 'Paid';
    const isPaid = newStatus === 'Paid';
    let diff = 0;
    if (wasPaid && isPaid) {
      diff = newAmount - oldAmount;
    } else if (wasPaid && !isPaid) {
      diff = -oldAmount;
    } else if (!wasPaid && isPaid) {
      diff = newAmount;
    } else {
      diff = 0;
    }

    payment.method = method;
    payment.status = newStatus;
    payment.amount = newAmount;
    if (date !== undefined) payment.date = date;
    await payment.save();

    await notify(
      'Payment Updated',
      `Payment of ${payment.amount} for order ${payment.orderNumber} updated to ${payment.status}.`,
      'system',
      payment.branch || req.user.branch
    );

    // Sync with order payment status, order amountPaid, and customer balance
    if (payment.order) {
      const order = await Order.findById(payment.order);
      if (order) {
        // Adjust order's amountPaid by the difference in payment transaction amount
        order.amountPaid = (order.amountPaid || 0) + diff;
        
        // Recompute order paymentStatus
        if (order.amountPaid >= order.totalAmount) {
          order.paymentStatus = 'Paid';
        } else if (order.amountPaid > 0) {
          order.paymentStatus = 'Partial';
        } else {
          order.paymentStatus = 'Pending';
        }
        await order.save();

        // Adjust customer balance
        const Customer = require('../models/Customer');
        const customer = await Customer.findById(order.customer);
        if (customer) {
          customer.balance = Math.max(0, (customer.balance || 0) - diff);
          await customer.save();
        }
      }
    } else if (payment.orderNumber && payment.orderNumber.startsWith('BAL-')) {
      const Customer = require('../models/Customer');
      const customerId = payment.orderNumber.replace('BAL-', '');
      if (mongoose.Types.ObjectId.isValid(customerId)) {
        const customer = await Customer.findById(customerId);
        if (customer) {
          customer.balance = Math.max(0, (customer.balance || 0) - diff);
          await customer.save();
        }
      }
    }

    if (payment.order) {
      await payment.populate('order');
    }
    res.json(formatPayment(payment));
  } catch (error) {
    console.error('Update payment error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
