import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert } from "react-native";
import { Theme } from "../theme/theme";
import { fetchForms, autofillForm, submitForm, fillFormFromDocument } from "../services/api";

export default function FormFillerScreen() {
  const [forms, setForms] = useState<any[]>([]);
  const [selectedForm, setSelectedForm] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [autofilling, setAutofilling] = useState(false);
  const [formData, setFormData] = useState<Record<string, string>>({});

  // Vision scanner states
  const [docUrl, setDocUrl] = useState("");
  const [simulateType, setSimulateType] = useState<"referral" | "appointment" | null>(null);
  const [scanningUrl, setScanningUrl] = useState(false);

  const loadForms = async () => {
    try {
      const data = await fetchForms();
      setForms(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadForms();
  }, []);

  const selectForm = (form: any) => {
    setSelectedForm(form);
    setFormData(form.filled_data || {});
  };

  const handleAutofill = async () => {
    if (!selectedForm) return;
    setAutofilling(true);
    try {
      const updatedForm = await autofillForm(selectedForm.id);
      setSelectedForm(updatedForm);
      setFormData(updatedForm.filled_data || {});
      Alert.alert("Auto-fill complete", "Clinical details successfully pre-filled from your EHR profile.");
    } catch (e) {
      console.error(e);
      Alert.alert("Auto-fill Failed", "Could not autofill form at this time.");
    } finally {
      setAutofilling(false);
    }
  };

  const handleVisionAutoFill = async () => {
    setScanningUrl(true);
    try {
      await new Promise(r => setTimeout(r, 2000)); // Simulating layout parsing step
      const res = await fillFormFromDocument(simulateType || undefined, docUrl || undefined);
      
      const mockForm = {
        id: res.form_id,
        title: res.title,
        fields: res.fields,
        filled_data: res.filled_data,
        status: "DRAFT"
      };

      Alert.alert(
        "Form Scanned & Populated",
        res.message,
        [
          {
            text: "Review Pre-filled Draft",
            onPress: () => {
              setSelectedForm(mockForm);
              setFormData(res.filled_data);
              setDocUrl("");
              setSimulateType(null);
            }
          }
        ]
      );
      await loadForms();
    } catch (e) {
      console.error(e);
      Alert.alert("Auto-fill Failed", "Could not read external form data.");
    } finally {
      setScanningUrl(false);
    }
  };

  const handleFieldChange = (key: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleSubmit = async (status: "DRAFT" | "SUBMITTED") => {
    if (!selectedForm) return;
    try {
      const updatedForm = await submitForm(selectedForm.id, formData, status);
      setSelectedForm(null);
      await loadForms();
      
      Alert.alert(
        status === "SUBMITTED" ? "Form Submitted" : "Draft Saved",
        status === "SUBMITTED" 
          ? "Your signed document has been submitted to the clinic database." 
          : "Your progress has been saved as a draft.",
        [{ text: "OK" }]
      );
    } catch (e) {
      console.error(e);
      Alert.alert("Submission Failed", "Could not submit form to server.");
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Theme.colors.primary} />
        <Text style={styles.loadingText}>Loading form templates...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {selectedForm ? (
        // Form Editing Mode
        <KeyboardAvoidingWrapper>
          <View style={styles.formEditHeader}>
            <TouchableOpacity style={styles.backButton} onPress={() => setSelectedForm(null)}>
              <Text style={styles.backButtonText}>➔ Back</Text>
            </TouchableOpacity>
            <Text style={styles.formTitleText} numberOfLines={1}>{selectedForm.title}</Text>
          </View>

          <ScrollView style={styles.fieldsScroll} contentContainerStyle={styles.fieldsContainer}>
            <Text style={styles.formExplainer}>
              Ensure all fields are accurate. Robin pre-populated details using your health vault.
            </Text>

            <TouchableOpacity 
              style={styles.autofillBanner} 
              onPress={handleAutofill}
              disabled={autofilling}
            >
              {autofilling ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.autofillBannerText}>⚡ Re-Autofill with Health Vault</Text>
              )}
            </TouchableOpacity>

            {selectedForm.fields.map((field: any) => {
              const value = formData[field.id] || "";
              const hasValue = value.length > 0;
              
              return (
                <View key={field.id} style={styles.fieldWrapper}>
                  <Text style={styles.fieldLabel}>
                    {field.label} {field.required && <Text style={{ color: Theme.colors.error }}>*</Text>}
                  </Text>
                  <TextInput
                    style={[
                      styles.fieldInput,
                      field.type === "textarea" && styles.fieldTextArea,
                      hasValue ? styles.inputFilled : styles.inputEmpty
                    ]}
                    multiline={field.type === "textarea"}
                    numberOfLines={field.type === "textarea" ? 4 : 1}
                    value={value}
                    onChangeText={(val) => handleFieldChange(field.id, val)}
                    placeholder={`Enter ${field.label.toLowerCase()}`}
                    placeholderTextColor={Theme.colors.textMuted}
                  />
                  {hasValue && (
                    <Text style={styles.autofillBadge}>Verified by Agent</Text>
                  )}
                </View>
              );
            })}

            {/* Submit Controls */}
            <View style={styles.actionButtonsRow}>
              <TouchableOpacity style={styles.saveDraftBtn} onPress={() => handleSubmit("DRAFT")}>
                <Text style={styles.saveDraftBtnText}>Save Draft</Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.submitBtn} onPress={() => handleSubmit("SUBMITTED")}>
                <Text style={styles.submitBtnText}>Sign & Submit</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingWrapper>
      ) : (
        // Form List Mode
        <ScrollView contentContainerStyle={styles.listContainer}>
          <Text style={styles.title}>Clinical Intake Portal</Text>
          <Text style={styles.subtitle}>Review intake documents, HIPAA agreements, and clinical releases</Text>

          {/* AI Vision Form Auto-Filler Card */}
          <View style={styles.visionCard}>
            <Text style={styles.visionCardHeader}>⚡ AI Vision Form Auto-Filler</Text>
            <Text style={styles.visionCardDesc}>
              Provide a medical form URL or select a mock PDF document template. Robin will analyze the layout and auto-populate all fields using your health vault.
            </Text>

            <Text style={styles.visionLabel}>Form Document URL</Text>
            <TextInput
              style={styles.urlInput}
              placeholder="https://example-clinic.org/forms/referral.pdf"
              placeholderTextColor={Theme.colors.textMuted}
              value={docUrl}
              onChangeText={setDocUrl}
            />

            <Text style={styles.visionLabel}>Or select a Simulated PDF Form Template</Text>
            <View style={styles.mockSelectContainer}>
              <TouchableOpacity 
                style={[styles.mockSelectBtn, simulateType === "referral" && styles.mockSelectBtnActive]}
                onPress={() => setSimulateType("referral")}
              >
                <Text style={[styles.mockSelectBtnText, simulateType === "referral" && styles.mockSelectBtnTextActive]}>
                  Specialist Referral
                </Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.mockSelectBtn, simulateType === "appointment" && styles.mockSelectBtnActive]}
                onPress={() => setSimulateType("appointment")}
              >
                <Text style={[styles.mockSelectBtnText, simulateType === "appointment" && styles.mockSelectBtnTextActive]}>
                  Appointment Request
                </Text>
              </TouchableOpacity>
            </View>

            {scanningUrl ? (
              <View style={styles.scanningProgress}>
                <ActivityIndicator size="small" color={Theme.colors.primary} />
                <Text style={styles.scanningText}>Robin is analyzing form layout and pulling FHIR context...</Text>
              </View>
            ) : (
              <TouchableOpacity 
                style={[styles.scanButton, (!docUrl.trim() && !simulateType) && styles.scanButtonDisabled]}
                disabled={!docUrl.trim() && !simulateType}
                onPress={handleVisionAutoFill}
              >
                <Text style={styles.scanButtonText}>Analyze & Auto-populate</Text>
              </TouchableOpacity>
            )}
          </View>

          <Text style={styles.sectionTitle}>Available Form Templates</Text>

          {forms.map((form) => {
            const hasDraft = form.status === "DRAFT";
            const isSubmitted = form.status === "SUBMITTED";
            
            return (
              <TouchableOpacity 
                key={form.id} 
                style={[
                  styles.formCard,
                  isSubmitted && styles.formCardSubmitted
                ]}
                onPress={() => !isSubmitted && selectForm(form)}
                disabled={isSubmitted}
              >
                <View style={styles.formCardHeader}>
                  <Text style={styles.formCardTitle}>{form.title}</Text>
                  <View style={[
                    styles.statusBadge,
                    hasDraft && styles.badgeDraft,
                    isSubmitted && styles.badgeSubmitted
                  ]}>
                    <Text style={[
                      styles.statusBadgeText,
                      hasDraft && styles.badgeDraftText,
                      isSubmitted && styles.badgeSubmittedText
                    ]}>
                      {form.status}
                    </Text>
                  </View>
                </View>
                <Text style={styles.formCardDesc}>
                  {isSubmitted 
                    ? "This document has been finalized and signed." 
                    : `Contains ${form.fields.length} fields. Ready for AI pre-fill.`}
                </Text>
                {!isSubmitted && (
                  <Text style={styles.formCardAction}>
                    {hasDraft ? "Resume Draft" : "Tap to pre-fill & review"} ➔
                  </Text>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

// Helper component to resolve KeyboardAvoidingView in list vs edit modes
function KeyboardAvoidingWrapper({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ flex: 1 }}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.colors.background,
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
  listContainer: {
    padding: 20,
    paddingTop: 50,
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
  formCard: {
    backgroundColor: Theme.colors.surface,
    borderColor: Theme.colors.surfaceGlassBorder,
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  formCardSubmitted: {
    opacity: 0.7,
  },
  formCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  formCardTitle: {
    color: Theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: "bold",
    flex: 1,
    marginRight: 10,
  },
  statusBadge: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderColor: "rgba(255, 255, 255, 0.15)",
    borderWidth: 1,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  statusBadgeText: {
    color: Theme.colors.textSecondary,
    fontSize: 10,
    fontWeight: "bold",
  },
  badgeDraft: {
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    borderColor: "rgba(245, 158, 11, 0.3)",
  },
  badgeDraftText: {
    color: Theme.colors.warning,
  },
  badgeSubmitted: {
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    borderColor: "rgba(16, 185, 129, 0.3)",
  },
  badgeSubmittedText: {
    color: Theme.colors.primary,
  },
  formCardDesc: {
    color: Theme.colors.textSecondary,
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 12,
  },
  formCardAction: {
    color: Theme.colors.primary,
    fontSize: 12,
    fontWeight: "bold",
  },
  formEditHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: Theme.colors.divider,
    backgroundColor: Theme.colors.surface,
  },
  backButton: {
    marginRight: 15,
  },
  backButtonText: {
    color: Theme.colors.primary,
    fontSize: 15,
    fontWeight: "600",
    transform: [{ scaleX: -1 }] // Flips arrow to point left
  },
  formTitleText: {
    color: Theme.colors.textPrimary,
    fontSize: 17,
    fontWeight: "bold",
    flex: 1,
  },
  fieldsScroll: {
    flex: 1,
  },
  fieldsContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  formExplainer: {
    color: Theme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 15,
  },
  autofillBanner: {
    backgroundColor: Theme.colors.primary,
    borderRadius: 10,
    padding: 12,
    alignItems: "center",
    marginBottom: 25,
  },
  autofillBannerText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "bold",
  },
  fieldWrapper: {
    marginBottom: 20,
  },
  fieldLabel: {
    color: Theme.colors.textSecondary,
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 8,
  },
  fieldInput: {
    backgroundColor: Theme.colors.surface,
    color: Theme.colors.textPrimary,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    borderWidth: 1,
  },
  fieldTextArea: {
    height: 90,
    textAlignVertical: "top",
  },
  inputEmpty: {
    borderColor: "rgba(245, 158, 11, 0.4)", // Amber borders highlight empty fields
  },
  inputFilled: {
    borderColor: "rgba(16, 185, 129, 0.4)", // Green borders verify autofilled fields
  },
  autofillBadge: {
    color: Theme.colors.primary,
    fontSize: 10,
    fontWeight: "bold",
    marginTop: 4,
    alignSelf: "flex-end",
  },
  actionButtonsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 20,
  },
  saveDraftBtn: {
    width: "47%",
    borderColor: Theme.colors.surfaceGlassBorder,
    borderWidth: 1,
    backgroundColor: Theme.colors.surface,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  saveDraftBtnText: {
    color: Theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: "bold",
  },
  submitBtn: {
    width: "47%",
    backgroundColor: Theme.colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  submitBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "bold",
  },
  visionCard: {
    backgroundColor: Theme.colors.surface,
    borderColor: "rgba(59, 130, 246, 0.2)",
    borderWidth: 1,
    borderRadius: 20,
    padding: 20,
    marginBottom: 25,
  },
  visionCardHeader: {
    color: Theme.colors.textPrimary,
    fontSize: 17,
    fontWeight: "bold",
    marginBottom: 10,
  },
  visionCardDesc: {
    color: Theme.colors.textSecondary,
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 15,
  },
  visionLabel: {
    color: Theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 8,
    marginTop: 10,
  },
  urlInput: {
    backgroundColor: Theme.colors.background,
    borderColor: Theme.colors.surfaceGlassBorder,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: Theme.colors.textPrimary,
    fontSize: 14,
    marginBottom: 10,
  },
  mockSelectContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 15,
  },
  mockSelectBtn: {
    width: "48%",
    borderColor: Theme.colors.surfaceGlassBorder,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: Theme.colors.background,
  },
  mockSelectBtnActive: {
    borderColor: Theme.colors.primary,
    backgroundColor: "rgba(16, 185, 129, 0.05)",
  },
  mockSelectBtnText: {
    color: Theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: "600",
  },
  mockSelectBtnTextActive: {
    color: Theme.colors.primary,
  },
  scanningProgress: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Theme.colors.surfaceGlass,
    padding: 12,
    borderRadius: 10,
    marginTop: 10,
  },
  scanningText: {
    color: Theme.colors.textSecondary,
    fontSize: 11,
    marginLeft: 10,
    flex: 1,
  },
  sectionTitle: {
    color: Theme.colors.textPrimary,
    fontSize: 17,
    fontWeight: "bold",
    marginBottom: 15,
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
});
