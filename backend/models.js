const mongoose = require('mongoose');

// --- User Schema ---
const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true },
  addresses: [{
    label: { type: String }, // e.g., "Home", "Office"
    line: { type: String, required: true },
    lat: { type: Number, required: true },
    lng: { type: Number, required: true }
  }],
  defaultPaymentMethod: { type: String, default: 'Cash' },
  language: { type: String, default: 'en' }, // "en", "ta", "si"
  preferences: {
    spicy: { type: Boolean, default: false },
    veg: { type: Boolean, default: false }
  }
});

// --- Restaurant Schema ---
const RestaurantSchema = new mongoose.Schema({
  name: { type: String, required: true },
  location: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true }
  },
  rating: { type: Number, default: 4.0 },
  isOpen: { type: Boolean, default: true },
  cuisines: [{ type: String }]
});

// --- MenuItem Schema ---
const MenuItemSchema = new mongoose.Schema({
  restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true },
  name: { type: String, required: true },
  nameLocalized: {
    ta: { type: String }, // Tamil name
    si: { type: String }  // Sinhala name
  },
  basePrice: { type: Number, required: true },
  sizes: [{
    label: { type: String, required: true }, // e.g. "regular", "large"
    price: { type: Number, required: true }
  }],
  options: [{
    name: { type: String, required: true }, // e.g. "spice level"
    values: [{ type: String }] // e.g. ["mild", "medium", "hot"]
  }],
  tags: [{ type: String }], // e.g. ["spicy", "chicken", "rice"]
  calories: { type: Number },
  protein: { type: Number },
  available: { type: Boolean, default: true }
});

// --- Order Schema ---
const OrderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true },
  items: [{
    menuItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'MenuItem', required: true },
    name: { type: String, required: true },
    size: { type: String },
    qty: { type: Number, required: true, default: 1 },
    price: { type: Number, required: true }
  }],
  subtotal: { type: Number, required: true },
  deliveryFee: { type: Number, required: true, default: 150 }, // Rs. 150 default delivery fee
  total: { type: Number, required: true },
  status: {
    type: String,
    enum: ['Placed', 'Preparing', 'OnTheWay', 'Delivered'],
    default: 'Placed'
  },
  channel: { type: String, default: 'voice' }, // "voice", "app"
  rider: {
    id: { type: String },
    lat: { type: Number },
    lng: { type: Number },
    etaMins: { type: Number }
  },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);
const Restaurant = mongoose.model('Restaurant', RestaurantSchema);
const MenuItem = mongoose.model('MenuItem', MenuItemSchema);
const Order = mongoose.model('Order', OrderSchema);

module.exports = {
  User,
  Restaurant,
  MenuItem,
  Order
};
