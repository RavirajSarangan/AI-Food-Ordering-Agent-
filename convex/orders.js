import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

// Mutation to place a new order (called by the client tool or HTTP webhook)
export const createOrder = mutation({
  args: {
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
    channel: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    let subtotal = 0;
    const validatedItems = [];

    // Retrieve and validate item details from database
    for (const item of args.items) {
      const dbItem = await ctx.db.get(item.menuItemId);
      if (!dbItem) {
        throw new Error(`Menu item ${item.menuItemId} not found`);
      }

      // Find the price for the specific size
      let unitPrice = dbItem.basePrice;
      if (item.size) {
        const sizeConfig = dbItem.sizes.find(s => s.label.toLowerCase() === item.size.toLowerCase());
        if (sizeConfig) {
          unitPrice = sizeConfig.price;
        }
      }

      subtotal += unitPrice * item.qty;
      validatedItems.push({
        menuItemId: item.menuItemId,
        name: dbItem.name,
        size: item.size || "regular",
        qty: item.qty,
        price: unitPrice
      });
    }

    const deliveryFee = 150; // Flat Rs. 150 delivery fee
    const total = subtotal + deliveryFee;

    const orderId = await ctx.db.insert("orders", {
      userId: args.userId,
      restaurantId: args.restaurantId,
      items: validatedItems,
      subtotal,
      deliveryFee,
      total,
      status: "Placed",
      channel: args.channel || "voice",
      rider: {
        id: "rider_colombo_01",
        lat: 6.9150,
        lng: 79.8550,
        etaMins: 15
      },
      createdAt: Date.now()
    });

    // Schedule the first status transition (to "Preparing") after 30 seconds
    await ctx.scheduler.runAfter(30000, internal.orders.transitionOrderStatus, {
      orderId,
      nextStatus: "Preparing"
    });

    return {
      success: true,
      orderId,
      orderNumber: orderId.slice(-4).toUpperCase(),
      subtotal,
      deliveryFee,
      total
    };
  }
});

// Internal mutation to transition order status and schedule the next workflow state
export const transitionOrderStatus = internalMutation({
  args: {
    orderId: v.id("orders"),
    nextStatus: v.string()
  },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) return;

    let rider = order.rider;
    let nextStatus = "";
    let delay = 0;

    if (args.nextStatus === "Preparing") {
      rider = { ...rider, etaMins: 12 };
      nextStatus = "OnTheWay";
      delay = 60000; // Transitions to "OnTheWay" in 60s
    } else if (args.nextStatus === "OnTheWay") {
      // Move rider closer to Colombo 3 (6.9123, 79.8521)
      rider = { ...rider, lat: 6.9135, lng: 79.8535, etaMins: 5 };
      nextStatus = "Delivered";
      delay = 90000; // Transitions to "Delivered" in 90s
    } else if (args.nextStatus === "Delivered") {
      rider = { ...rider, lat: 6.9123, lng: 79.8521, etaMins: 0 };
    }

    await ctx.db.patch(args.orderId, {
      status: args.nextStatus,
      rider
    });

    // Recursively schedule next state transition
    if (nextStatus && delay > 0) {
      await ctx.scheduler.runAfter(delay, internal.orders.transitionOrderStatus, {
        orderId: args.orderId,
        nextStatus
      });
    }
  }
});

// Query to get order details and live rider coordinates
export const getOrderStatus = query({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) {
      return null;
    }
    return {
      ...order,
      orderNumber: order._id.slice(-4).toUpperCase()
    };
  }
});
