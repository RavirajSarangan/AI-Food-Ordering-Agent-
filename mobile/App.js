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
  HelpCircle
} from 'lucide-react-native';

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

export default function App() {
  const [language, setLanguage] = useState('EN'); // EN, TA, SI
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  
  // Voice Agent State
  // 'idle' | 'listening' | 'thinking' | 'speaking' | 'tool_running' | 'success' | 'error'
  const [voiceState, setVoiceState] = useState('idle');
  const [caption, setCaption] = useState("Tap the mic to start ordering...");
  const [transcript, setTranscript] = useState("");
  
  // Cart State (Source of Truth)
  const [cart, setCart] = useState([]);
  const [restaurant, setRestaurant] = useState(null);

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
    if (voiceState === 'thinking' || voiceState === 'tool_running') {
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
  }, [voiceState]);

  const spin = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg']
  });

  // Calculate totals
  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  const deliveryFee = subtotal > 0 ? 150 : 0;
  const total = subtotal + deliveryFee;

  // --- Client Tool Mock Handlers ---
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
    setCaption("Cart cleared.");
  };

  // --- Simulate Voice Scenarios ---
  const runScenarioOrder = () => {
    clearCart();
    setVoiceState('listening');
    setTranscript("I'd like a chicken biryani from ABC Biryani House");
    setCaption("Listening...");

    setTimeout(() => {
      setVoiceState('tool_running');
      setCaption("Fetching menu from ABC Biryani House...");
      setRestaurant("ABC Biryani House");
    }, 2000);

    setTimeout(() => {
      setVoiceState('speaking');
      setCaption("Would you like a regular (Rs.1,000) or large (Rs.1,400) Chicken Biryani?");
    }, 4000);
  };

  const runScenarioAddLarge = () => {
    setVoiceState('listening');
    setTranscript("Make it a large one please.");
    setCaption("Listening...");

    setTimeout(() => {
      setVoiceState('tool_running');
      setCaption("Updating your cart...");
      handleAddToCart({
        menuItemId: "m1",
        name: "Chicken Biryani",
        size: "large",
        price: 1400
      });
    }, 1500);

    setTimeout(() => {
      setVoiceState('speaking');
      setCaption("Added large Chicken Biryani. Would you like a drink with that?");
    }, 3000);
  };

  const runScenarioAddDrink = () => {
    setVoiceState('listening');
    setTranscript("Yes, add a Coke.");
    setCaption("Listening...");

    setTimeout(() => {
      setVoiceState('tool_running');
      setCaption("Adding beverage...");
      handleAddToCart({
        menuItemId: "m3",
        name: "Coke",
        size: "regular",
        price: 200
      });
    }, 1500);

    setTimeout(() => {
      setVoiceState('speaking');
      setCaption("Your total is Rs. 1,750 (including Rs. 150 delivery). Shall I place the order?");
    }, 3000);
  };

  const runScenarioConfirm = () => {
    setVoiceState('listening');
    setTranscript("Yes, place it.");
    setCaption("Listening...");

    setTimeout(() => {
      setVoiceState('tool_running');
      setCaption("Creating your order in the kitchen...");
    }, 1500);

    setTimeout(() => {
      setVoiceState('success');
      setCaption("Done! Order #4821 placed successfully. Delivery in 15 mins.");
    }, 3500);
  };

  const getOrbColor = () => {
    switch(voiceState) {
      case 'listening': return COLORS.primary;
      case 'thinking': return COLORS.accent;
      case 'speaking': return '#818CF8'; // soft violet
      case 'tool_running': return COLORS.accent;
      case 'success': return COLORS.success;
      case 'error': return COLORS.error;
      default: return '#374151'; // dark gray
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      {/* --- HEADER --- */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>FoodHub AI</Text>
          <View style={styles.locationContainer}>
            <MapPin size={12} color={COLORS.primary} />
            <Text style={styles.locationText}>Colombo, Sri Lanka</Text>
          </View>
        </View>

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
                { rotate: voiceState === 'thinking' || voiceState === 'tool_running' ? spin : '0deg' }
              ]
            }
          ]}>
            {(voiceState === 'thinking' || voiceState === 'tool_running') ? (
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
    color: COLORS.text,
    fontFamily: 'Inter_700Bold'
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4
  },
  locationText: {
    fontSize: 12,
    color: COLORS.muted,
    marginLeft: 4
  },
  langSelector: {
    backgroundColor: COLORS.surface,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#374151'
  },
  langText: {
    color: COLORS.text,
    fontWeight: '600',
    fontSize: 14
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
    fontSize: 14,
    fontWeight: '600'
  },
  scrollContent: {
    paddingBottom: 150
  },
  orbContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 250,
    position: 'relative'
  },
  orbOuterRing: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 3,
    borderStyle: 'dashed'
  },
  orbCore: {
    width: 110,
    height: 110,
    borderRadius: 55,
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
    bottom: 30,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12
  },
  stateBadgeText: {
    color: COLORS.text,
    fontSize: 10,
    fontWeight: '800'
  },
  captionContainer: {
    paddingHorizontal: 24,
    alignItems: 'center',
    marginBottom: 20
  },
  captionText: {
    fontSize: 18,
    color: COLORS.text,
    textAlign: 'center',
    lineHeight: 26,
    fontWeight: '500'
  },
  transcriptText: {
    fontSize: 14,
    color: COLORS.muted,
    marginTop: 8,
    fontStyle: 'italic',
    textAlign: 'center'
  },
  cartCard: {
    backgroundColor: COLORS.surface,
    marginHorizontal: 20,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2D3748',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2
  },
  cartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16
  },
  cartHeaderTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  cartTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.text,
    marginLeft: 8
  },
  restaurantBadge: {
    fontSize: 12,
    color: COLORS.accent,
    backgroundColor: 'rgba(255, 183, 3, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    fontWeight: '600'
  },
  emptyCartContainer: {
    alignItems: 'center',
    paddingVertical: 24
  },
  emptyCartText: {
    color: COLORS.muted,
    fontSize: 15,
    fontWeight: '600'
  },
  emptyCartSubtext: {
    color: '#6B7280',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 6,
    paddingHorizontal: 20
  },
  cartItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#2D3748'
  },
  itemMeta: {
    flex: 1
  },
  itemName: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text
  },
  itemDetails: {
    fontSize: 12,
    color: COLORS.muted,
    marginTop: 2
  },
  qtyPriceGroup: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  itemQty: {
    fontSize: 14,
    color: COLORS.accent,
    marginRight: 12,
    fontWeight: '700'
  },
  itemPrice: {
    fontSize: 15,
    color: COLORS.text,
    fontWeight: '600',
    width: 80,
    textAlign: 'right'
  },
  deleteButton: {
    padding: 6,
    marginLeft: 8
  },
  divider: {
    height: 1,
    backgroundColor: '#2D3748',
    marginVertical: 14
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 4
  },
  priceLabel: {
    color: COLORS.muted,
    fontSize: 14
  },
  priceValue: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '500'
  },
  totalLabel: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: 'bold'
  },
  totalValue: {
    color: COLORS.primary,
    fontSize: 18,
    fontWeight: 'bold'
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
    fontSize: 12,
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
    fontSize: 12,
    fontWeight: '700'
  }
});
