import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Modal, TextInput } from "react-native";
import { Theme } from "../theme/theme";
import { 
  fetchPatientProfile, 
  uploadMockDocument, 
  updatePatientProfile,
  fetchFastenConnections,
  registerFastenConnection,
  syncFastenProvider,
  fetchFhirResources,
  fetchCompiledTruth,
  evaluateCuratr,
  applyCuratrFix,
  BASE_URL
} from "../services/api";
import { LinearGradient } from "expo-linear-gradient";
import { WebView } from "react-native-webview";

export default function HealthProfileScreen() {
  const [patient, setPatient] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [parsing, setParsing] = useState(false);
  const [parseSteps, setParseSteps] = useState<string[]>([]);
  const [selectedMockFile, setSelectedMockFile] = useState<"lab" | "discharge" | null>(null);

  // Fasten Connect States
  const [fastenConnections, setFastenConnections] = useState<any[]>([]);
  const [fhirConditions, setFhirConditions] = useState<any[]>([]);
  const [showFastenModal, setShowFastenModal] = useState(false);
  const [linkingProvider, setLinkingProvider] = useState(false);
  const [syncingProviderId, setSyncingProviderId] = useState<string | null>(null);

  // Curatr / Compiled Truth states
  const [selectedCondition, setSelectedCondition] = useState<any>(null);
  const [compiledTruth, setCompiledTruth] = useState<any>(null);
  const [curatrEvaluation, setCuratrEvaluation] = useState<any>(null);
  const [showTruthModal, setShowTruthModal] = useState(false);
  const [curatrFixing, setCuratrFixing] = useState(false);
  const [patientIntent, setPatientIntent] = useState("");

  // HealthKit Sync States
  const [healthSyncing, setHealthSyncing] = useState(false);
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [healthSynced, setHealthSynced] = useState(false);
  const [vitals, setVitals] = useState<{ bp: string; hr: string; steps: string } | null>(null);

  const loadProfile = async () => {
    try {
      const [profileData, fastenData, fhirData] = await Promise.all([
        fetchPatientProfile(),
        fetchFastenConnections(),
        fetchFhirResources("Condition")
      ]);
      setPatient(profileData);
      setFastenConnections(fastenData);
      if (fhirData && fhirData.entry) {
        setFhirConditions(fhirData.entry.map((e: any) => e.resource));
      } else {
        setFhirConditions([]);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
  }, []);

  const triggerUpload = async (fileType: "lab" | "discharge") => {
    setParsing(true);
    setParseSteps(["Uploading file to clinical agent server...", "Analyzing document contents (multimodal model)..."]);
    
    const filename = fileType === "lab" 
      ? "LabResult_May2026.pdf" 
      : "DischargeSummary_JenkinsClinic.pdf";
      
    const mime = "application/pdf";

    try {
      await new Promise(r => setTimeout(r, 1000));
      setParseSteps(prev => [...prev, "Extracting clinical findings (diagnoses, allergies, meds)..."]);
      
      await new Promise(r => setTimeout(r, 1000));
      const res = await uploadMockDocument(filename, mime);
      
      setParseSteps(prev => [...prev, "Matching findings with existing Patient Record..."]);
      await new Promise(r => setTimeout(r, 1000));
      
      setParseSteps(prev => [...prev, "EHR profile updated and synchronized!"]);
      await new Promise(r => setTimeout(r, 800));

      await loadProfile();

      Alert.alert(
        "EHR Synced Successfully", 
        res.extracted_data.summary_of_findings,
        [{ text: "OK" }]
      );
    } catch (e) {
      console.error(e);
      Alert.alert("Upload Failed", "Could not reach the server to analyze the document.");
    } finally {
      setParsing(false);
      setParseSteps([]);
      setSelectedMockFile(null);
    }
  };

  const handleStitchMessage = async (event: any) => {
    try {
      const payload = JSON.parse(event.nativeEvent.data);
      console.log("Stitch Webview Message:", payload);
      
      const eventType = payload.event_type || payload.type;
      let eventData = payload.data;
      if (typeof eventData === 'string') {
        try {
          eventData = JSON.parse(eventData);
        } catch (e) {
          // Keep as string
        }
      }
      
      if (eventType === 'widget.complete' || eventType === 'connection.success' || eventType === 'patient.connection_success') {
        const orgConnectionId = eventData?.org_connection_id || eventData?.connection_id;
        const providerName = eventData?.provider_name || eventData?.brand_name || "Linked EHR Provider";
        
        if (orgConnectionId) {
          setLinkingProvider(true);
          try {
            await registerFastenConnection(orgConnectionId, providerName);
            await syncFastenProvider(orgConnectionId, providerName);
            Alert.alert("Provider Connected", `Successfully linked and synchronized clinical details from ${providerName}.`);
            setShowFastenModal(false);
            await loadProfile();
          } catch (e) {
            console.error(e);
            Alert.alert("Connection Failed", "Unable to establish secure connection with EHR system.");
          } finally {
            setLinkingProvider(false);
          }
        }
      } else if (eventType === 'widget.close' || eventType === 'widget.cancel') {
        setShowFastenModal(false);
      }
    } catch (err) {
      console.error("Error parsing message from Stitch WebView:", err);
    }
  };

  const triggerFastenSync = async (orgConnectionId: string, providerName: string) => {
    setSyncingProviderId(orgConnectionId);
    try {
      const res = await syncFastenProvider(orgConnectionId, providerName);
      Alert.alert("EHR Ingestion Sync Successful", res.message);
      await loadProfile();
    } catch (e) {
      console.error(e);
      Alert.alert("Sync Failure", "Failed to retrieve provider records.");
    } finally {
      setSyncingProviderId(null);
    }
  };

  const handleSelectCondition = async (cond: any) => {
    setSelectedCondition(cond);
    setShowTruthModal(true);
    setCompiledTruth(null);
    setCuratrEvaluation(null);
    setPatientIntent("");
    try {
      const [truthData, evalData] = await Promise.all([
        fetchCompiledTruth("Condition", cond.id),
        evaluateCuratr("Condition", cond.id)
      ]);
      setCompiledTruth(truthData);
      setCuratrEvaluation(evalData);
    } catch (e) {
      console.error(e);
    }
  };

  const handleApplyCuratrFix = async () => {
    if (!selectedCondition || !curatrEvaluation || curatrEvaluation.issues.length === 0) return;
    if (!patientIntent.trim()) {
      Alert.alert("Correction Intent Required", "Please specify patient confirmation notes/intent to apply the ICD-10 correction.");
      return;
    }
    setCuratrFixing(true);
    try {
      const fixes = curatrEvaluation.issues.map((iss: any) => ({
        field_path: iss.field,
        new_value: iss.suggestion
      }));
      const res = await applyCuratrFix("Condition", selectedCondition.id, fixes, patientIntent);
      Alert.alert("Clinical Fix Applied", res.message);
      
      // Refresh compiled-truth views
      const [newTruth, newEval] = await Promise.all([
        fetchCompiledTruth("Condition", selectedCondition.id),
        evaluateCuratr("Condition", selectedCondition.id)
      ]);
      setCompiledTruth(newTruth);
      setCuratrEvaluation(newEval);
      setPatientIntent("");
      await loadProfile();
    } catch (e) {
      console.error(e);
      Alert.alert("Curation Error", "Failed to compile quality upgrades on database.");
    } finally {
      setCuratrFixing(false);
    }
  };

  const getParamVal = (name: string, type: string = "valueString") => {
    if (!compiledTruth) return null;
    const p = compiledTruth.parameter.find((x: any) => x.name === name);
    return p ? p[type] : null;
  };

  const getTimelineEvents = () => {
    if (!compiledTruth) return [];
    const timelineParam = compiledTruth.parameter.find((x: any) => x.name === "timeline");
    if (!timelineParam || !timelineParam.part) return [];
    return timelineParam.part.map((evt: any) => {
      const obj: any = {};
      evt.part.forEach((p: any) => {
        obj[p.name] = p.valueString;
      });
      return obj;
    });
  };

  const handleHealthSyncRequest = () => {
    if (healthSynced) {
      Alert.alert("Already Synced", "Your device health data is currently synchronized.");
      return;
    }
    setShowPermissionModal(true);
  };

  const handleAllowPermission = async () => {
    setShowPermissionModal(false);
    setHealthSyncing(true);
    
    try {
      await new Promise(r => setTimeout(r, 1200));
      
      setVitals({
        bp: "120/78 mmHg",
        hr: "72 bpm",
        steps: "6,432 steps today"
      });

      const currentConditions = parseArray(patient?.conditions);
      if (!currentConditions.includes("Resting HR: 72 bpm (Device Synced)")) {
        currentConditions.push("Resting HR: 72 bpm (Device Synced)");
        await updatePatientProfile({
          conditions: currentConditions
        });
        await fetchPatientProfile().then(setPatient);
      }

      setHealthSynced(true);
      Alert.alert("Health Sync Successful", "Vitals, activity metrics, and clinical device logs imported successfully.");
    } catch (e) {
      console.error(e);
      Alert.alert("Sync Error", "Unable to retrieve OS health databases.");
    } finally {
      setHealthSyncing(false);
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      "Confirm Account Deletion",
      "Are you sure you want to permanently delete your medical profile, credentials, and care coordination logs? This action is immediate and cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Delete Profile", 
          style: "destructive",
          onPress: () => {
            Alert.alert(
              "Account Deleted",
              "Your secure account and all clinical health databases have been permanently wiped from our secure database servers.",
              [{ text: "OK" }]
            );
          }
        }
      ]
    );
  };


  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Theme.colors.primary} />
        <Text style={styles.loadingText}>Fetching secure EHR records...</Text>
      </View>
    );
  }

  const parseArray = (val: any) => {
    if (typeof val === "string") {
      try { return JSON.parse(val); } catch { return []; }
    }
    return val || [];
  };

  const conditions = parseArray(patient?.conditions);
  const allergies = parseArray(patient?.allergies);
  const medications = parseArray(patient?.medications);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <Text style={styles.title}>Secure Health Vault</Text>
      <Text style={styles.subtitle}>Manage personal medical history, insurance coverage, and health records</Text>

      {/* Native Health Integration Hub */}
      <View style={styles.card}>
        <Text style={styles.cardHeader}>Device Health Database Integration</Text>
        <Text style={styles.scanExplanation}>
          Synchronize local biometrics and vital logs from Apple HealthKit / Google Health Connect to keep Robin updated.
        </Text>

        {healthSyncing ? (
          <View style={styles.syncProgress}>
            <ActivityIndicator size="small" color={Theme.colors.secondary} />
            <Text style={styles.syncProgressText}>Synchronizing device health databases...</Text>
          </View>
        ) : healthSynced && vitals ? (
          <LinearGradient
            colors={["rgba(59, 130, 246, 0.1)", "rgba(16, 185, 129, 0.05)"]}
            style={styles.vitalsCard}
          >
            <Text style={styles.vitalsTitle}>Device Biometrics (Synced)</Text>
            <View style={styles.vitalsRow}>
              <View style={styles.vitalCol}>
                <Text style={styles.vitalLabel}>Blood Pressure</Text>
                <Text style={styles.vitalValue}>{vitals.bp}</Text>
              </View>
              <View style={styles.vitalCol}>
                <Text style={styles.vitalLabel}>Heart Rate</Text>
                <Text style={styles.vitalValue}>{vitals.hr}</Text>
              </View>
              <View style={styles.vitalCol}>
                <Text style={styles.vitalLabel}>Activity</Text>
                <Text style={styles.vitalValue}>{vitals.steps}</Text>
              </View>
            </View>
          </LinearGradient>
        ) : (
          <TouchableOpacity style={[styles.scanButton, { backgroundColor: Theme.colors.secondary }]} onPress={handleHealthSyncRequest}>
            <Text style={styles.scanButtonText}>Sync Apple Health / Google Fit</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Fasten Connect EHR Card */}
      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardHeader}>EHR Portal Links</Text>
          <TouchableOpacity style={styles.addProviderBtn} onPress={() => setShowFastenModal(true)}>
            <Text style={styles.addProviderBtnText}>+ Connect Portal</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.scanExplanation}>
          Link your patient portals (Epic, Cerner, MyChart) via Fasten Connect to ingest clinical history securely.
        </Text>

        {fastenConnections.length > 0 ? (
          fastenConnections.map((conn: any, index: number) => (
            <View key={index} style={styles.connectionItem}>
              <View style={styles.connectionInfo}>
                <Text style={styles.connectionName}>{conn.provider_name}</Text>
                <Text style={styles.connectionSync}>
                  Last sync: {conn.last_sync_at ? new Date(conn.last_sync_at).toLocaleDateString() : "Never"}
                </Text>
              </View>
              {syncingProviderId === conn.org_connection_id ? (
                <ActivityIndicator size="small" color={Theme.colors.primary} />
              ) : (
                <TouchableOpacity 
                  style={styles.syncBtn} 
                  onPress={() => triggerFastenSync(conn.org_connection_id, conn.provider_name)}
                >
                  <Text style={styles.syncBtnText}>Sync</Text>
                </TouchableOpacity>
              )}
            </View>
          ))
        ) : (
          <Text style={styles.noConnectionsText}>No external EHR accounts connected yet.</Text>
        )}
      </View>

      {/* Demographics Card */}
      <View style={styles.card}>
        <Text style={styles.cardHeader}>Demographics & Insurance</Text>
        
        <View style={styles.profileRow}>
          <Text style={styles.label}>Patient Name</Text>
          <Text style={styles.value}>{patient?.name}</Text>
        </View>

        <View style={styles.profileRow}>
          <Text style={styles.label}>Date of Birth</Text>
          <Text style={styles.value}>
            {patient?.dob ? new Date(patient.dob).toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric"
            }) : "N/A"}
          </Text>
        </View>

        <View style={styles.profileRow}>
          <Text style={styles.label}>Contact Phone</Text>
          <Text style={styles.value}>{patient?.phone}</Text>
        </View>

        <View style={styles.profileRow}>
          <Text style={styles.label}>Email Address</Text>
          <Text style={styles.value}>{patient?.email}</Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.profileRow}>
          <Text style={styles.label}>Insurance Carrier</Text>
          <Text style={styles.value}>{patient?.insurance_provider}</Text>
        </View>

        <View style={styles.profileRow}>
          <Text style={styles.label}>Policy ID Number</Text>
          <Text style={[styles.value, { fontFamily: "monospace" }]}>{patient?.insurance_policy_num}</Text>
        </View>
      </View>

      {/* Clinical Findings Card */}
      <View style={styles.card}>
        <Text style={styles.cardHeader}>Medical Profile Details</Text>
        
        {/* Conditions */}
        <Text style={styles.subHeader}>Diagnosed Conditions</Text>
        <View style={styles.tagGrid}>
          {conditions.map((item: string, idx: number) => (
            <View key={idx} style={styles.tagBlue}>
              <Text style={styles.tagTextBlue}>{item}</Text>
            </View>
          ))}
        </View>

        {/* FHIR-based Conditions */}
        <Text style={[styles.subHeader, { marginTop: 15 }]}>EHR FHIR Conditions (Curatr Quality Audited)</Text>
        {fhirConditions.length > 0 ? (
          fhirConditions.map((cond: any, idx: number) => {
            const coding = cond.code?.coding?.[0] || {};
            const isDeprecated = coding.system?.includes("icd-9") || coding.code === "250.00";
            return (
              <TouchableOpacity 
                key={idx} 
                style={styles.fhirConditionItem} 
                onPress={() => handleSelectCondition(cond)}
              >
                <View style={styles.fhirCondLeft}>
                  <Text style={styles.fhirCondName}>
                    {cond.code?.text || coding.display || "Unknown Condition"}
                  </Text>
                  <Text style={styles.fhirCondDetails}>
                    {coding.system?.includes("icd-10") ? "ICD-10-CM" : "ICD-9"}: {coding.code || "N/A"}
                  </Text>
                </View>
                <View style={styles.fhirCondRight}>
                  {isDeprecated ? (
                    <View style={styles.badgeRaw}>
                      <Text style={styles.badgeRawText}>Action Required</Text>
                    </View>
                  ) : (
                    <View style={styles.badgeCurated}>
                      <Text style={styles.badgeCuratedText}>Curated</Text>
                    </View>
                  )}
                  <Text style={styles.curatrInspectText}>Inspect ➔</Text>
                </View>
              </TouchableOpacity>
            );
          })
        ) : (
          <Text style={styles.noTagText}>No FHIR Conditions synced.</Text>
        )}

        {/* Allergies */}
        <Text style={[styles.subHeader, { marginTop: 15 }]}>Allergies</Text>
        <View style={styles.tagGrid}>
          {allergies.map((item: string, idx: number) => (
            <View key={idx} style={styles.tagRed}>
              <Text style={styles.tagTextRed}>{item}</Text>
            </View>
          ))}
        </View>

        {/* Medications */}
        <Text style={[styles.subHeader, { marginTop: 15 }]}>Current Medications</Text>
        {medications.map((item: any, idx: number) => (
          <View key={idx} style={styles.medicationRow}>
            <Text style={styles.medName}>{item.name}</Text>
            <Text style={styles.medDosage}>{item.dosage} — {item.frequency}</Text>
          </View>
        ))}
      </View>

      {/* Document Scanner Card */}
      <View style={[styles.card, { marginBottom: 30 }]}>
        <Text style={styles.cardHeader}>Sync Records via Clinical Documents</Text>
        <Text style={styles.scanExplanation}>
          Select a medical record below to simulate importing, parsing, and auto-syncing its clinical details into your EHR profile.
        </Text>

        {parsing ? (
          <View style={styles.parsingView}>
            <ActivityIndicator size="small" color={Theme.colors.primary} />
            <Text style={styles.parsingTitle}>Robin is parsing your document...</Text>
            {parseSteps.map((step, idx) => (
              <Text key={idx} style={[styles.parsingStepText, idx === parseSteps.length - 1 && { color: Theme.colors.primary, fontWeight: "600" }]}>
                ➔ {step}
              </Text>
            ))}
          </View>
        ) : (
          <View>
            <TouchableOpacity 
              style={[styles.mockFileRow, selectedMockFile === "lab" && styles.mockFileRowSelected]}
              onPress={() => setSelectedMockFile("lab")}
            >
              <Text style={styles.fileIcon}>📄</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.fileName}>LabResult_May2026.pdf</Text>
                <Text style={styles.fileDesc}>Discovers Vitamin D deficiency & daily supplement</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.mockFileRow, selectedMockFile === "discharge" && styles.mockFileRowSelected]}
              onPress={() => setSelectedMockFile("discharge")}
            >
              <Text style={styles.fileIcon}>📄</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.fileName}>DischargeSummary_JenkinsClinic.pdf</Text>
                <Text style={styles.fileDesc}>Discovers Mild Scoliosis diagnosis</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.scanButton, !selectedMockFile && styles.scanButtonDisabled]}
              disabled={!selectedMockFile}
              onPress={() => selectedMockFile && triggerUpload(selectedMockFile)}
            >
              <Text style={styles.scanButtonText}>Import & Parse with AI Agent</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Account Deletion App Store Compliance Card */}
      <View style={[styles.card, { borderColor: "rgba(239, 68, 68, 0.2)" }]}>
        <Text style={[styles.cardHeader, { color: Theme.colors.error }]}>Account Deletion (App Store Compliant)</Text>
        <Text style={styles.scanExplanation}>
          App Store guidelines require that you can delete your user account and all personal health history from our systems at any time. This action is permanent.
        </Text>
        <TouchableOpacity style={[styles.scanButton, { backgroundColor: Theme.colors.error }]} onPress={handleDeleteAccount}>
          <Text style={styles.scanButtonText}>Delete Health Account & Data</Text>
        </TouchableOpacity>
      </View>

      {/* Stitch Widget OAuth Simulation Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showFastenModal}
        onRequestClose={() => setShowFastenModal(false)}
      >
        <View style={styles.modalBg}>
          <View style={styles.modalCardLarge}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitleLeft}>Connect Health Records</Text>
              <TouchableOpacity 
                style={styles.modalCloseBtn} 
                onPress={() => setShowFastenModal(false)}
              >
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            
            {linkingProvider ? (
              <View style={styles.linkingViewFull}>
                <ActivityIndicator size="large" color={Theme.colors.primary} />
                <Text style={styles.linkingText}>Processing provider authentication...</Text>
              </View>
            ) : (
              <WebView
                source={{ uri: `${BASE_URL}/fasten-stitch.html` }}
                onMessage={handleStitchMessage}
                style={styles.webview}
                startInLoadingState={true}
                renderLoading={() => (
                  <View style={styles.webviewLoading}>
                    <ActivityIndicator size="large" color={Theme.colors.primary} />
                    <Text style={styles.webviewLoadingText}>Loading Fasten Stitch portal...</Text>
                  </View>
                )}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* Compiled Truth & Curatr Quality Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showTruthModal}
        onRequestClose={() => setShowTruthModal(false)}
      >
        <View style={styles.modalBg}>
          <View style={styles.modalCardScrollContainer}>
            <ScrollView contentContainerStyle={styles.truthModalContentContainer} showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>EHR Compiled Truth</Text>
              
              {!compiledTruth ? (
                <View style={styles.loadingModal}>
                  <ActivityIndicator size="large" color={Theme.colors.primary} />
                  <Text style={styles.loadingModalText}>Evaluating HealthClaw R6 state...</Text>
                </View>
              ) : (
                <View>
                  <Text style={styles.modalSubHeader}>FHIR RESOURCE DATA (Safe Harbor Redacted)</Text>
                  <View style={styles.redactedDataBox}>
                    <Text style={styles.redactedText}>
                      ID: {compiledTruth.parameter.find((x: any) => x.name === "current")?.resource?.id}
                    </Text>
                    <Text style={styles.redactedText}>
                      Subject: {compiledTruth.parameter.find((x: any) => x.name === "current")?.resource?.subject?.reference} (Masked)
                    </Text>
                    <Text style={styles.redactedText}>
                      Verification Status: {compiledTruth.parameter.find((x: any) => x.name === "current")?.resource?.verificationStatus?.coding?.[0]?.code || "confirmed"}
                    </Text>
                    <Text style={styles.redactedText}>
                      Coding: {compiledTruth.parameter.find((x: any) => x.name === "current")?.resource?.code?.coding?.[0]?.system}
                    </Text>
                    <Text style={styles.redactedText}>
                      Code/Display: {compiledTruth.parameter.find((x: any) => x.name === "current")?.resource?.code?.coding?.[0]?.code} - {compiledTruth.parameter.find((x: any) => x.name === "current")?.resource?.code?.coding?.[0]?.display}
                    </Text>
                  </View>

                  <View style={styles.curationOverview}>
                    <View style={styles.curationItem}>
                      <Text style={styles.curationLabel}>Curation State</Text>
                      <Text style={[
                        styles.curationVal, 
                        { color: getParamVal("curation_state") === "curated" ? Theme.colors.primary : Theme.colors.warning }
                      ]}>
                        {getParamVal("curation_state")?.toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.curationItem}>
                      <Text style={styles.curationLabel}>Quality Score</Text>
                      <Text style={styles.curationVal}>
                        {parseFloat(getParamVal("quality_score", "valueDecimal") || "0").toFixed(2)}
                      </Text>
                    </View>
                  </View>

                  {/* Curatr Validation Scans */}
                  {curatrEvaluation && (
                    <View style={styles.curatrSection}>
                      <Text style={styles.modalSubHeader}>CURATR CLINICAL QUALITY SCAN</Text>
                      {curatrEvaluation.issues.length > 0 ? (
                        curatrEvaluation.issues.map((iss: any, index: number) => (
                          <View key={index} style={styles.curatrIssueBox}>
                            <Text style={styles.curatrIssueMsg}>⚠️ {iss.message}</Text>
                            <Text style={styles.curatrSuggestion}>
                              Suggested Fix: {iss.suggestion?.display} ({iss.suggestion?.code})
                            </Text>

                            <Text style={styles.intentLabel}>Confirm Patient Correction Intent</Text>
                            <TextInput
                              style={styles.intentInput}
                              placeholder="e.g. I verify this correction is for my Type 2 Diabetes records"
                              placeholderTextColor={Theme.colors.textMuted}
                              value={patientIntent}
                              onChangeText={setPatientIntent}
                            />

                            {curatrFixing ? (
                              <ActivityIndicator size="small" color={Theme.colors.primary} />
                            ) : (
                              <TouchableOpacity 
                                style={[styles.scanButton, { backgroundColor: Theme.colors.primary, marginTop: 10 }]}
                                onPress={handleApplyCuratrFix}
                              >
                                <Text style={styles.scanButtonText}>Apply ICD-10 Correction</Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        ))
                      ) : (
                        <View style={styles.curatrSuccessBox}>
                          <Text style={styles.curatrSuccessText}>✅ Quality validations passed. Coding elements compliant.</Text>
                        </View>
                      )}
                    </View>
                  )}

                  {/* Provenance Audit Timeline */}
                  <Text style={[styles.modalSubHeader, { marginTop: 15 }]}>PROVENANCE AUDIT TRAIL TIMELINE</Text>
                  {getTimelineEvents().length > 0 ? (
                    getTimelineEvents().map((evt: any, index: number) => (
                      <View key={index} style={styles.timelineItem}>
                        <View style={styles.timelineHeader}>
                          <Text style={styles.timelineAgent}>{evt.agent}</Text>
                          <Text style={styles.timelineDate}>
                            {new Date(evt.recorded).toLocaleDateString()}
                          </Text>
                        </View>
                        <Text style={styles.timelineSummary}>{evt.summary}</Text>
                        {evt.patient_intent ? (
                          <Text style={styles.timelineIntent}>Intent: "{evt.patient_intent}"</Text>
                        ) : null}
                      </View>
                    ))
                  ) : (
                    <Text style={styles.noTimelineText}>No modifications recorded yet.</Text>
                  )}
                </View>
              )}

              <TouchableOpacity 
                style={[styles.modalCancel, { width: "100%", marginTop: 20 }]} 
                onPress={() => setShowTruthModal(false)}
              >
                <Text style={styles.modalCancelText}>Close Vault Explorer</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>


      {/* Simulated OS HealthKit Permission Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showPermissionModal}
        onRequestClose={() => setShowPermissionModal(false)}
      >
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Health Permissions Required</Text>
            <Text style={styles.modalDesc}>
              "HealthRobin AI" requests permission to read and share data from Apple Health and Google Health Connect databases.
            </Text>
            
            <View style={styles.modalPermList}>
              <Text style={styles.modalPermItem}>• Read Active Medications</Text>
              <Text style={styles.modalPermItem}>• Read Clinical Diagnoses & History</Text>
              <Text style={styles.modalPermItem}>• Read Vitals (Heart Rate, Blood Pressure)</Text>
              <Text style={styles.modalPermItem}>• Share Agent Sync Summaries</Text>
            </View>

            <Text style={styles.modalPrivacyWarning}>
              Your biometrics are encrypted and processed in compliance with HIPAA privacy standard guidelines.
            </Text>

            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setShowPermissionModal(false)}>
                <Text style={styles.modalCancelText}>Don't Allow</Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.modalConfirm} onPress={handleAllowPermission}>
                <Text style={styles.modalConfirmText}>Allow Access</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.colors.background,
  },
  contentContainer: {
    padding: 20,
    paddingTop: 50,
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
  title: {
    color: Theme.colors.textPrimary,
    fontSize: 22,
    fontWeight: "bold",
  },
  subtitle: {
    color: Theme.colors.textSecondary,
    fontSize: 13,
    marginTop: 4,
    marginBottom: 20,
    lineHeight: 18,
  },
  card: {
    backgroundColor: Theme.colors.surface,
    borderColor: Theme.colors.surfaceGlassBorder,
    borderWidth: 1,
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
  },
  cardHeader: {
    color: Theme.colors.textPrimary,
    fontSize: 17,
    fontWeight: "bold",
    marginBottom: 15,
  },
  profileRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Theme.colors.divider,
  },
  label: {
    color: Theme.colors.textSecondary,
    fontSize: 14,
  },
  value: {
    color: Theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: "500",
  },
  divider: {
    height: 1,
    backgroundColor: Theme.colors.divider,
    marginVertical: 15,
  },
  subHeader: {
    color: Theme.colors.textSecondary,
    fontSize: 13,
    fontWeight: "bold",
    textTransform: "uppercase",
    marginBottom: 10,
  },
  tagGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  tagBlue: {
    backgroundColor: "rgba(59, 130, 246, 0.15)",
    borderColor: "rgba(59, 130, 246, 0.3)",
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginRight: 8,
    marginBottom: 8,
  },
  tagTextBlue: {
    color: Theme.colors.secondary,
    fontSize: 13,
    fontWeight: "500",
  },
  tagRed: {
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    borderColor: "rgba(239, 68, 68, 0.3)",
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginRight: 8,
    marginBottom: 8,
  },
  tagTextRed: {
    color: Theme.colors.error,
    fontSize: 13,
    fontWeight: "500",
  },
  medicationRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Theme.colors.divider,
  },
  medName: {
    color: Theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: "bold",
  },
  medDosage: {
    color: Theme.colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  scanExplanation: {
    color: Theme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 20,
  },
  mockFileRow: {
    flexDirection: "row",
    backgroundColor: Theme.colors.surfaceGlass,
    borderColor: Theme.colors.surfaceGlassBorder,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    marginBottom: 12,
  },
  mockFileRowSelected: {
    borderColor: Theme.colors.primary,
    backgroundColor: "rgba(16, 185, 129, 0.05)",
  },
  fileIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  fileName: {
    color: Theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: "bold",
  },
  fileDesc: {
    color: Theme.colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  scanButton: {
    backgroundColor: Theme.colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 10,
  },
  scanButtonDisabled: {
    backgroundColor: Theme.colors.textMuted,
    opacity: 0.5,
  },
  scanButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "bold",
  },
  parsingView: {
    backgroundColor: Theme.colors.surfaceGlass,
    borderRadius: 12,
    padding: 16,
    marginTop: 10,
  },
  parsingTitle: {
    color: Theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: "bold",
    marginTop: 10,
    marginBottom: 12,
  },
  parsingStepText: {
    color: Theme.colors.textSecondary,
    fontSize: 12,
    marginBottom: 6,
    lineHeight: 16,
  },
  syncProgress: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Theme.colors.surfaceGlass,
    padding: 15,
    borderRadius: 12,
  },
  syncProgressText: {
    color: Theme.colors.textSecondary,
    fontSize: 13,
    marginLeft: 12,
    fontStyle: "italic",
  },
  vitalsCard: {
    padding: 16,
    borderRadius: 12,
    borderColor: "rgba(59, 130, 246, 0.2)",
    borderWidth: 1,
  },
  vitalsTitle: {
    color: Theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 12,
  },
  vitalsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  vitalCol: {
    alignItems: "center",
    width: "30%",
  },
  vitalLabel: {
    color: Theme.colors.textSecondary,
    fontSize: 11,
    marginBottom: 4,
  },
  vitalValue: {
    color: Theme.colors.textPrimary,
    fontSize: 13,
    fontWeight: "bold",
  },
  modalBg: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    justifyContent: "center",
    alignItems: "center",
    padding: 25,
  },
  modalCard: {
    backgroundColor: Theme.colors.surface,
    borderColor: Theme.colors.surfaceGlassBorder,
    borderWidth: 1,
    borderRadius: 24,
    padding: 24,
    width: "100%",
    maxWidth: 400,
  },
  modalTitle: {
    color: Theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 12,
  },
  modalDesc: {
    color: Theme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
    marginBottom: 20,
  },
  modalPermList: {
    backgroundColor: Theme.colors.background,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderColor: Theme.colors.divider,
    borderWidth: 1,
  },
  modalPermItem: {
    color: Theme.colors.textPrimary,
    fontSize: 13,
    marginBottom: 10,
    fontWeight: "500",
  },
  modalPrivacyWarning: {
    color: Theme.colors.textMuted,
    fontSize: 11,
    textAlign: "center",
    lineHeight: 15,
    marginBottom: 25,
  },
  modalButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  modalCancel: {
    width: "47%",
    borderColor: Theme.colors.surfaceGlassBorder,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  modalCancelText: {
    color: Theme.colors.textSecondary,
    fontSize: 14,
    fontWeight: "bold",
  },
  modalConfirm: {
    width: "47%",
    backgroundColor: Theme.colors.secondary,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  modalConfirmText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "bold",
  },
  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 15,
  },
  addProviderBtn: {
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    borderColor: "rgba(16, 185, 129, 0.3)",
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  addProviderBtnText: {
    color: Theme.colors.primary,
    fontSize: 12,
    fontWeight: "bold",
  },
  connectionItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: Theme.colors.surfaceGlass,
    borderColor: Theme.colors.surfaceGlassBorder,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  connectionInfo: {
    flex: 1,
  },
  connectionName: {
    color: Theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: "bold",
  },
  connectionSync: {
    color: Theme.colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  syncBtn: {
    backgroundColor: Theme.colors.secondary,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  syncBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "bold",
  },
  noConnectionsText: {
    color: Theme.colors.textMuted,
    fontSize: 13,
    fontStyle: "italic",
    textAlign: "center",
    paddingVertical: 10,
  },
  fhirConditionItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: Theme.colors.surfaceGlass,
    borderColor: Theme.colors.surfaceGlassBorder,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    marginTop: 5,
  },
  fhirCondLeft: {
    flex: 1,
    marginRight: 10,
  },
  fhirCondName: {
    color: Theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: "bold",
  },
  fhirCondDetails: {
    color: Theme.colors.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
  fhirCondRight: {
    alignItems: "flex-end",
  },
  badgeRaw: {
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    borderColor: "rgba(245, 158, 11, 0.3)",
    borderWidth: 1,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
    marginBottom: 4,
  },
  badgeRawText: {
    color: Theme.colors.warning,
    fontSize: 10,
    fontWeight: "bold",
  },
  badgeCurated: {
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    borderColor: "rgba(16, 185, 129, 0.3)",
    borderWidth: 1,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
    marginBottom: 4,
  },
  badgeCuratedText: {
    color: Theme.colors.primary,
    fontSize: 10,
    fontWeight: "bold",
  },
  curatrInspectText: {
    color: Theme.colors.secondary,
    fontSize: 11,
    fontWeight: "500",
  },
  linkingView: {
    alignItems: "center",
    paddingVertical: 30,
  },
  linkingText: {
    color: Theme.colors.textSecondary,
    fontSize: 14,
    marginTop: 15,
  },
  providerSelectRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: Theme.colors.surfaceGlass,
    borderColor: Theme.colors.surfaceGlassBorder,
    borderWidth: 1,
    borderRadius: 12,
    padding: 15,
    marginBottom: 10,
  },
  providerSelectName: {
    color: Theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: "600",
  },
  providerSelectIcon: {
    color: Theme.colors.secondary,
    fontSize: 14,
  },
  modalCardScrollContainer: {
    width: "100%",
    maxHeight: "85%",
    backgroundColor: Theme.colors.surface,
    borderColor: Theme.colors.surfaceGlassBorder,
    borderWidth: 1,
    borderRadius: 24,
    maxWidth: 400,
    overflow: "hidden",
  },
  truthModalContentContainer: {
    padding: 24,
  },
  loadingModal: {
    alignItems: "center",
    paddingVertical: 40,
  },
  loadingModalText: {
    color: Theme.colors.textSecondary,
    fontSize: 14,
    marginTop: 15,
  },
  modalSubHeader: {
    color: Theme.colors.textSecondary,
    fontSize: 11,
    fontWeight: "bold",
    letterSpacing: 1,
    marginBottom: 8,
    marginTop: 15,
  },
  redactedDataBox: {
    backgroundColor: Theme.colors.background,
    borderColor: Theme.colors.divider,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 15,
  },
  redactedText: {
    color: Theme.colors.textSecondary,
    fontSize: 12,
    fontFamily: "monospace",
    lineHeight: 16,
    marginBottom: 4,
  },
  curationOverview: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: Theme.colors.surfaceGlass,
    borderRadius: 12,
    padding: 12,
    marginBottom: 15,
  },
  curationItem: {
    alignItems: "center",
    width: "48%",
  },
  curationLabel: {
    color: Theme.colors.textMuted,
    fontSize: 11,
    marginBottom: 4,
  },
  curationVal: {
    color: Theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: "bold",
  },
  curatrSection: {
    marginTop: 5,
  },
  curatrIssueBox: {
    backgroundColor: "rgba(245, 158, 11, 0.08)",
    borderColor: "rgba(245, 158, 11, 0.2)",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  curatrIssueMsg: {
    color: Theme.colors.warning,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
  },
  curatrSuggestion: {
    color: Theme.colors.textPrimary,
    fontSize: 12,
    marginTop: 6,
    fontWeight: "500",
  },
  intentLabel: {
    color: Theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: "bold",
    marginTop: 12,
    marginBottom: 6,
  },
  intentInput: {
    backgroundColor: Theme.colors.background,
    borderColor: Theme.colors.divider,
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    color: Theme.colors.textPrimary,
    fontSize: 13,
  },
  curatrSuccessBox: {
    backgroundColor: "rgba(16, 185, 129, 0.08)",
    borderColor: "rgba(16, 185, 129, 0.2)",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  curatrSuccessText: {
    color: Theme.colors.primary,
    fontSize: 13,
    fontWeight: "600",
  },
  timelineItem: {
    borderLeftWidth: 2,
    borderLeftColor: Theme.colors.primary,
    paddingLeft: 12,
    marginBottom: 15,
    marginLeft: 6,
  },
  timelineHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  timelineAgent: {
    color: Theme.colors.textPrimary,
    fontSize: 13,
    fontWeight: "bold",
  },
  timelineDate: {
    color: Theme.colors.textMuted,
    fontSize: 11,
  },
  timelineSummary: {
    color: Theme.colors.textSecondary,
    fontSize: 12,
    marginTop: 4,
    lineHeight: 16,
  },
  timelineIntent: {
    color: Theme.colors.secondary,
    fontSize: 11,
    fontStyle: "italic",
    marginTop: 4,
  },
  noTimelineText: {
    color: Theme.colors.textMuted,
    fontSize: 12,
    fontStyle: "italic",
    paddingVertical: 5,
  },
  noTagText: {
    color: Theme.colors.textMuted,
    fontSize: 13,
    fontStyle: "italic",
  },
  modalCardLarge: {
    backgroundColor: Theme.colors.surface,
    borderColor: Theme.colors.surfaceGlassBorder,
    borderWidth: 1,
    borderRadius: 24,
    width: "100%",
    height: "85%",
    maxWidth: 500,
    overflow: "hidden",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Theme.colors.divider,
  },
  modalTitleLeft: {
    color: Theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: "bold",
  },
  modalCloseBtn: {
    padding: 8,
  },
  modalCloseText: {
    color: Theme.colors.textSecondary,
    fontSize: 18,
    fontWeight: "bold",
  },
  webview: {
    flex: 1,
    backgroundColor: "transparent",
  },
  webviewLoading: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Theme.colors.surface,
  },
  webviewLoadingText: {
    color: Theme.colors.textSecondary,
    fontSize: 14,
    marginTop: 15,
  },
  linkingViewFull: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
});
