import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  Animated,
  Easing
} from 'react-native';
import { 
  Mic, 
  Trash2, 
  ChevronDown, 
  ShoppingCart, 
  MapPin, 
  Play, 
  RotateCcw, 
  CheckCircle2, 
  XCircle,
  Database,
  RefreshCw
} from 'lucide-react-native';

// --- Convex Imports ---
import { ConvexProvider, ConvexReactClient, useConvex, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";

// --- Color Tokens ---
const COLORS = {
  primary: '#FF5A1F',
  primaryDeep: '#C8390B',
  accent: '#FFB703',
  bg: '#0E0F12',
  surface: '#1A1C20',
  text: '#FFFFFF',
  muted: '#9AA0A6',
  success: '#22C55E',
  error: '#EF4444'
};

const CONVEX_URL = process.env.EXPO_PUBLIC_CONVEX_URL || "";

// Wrapper Component to configure Convex conditionally
export default function App() {
  if (CONVEX_URL) {
    const convexClient = new ConvexReactClient(CONVEX_URL);
    return (
      <ConvexProvider client={convexClient}>
        <MainApp isConvex={true} />
      </ConvexProvider>
    );
  }
  return <MainApp isConvex={false} />;
}

function MainApp({ isConvex }) {
  const convex = isConvex ? useConvex() : null;
  
  const [language, setLanguage] = useState('EN'); // EN, TA, SI
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  
  // Voice Agent State
  // 'idle' | 'listening' | 'thinking' | 'speaking' | 'tool_running' | 'success' | 'error'
  const [voiceState, setVoiceState] = useState('idle');
  const [caption, setCaption] = useState(isConvex ? "Convex linked. Tap mic or seed DB to start..." : "Running offline. Tap mic to start...");
  const [transcript, setTranscript] = useState("");
  
  // Cart State (Source of Truth)
  const [cart, setCart] = useState([]);
  const [restaurant, setRestaurant] = useState(null);
  const [restaurantId, setRestaurantId] = useState(null);
  const [userId, setUserId] = useState(null);

  // Seeding State
  const [seeding, setSeeding] = useState(false);

  // Active Order for Tracking
  const [activeOrderId, setActiveOrderId] = useState(null);

  // Animation Values
  const [pulseAnim] = useState(new Animated.Value(1));
  const [rotateAnim] = useState(new Animated.Value(0));

  // Pulse animation for Listening state
  useEffect(() => {
    let animation;
    if (voiceState === 'listening') {
      animation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.25,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true
          })
        ])
      );
      animation.start();
    } else {
      pulseAnim.setValue(1);
    }
    return () => animation && animation.stop();
  }, [voiceState]);

  // Rotation animation for Thinking/Tool Running state
  useEffect(() => {
    let animation;
    if (voiceState === 'thinking' || voiceState === 'tool_running' || seeding) {
      animation = Animated.loop(
        Animated.timing(rotateAnim, {
          toValue: 1,
          duration: 1200,
          easing: Easing.linear,
          useNativeDriver: true
        })
      );
      animation.start();
    } else {
      rotateAnim.setValue(0);
    }
    return () => animation && animation.stop();
  }, [voiceState, seeding]);

  const spin = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg']
  });

  // Calculate totals
  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  const deliveryFee = subtotal > 0 ? 150 : 0;
  const total = subtotal + deliveryFee;

  // --- Seed Convex Database ---
  const handleSeedDatabase = async () => {
    if (!isConvex) return;
    setSeeding(true);
    setCaption("Seeding Convex database...");
    try {
      const result = await convex.mutation(api.menu.seed);
      setUserId(result.userId);
      setCaption("Convex DB seeded successfully!");
      setVoiceState('success');
      setTimeout(() => setVoiceState('idle'), 2000);
    } catch (e) {
      console.error(e);
      setCaption("Failed to seed database: " + e.message);
      setVoiceState('error');
    } finally {
      setSeeding(false);
    }
  };

  // --- Client Tool Handlers ---
  const handleAddToCart = (item) => {
    setCart(prevCart => {
      const existing = prevCart.find(i => i.menuItemId === item.menuItemId && i.size === item.size);
      if (existing) {
        return prevCart.map(i => 
          (i.menuItemId === item.menuItemId && i.size === item.size) 
            ? { ...i, qty: i.qty + 1 } 
            : i
        );
      }
      return [...prevCart, { ...item, qty: 1 }];
    });
    setCaption(`Added ${item.name} to your cart.`);
  };

  const handleRemoveFromCart = (menuItemId, size) => {
    setCart(prevCart => {
      const existing = prevCart.find(i => i.menuItemId === menuItemId && i.size === size);
      if (!existing) return prevCart;
      if (existing.qty === 1) {
        return prevCart.filter(i => !(i.menuItemId === menuItemId && i.size === size));
      }
      return prevCart.map(i => 
        (i.menuItemId === menuItemId && i.size === size) 
          ? { ...i, qty: i.qty - 1 } 
          : i
      );
    });
    setCaption("Removed item from cart.");
  };

  const clearCart = () => {
    setCart([]);
    setRestaurant(null);
    setRestaurantId(null);
    setActiveOrderId(null);
    setCaption("Cart cleared.");
  };

  // --- Real-time Order Submission to Convex ---
  const submitOrderToConvex = async () => {
    if (!isConvex) return;
    setVoiceState('tool_running');
    setCaption("Submitting order to Convex...");

    try {
      // Create user if not seeded
      let activeUserId = userId;
      if (!activeUserId) {
        setCaption("No active user found. Seeding first...");
        const seedResult = await convex.mutation(api.menu.seed);
        activeUserId = seedResult.userId;
        setUserId(activeUserId);
      }

      // If restaurant ID is not determined, search for ABC Biryani House
      let activeRestId = restaurantId;
      if (!activeRestId) {
        const searchResult = await convex.query(api.menu.searchFood, { q: "biryani" });
        if (searchResult.length > 0) {
          activeRestId = searchResult[0].restaurant.id;
          setRestaurantId(activeRestId);
        } else {
          throw new Error("Seed data missing. Click 'Seed DB' at the top first.");
        }
      }

      // Map cart to Convex ID validated items
      const orderItems = cart.map(item => ({
        menuItemId: item.menuItemId,
        name: item.name,
        size: item.size,
        qty: item.qty,
        price: item.price
      }));

      const orderResult = await convex.mutation(api.orders.createOrder, {
        userId: activeUserId,
        restaurantId: activeRestId,
        items: orderItems,
        channel: "voice"
      });

      setActiveOrderId(orderResult.orderId);
      setVoiceState('success');
      setCaption(`Order #${orderResult.orderNumber} placed successfully! Rider is on the way.`);
    } catch (e) {
      console.error(e);
      setCaption("Failed to place order: " + e.message);
      setVoiceState('error');
    }
  };

  // --- Simulate Voice Scenarios (handles both Convex query & offline mock modes) ---
  const runScenarioOrder = async () => {
    clearCart();
    setVoiceState('listening');
    setTranscript("I'd like a chicken biryani from ABC Biryani House");
    setCaption("Listening...");

    setTimeout(async () => {
      setVoiceState('tool_running');
      setCaption("Searching database for ABC Biryani House...");

      if (isConvex) {
        try {
          // Imperative query using Convex Client
          const searchResult = await convex.query(api.menu.searchFood, { q: "biryani" });
          if (searchResult.length > 0) {
            const match = searchResult[0];
            setRestaurant(match.restaurant.name);
            setRestaurantId(match.restaurant.id);
            setVoiceState('speaking');
            setCaption("Would you like a regular (Rs.1,000) or large (Rs.1,400) Chicken Biryani?");
          } else {
            setCaption("Biryani House not found. Make sure to click 'Seed DB' first!");
            setVoiceState('error');
          }
        } catch (e) {
          setCaption("Database search failed: " + e.message);
          setVoiceState('error');
        }
      } else {
        // Offline Mock Fallback
        setRestaurant("ABC Biryani House");
        setTimeout(() => {
          setVoiceState('speaking');
          setCaption("Would you like a regular (Rs.1,000) or large (Rs.1,400) Chicken Biryani?");
        }, 1500);
      }
    }, 2000);
  };

  const runScenarioAddLarge = async () => {
    setVoiceState('listening');
    setTranscript("Make it a large one please.");
    setCaption("Listening...");

    setTimeout(async () => {
      setVoiceState('tool_running');
      setCaption("Updating cart...");

      let itemConfig = {
        menuItemId: "m1", // mock ID
        name: "Chicken Biryani",
        size: "large",
        price: 1400
      };

      if (isConvex && restaurantId) {
        try {
          const searchResult = await convex.query(api.menu.searchFood, { q: "biryani" });
          const match = searchResult.find(item => item.restaurant.id === restaurantId);
          if (match) {
            const largeSize = match.sizes.find(s => s.label === "large");
            itemConfig = {
              menuItemId: match.menuItemId,
              name: match.name,
              size: "large",
              price: largeSize ? largeSize.price : match.basePrice
            };
          }
        } catch (e) {
          console.warn("Failed to query sizes from Convex, using fallback.");
        }
      }

      handleAddToCart(itemConfig);
      setVoiceState('speaking');
      setCaption("Added large Chicken Biryani. Would you like a drink with that?");
    }, 2000);
  };

  const runScenarioAddDrink = async () => {
    setVoiceState('listening');
    setTranscript("Yes, add a Coke.");
    setCaption("Listening...");

    setTimeout(async () => {
      setVoiceState('tool_running');
      setCaption("Adding beverage...");

      let drinkConfig = {
        menuItemId: "m3", // mock ID
        name: "Coke",
        size: "regular",
        price: 200
      };

      if (isConvex && restaurantId) {
        try {
          const searchResult = await convex.query(api.menu.searchFood, { q: "coke" });
          const match = searchResult.find(item => item.restaurant.id === restaurantId);
          if (match) {
            drinkConfig = {
              menuItemId: match.menuItemId,
              name: match.name,
              size: "regular",
              price: match.basePrice
            };
          }
        } catch (e) {
          console.warn("Failed to query beverage from Convex.");
        }
      }

      handleAddToCart(drinkConfig);
      setVoiceState('speaking');
      setCaption(`Your total is Rs. ${(total + 200).toLocaleString()} (including Rs. 150 delivery). Place the order?`);
    }, 2000);
  };

  const runScenarioConfirm = () => {
    setVoiceState('listening');
    setTranscript("Yes, place it.");
    setCaption("Listening...");

    setTimeout(() => {
      if (isConvex) {
        submitOrderToConvex();
      } else {
        // Offline Mock Simulation
        setVoiceState('tool_running');
        setCaption("Creating your order in the kitchen...");
        setTimeout(() => {
          setVoiceState('success');
          setCaption("Done! Order #4821 placed successfully. Delivery in 15 mins.");
        }, 2000);
      }
    }, 1500);
  };

  const getOrbColor = () => {
    switch(voiceState) {
      case 'listening': return COLORS.primary;
      case 'thinking': return COLORS.accent;
      case 'speaking': return '#818CF8';
      case 'tool_running': return COLORS.accent;
      case 'success': return COLORS.success;
      case 'error': return COLORS.error;
      default: return '#374151';
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      {/* --- HEADER --- */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>FoodHub AI</Text>
          <View style={styles.badgeRow}>
            <View style={[styles.dbBadge, { backgroundColor: isConvex ? 'rgba(34, 197, 94, 0.15)' : 'rgba(156, 163, 175, 0.15)' }]}>
              <Database size={10} color={isConvex ? COLORS.success : COLORS.muted} />
              <Text style={[styles.dbBadgeText, { color: isConvex ? COLORS.success : COLORS.muted }]}>
                {isConvex ? "Convex DB Connected" : "Demo Mode"}
              </Text>
            </View>
            <View style={styles.locationContainer}>
              <MapPin size={10} color={COLORS.primary} />
              <Text style={styles.locationText}>Colombo</Text>
            </View>
          </View>
        </View>

        <View style={styles.headerRight}>
          {isConvex && (
            <TouchableOpacity 
              style={styles.seedBtn} 
              onPress={handleSeedDatabase}
              disabled={seeding}
            >
              <Animated.View style={seeding ? { transform: [{ rotate: spin }] } : {}}>
                <RefreshCw size={12} color={COLORS.text} />
              </Animated.View>
              <Text style={styles.seedBtnText}>Seed DB</Text>
            </TouchableOpacity>
          )}
          
          {/* Language Selector */}
          <View>
            <TouchableOpacity 
              style={styles.langSelector}
              onPress={() => setLangMenuOpen(!langMenuOpen)}
            >
              <Text style={styles.langText}>{language} ▾</Text>
            </TouchableOpacity>
            {langMenuOpen && (
              <View style={styles.langDropdown}>
                {['EN', 'TA', 'SI'].map(lang => (
                  <TouchableOpacity 
                    key={lang} 
                    style={styles.dropdownItem}
                    onPress={() => {
                      setLanguage(lang);
                      setLangMenuOpen(false);
                    }}
                  >
                    <Text style={styles.dropdownItemText}>{lang}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        {/* --- VOICE ORB WORKSPACE --- */}
        <View style={styles.orbContainer}>
          <Animated.View style={[
            styles.orbOuterRing,
            {
              borderColor: getOrbColor(),
              transform: [{ scale: pulseAnim }],
              opacity: voiceState === 'listening' ? 0.6 : 0.2
            }
          ]} />
          
          <Animated.View style={[
            styles.orbCore,
            {
              backgroundColor: getOrbColor(),
              transform: [
                { scale: voiceState === 'listening' ? pulseAnim : 1 },
                { rotate: (voiceState === 'thinking' || voiceState === 'tool_running' || seeding) ? spin : '0deg' }
              ]
            }
          ]}>
            {(voiceState === 'thinking' || voiceState === 'tool_running' || seeding) ? (
              <ActivityIndicator color={COLORS.text} size="large" />
            ) : voiceState === 'success' ? (
              <CheckCircle2 color={COLORS.text} size={40} />
            ) : voiceState === 'error' ? (
              <XCircle color={COLORS.text} size={40} />
            ) : (
              <Mic color={COLORS.text} size={36} />
            )}
          </Animated.View>

          {/* Voice State Badge */}
          <View style={[styles.stateBadge, { backgroundColor: getOrbColor() }]}>
            <Text style={styles.stateBadgeText}>{voiceState.toUpperCase()}</Text>
          </View>
        </View>

        {/* --- CAPTIONS & DIALOGUE --- */}
        <View style={styles.captionContainer}>
          <Text style={styles.captionText}>"{caption}"</Text>
          {transcript !== "" && (
            <Text style={styles.transcriptText}>You said: {transcript}</Text>
          )}
        </View>

        {/* --- REAL-TIME ORDER TRACKER PANEL --- */}
        {isConvex && activeOrderId && (
          <ConvexOrderTracker orderId={activeOrderId} />
        )}

        {/* --- DYNAMIC CART DISPLAY --- */}
        <View style={styles.cartCard}>
          <View style={styles.cartHeader}>
            <View style={styles.cartHeaderTitleGroup}>
              <ShoppingCart size={18} color={COLORS.primary} />
              <Text style={styles.cartTitle}>Active Cart</Text>
            </View>
            {restaurant && (
              <Text style={styles.restaurantBadge}>{restaurant}</Text>
            )}
          </View>

          {cart.length === 0 ? (
            <View style={styles.emptyCartContainer}>
              <Text style={styles.emptyCartText}>Your cart is currently empty.</Text>
              <Text style={styles.emptyCartSubtext}>Items added by the voice assistant will appear here in real time.</Text>
            </View>
          ) : (
            <View>
              {cart.map((item, idx) => (
                <View key={`${item.menuItemId}-${item.size}-${idx}`} style={styles.cartItemRow}>
                  <View style={styles.itemMeta}>
                    <Text style={styles.itemName}>{item.name}</Text>
                    <Text style={styles.itemDetails}>Size: {item.size}</Text>
                  </View>
                  <View style={styles.qtyPriceGroup}>
                    <Text style={styles.itemQty}>x{item.qty}</Text>
                    <Text style={styles.itemPrice}>Rs. {(item.price * item.qty).toLocaleString()}</Text>
                    <TouchableOpacity 
                      onPress={() => handleRemoveFromCart(item.menuItemId, item.size)}
                      style={styles.deleteButton}
                    >
                      <Trash2 size={16} color={COLORS.error} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}

              {/* Pricing breakdown */}
              <View style={styles.divider} />
              
              <View style={styles.priceRow}>
                <Text style={styles.priceLabel}>Subtotal</Text>
                <Text style={styles.priceValue}>Rs. {subtotal.toLocaleString()}</Text>
              </View>
              
              <View style={styles.priceRow}>
                <Text style={styles.priceLabel}>Delivery Fee</Text>
                <Text style={styles.priceValue}>Rs. {deliveryFee.toLocaleString()}</Text>
              </View>
              
              <View style={[styles.priceRow, { marginTop: 8 }]}>
                <Text style={styles.totalLabel}>Total Amount</Text>
                <Text style={styles.totalValue}>Rs. {total.toLocaleString()}</Text>
              </View>
            </View>
          )}
        </View>

      </ScrollView>

      {/* --- DEV TESTING SIMULATOR DRAWER --- */}
      <View style={styles.devDrawer}>
        <View style={styles.devHeader}>
          <Play size={14} color={COLORS.accent} />
          <Text style={styles.devTitle}>ElevenLabs Client Tool Simulator</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.devActions}>
          <TouchableOpacity style={styles.devBtn} onPress={runScenarioOrder}>
            <Text style={styles.devBtnText}>1. Order Chicken Biryani</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.devBtn} onPress={runScenarioAddLarge}>
            <Text style={styles.devBtnText}>2. Select Large (addToCart)</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.devBtn} onPress={runScenarioAddDrink}>
            <Text style={styles.devBtnText}>3. Add Coke (addToCart)</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.devBtn} onPress={runScenarioConfirm}>
            <Text style={styles.devBtnText}>4. Confirm (create_order)</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.devBtn, { backgroundColor: '#374151' }]} 
            onPress={() => {
              setVoiceState('idle');
              setTranscript('');
              setCaption('Assistant reset.');
              setActiveOrderId(null);
            }}
          >
            <RotateCcw size={14} color="#FFF" />
            <Text style={[styles.devBtnText, { marginLeft: 4 }]}>Reset Agent</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.devBtn, { backgroundColor: '#4B5563' }]} 
            onPress={clearCart}
          >
            <Trash2 size={14} color="#FFF" />
            <Text style={[styles.devBtnText, { marginLeft: 4 }]}>Clear Cart</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

// --- Convex Real-time Order Tracking Subscription Component ---
function ConvexOrderTracker({ orderId }) {
  // Real-time subscription hook. Convex will push updates to this component instantly!
  const order = useQuery(api.orders.getOrderStatus, { orderId });

  if (!order) {
    return (
      <View style={styles.trackerCard}>
        <ActivityIndicator color={COLORS.primary} size="small" />
        <Text style={styles.trackerStatusText}>Subscribing to live tracking stream...</Text>
      </View>
    );
  }

  const getStatusColor = () => {
    switch (order.status) {
      case 'Delivered': return COLORS.success;
      case 'OnTheWay': return COLORS.accent;
      default: return COLORS.primary;
    }
  };

  return (
    <View style={styles.trackerCard}>
      <Text style={styles.trackerTitle}>Live Tracking (Order #{order.orderNumber})</Text>
      
      <View style={styles.trackerProgressContainer}>
        <View style={[styles.progressBar, { width: order.status === 'Placed' ? '25%' : order.status === 'Preparing' ? '50%' : order.status === 'OnTheWay' ? '75%' : '100%', backgroundColor: getStatusColor() }]} />
      </View>

      <View style={styles.trackerDetailsRow}>
        <View>
          <Text style={styles.trackerLabel}>Status</Text>
          <Text style={[styles.trackerValue, { color: getStatusColor() }]}>{order.status}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.trackerLabel}>Estimated Delivery</Text>
          <Text style={styles.trackerValue}>{order.rider?.etaMins > 0 ? `${order.rider.etaMins} mins` : "Delivered ✓"}</Text>
        </View>
      </View>

      {order.rider && (
        <View style={styles.riderBox}>
          <Text style={styles.riderText}>Rider Coordinates: {order.rider.lat.toFixed(4)}, {order.rider.lng.toFixed(4)}</Text>
          <Text style={styles.riderSubtext}>Simulating live GPS movement onto delivery address...</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1F2937'
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.text
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4
  },
  dbBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 6
  },
  dbBadgeText: {
    fontSize: 9,
    fontWeight: 'bold',
    marginLeft: 3
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  locationText: {
    fontSize: 10,
    color: COLORS.muted,
    marginLeft: 2
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  seedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 90, 31, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginRight: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 90, 31, 0.3)'
  },
  seedBtnText: {
    color: COLORS.text,
    fontSize: 11,
    fontWeight: '700',
    marginLeft: 4
  },
  langSelector: {
    backgroundColor: COLORS.surface,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#374151'
  },
  langText: {
    color: COLORS.text,
    fontWeight: '600',
    fontSize: 12
  },
  langDropdown: {
    position: 'absolute',
    top: 36,
    right: 0,
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#374151',
    zIndex: 10,
    width: 60
  },
  dropdownItem: {
    paddingVertical: 8,
    alignItems: 'center'
  },
  dropdownItemText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '600'
  },
  scrollContent: {
    paddingBottom: 150
  },
  orbContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 220,
    position: 'relative'
  },
  orbOuterRing: {
    position: 'absolute',
    width: 150,
    height: 150,
    borderRadius: 75,
    borderWidth: 3,
    borderStyle: 'dashed'
  },
  orbCore: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6
  },
  stateBadge: {
    position: 'absolute',
    bottom: 24,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12
  },
  stateBadgeText: {
    color: COLORS.text,
    fontSize: 9,
    fontWeight: '800'
  },
  captionContainer: {
    paddingHorizontal: 24,
    alignItems: 'center',
    marginBottom: 16
  },
  captionText: {
    fontSize: 17,
    color: COLORS.text,
    textAlign: 'center',
    lineHeight: 24,
    fontWeight: '500'
  },
  transcriptText: {
    fontSize: 13,
    color: COLORS.muted,
    marginTop: 6,
    fontStyle: 'italic',
    textAlign: 'center'
  },
  cartCard: {
    backgroundColor: COLORS.surface,
    marginHorizontal: 20,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2D3748'
  },
  cartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14
  },
  cartHeaderTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  cartTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.text,
    marginLeft: 8
  },
  restaurantBadge: {
    fontSize: 11,
    color: COLORS.accent,
    backgroundColor: 'rgba(255, 183, 3, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    fontWeight: '600'
  },
  emptyCartContainer: {
    alignItems: 'center',
    paddingVertical: 20
  },
  emptyCartText: {
    color: COLORS.muted,
    fontSize: 14,
    fontWeight: '600'
  },
  emptyCartSubtext: {
    color: '#6B7280',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 4,
    paddingHorizontal: 20
  },
  cartItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#2D3748'
  },
  itemMeta: {
    flex: 1
  },
  itemName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text
  },
  itemDetails: {
    fontSize: 11,
    color: COLORS.muted,
    marginTop: 2
  },
  qtyPriceGroup: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  itemQty: {
    fontSize: 13,
    color: COLORS.accent,
    marginRight: 10,
    fontWeight: '700'
  },
  itemPrice: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '600',
    width: 70,
    textAlign: 'right'
  },
  deleteButton: {
    padding: 6,
    marginLeft: 6
  },
  divider: {
    height: 1,
    backgroundColor: '#2D3748',
    marginVertical: 12
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 3
  },
  priceLabel: {
    color: COLORS.muted,
    fontSize: 13
  },
  priceValue: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '500'
  },
  totalLabel: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: 'bold'
  },
  totalValue: {
    color: COLORS.primary,
    fontSize: 17,
    fontWeight: 'bold'
  },
  trackerCard: {
    backgroundColor: '#1E293B',
    marginHorizontal: 20,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155'
  },
  trackerTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 10
  },
  trackerProgressContainer: {
    height: 6,
    backgroundColor: '#0F172A',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 10
  },
  progressBar: {
    height: '100%',
    borderRadius: 3
  },
  trackerDetailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12
  },
  trackerLabel: {
    color: '#64748B',
    fontSize: 11
  },
  trackerValue: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: 'bold',
    marginTop: 2
  },
  trackerStatusText: {
    color: COLORS.muted,
    fontSize: 12,
    marginLeft: 10
  },
  riderBox: {
    backgroundColor: '#0F172A',
    padding: 10,
    borderRadius: 8
  },
  riderText: {
    color: COLORS.accent,
    fontSize: 11,
    fontFamily: 'monospace'
  },
  riderSubtext: {
    color: '#64748B',
    fontSize: 9,
    marginTop: 4
  },
  devDrawer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#1E293B',
    borderTopWidth: 1,
    borderTopColor: '#334155',
    paddingVertical: 12,
    paddingHorizontal: 16
  },
  devHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8
  },
  devTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#94A3B8',
    marginLeft: 6
  },
  devActions: {
    flexDirection: 'row',
    paddingRight: 16
  },
  devBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginRight: 8,
    flexDirection: 'row',
    alignItems: 'center'
  },
  devBtnText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700'
  }
});
