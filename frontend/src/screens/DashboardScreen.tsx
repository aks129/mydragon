import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from "react-native";
import { Theme } from "../theme/theme";
import { 
  fetchPatientProfile, 
  fetchAppointments, 
  fetchCareGaps, 
  fetchHealthHabits, 
  fetchMedicationRefills 
} from "../services/api";
import { LinearGradient } from "expo-linear-gradient";

interface DashboardScreenProps {
  onNavigate: (tab: string) => void;
}

export default function DashboardScreen({ onNavigate }: DashboardScreenProps) {
  const [patient, setPatient] = useState<any>(null);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [careGaps, setCareGaps] = useState<any[]>([]);
  const [habits, setHabits] = useState<any>(null);
  const [refills, setRefills] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setError(null);
      const [profileData, apptsData, gapsData, habitsData, refillsData] = await Promise.all([
        fetchPatientProfile(),
        fetchAppointments(),
        fetchCareGaps(),
        fetchHealthHabits(),
        fetchMedicationRefills(),
      ]);
      setPatient(profileData);
      setAppointments(apptsData);
      setCareGaps(gapsData);
      setHabits(habitsData);
      setRefills(refillsData);
    } catch (err: any) {
      console.error(err);
      setError("Unable to connect to Healthcare Server.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Theme.colors.primary} />
        <Text style={styles.loadingText}>Loading health dashboard...</Text>
      </View>
    );
  }

  // Find next upcoming appointment
  const scheduledAppointments = appointments.filter(a => a.status === "SCHEDULED");
  const nextAppointment = scheduledAppointments.length > 0 ? scheduledAppointments[scheduledAppointments.length - 1] : null;

  return (
    <ScrollView 
      style={styles.container} 
      contentContainerStyle={styles.contentContainer}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Theme.colors.primary} />}
    >
      {/* Header Greeting */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hello,</Text>
          <Text style={styles.patientName}>{patient?.name || "Eugene Vestel"}</Text>
        </View>
        <LinearGradient 
          colors={[Theme.colors.primary, Theme.colors.secondary]} 
          style={styles.avatarGlow}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>EV</Text>
          </View>
        </LinearGradient>
      </View>

      {error && (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadData}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Agent Status Banner */}
      <View style={styles.agentStatusCard}>
        <View style={styles.pulseContainer}>
          <View style={styles.pulseOutline} />
          <View style={styles.pulseDot} />
        </View>
        <View style={styles.agentStatusInfo}>
          <Text style={styles.agentStatusTitle}>Agent Robin: Idle</Text>
          <Text style={styles.agentStatusDesc}>Ready to manage appointments or pre-fill medical forms.</Text>
        </View>
      </View>

      {/* Care Gaps Summary Banner */}
      {careGaps.filter(g => g.status === "due").length > 0 && (
        <TouchableOpacity style={styles.careGapsBanner} onPress={() => onNavigate("ehr")}>
          <Text style={styles.careGapsBannerIcon}>⚠️</Text>
          <View style={styles.careGapsBannerInfo}>
            <Text style={styles.careGapsBannerTitle}>
              {careGaps.filter(g => g.status === "due").length} Care Gaps Due / Overdue
            </Text>
            <Text style={styles.careGapsBannerDesc}>
              HEDIS guidelines show outstanding screenings. Tap to review.
            </Text>
          </View>
        </TouchableOpacity>
      )}

      {/* Next Appointment Card */}
      <Text style={styles.sectionTitle}>Upcoming Event</Text>
      {nextAppointment ? (
        <LinearGradient
          colors={["#16223F", "#0F1A30"]}
          style={styles.appointmentCard}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.apptHeader}>
            <View style={styles.badgeScheduled}>
              <Text style={styles.badgeScheduledText}>Confirmed</Text>
            </View>
            <Text style={styles.apptDate}>
              {new Date(nextAppointment.time_slot).toLocaleDateString("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
              })} at {new Date(nextAppointment.time_slot).toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
              })}
            </Text>
          </View>
          <Text style={styles.apptPhysician}>{nextAppointment.physician_name}</Text>
          <Text style={styles.apptSpecialty}>{nextAppointment.physician_specialty}</Text>
          <View style={styles.apptDivider} />
          <Text style={styles.apptReasonLabel}>Reason for visit</Text>
          <Text style={styles.apptReason}>{nextAppointment.reason}</Text>
        </LinearGradient>
      ) : (
        <TouchableOpacity style={styles.noApptCard} onPress={() => onNavigate("simulator")}>
          <Text style={styles.noApptText}>No upcoming appointments scheduled.</Text>
          <Text style={styles.noApptAction}>Tap to have Robin call a physician office</Text>
        </TouchableOpacity>
      )}

      {/* Smart Health Insights (Wearables & Medication Refills) */}
      <Text style={styles.sectionTitle}>Smart Health Insights</Text>
      <View style={styles.insightsContainer}>
        {/* Wearables Card */}
        {habits && (
          <LinearGradient
            colors={["rgba(59, 130, 246, 0.08)", "rgba(59, 130, 246, 0.02)"]}
            style={styles.insightCard}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <View style={styles.insightHeader}>
              <Text style={styles.insightIcon}>⌚</Text>
              <Text style={styles.insightHeaderTitle}>Wearable Trends</Text>
              <View style={styles.badgeGarmin}>
                <Text style={styles.badgeGarminText}>Garmin</Text>
              </View>
            </View>
            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{habits.resting_hr_average} <Text style={styles.statUnit}>bpm</Text></Text>
                <Text style={styles.statLabel}>Resting HR</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{habits.steps_average.toLocaleString()} <Text style={styles.statUnit}>/day</Text></Text>
                <Text style={styles.statLabel}>Avg Steps</Text>
              </View>
            </View>
            <Text style={styles.trendDesc}>{habits.trend_summary}</Text>
          </LinearGradient>
        )}

        {/* Refills Card */}
        {refills && refills.refills && refills.refills.length > 0 && (
          <LinearGradient
            colors={["rgba(16, 185, 129, 0.08)", "rgba(16, 185, 129, 0.02)"]}
            style={[styles.insightCard, { marginTop: 15 }]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <View style={styles.insightHeader}>
              <Text style={styles.insightIcon}>💊</Text>
              <Text style={styles.insightHeaderTitle}>Prescription Refills</Text>
              {refills.refills.some((r: any) => r.status === "due") && (
                <View style={styles.badgeRefillDue}>
                  <Text style={styles.badgeRefillDueText}>Action Required</Text>
                </View>
              )}
            </View>
            <View style={styles.refillList}>
              {refills.refills.map((refill: any, idx: number) => (
                <View key={idx} style={styles.refillItem}>
                  <View style={styles.refillLeft}>
                    <Text style={styles.refillMedName}>{refill.medication_name}</Text>
                    <Text style={styles.refillDetails}>{refill.dosage} • {refill.frequency}</Text>
                  </View>
                  <View style={styles.refillRight}>
                    <Text style={[
                      styles.refillStatusText, 
                      { color: refill.status === "due" ? Theme.colors.error : Theme.colors.primary }
                    ]}>
                      {refill.days_remaining} days left
                    </Text>
                    <Text style={styles.refillStatusLabel}>
                      {refill.status === "due" ? "Refill needed" : "In stock"}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </LinearGradient>
        )}
      </View>

      {/* Quick Action Hub */}
      <Text style={styles.sectionTitle}>Care Coordination Actions</Text>
      <View style={styles.grid}>
        <TouchableOpacity style={styles.gridCard} onPress={() => onNavigate("simulator")}>
          <Text style={styles.gridIcon}>📞</Text>
          <Text style={styles.gridTitle}>Schedule Call</Text>
          <Text style={styles.gridDesc}>Trigger Robin to negotiate doctor appointments</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.gridCard} onPress={() => onNavigate("forms")}>
          <Text style={styles.gridIcon}>📝</Text>
          <Text style={styles.gridTitle}>Autofill Forms</Text>
          <Text style={styles.gridDesc}>Intake, HIPAA, & consent documents</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.gridCard} onPress={() => onNavigate("ehr")}>
          <Text style={styles.gridIcon}>📂</Text>
          <Text style={styles.gridTitle}>Sync EHR Records</Text>
          <Text style={styles.gridDesc}>Upload documents and view parsed data</Text>
        </TouchableOpacity>
      </View>

      {/* Health Profile Overview */}
      <Text style={styles.sectionTitle}>EHR Quick View</Text>
      <View style={styles.ehrSummaryCard}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Active Conditions</Text>
          <View style={styles.tagContainer}>
            {patient?.conditions ? jsonParse(patient.conditions).map((cond: string, index: number) => (
              <View key={index} style={styles.tagCondition}>
                <Text style={styles.tagText}>{cond}</Text>
              </View>
            )) : <Text style={styles.noTagText}>None listed</Text>}
          </View>
        </View>

        <View style={styles.summaryDivider} />

        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Allergies</Text>
          <View style={styles.tagContainer}>
            {patient?.allergies ? jsonParse(patient.allergies).map((allergy: string, index: number) => (
              <View key={index} style={[styles.tagCondition, { backgroundColor: "rgba(239, 68, 68, 0.15)", borderColor: "rgba(239, 68, 68, 0.3)" }]}>
                <Text style={[styles.tagText, { color: Theme.colors.error }]}>{allergy}</Text>
              </View>
            )) : <Text style={styles.noTagText}>None listed</Text>}
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

// Small helper to deal with array representations
function jsonParse(val: any) {
  if (typeof val === "string") {
    try {
      return JSON.parse(val);
    } catch {
      return [];
    }
  }
  return val || [];
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.colors.background,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: Theme.colors.background,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    color: Theme.colors.textSecondary,
    marginTop: 15,
    fontSize: 16,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 40,
    marginBottom: 25,
  },
  greeting: {
    color: Theme.colors.textSecondary,
    fontSize: 18,
  },
  patientName: {
    color: Theme.colors.textPrimary,
    fontSize: 26,
    fontWeight: "bold",
  },
  avatarGlow: {
    padding: 2,
    borderRadius: 25,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#161E2E",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    color: Theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: "bold",
  },
  errorCard: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderColor: "rgba(239, 68, 68, 0.2)",
    borderWidth: 1,
    borderRadius: 12,
    padding: 15,
    marginBottom: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  errorText: {
    color: Theme.colors.error,
    fontSize: 14,
    flex: 1,
  },
  retryButton: {
    backgroundColor: Theme.colors.error,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  retryButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "bold",
  },
  agentStatusCard: {
    flexDirection: "row",
    backgroundColor: Theme.colors.surfaceGlass,
    borderColor: Theme.colors.surfaceGlassBorder,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
    marginBottom: 25,
  },
  pulseContainer: {
    width: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  pulseOutline: {
    position: "absolute",
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Theme.colors.primary,
    opacity: 0.2,
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Theme.colors.primary,
  },
  agentStatusInfo: {
    flex: 1,
  },
  agentStatusTitle: {
    color: Theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: "600",
  },
  agentStatusDesc: {
    color: Theme.colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  sectionTitle: {
    color: Theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 15,
    marginTop: 10,
  },
  appointmentCard: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 25,
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderWidth: 1,
  },
  apptHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  badgeScheduled: {
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    borderColor: "rgba(16, 185, 129, 0.3)",
    borderWidth: 1,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  badgeScheduledText: {
    color: Theme.colors.primary,
    fontSize: 11,
    fontWeight: "bold",
  },
  apptDate: {
    color: Theme.colors.primary,
    fontSize: 14,
    fontWeight: "600",
  },
  apptPhysician: {
    color: Theme.colors.textPrimary,
    fontSize: 20,
    fontWeight: "bold",
  },
  apptSpecialty: {
    color: Theme.colors.textSecondary,
    fontSize: 14,
    marginTop: 2,
    marginBottom: 15,
  },
  apptDivider: {
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    marginBottom: 12,
  },
  apptReasonLabel: {
    color: Theme.colors.textMuted,
    fontSize: 11,
    textTransform: "uppercase",
    fontWeight: "600",
  },
  apptReason: {
    color: Theme.colors.textPrimary,
    fontSize: 14,
    marginTop: 4,
  },
  noApptCard: {
    backgroundColor: Theme.colors.surfaceGlass,
    borderColor: Theme.colors.surfaceGlassBorder,
    borderWidth: 1,
    borderRadius: 16,
    padding: 25,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 25,
    borderStyle: "dashed",
  },
  noApptText: {
    color: Theme.colors.textSecondary,
    fontSize: 15,
    textAlign: "center",
  },
  noApptAction: {
    color: Theme.colors.secondary,
    fontSize: 13,
    fontWeight: "600",
    marginTop: 8,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: 25,
  },
  gridCard: {
    width: "48%",
    backgroundColor: Theme.colors.surfaceGlass,
    borderColor: Theme.colors.surfaceGlassBorder,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 15,
  },
  gridIcon: {
    fontSize: 24,
    marginBottom: 10,
  },
  gridTitle: {
    color: Theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: "bold",
  },
  gridDesc: {
    color: Theme.colors.textMuted,
    fontSize: 11,
    marginTop: 4,
    lineHeight: 14,
  },
  ehrSummaryCard: {
    backgroundColor: Theme.colors.surfaceGlass,
    borderColor: Theme.colors.surfaceGlassBorder,
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  summaryItem: {
    marginBottom: 15,
  },
  summaryLabel: {
    color: Theme.colors.textSecondary,
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 10,
  },
  tagContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  tagCondition: {
    backgroundColor: "rgba(59, 130, 246, 0.15)",
    borderColor: "rgba(59, 130, 246, 0.3)",
    borderWidth: 1,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginRight: 8,
    marginBottom: 8,
  },
  tagText: {
    color: Theme.colors.secondary,
    fontSize: 12,
    fontWeight: "500",
  },
  noTagText: {
    color: Theme.colors.textMuted,
    fontSize: 13,
    fontStyle: "italic",
  },
  summaryDivider: {
    height: 1,
    backgroundColor: Theme.colors.divider,
    marginVertical: 10,
  },
  careGapsBanner: {
    flexDirection: "row",
    backgroundColor: "rgba(245, 158, 11, 0.1)",
    borderColor: "rgba(245, 158, 11, 0.3)",
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
    marginBottom: 25,
  },
  careGapsBannerIcon: {
    fontSize: 24,
    marginRight: 15,
  },
  careGapsBannerInfo: {
    flex: 1,
  },
  careGapsBannerTitle: {
    color: Theme.colors.warning,
    fontSize: 15,
    fontWeight: "bold",
  },
  careGapsBannerDesc: {
    color: Theme.colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  insightsContainer: {
    marginBottom: 25,
  },
  insightCard: {
    borderColor: Theme.colors.surfaceGlassBorder,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
  },
  insightHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 15,
  },
  insightIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  insightHeaderTitle: {
    color: Theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: "bold",
    flex: 1,
  },
  badgeGarmin: {
    backgroundColor: "rgba(59, 130, 246, 0.15)",
    borderColor: "rgba(59, 130, 246, 0.3)",
    borderWidth: 1,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  badgeGarminText: {
    color: Theme.colors.secondary,
    fontSize: 10,
    fontWeight: "bold",
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    backgroundColor: "rgba(255, 255, 255, 0.02)",
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 12,
  },
  statBox: {
    alignItems: "center",
  },
  statValue: {
    color: Theme.colors.textPrimary,
    fontSize: 20,
    fontWeight: "bold",
  },
  statUnit: {
    fontSize: 12,
    color: Theme.colors.textSecondary,
    fontWeight: "normal",
  },
  statLabel: {
    color: Theme.colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: Theme.colors.divider,
  },
  trendDesc: {
    color: Theme.colors.textSecondary,
    fontSize: 12,
    lineHeight: 16,
  },
  badgeRefillDue: {
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    borderColor: "rgba(239, 68, 68, 0.3)",
    borderWidth: 1,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  badgeRefillDueText: {
    color: Theme.colors.error,
    fontSize: 10,
    fontWeight: "bold",
  },
  refillList: {
    marginTop: 5,
  },
  refillItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.04)",
  },
  refillLeft: {
    flex: 1,
  },
  refillRight: {
    alignItems: "flex-end",
  },
  refillMedName: {
    color: Theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: "600",
  },
  refillDetails: {
    color: Theme.colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  refillStatusText: {
    fontSize: 13,
    fontWeight: "bold",
  },
  refillStatusLabel: {
    color: Theme.colors.textMuted,
    fontSize: 10,
    marginTop: 2,
  },
});
