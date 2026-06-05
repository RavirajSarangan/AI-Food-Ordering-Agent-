const express = require('express');
const router = express.Router();
const { Order, MenuItem } = require('../models');
const { verifyAgentSecret } = require('./agent');

// POST /api/orders
// Places a new order and re-calculates/verifies pricing server-side to prevent tampering
router.post('/orders', verifyAgentSecret, async (req, res) => {
  try {
    const { userId, restaurantId, items, channel } = req.body;

    if (!userId || !restaurantId || !items || !items.length) {
      return res.status(400).json({ success: false, error: "Missing required fields" });
    }

    let subtotal = 0;
    const validatedItems = [];

    // Retrieve and validate item details from database
    for (const item of items) {
      const dbItem = await MenuItem.findById(item.menuItemId);
      if (!dbItem) {
        return res.status(404).json({ success: false, error: `Menu item ${item.menuItemId} not found` });
      }

      // Find the price for the specific size
      let unitPrice = dbItem.basePrice;
      if (item.size) {
        const sizeConfig = dbItem.sizes.find(s => s.label.toLowerCase() === item.size.toLowerCase());
        if (sizeConfig) {
          unitPrice = sizeConfig.price;
        }
      }

      const qty = item.qty || 1;
      const itemCost = unitPrice * qty;
      subtotal += itemCost;

      validatedItems.push({
        menuItemId: dbItem._id,
        name: dbItem.name,
        size: item.size || 'regular',
        qty,
        price: unitPrice
      });
    }

    const deliveryFee = 150; // Flat Rs. 150 delivery fee
    const total = subtotal + deliveryFee;

    // Create the order
    const order = await Order.create({
      userId,
      restaurantId,
      items: validatedItems,
      subtotal,
      deliveryFee,
      total,
      status: 'Placed',
      channel: channel || 'voice',
      rider: {
        id: "rider_colombo_01",
        lat: 6.9150,
        lng: 79.8550,
        etaMins: 15 // Initial ETA
      }
    });

    res.status(201).json({
      success: true,
      message: "Order placed successfully",
      orderId: order._id,
      orderNumber: order._id.toString().slice(-4).toUpperCase(), // last 4 chars as readable order number
      subtotal,
      deliveryFee,
      total
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/orders/:id/status
// Simulates order status progression and rider tracking coordinates dynamically
router.get('/orders/:id/status', verifyAgentSecret, async (req, res) => {
  try {
    const { id } = req.params;
    const order = await Order.findById(id);

    if (!order) {
      return res.status(404).json({ success: false, error: "Order not found" });
    }

    // Dynamic simulator based on order age (in seconds)
    const ageSeconds = (Date.now() - new Date(order.createdAt).getTime()) / 1000;
    let currentStatus = order.status;
    let etaMins = 15;
    let riderLat = 6.9150;
    let riderLng = 79.8550;

    if (ageSeconds < 30) {
      currentStatus = 'Placed';
      etaMins = 15;
    } else if (ageSeconds < 90) {
      currentStatus = 'Preparing';
      etaMins = 12;
    } else if (ageSeconds < 180) {
      currentStatus = 'OnTheWay';
      // Simulate rider moving closer to default Colombo 3 address (lat: 6.9123, lng: 79.8521)
      const ratio = (ageSeconds - 90) / 90; // 0 to 1
      riderLat = 6.9150 - (6.9150 - 6.9123) * ratio;
      riderLng = 79.8550 - (79.8550 - 79.8521) * ratio;
      etaMins = Math.max(1, Math.round(8 * (1 - ratio)));
    } else {
      currentStatus = 'Delivered';
      etaMins = 0;
      riderLat = 6.9123;
      riderLng = 79.8521;
    }

    // Persist status updates in database
    if (order.status !== currentStatus) {
      order.status = currentStatus;
      order.rider.lat = riderLat;
      order.rider.lng = riderLng;
      order.rider.etaMins = etaMins;
      await order.save();
    }

    res.json({
      success: true,
      orderId: order._id,
      orderNumber: order._id.toString().slice(-4).toUpperCase(),
      status: currentStatus,
      subtotal: order.subtotal,
      deliveryFee: order.deliveryFee,
      total: order.total,
      rider: {
        id: order.rider.id,
        lat: riderLat,
        lng: riderLng,
        etaMins
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
