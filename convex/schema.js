import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    name: v.string(),
    phone: v.string(),
    addresses: v.array(
      v.object({
        label: v.optional(v.string()),
        line: v.string(),
        lat: v.number(),
        lng: v.number()
      })
    ),
    defaultPaymentMethod: v.string(),
    language: v.string(), // "en", "ta", "si"
    preferences: v.object({
      spicy: v.boolean(),
      veg: v.boolean()
    })
  }),

  restaurants: defineTable({
    name: v.string(),
    location: v.object({
      lat: v.number(),
      lng: v.number()
    }),
    rating: v.number(),
    isOpen: v.boolean(),
    cuisines: v.array(v.string())
  }),

  menuItems: defineTable({
    restaurantId: v.id("restaurants"),
    name: v.string(),
    nameLocalized: v.object({
      ta: v.optional(v.string()),
      si: v.optional(v.string())
    }),
    basePrice: v.number(),
    sizes: v.array(
      v.object({
        label: v.string(),
        price: v.number()
      })
    ),
    options: v.array(
      v.object({
        name: v.string(),
        values: v.array(v.string())
      })
    ),
    tags: v.array(v.string()),
    calories: v.optional(v.number()),
    protein: v.optional(v.number()),
    available: v.boolean()
  }).index("by_restaurant", ["restaurantId"]),

  orders: defineTable({
    userId: v.id("users"),
    restaurantId: v.id("restaurants"),
    items: v.array(
      v.object({
        menuItemId: v.id("menuItems"),
        name: v.string(),
        size: v.optional(v.string()),
        qty: v.number(),
        price: v.number()
      })
    ),
    subtotal: v.number(),
    deliveryFee: v.number(),
    total: v.number(),
    status: v.string(), // "Placed" | "Preparing" | "OnTheWay" | "Delivered"
    channel: v.string(), // "voice" | "app"
    rider: v.optional(
      v.object({
        id: v.string(),
        lat: v.number(),
        lng: v.number(),
        etaMins: v.number()
      })
    ),
    createdAt: v.number() // millisecond timestamp
  })
});
