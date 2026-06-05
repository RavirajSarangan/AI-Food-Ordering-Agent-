const express = require('express');
const router = express.Router();
const { Restaurant, MenuItem, User } = require('../models');
const { verifyAgentSecret } = require('./agent');

// Seeding endpoint for testing/development
router.post('/seed', async (req, res) => {
  try {
    // Clean database first
    await User.deleteMany({});
    await Restaurant.deleteMany({});
    await MenuItem.deleteMany({});

    // 1. Create a dummy user
    const user = await User.create({
      name: "Raviraj Sarangan",
      phone: "+94771234567",
      addresses: [
        { label: "Home", line: "45 Galle Road, Colombo 03", lat: 6.9123, lng: 79.8521 }
      ],
      defaultPaymentMethod: "Cash",
      language: "en",
      preferences: { spicy: true, veg: false }
    });

    // 2. Create Restaurants
    const r1 = await Restaurant.create({
      name: "ABC Biryani House",
      location: { lat: 6.9150, lng: 79.8550 },
      rating: 4.5,
      isOpen: true,
      cuisines: ["Biryani", "Indian", "Sri Lankan"]
    });

    const r2 = await Restaurant.create({
      name: "Spice Garden",
      location: { lat: 6.9200, lng: 79.8600 },
      rating: 4.2,
      isOpen: true,
      cuisines: ["Sri Lankan", "Rice & Curry", "Kottu"]
    });

    // 3. Create Menu Items
    const menuItems = [
      // ABC Biryani House Menu Items
      {
        restaurantId: r1._id,
        name: "Chicken Biryani",
        nameLocalized: {
          ta: "சிக்கன் பிரியாணி",
          si: "චිකන් බිරියානි"
        },
        basePrice: 1000,
        sizes: [
          { label: "regular", price: 1000 },
          { label: "large", price: 1400 }
        ],
        options: [
          { name: "spice level", values: ["mild", "medium", "hot"] }
        ],
        tags: ["spicy", "chicken", "biryani", "rice"],
        calories: 750,
        protein: 35,
        available: true
      },
      {
        restaurantId: r1._id,
        name: "Mutton Biryani",
        nameLocalized: {
          ta: "மட்டன் பிரியாணி",
          si: "මට්න් බිරියානි"
        },
        basePrice: 1400,
        sizes: [
          { label: "regular", price: 1400 },
          { label: "large", price: 1900 }
        ],
        options: [
          { name: "spice level", values: ["mild", "medium", "hot"] }
        ],
        tags: ["spicy", "mutton", "biryani", "rice"],
        calories: 850,
        protein: 42,
        available: true
      },
      {
        restaurantId: r1._id,
        name: "Coke",
        nameLocalized: {
          ta: "கோக்",
          si: "කෝක්"
        },
        basePrice: 200,
        sizes: [
          { label: "regular", price: 200 }
        ],
        options: [],
        tags: ["drink", "beverage", "cold"],
        calories: 140,
        protein: 0,
        available: true
      },

      // Spice Garden Menu Items
      {
        restaurantId: r2._id,
        name: "Chicken Kottu",
        nameLocalized: {
          ta: "சிக்கன் கொத்து",
          si: "චිකන් කොත්තු"
        },
        basePrice: 850,
        sizes: [
          { label: "regular", price: 850 },
          { label: "large", price: 1200 }
        ],
        options: [
          { name: "cheese level", values: ["none", "normal", "double cheese"] }
        ],
        tags: ["spicy", "chicken", "kottu", "srilankan"],
        calories: 680,
        protein: 28,
        available: true
      },
      {
        restaurantId: r2._id,
        name: "Egg Kottu",
        nameLocalized: {
          ta: "முட்டை கொத்து",
          si: "බිත්තර කොත්තු"
        },
        basePrice: 700,
        sizes: [
          { label: "regular", price: 700 },
          { label: "large", price: 950 }
        ],
        options: [],
        tags: ["spicy", "egg", "kottu", "srilankan", "vegetarian"],
        calories: 550,
        protein: 18,
        available: true
      }
    ];

    await MenuItem.insertMany(menuItems);

    res.json({
      success: true,
      message: "Database seeded successfully",
      user: { id: user._id, name: user.name },
      restaurants: [
        { id: r1._id, name: r1.name },
        { id: r2._id, name: r2.name }
      ]
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/menu/:restaurantId
// Returns menu items for a restaurant
router.get('/menu/:restaurantId', verifyAgentSecret, async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const items = await MenuItem.find({ restaurantId, available: true });
    res.json({ success: true, items });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/foods/search?q=
// Finds dishes and their restaurants
router.get('/foods/search', verifyAgentSecret, async (req, res) => {
  try {
    const query = req.query.q || '';
    if (!query) {
      return res.json({ success: true, results: [] });
    }

    // Search by name (case-insensitive regex) or localized names, or tags
    const searchRegex = new RegExp(query, 'i');
    const items = await MenuItem.find({
      available: true,
      $or: [
        { name: searchRegex },
        { 'nameLocalized.ta': searchRegex },
        { 'nameLocalized.si': searchRegex },
        { tags: { $in: [searchRegex] } }
      ]
    }).populate('restaurantId', 'name rating location isOpen');

    // Format results to make it easier for ElevenLabs LLM to parse
    const formattedResults = items.map(item => ({
      menuItemId: item._id,
      name: item.name,
      nameLocalized: item.nameLocalized,
      basePrice: item.basePrice,
      sizes: item.sizes,
      options: item.options,
      restaurant: {
        id: item.restaurantId._id,
        name: item.restaurantId.name,
        rating: item.restaurantId.rating,
        isOpen: item.restaurantId.isOpen
      }
    }));

    res.json({ success: true, results: formattedResults });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
