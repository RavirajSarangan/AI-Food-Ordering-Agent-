import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  SafeAreaView,
  StatusBar,
  Animated,
  Easing
} from 'react-native';
import { 
  Provider as PaperProvider, 
  MD3DarkTheme, 
  Text as PaperText,
  Card as PaperCard,
  Button as PaperButton,
  Chip as PaperChip,
  ProgressBar as PaperProgressBar,
  IconButton as PaperIconButton,
  Divider as PaperDivider
} from 'react-native-paper';
import { 
  Mic, 
  MapPin, 
  Play, 
  RotateCcw, 
  CheckCircle2, 
  XCircle,
  Database,
  RefreshCw,
  ShoppingCart,
  Trash2
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

// --- Custom Material 3 Dark Theme ---
const customTheme = {
  ...MD3DarkTheme,
  roundness: 3, // Premium modern slightly rounded corners
  colors: {
    ...MD3DarkTheme.colors,
    primary: COLORS.primary,
    onPrimary: COLORS.text,
    primaryContainer: 'rgba(255, 90, 31, 0.15)',
    onPrimaryContainer: COLORS.primary,
    surface: COLORS.surface,
    onSurface: COLORS.text,
    background: COLORS.bg,
    onBackground: COLORS.text,
    error: COLORS.error,
    elevation: {
      ...MD3DarkTheme.colors.elevation,
      level1: '#1A1C20',
      level2: '#24262A',
      level3: '#2D2F34'
    }
  }
};

const CONVEX_URL = process.env.EXPO_PUBLIC_CONVEX_URL || "";

// Wrapper Component to configure Convex & Paper theme conditionally
export default function App() {
  const content = CONVEX_URL ? (
    <ConvexProvider client={new ConvexReactClient(CONVEX_URL)}>
      <MainApp isConvex={true} />
    </ConvexProvider>
  ) : (
    <MainApp isConvex={false} />
  );

  return (
    <PaperProvider theme={customTheme}>
      {content}
    </PaperProvider>
  );
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

  // Animation Values for Custom Voice Orb
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
      let activeUserId = userId;
      if (!activeUserId) {
        setCaption("No active user found. Seeding first...");
        const seedResult = await convex.mutation(api.menu.seed);
        activeUserId = seedResult.userId;
        setUserId(activeUserId);
      }

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

  // --- Simulate Voice Scenarios ---
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
        menuItemId: "m1",
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
          console.warn("Failed to query sizes from Convex.");
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
        menuItemId: "m3",
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
      default: return '#4B5563';
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      {/* --- HEADER --- */}
      <View style={styles.header}>
        <View>
          <PaperText variant="titleLarge" style={styles.headerTitle}>FoodHub AI</PaperText>
          <View style={styles.badgeRow}>
            <PaperChip 
              icon={() => <Database size={12} color={isConvex ? COLORS.success : COLORS.muted} />}
              style={[styles.dbChip, { backgroundColor: isConvex ? 'rgba(34, 197, 94, 0.12)' : 'rgba(156, 163, 175, 0.12)' }]}
              textStyle={[styles.dbChipText, { color: isConvex ? COLORS.success : COLORS.muted }]}
            >
              {isConvex ? "Convex DB" : "Demo Mode"}
            </PaperChip>
            
            <View style={styles.locationContainer}>
              <MapPin size={10} color={COLORS.primary} />
              <PaperText variant="bodySmall" style={styles.locationText}>Colombo</PaperText>
            </View>
          </View>
        </View>

        <View style={styles.headerRight}>
          {isConvex && (
            <PaperButton 
              mode="contained-tonal"
              icon={() => <RefreshCw size={12} color={COLORS.primary} />}
              onPress={handleSeedDatabase}
              disabled={seeding}
              style={styles.seedBtn}
              labelStyle={styles.seedBtnLabel}
            >
              Seed DB
            </PaperButton>
          )}
          
          {/* Language Selector */}
          <View>
            <TouchableOpacity 
              style={styles.langSelector}
              onPress={() => setLangMenuOpen(!langMenuOpen)}
            >
              <PaperText variant="labelMedium" style={styles.langText}>{language} ▾</PaperText>
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
                    <PaperText variant="labelMedium" style={styles.dropdownItemText}>{lang}</PaperText>
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
          <PaperChip style={[styles.stateBadge, { backgroundColor: getOrbColor() }]} textStyle={styles.stateBadgeText}>
            {voiceState.toUpperCase()}
          </PaperChip>
        </View>

        {/* --- CAPTIONS & DIALOGUE --- */}
        <View style={styles.captionContainer}>
          <PaperText variant="headlineSmall" style={styles.captionText}>"{caption}"</PaperText>
          {transcript !== "" && (
            <PaperText variant="bodyMedium" style={styles.transcriptText}>You said: {transcript}</PaperText>
          )}
        </View>

        {/* --- REAL-TIME ORDER TRACKER PANEL --- */}
        {isConvex && activeOrderId && (
          <ConvexOrderTracker orderId={activeOrderId} />
        )}

        {/* --- DYNAMIC CART DISPLAY --- */}
        <PaperCard style={styles.cartCard} mode="outlined">
          <PaperCard.Title 
            title="Active Cart" 
            titleStyle={styles.cartCardTitle}
            left={(props) => <ShoppingCart {...props} size={18} color={COLORS.primary} />}
            right={() => restaurant ? (
              <PaperChip style={styles.restaurantChip} textStyle={styles.restaurantChipText}>
                {restaurant}
              </PaperChip>
            ) : null}
          />
          
          <PaperCard.Content>
            {cart.length === 0 ? (
              <View style={styles.emptyCartContainer}>
                <PaperText variant="bodyLarge" style={styles.emptyCartText}>Your cart is currently empty.</PaperText>
                <PaperText variant="bodySmall" style={styles.emptyCartSubtext}>Items added by the voice assistant will appear here in real time.</PaperText>
              </View>
            ) : (
              <View>
                {cart.map((item, idx) => (
                  <View key={`${item.menuItemId}-${item.size}-${idx}`} style={styles.cartItemRow}>
                    <View style={styles.itemMeta}>
                      <PaperText variant="bodyMedium" style={styles.itemName}>{item.name}</PaperText>
                      <PaperText variant="bodySmall" style={styles.itemDetails}>Size: {item.size}</PaperText>
                    </View>
                    <View style={styles.qtyPriceGroup}>
                      <PaperText variant="titleMedium" style={styles.itemQty}>x{item.qty}</PaperText>
                      <PaperText variant="bodyMedium" style={styles.itemPrice}>Rs. {(item.price * item.qty).toLocaleString()}</PaperText>
                      <PaperIconButton 
                        icon={() => <Trash2 size={16} color={COLORS.error} />}
                        size={20}
                        onPress={() => handleRemoveFromCart(item.menuItemId, item.size)}
                        style={styles.deleteButton}
                      />
                    </View>
                  </View>
                ))}

                <PaperDivider style={styles.divider} />
                
                <View style={styles.priceRow}>
                  <PaperText variant="bodyMedium" style={styles.priceLabel}>Subtotal</PaperText>
                  <PaperText variant="bodyMedium" style={styles.priceValue}>Rs. {subtotal.toLocaleString()}</PaperText>
                </View>
                
                <View style={styles.priceRow}>
                  <PaperText variant="bodyMedium" style={styles.priceLabel}>Delivery Fee</PaperText>
                  <PaperText variant="bodyMedium" style={styles.priceValue}>Rs. {deliveryFee.toLocaleString()}</PaperText>
                </View>
                
                <View style={[styles.priceRow, { marginTop: 8 }]}>
                  <PaperText variant="titleMedium" style={styles.totalLabel}>Total Amount</PaperText>
                  <PaperText variant="titleLarge" style={styles.totalValue}>Rs. {total.toLocaleString()}</PaperText>
                </View>
              </View>
            )}
          </PaperCard.Content>
        </PaperCard>

      </ScrollView>

      {/* --- DEV TESTING SIMULATOR DRAWER --- */}
      <PaperCard style={styles.devDrawer} mode="elevated" elevation={2}>
        <View style={styles.devHeader}>
          <Play size={12} color={COLORS.accent} />
          <PaperText variant="labelSmall" style={styles.devTitle}>ElevenLabs Client Tool Simulator</PaperText>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.devActions}>
          <PaperButton mode="contained" onPress={runScenarioOrder} style={styles.devBtn} labelStyle={styles.devBtnText}>
            1. Order Biryani
          </PaperButton>
          <PaperButton mode="contained" onPress={runScenarioAddLarge} style={styles.devBtn} labelStyle={styles.devBtnText}>
            2. Large Size
          </PaperButton>
          <PaperButton mode="contained" onPress={runScenarioAddDrink} style={styles.devBtn} labelStyle={styles.devBtnText}>
            3. Add Coke
          </PaperButton>
          <PaperButton mode="contained" onPress={runScenarioConfirm} style={[styles.devBtn, { backgroundColor: COLORS.success }]} labelStyle={styles.devBtnText}>
            4. Confirm
          </PaperButton>
          <PaperButton 
            mode="outlined" 
            onPress={() => {
              setVoiceState('idle');
              setTranscript('');
              setCaption('Assistant reset.');
              setActiveOrderId(null);
            }}
            style={styles.devBtnReset} 
            labelStyle={styles.devBtnResetText}
          >
            Reset Agent
          </PaperButton>
          <PaperButton 
            mode="outlined" 
            onPress={clearCart}
            style={styles.devBtnReset} 
            labelStyle={styles.devBtnResetText}
          >
            Clear Cart
          </PaperButton>
        </ScrollView>
      </PaperCard>
    </SafeAreaView>
  );
}

