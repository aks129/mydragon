import React, { useState } from "react";
import { StyleSheet, View, Text, TouchableOpacity, SafeAreaView, Platform, TextInput, Alert } from "react-native";
import { StatusBar } from "expo-status-bar";
import { Theme } from "./src/theme/theme";
import { LinearGradient } from "expo-linear-gradient";

// Import Screens
import DashboardScreen from "./src/screens/DashboardScreen";
import CallSimulatorScreen from "./src/screens/CallSimulatorScreen";
import ChatScreen from "./src/screens/ChatScreen";
import HealthProfileScreen from "./src/screens/HealthProfileScreen";
import FormFillerScreen from "./src/screens/FormFillerScreen";

export default function App() {
  const [activeTab, setActiveTab] = useState<string>("dashboard");
  const [authenticated, setAuthenticated] = useState<boolean>(false);
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");

  const handleLogin = () => {
    if (email === "eugene.vestel@example.com" && password === "eugene1234") {
      setAuthenticated(true);
    } else {
      Alert.alert(
        "Invalid Credentials", 
        "For demo purposes, tap 'Demo Auto-fill' to load the correct login credentials.",
        [{ text: "OK" }]
      );
    }
  };

  const handleDemoFill = () => {
    setEmail("eugene.vestel@example.com");
    setPassword("eugene1234");
  };

  const renderScreen = () => {
    switch (activeTab) {
      case "dashboard":
        return <DashboardScreen onNavigate={setActiveTab} />;
      case "simulator":
        return <CallSimulatorScreen />;
      case "chat":
        return <ChatScreen />;
      case "ehr":
        return <HealthProfileScreen />;
      case "forms":
        return <FormFillerScreen />;
      default:
        return <DashboardScreen onNavigate={setActiveTab} />;
    }
  };

  if (!authenticated) {
    return (
      <SafeAreaView style={styles.loginContainer}>
        <StatusBar style="light" />
        <View style={styles.loginCard}>
          <LinearGradient
            colors={[Theme.colors.primary, Theme.colors.secondary]}
            style={styles.logoRing}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <View style={styles.logo}>
              <Text style={styles.logoIcon}>🤖</Text>
            </View>
          </LinearGradient>
          
          <Text style={styles.loginTitle}>HealthRobin AI</Text>
          <Text style={styles.loginSubtitle}>Access your secure healthcare assistant agent portal</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Patient Email</Text>
            <TextInput
              style={styles.input}
              placeholder="patient@example.com"
              placeholderTextColor={Theme.colors.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Secure Password</Text>
            <TextInput
              style={styles.input}
              placeholder="••••••••"
              placeholderTextColor={Theme.colors.textMuted}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
          </View>

          <TouchableOpacity style={styles.loginBtn} onPress={handleLogin}>
            <Text style={styles.loginBtnText}>Secure Sign In</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.demoFillLink} onPress={handleDemoFill}>
            <Text style={styles.demoFillLinkText}>⚡ Demo Auto-fill Credentials</Text>
          </TouchableOpacity>

          <View style={styles.disclaimerContainer}>
            <Text style={styles.disclaimerText}>
              ⚠️ MEDICAL DISCLAIMER: HealthRobin AI is a care coordination tool. It does not provide medical advice or diagnoses. Please consult a physician for all clinical decisions.
            </Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      
      {/* Active Screen Area */}
      <View style={styles.screenContainer}>
        {renderScreen()}
      </View>

      {/* Glassmorphic Tab Bar Navigation */}
      <View style={styles.tabBar}>
        <TouchableOpacity 
          style={[styles.tabItem, activeTab === "dashboard" && styles.tabItemActive]} 
          onPress={() => setActiveTab("dashboard")}
        >
          <Text style={styles.tabIcon}>🏠</Text>
          <Text style={[styles.tabLabel, activeTab === "dashboard" && styles.tabLabelActive]}>Home</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.tabItem, activeTab === "simulator" && styles.tabItemActive]} 
          onPress={() => setActiveTab("simulator")}
        >
          <Text style={styles.tabIcon}>📞</Text>
          <Text style={[styles.tabLabel, activeTab === "simulator" && styles.tabLabelActive]}>Voice</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.tabItem, activeTab === "chat" && styles.tabItemActive]} 
          onPress={() => setActiveTab("chat")}
        >
          <Text style={styles.tabIcon}>💬</Text>
          <Text style={[styles.tabLabel, activeTab === "chat" && styles.tabLabelActive]}>Chat</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.tabItem, activeTab === "ehr" && styles.tabItemActive]} 
          onPress={() => setActiveTab("ehr")}
        >
          <Text style={styles.tabIcon}>📂</Text>
          <Text style={[styles.tabLabel, activeTab === "ehr" && styles.tabLabelActive]}>EHR</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.tabItem, activeTab === "forms" && styles.tabItemActive]} 
          onPress={() => setActiveTab("forms")}
        >
          <Text style={styles.tabIcon}>📝</Text>
          <Text style={[styles.tabLabel, activeTab === "forms" && styles.tabLabelActive]}>Forms</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.colors.background,
  },
  screenContainer: {
    flex: 1,
  },
  loginContainer: {
    flex: 1,
    backgroundColor: Theme.colors.background,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  loginCard: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: Theme.colors.surface,
    borderColor: Theme.colors.surfaceGlassBorder,
    borderWidth: 1,
    borderRadius: 24,
    padding: 25,
    alignItems: "center",
  },
  logoRing: {
    padding: 3,
    borderRadius: 35,
    marginBottom: 15,
  },
  logo: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#161E2E",
    justifyContent: "center",
    alignItems: "center",
  },
  logoIcon: {
    fontSize: 32,
  },
  loginTitle: {
    color: Theme.colors.textPrimary,
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 6,
  },
  loginSubtitle: {
    color: Theme.colors.textSecondary,
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 25,
  },
  inputGroup: {
    width: "100%",
    marginBottom: 16,
  },
  inputLabel: {
    color: Theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 8,
  },
  input: {
    backgroundColor: Theme.colors.background,
    color: Theme.colors.textPrimary,
    borderRadius: 12,
    paddingHorizontal: 15,
    paddingVertical: 12,
    fontSize: 14,
    borderColor: Theme.colors.divider,
    borderWidth: 1,
  },
  loginBtn: {
    width: "100%",
    backgroundColor: Theme.colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 10,
    shadowColor: Theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  loginBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "bold",
  },
  demoFillLink: {
    marginTop: 20,
  },
  demoFillLinkText: {
    color: Theme.colors.secondary,
    fontSize: 13,
    fontWeight: "600",
  },
  disclaimerContainer: {
    marginTop: 20,
    padding: 10,
    backgroundColor: "rgba(245, 158, 11, 0.08)",
    borderColor: "rgba(245, 158, 11, 0.2)",
    borderWidth: 1,
    borderRadius: 10,
  },
  disclaimerText: {
    color: Theme.colors.warning,
    fontSize: 10,
    lineHeight: 14,
    textAlign: "center",
  },
  tabBar: {
    flexDirection: "row",
    backgroundColor: Theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: Theme.colors.divider,
    paddingVertical: Platform.OS === "ios" ? 10 : 8,
    paddingBottom: Platform.OS === "ios" ? 25 : 8,
    justifyContent: "space-around",
    alignItems: "center",
  },
  tabItem: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 16,
  },
  tabItemActive: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  tabIcon: {
    fontSize: 20,
    marginBottom: 4,
  },
  tabLabel: {
    color: Theme.colors.textSecondary,
    fontSize: 10,
    fontWeight: "500",
  },
  tabLabelActive: {
    color: Theme.colors.primary,
    fontWeight: "bold",
  },
});
