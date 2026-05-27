import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createStackNavigator } from "@react-navigation/stack";
import { Feather } from "@expo/vector-icons";
import * as LocalAuthentication from "expo-local-authentication";
import type { ComponentType } from "react";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { getSession, isBiometricEnabled } from "../lib/auth";
import { WelcomeScreen } from "../screens/onboarding/WelcomeScreen";
import { OnboardingAdmittedScreen } from "../screens/onboarding/OnboardingAdmittedScreen";
import { OnboardingCategoriesScreen } from "../screens/onboarding/OnboardingCategoriesScreen";
import { OnboardingPaymentScreen } from "../screens/onboarding/OnboardingPaymentScreen";
import { OnboardingProfileScreen } from "../screens/onboarding/OnboardingProfileScreen";
import { OnboardingTierScreen } from "../screens/onboarding/OnboardingTierScreen";
import { PhoneScreen } from "../screens/auth/PhoneScreen";
import { OTPScreen } from "../screens/auth/OTPScreen";
import { DashboardScreen } from "../screens/home/DashboardScreen";
import { DealsScreen } from "../screens/deals/DealsScreen";
import { BookingsScreen } from "../screens/bookings/BookingsScreen";
import { WalletScreen } from "../screens/wallet/WalletScreen";
import { ProfileScreen } from "../screens/profile/ProfileScreen";

const AuthStack = createStackNavigator();
const Tab = createBottomTabNavigator();

const linking = {
  prefixes: ["plutusclub://", "https://plutusclub.in"],
  config: {
    screens: {
      Welcome: "referral",
      Deals: "deals",
      Bookings: "member/bookings",
      Profile: "member/profile"
    }
  }
};

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: "#0A0A12" },
        headerTintColor: "#F7F1DF",
        tabBarActiveTintColor: "#C9A961",
        tabBarInactiveTintColor: "#7A7787",
        tabBarStyle: { backgroundColor: "#0A0A12", borderTopColor: "#252331" },
        tabBarIcon: ({ color, size }) => {
          const icons = {
            Home: "home",
            Deals: "grid",
            Bookings: "calendar",
            Wallet: "credit-card",
            Profile: "user"
          } as const;
          return <Feather name={icons[route.name as keyof typeof icons]} color={color} size={size} />;
        }
      })}
    >
      <Tab.Screen name="Home" component={DashboardScreen} />
      <Tab.Screen name="Deals" component={DealsScreen} />
      <Tab.Screen name="Bookings" component={BookingsScreen} />
      <Tab.Screen name="Wallet" component={WalletScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

export function RootNavigator() {
  const [loading, setLoading] = useState(true);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    async function restoreSession() {
      const session = await getSession();
      if (!session) {
        setHasSession(false);
        return;
      }

      if (await isBiometricEnabled()) {
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: "Unlock PlutusClub",
          cancelLabel: "Sign out",
          disableDeviceFallback: false
        });
        setHasSession(result.success);
        return;
      }

      setHasSession(true);
    }

    restoreSession().finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#0A0A12" }}>
        <ActivityIndicator color="#C9A961" />
        <Text style={{ marginTop: 12, color: "#7A7787" }}>Securing session...</Text>
      </View>
    );
  }

  return (
    <NavigationContainer linking={linking}>
      {hasSession ? (
        <MainTabs />
      ) : (
        <AuthStack.Navigator screenOptions={{ headerShown: false }}>
          <AuthStack.Screen name="Welcome" component={WelcomeScreen} />
          <AuthStack.Screen name="Phone" component={PhoneScreen} />
          <AuthStack.Screen name="OTP" component={OTPScreen as ComponentType<any>} />
          <AuthStack.Screen name="OnboardingProfile" component={OnboardingProfileScreen} />
          <AuthStack.Screen name="OnboardingTier" component={OnboardingTierScreen} />
          <AuthStack.Screen name="OnboardingCategories" component={OnboardingCategoriesScreen} />
          <AuthStack.Screen name="OnboardingPayment" component={OnboardingPaymentScreen} />
          <AuthStack.Screen name="OnboardingAdmitted" component={OnboardingAdmittedScreen} />
        </AuthStack.Navigator>
      )}
    </NavigationContainer>
  );
}