// --- Convex Real-time Order Tracking Subscription Component ---
function ConvexOrderTracker({ orderId }) {
  const order = useQuery(api.orders.getOrderStatus, { orderId });

  if (!order) {
    return (
      <PaperCard style={styles.trackerCard} mode="outlined">
        <PaperCard.Content style={styles.trackerLoading}>
          <ActivityIndicator color={COLORS.primary} size="small" />
          <PaperText variant="bodyMedium" style={styles.trackerStatusText}>Subscribing to live order updates...</PaperText>
        </PaperCard.Content>
      </PaperCard>
    );
  }

  const getStatusColor = () => {
    switch (order.status) {
      case 'Delivered': return COLORS.success;
      case 'OnTheWay': return COLORS.accent;
      default: return COLORS.primary;
    }
  };

  const getProgress = () => {
    switch (order.status) {
      case 'Placed': return 0.25;
      case 'Preparing': return 0.50;
      case 'OnTheWay': return 0.75;
      case 'Delivered': return 1.0;
      default: return 0.1;
    }
  };

  return (
    <PaperCard style={styles.trackerCard} mode="outlined">
      <PaperCard.Content>
        <PaperText variant="titleMedium" style={styles.trackerTitle}>Live Tracking (Order #{order.orderNumber})</PaperText>
        
        <PaperProgressBar 
          progress={getProgress()} 
          color={getStatusColor()} 
          style={styles.progressBar}
        />

        <View style={styles.trackerDetailsRow}>
          <View>
            <PaperText variant="bodySmall" style={styles.trackerLabel}>Status</PaperText>
            <PaperText variant="bodyLarge" style={[styles.trackerValue, { color: getStatusColor() }]}>
              {order.status}
            </PaperText>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <PaperText variant="bodySmall" style={styles.trackerLabel}>Estimated Delivery</PaperText>
            <PaperText variant="bodyLarge" style={styles.trackerValue}>
              {order.rider?.etaMins > 0 ? `${order.rider.etaMins} mins` : "Delivered ✓"}
            </PaperText>
          </View>
        </View>

        {order.rider && (
          <View style={styles.riderBox}>
            <PaperText variant="bodySmall" style={styles.riderText}>
              Rider GPS: {order.rider.lat.toFixed(4)}, {order.rider.lng.toFixed(4)}
            </PaperText>
            <PaperText variant="bodySmall" style={styles.riderSubtext}>
              Simulating live rider movement to your delivery address...
            </PaperText>
          </View>
        )}
      </PaperCard.Content>
    </PaperCard>
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
    borderBottomColor: '#24262A'
  },
  headerTitle: {
    fontWeight: 'bold',
    color: COLORS.text
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6
  },
  dbChip: {
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
    borderRadius: 6
  },
  dbChipText: {
    fontSize: 9,
    fontWeight: '800',
    lineHeight: 12
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  locationText: {
    color: COLORS.muted,
    marginLeft: 3
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  seedBtn: {
    height: 32,
    justifyContent: 'center',
    marginRight: 8,
    borderRadius: 8
  },
  seedBtnLabel: {
    fontSize: 11,
    fontWeight: 'bold',
    marginHorizontal: 0,
    marginVertical: 0
  },
  langSelector: {
    backgroundColor: COLORS.surface,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#374151',
    height: 32,
    justifyContent: 'center'
  },
  langText: {
    color: COLORS.text,
    fontWeight: '600'
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
    fontWeight: '600'
  },
  scrollContent: {
    paddingBottom: 160
  },
  orbContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 200,
    position: 'relative'
  },
  orbOuterRing: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 3,
    borderStyle: 'dashed'
  },
  orbCore: {
    width: 90,
    height: 90,
    borderRadius: 45,
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
    bottom: 15,
    borderRadius: 6,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center'
  },
  stateBadgeText: {
    color: COLORS.text,
    fontSize: 8,
    fontWeight: '900',
    lineHeight: 12
  },
  captionContainer: {
    paddingHorizontal: 24,
    alignItems: 'center',
    marginBottom: 16
  },
  captionText: {
    color: COLORS.text,
    textAlign: 'center',
    lineHeight: 30,
    fontWeight: '600'
  },
  transcriptText: {
    color: COLORS.muted,
    marginTop: 6,
    fontStyle: 'italic',
    textAlign: 'center'
  },
  cartCard: {
    backgroundColor: COLORS.surface,
    marginHorizontal: 16,
    borderRadius: 8,
    borderColor: '#24262A'
  },
  cartCardTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.text
  },
  restaurantChip: {
    backgroundColor: 'rgba(255, 183, 3, 0.12)',
    borderRadius: 6,
    height: 24,
    marginRight: 12,
    justifyContent: 'center'
  },
  restaurantChipText: {
    fontSize: 10,
    color: COLORS.accent,
    fontWeight: '700',
    lineHeight: 12
  },
  emptyCartContainer: {
    alignItems: 'center',
    paddingVertical: 16
  },
  emptyCartText: {
    color: COLORS.muted,
    fontWeight: '600'
  },
  emptyCartSubtext: {
    color: '#64748B',
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
    borderBottomColor: '#24262A'
  },
  itemMeta: {
    flex: 1
  },
  itemName: {
    fontWeight: '600',
    color: COLORS.text
  },
  itemDetails: {
    color: COLORS.muted,
    marginTop: 2
  },
  qtyPriceGroup: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  itemQty: {
    color: COLORS.accent,
    marginRight: 12,
    fontWeight: '700'
  },
  itemPrice: {
    color: COLORS.text,
    fontWeight: '600',
    width: 70,
    textAlign: 'right'
  },
  deleteButton: {
    margin: 0,
    marginLeft: 4
  },
  divider: {
    backgroundColor: '#24262A',
    marginVertical: 10
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 3
  },
  priceLabel: {
    color: COLORS.muted
  },
  priceValue: {
    color: COLORS.text,
    fontWeight: '500'
  },
  totalLabel: {
    color: COLORS.text,
    fontWeight: 'bold'
  },
  totalValue: {
    color: COLORS.primary,
    fontWeight: 'bold'
  },
  trackerCard: {
    backgroundColor: '#161E2E',
    marginHorizontal: 16,
    borderRadius: 8,
    marginBottom: 16,
    borderColor: '#1F2937'
  },
  trackerLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12
  },
  trackerTitle: {
    color: COLORS.text,
    fontWeight: 'bold',
    marginBottom: 10
  },
  progressBar: {
    height: 4,
    borderRadius: 2,
    marginBottom: 12
  },
  trackerDetailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12
  },
  trackerLabel: {
    color: '#9CA3AF'
  },
  trackerValue: {
    fontWeight: 'bold',
    marginTop: 2
  },
  trackerStatusText: {
    color: COLORS.muted,
    marginLeft: 10
  },
  riderBox: {
    backgroundColor: '#0B0F19',
    padding: 10,
    borderRadius: 6
  },
  riderText: {
    color: COLORS.accent,
    fontFamily: 'System'
  },
  riderSubtext: {
    color: '#6B7280',
    marginTop: 2
  },
  devDrawer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#1E293B',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 0
  },
  devHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    paddingLeft: 4
  },
  devTitle: {
    fontWeight: 'bold',
    color: '#94A3B8',
    marginLeft: 6
  },
  devActions: {
    flexDirection: 'row',
    paddingRight: 16
  },
  devBtn: {
    marginRight: 6,
    borderRadius: 6,
    backgroundColor: COLORS.primary,
    height: 34,
    justifyContent: 'center'
  },
  devBtnText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#FFF'
  },
  devBtnReset: {
    marginRight: 6,
    borderRadius: 6,
    height: 34,
    justifyContent: 'center',
    borderColor: '#475569'
  },
  devBtnResetText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#94A3B8'
  }
});
