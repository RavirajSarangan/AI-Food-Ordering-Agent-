import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// GET /api/menu/:restaurantId
export const getMenu = query({
  args: { restaurantId: v.id("restaurants") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("menuItems")
      .withIndex("by_restaurant", (q) => q.eq("restaurantId", args.restaurantId))
      .filter((q) => q.eq(q.field("available"), true))
      .collect();
  }
});

// GET /api/foods/search?q=
export const searchFood = query({
  args: { q: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const qStr = args.q ? args.q.toLowerCase() : "";
    const items = await ctx.db
      .query("menuItems")
      .filter((q) => q.eq(q.field("available"), true))
      .collect();

    if (!qStr) {
      return [];
    }

    const matched = [];
    for (const item of items) {
      const nameMatch = item.name.toLowerCase().includes(qStr);
      const taMatch = item.nameLocalized.ta?.toLowerCase().includes(qStr);
      const siMatch = item.nameLocalized.si?.toLowerCase().includes(qStr);
      const tagMatch = item.tags.some(tag => tag.toLowerCase().includes(qStr));

      if (nameMatch || taMatch || siMatch || tagMatch) {
        const restaurant = await ctx.db.get(item.restaurantId);
        matched.push({
          menuItemId: item._id,
          name: item.name,
          nameLocalized: item.nameLocalized,
          basePrice: item.basePrice,
          sizes: item.sizes,
          options: item.options,
          restaurant: {
            id: restaurant._id,
            name: restaurant.name,
            rating: restaurant.rating,
            isOpen: restaurant.isOpen
          }
        });
      }
    }
    return matched;
  }
});

// Seeding mutation to clear and populate database with default Sri Lankan restaurants/menus
export const seed = mutation({
  args: {},
  handler: async (ctx) => {
    // 1. Clear database
    const users = await ctx.db.query("users").collect();
    for (const u of users) {
      await ctx.db.delete(u._id);
    }
    const restaurants = await ctx.db.query("restaurants").collect();
    for (const r of restaurants) {
      await ctx.db.delete(r._id);
    }
    const items = await ctx.db.query("menuItems").collect();
    for (const i of items) {
      await ctx.db.delete(i._id);
    }
    const orders = await ctx.db.query("orders").collect();
    for (const o of orders) {
      await ctx.db.delete(o._id);
    }

    // 2. Add Default User
    const userId = await ctx.db.insert("users", {
      name: "Raviraj Sarangan",
      phone: "+94771234567",
      addresses: [
        { label: "Home", line: "45 Galle Road, Colombo 03", lat: 6.9123, lng: 79.8521 }
      ],
      defaultPaymentMethod: "Cash",
      language: "en",
      preferences: { spicy: true, veg: false }
    });

    // 3. Add Restaurants
    const r1Id = await ctx.db.insert("restaurants", {
      name: "ABC Biryani House",
      location: { lat: 6.9150, lng: 79.8550 },
      rating: 4.5,
      isOpen: true,
      cuisines: ["Biryani", "Indian", "Sri Lankan"]
    });

    const r2Id = await ctx.db.insert("restaurants", {
      name: "Spice Garden",
      location: { lat: 6.9200, lng: 79.8600 },
      rating: 4.2,
      isOpen: true,
      cuisines: ["Sri Lankan", "Rice & Curry", "Kottu"]
    });

    // 4. Add Menu Items
    const menuItems = [
      {
        restaurantId: r1Id,
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
        restaurantId: r1Id,
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
        restaurantId: r1Id,
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
      {
        restaurantId: r2Id,
        name: "Chicken Kottu",
        nameLocalized: {
          ta: "சிக்கன் கொத்து",
          si: "චිකன் கொத்து"
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
        restaurantId: r2Id,
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

    for (const item of menuItems) {
      await ctx.db.insert("menuItems", item);
    }

    return {
      success: true,
      userId,
      restaurants: [
        { id: r1Id, name: "ABC Biryani House" },
        { id: r2Id, name: "Spice Garden" }
      ]
    };
  }
});
