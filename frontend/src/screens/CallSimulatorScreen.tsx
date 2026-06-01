import React, { useState, useEffect, useRef } from "react";
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, Alert } from "react-native";
import { Theme } from "../theme/theme";
import { WS_URL, BASE_URL } from "../services/api";
import { LinearGradient } from "expo-linear-gradient";

interface TranscriptLine {
  id: string;
  speaker: "agent" | "receptionist";
  text: string;
}

export default function CallSimulatorScreen() {
  const [callMode, setCallMode] = useState<"SIMULATOR" | "LIVE">("SIMULATOR");
  const [status, setStatus] = useState<"IDLE" | "CALLING" | "RINGING" | "CONNECTED" | "SUCCESS" | "ERROR">("IDLE");
  const [statusMessage, setStatusMessage] = useState("Robin is ready to initiate calls.");
  const [transcripts, setTranscripts] = useState<TranscriptLine[]>([]);
  const [activeSpeaker, setActiveSpeaker] = useState<"agent" | "receptionist" | "none">("none");
  const [appointmentDetails, setAppointmentDetails] = useState<any>(null);
  
  // Live outbound call inputs
  const [phoneNumber, setPhoneNumber] = useState("+1");
  const [dispatching, setDispatching] = useState(false);
  const [blandCallId, setBlandCallId] = useState<string | null>(null);

  // Waveform animation parameters
  const [waveScale, setWaveScale] = useState(1);
  const wsRef = useRef<WebSocket | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const intervalRef = useRef<any>(null);

  // Audio wave pulse simulator
  useEffect(() => {
    if (activeSpeaker !== "none" || status === "CALLING" || status === "RINGING") {
      intervalRef.current = setInterval(() => {
        setWaveScale(1 + Math.random() * 0.8);
      }, 150);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setWaveScale(1);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [activeSpeaker, status]);

  // Start visual simulator
  const startCallSimulation = () => {
    setTranscripts([]);
    setAppointmentDetails(null);
    setStatus("CALLING");
    setStatusMessage("Dialing Dr. Sarah Jenkins Orthopedics...");
    setActiveSpeaker("none");

    const ws = new WebSocket(`${WS_URL}/api/calls/simulate`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      console.log("WebSocket event:", data);

      if (data.type === "status") {
        setStatusMessage(data.message);
        if (data.message.includes("connected")) {
          setStatus("CONNECTED");
        } else if (data.message.includes("Ringing")) {
          setStatus("RINGING");
        }
      } else if (data.type === "transcript") {
        setActiveSpeaker(data.active || "none");
        setTranscripts(prev => [
          ...prev,
          {
            id: Math.random().toString(),
            speaker: data.speaker,
            text: data.text
          }
        ]);
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
      } else if (data.type === "success") {
        setStatus("SUCCESS");
        setStatusMessage(data.message);
        setActiveSpeaker("none");
        setAppointmentDetails(data.appointment);
        ws.close();
      } else if (data.type === "error") {
        setStatus("ERROR");
        setStatusMessage(data.message);
        setActiveSpeaker("none");
        ws.close();
      }
    };

    ws.onerror = (e) => {
      console.error(e);
      setStatus("ERROR");
      setStatusMessage("Call server connection failed. Make sure backend is running.");
      setActiveSpeaker("none");
    };
  };

  // Dispatch live calling
  const handleLiveCallDispatch = async () => {
    if (phoneNumber.length < 5) {
      Alert.alert("Invalid Number", "Please provide a valid E.164 phone number, e.g. +15551234567");
      return;
    }
    
    setDispatching(true);
    setStatus("CALLING");
    setStatusMessage("Connecting with Bland.ai calling dispatcher...");
    
    try {
      const res = await fetch(`${BASE_URL}/api/calls/dispatch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer mock_token_eugene"
        },
        body: JSON.stringify({
          phone_number: phoneNumber,
          physician_name: "Dr. Sarah Jenkins",
          specialty: "Orthopedic Surgeon",
          reason: "Consultation for lower back pain issues"
        })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Dispatch failed");
      
      setBlandCallId(data.call_id);
      setStatusMessage(data.message);
      setStatus("CONNECTED"); // Outbound call initiated
      
      Alert.alert(
        "AI Agent Dispatched",
        `Outbound phone call triggered to ${phoneNumber}. Robin will call Dr. Jenkins' office. (Call ID: ${data.call_id})`,
        [{ text: "OK" }]
      );
    } catch (e: any) {
      console.error(e);
      setStatus("ERROR");
      setStatusMessage(e.message || "Failed to initiate outbound AI agent call.");
    } finally {
      setDispatching(false);
    }
  };

  const hangUp = () => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    setStatus("IDLE");
    setStatusMessage("Call cancelled.");
    setActiveSpeaker("none");
    setBlandCallId(null);
  };

  return (
    <View style={styles.container}>
      {/* Top Header */}
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>Voice Coordination Portal</Text>
        <Text style={styles.cardSubtitle}>Robin acts as Eugene's voice spokesperson to secure bookings</Text>
      </View>

      {/* Selector Mode Tabs */}
      {status === "IDLE" && (
        <View style={styles.toggleRow}>
          <TouchableOpacity 
            style={[styles.toggleBtn, callMode === "SIMULATOR" && styles.toggleBtnActive]}
            onPress={() => setCallMode("SIMULATOR")}
          >
            <Text style={[styles.toggleText, callMode === "SIMULATOR" && styles.toggleTextActive]}>Interactive Simulator</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.toggleBtn, callMode === "LIVE" && styles.toggleBtnActive]}
            onPress={() => setCallMode("LIVE")}
          >
            <Text style={[styles.toggleText, callMode === "LIVE" && styles.toggleTextActive]}>Live Voice Call (AI)</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Main Simulator Window */}
      <View style={styles.simulatorWindow}>
        {status === "IDLE" && (
          <View style={styles.idleView}>
            {callMode === "SIMULATOR" ? (
              // Simulator Mode Content
              <View style={styles.centerAlign}>
                <View style={styles.phoneIconRing}>
                  <Text style={styles.phoneIcon}>🤖</Text>
                </View>
                <Text style={styles.targetPhysician}>Dr. Sarah Jenkins</Text>
                <Text style={styles.targetSpecialty}>Orthopedic Specialist</Text>
                <Text style={styles.targetReason}>Reason: Lower Back Pain Consultation</Text>
                
                <TouchableOpacity style={styles.callButton} onPress={startCallSimulation}>
                  <Text style={styles.callButtonText}>Start Interactive Simulator</Text>
                </TouchableOpacity>
              </View>
            ) : (
              // Live Calling Mode Content
              <View style={styles.centerAlign}>
                <View style={[styles.phoneIconRing, { backgroundColor: "rgba(59, 130, 246, 0.1)", borderColor: "rgba(59, 130, 246, 0.2)" }]}>
                  <Text style={[styles.phoneIcon, { color: Theme.colors.secondary }]}>📞</Text>
                </View>
                
                <Text style={styles.targetPhysician}>Live Outbound Dial</Text>
                <Text style={styles.liveCallExplainer}>
                  Enter the phone number of a medical receptionist (or your own mobile to test) to trigger a live AI voice call using Bland.ai API.
                </Text>

                <View style={styles.phoneInputContainer}>
                  <Text style={styles.phoneInputLabel}>Destination Phone Number</Text>
                  <TextInput
                    style={styles.phoneTextInput}
                    placeholder="+15551234567"
                    placeholderTextColor={Theme.colors.textMuted}
                    value={phoneNumber}
                    onChangeText={setPhoneNumber}
                    keyboardType="phone-pad"
                  />
                </View>

                <TouchableOpacity 
                  style={[styles.callButton, { backgroundColor: Theme.colors.secondary }]} 
                  onPress={handleLiveCallDispatch}
                >
                  <Text style={styles.callButtonText}>Dispatch Outbound Agent</Text>
                </TouchableOpacity>

                <Text style={styles.keyNotice}>
                  * Ensure BLAND_API_KEY is configured in backend environment. Otherwise, a mock dispatch is completed.
                </Text>
              </View>
            )}
          </View>
        )}

        {(status === "CALLING" || status === "RINGING" || status === "CONNECTED") && (
          <View style={styles.activeCallView}>
            {/* Visual Audio Wave */}
            <View style={styles.waveContainer}>
              <View style={[styles.waveCircle, { transform: [{ scale: waveScale }], opacity: activeSpeaker === "agent" || callMode === "LIVE" ? 0.3 : 0.1, backgroundColor: activeSpeaker === "agent" ? Theme.colors.primary : Theme.colors.secondary }]} />
              <View style={[styles.waveCircleInner, { backgroundColor: activeSpeaker === "agent" ? Theme.colors.primary : activeSpeaker === "receptionist" ? Theme.colors.secondary : Theme.colors.textMuted }]} />
            </View>

            <Text style={styles.activeSpeakerText}>
              {callMode === "LIVE" 
                ? "AI Agent Calling Out..." 
                : activeSpeaker === "agent" 
                  ? "Robin Speaking" 
                  : activeSpeaker === "receptionist" 
                    ? "Office Representative Speaking" 
                    : "Connecting..."}
            </Text>

            <Text style={styles.liveStatusTicker}>{statusMessage}</Text>

            {callMode === "SIMULATOR" ? (
              /* Scrolling Simulator Transcript */
              <ScrollView ref={scrollRef} style={styles.transcriptScroll} contentContainerStyle={styles.transcriptContent}>
                {transcripts.map((line) => (
                  <View 
                    key={line.id} 
                    style={[
                      styles.transcriptRow,
                      line.speaker === "agent" ? styles.rowAgent : styles.rowReceptionist
                    ]}
                  >
                    <Text style={styles.speakerLabel}>
                      {line.speaker === "agent" ? "Robin (AI Agent):" : "Marcus (Receptionist):"}
                    </Text>
                    <Text style={styles.speakerText}>{line.text}</Text>
                  </View>
                ))}
              </ScrollView>
            ) : (
              /* Live Bland Call Monitoring Layout */
              <View style={styles.liveMonitorBox}>
                <Text style={styles.monitorTitle}>Live Status Tracker</Text>
                <View style={styles.monitorStep}>
                  <Text style={styles.monitorStepDone}>✓ Connection Dispatched</Text>
                  <Text style={styles.monitorStepPending}>◉ Speech Dialogue Running (Bland.ai API)</Text>
                  <Text style={styles.monitorStepMuted}>Waiting for Webhook callback to update database...</Text>
                </View>
              </View>
            )}

            <TouchableOpacity style={styles.hangupButton} onPress={hangUp}>
              <Text style={styles.hangupButtonText}>Hang Up</Text>
            </TouchableOpacity>
          </View>
        )}

        {status === "SUCCESS" && (
          <View style={styles.successView}>
            <View style={styles.successBadge}>
              <Text style={styles.successBadgeIcon}>✓</Text>
            </View>
            <Text style={styles.successTitle}>Booking Successful!</Text>
            <Text style={styles.successDesc}>Robin successfully confirmed and logged the appointment details.</Text>

            {appointmentDetails && (
              <LinearGradient
                colors={["#16223F", "#0F1A30"]}
                style={styles.receiptCard}
              >
                <Text style={styles.receiptLabel}>Appointment Secured</Text>
                <Text style={styles.receiptPhysician}>{appointmentDetails.physician_name}</Text>
                <Text style={styles.receiptTime}>
                  {new Date(appointmentDetails.time_slot).toLocaleString("en-US", {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit"
                  })}
                </Text>
                <Text style={styles.receiptStatus}>Calendar Updated (Local Database)</Text>
              </LinearGradient>
            )}

            <TouchableOpacity style={styles.doneButton} onPress={() => setStatus("IDLE")}>
              <Text style={styles.doneButtonText}>Finish</Text>
            </TouchableOpacity>
          </View>
        )}

        {status === "ERROR" && (
          <View style={styles.idleView}>
            <View style={[styles.phoneIconRing, { backgroundColor: "rgba(239, 68, 68, 0.1)", borderColor: "rgba(239, 68, 68, 0.2)" }]}>
              <Text style={[styles.phoneIcon, { color: Theme.colors.error }]}>⚠</Text>
            </View>
            <Text style={styles.errorTitle}>Connection Error</Text>
            <Text style={styles.errorDesc}>{statusMessage}</Text>
            
            <TouchableOpacity 
              style={[styles.callButton, { backgroundColor: Theme.colors.error }]} 
              onPress={callMode === "SIMULATOR" ? startCallSimulation : handleLiveCallDispatch}
            >
              <Text style={styles.callButtonText}>Try Again</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.cancelLink} onPress={() => setStatus("IDLE")}>
              <Text style={styles.cancelLinkText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.colors.background,
    padding: 20,
    paddingTop: 50,
  },
  cardHeader: {
    marginBottom: 15,
  },
  cardTitle: {
    color: Theme.colors.textPrimary,
    fontSize: 22,
    fontWeight: "bold",
  },
  cardSubtitle: {
    color: Theme.colors.textSecondary,
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },
  toggleRow: {
    flexDirection: "row",
    backgroundColor: Theme.colors.surface,
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 8,
  },
  toggleBtnActive: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderColor: Theme.colors.surfaceGlassBorder,
    borderWidth: 1,
  },
  toggleText: {
    color: Theme.colors.textSecondary,
    fontSize: 13,
    fontWeight: "500",
  },
  toggleTextActive: {
    color: Theme.colors.textPrimary,
    fontWeight: "bold",
  },
  simulatorWindow: {
    flex: 1,
    backgroundColor: Theme.colors.surface,
    borderColor: Theme.colors.surfaceGlassBorder,
    borderWidth: 1,
    borderRadius: 24,
    overflow: "hidden",
    marginBottom: 20,
  },
  idleView: {
    flex: 1,
    justifyContent: "center",
    padding: 25,
  },
  centerAlign: {
    alignItems: "center",
  },
  phoneIconRing: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(16, 185, 129, 0.1)",
    borderColor: "rgba(16, 185, 129, 0.2)",
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  phoneIcon: {
    fontSize: 32,
    color: Theme.colors.primary,
  },
  targetPhysician: {
    color: Theme.colors.textPrimary,
    fontSize: 22,
    fontWeight: "bold",
    textAlign: "center",
  },
  targetSpecialty: {
    color: Theme.colors.textSecondary,
    fontSize: 15,
    marginTop: 4,
  },
  targetReason: {
    color: Theme.colors.textMuted,
    fontSize: 13,
    marginTop: 8,
    marginBottom: 30,
  },
  liveCallExplainer: {
    color: Theme.colors.textSecondary,
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 20,
    paddingHorizontal: 10,
  },
  phoneInputContainer: {
    width: "100%",
    marginBottom: 25,
  },
  phoneInputLabel: {
    color: Theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 8,
  },
  phoneTextInput: {
    backgroundColor: Theme.colors.background,
    color: Theme.colors.textPrimary,
    borderRadius: 10,
    paddingHorizontal: 15,
    paddingVertical: 12,
    fontSize: 15,
    borderColor: Theme.colors.divider,
    borderWidth: 1,
  },
  callButton: {
    backgroundColor: Theme.colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 25,
    shadowColor: Theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
  },
  callButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
  },
  keyNotice: {
    color: Theme.colors.textMuted,
    fontSize: 10,
    textAlign: "center",
    marginTop: 15,
    fontStyle: "italic",
  },
  activeCallView: {
    flex: 1,
    alignItems: "center",
    padding: 20,
  },
  waveContainer: {
    width: 100,
    height: 100,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 20,
    marginBottom: 15,
  },
  waveCircle: {
    position: "absolute",
    width: 90,
    height: 90,
    borderRadius: 45,
  },
  waveCircleInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: "center",
    alignItems: "center",
  },
  activeSpeakerText: {
    color: Theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: "bold",
  },
  liveStatusTicker: {
    color: Theme.colors.textSecondary,
    fontSize: 12,
    fontStyle: "italic",
    marginTop: 5,
    textAlign: "center",
    marginBottom: 20,
  },
  transcriptScroll: {
    flex: 1,
    width: "100%",
    backgroundColor: Theme.colors.background,
    borderRadius: 16,
    padding: 15,
    marginBottom: 20,
    borderColor: Theme.colors.divider,
    borderWidth: 1,
  },
  transcriptContent: {
    paddingBottom: 15,
  },
  transcriptRow: {
    marginBottom: 12,
    padding: 10,
    borderRadius: 12,
    maxWidth: "90%",
  },
  rowAgent: {
    backgroundColor: "rgba(16, 185, 129, 0.08)",
    alignSelf: "flex-end",
    borderColor: "rgba(16, 185, 129, 0.15)",
    borderWidth: 1,
  },
  rowReceptionist: {
    backgroundColor: "rgba(59, 130, 246, 0.08)",
    alignSelf: "flex-start",
    borderColor: "rgba(59, 130, 246, 0.15)",
    borderWidth: 1,
  },
  speakerLabel: {
    fontSize: 11,
    fontWeight: "bold",
    color: Theme.colors.textSecondary,
    marginBottom: 4,
  },
  speakerText: {
    color: Theme.colors.textPrimary,
    fontSize: 14,
    lineHeight: 18,
  },
  liveMonitorBox: {
    flex: 1,
    width: "100%",
    backgroundColor: Theme.colors.background,
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderColor: Theme.colors.divider,
    borderWidth: 1,
  },
  monitorTitle: {
    color: Theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: "bold",
    marginBottom: 15,
  },
  monitorStep: {
    marginVertical: 5,
  },
  monitorStepDone: {
    color: Theme.colors.primary,
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 12,
  },
  monitorStepPending: {
    color: Theme.colors.secondary,
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 12,
  },
  monitorStepMuted: {
    color: Theme.colors.textMuted,
    fontSize: 12,
    fontStyle: "italic",
  },
  hangupButton: {
    backgroundColor: Theme.colors.error,
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 20,
    marginBottom: 10,
  },
  hangupButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "bold",
  },
  successView: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 25,
  },
  successBadge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    borderColor: "rgba(16, 185, 129, 0.3)",
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 15,
  },
  successBadgeIcon: {
    fontSize: 26,
    color: Theme.colors.primary,
    fontWeight: "bold",
  },
  successTitle: {
    color: Theme.colors.textPrimary,
    fontSize: 22,
    fontWeight: "bold",
  },
  successDesc: {
    color: Theme.colors.textSecondary,
    fontSize: 13,
    textAlign: "center",
    marginTop: 6,
    marginBottom: 20,
    lineHeight: 18,
  },
  receiptCard: {
    width: "100%",
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderWidth: 1,
    marginBottom: 25,
  },
  receiptLabel: {
    color: Theme.colors.primary,
    fontSize: 11,
    fontWeight: "bold",
    textTransform: "uppercase",
    marginBottom: 6,
  },
  receiptPhysician: {
    color: Theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: "bold",
  },
  receiptTime: {
    color: Theme.colors.textSecondary,
    fontSize: 14,
    marginTop: 4,
    textAlign: "center",
  },
  receiptStatus: {
    color: Theme.colors.textMuted,
    fontSize: 11,
    marginTop: 10,
    fontStyle: "italic",
  },
  doneButton: {
    backgroundColor: Theme.colors.surfaceGlass,
    borderColor: Theme.colors.surfaceGlassBorder,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 40,
    borderRadius: 20,
  },
  doneButtonText: {
    color: Theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: "bold",
  },
  errorTitle: {
    color: Theme.colors.error,
    fontSize: 18,
    fontWeight: "bold",
    marginTop: 10,
  },
  errorDesc: {
    color: Theme.colors.textSecondary,
    fontSize: 13,
    textAlign: "center",
    marginTop: 6,
    marginBottom: 25,
  },
  cancelLink: {
    marginTop: 15,
  },
  cancelLinkText: {
    color: Theme.colors.textMuted,
    fontSize: 13,
  },
});
