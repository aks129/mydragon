import React, { useState, useRef, useEffect } from "react";
import { StyleSheet, Text, View, TextInput, TouchableOpacity, FlatList, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { Theme } from "../theme/theme";
import { sendChatPrompt } from "../services/api";

interface Message {
  id: string;
  sender: "user" | "agent";
  text: string;
  thoughts?: string;
  timestamp: Date;
}

export default function ChatScreen() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      sender: "agent",
      text: "Hello! I'm Robin, your personal healthcare coordination assistant. Ask me to lookup local doctors, check your calendar for appointments, coordinate with Dr. Jenkins' office, or summarize your EHR details. How can I help you today?",
      timestamp: new Date(),
    }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeThoughts, setActiveThoughts] = useState<string | null>(null);
  
  const flatListRef = useRef<FlatList>(null);

  const sendMessage = async () => {
    if (!input.trim()) return;

    const userMessage: Message = {
      id: Math.random().toString(),
      sender: "user",
      text: input.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    const userPrompt = input;
    setInput("");
    setLoading(true);
    setActiveThoughts(null);

    // Scroll to end
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);

    try {
      const data = await sendChatPrompt(userPrompt);
      const agentMessage: Message = {
        id: Math.random().toString(),
        sender: "agent",
        text: data.response,
        thoughts: data.thoughts,
        timestamp: new Date(),
      };
      
      setMessages(prev => [...prev, agentMessage]);
      if (data.thoughts) {
        setActiveThoughts(data.thoughts);
      }
    } catch (error) {
      console.error(error);
      const errorMessage: Message = {
        id: Math.random().toString(),
        sender: "agent",
        text: "Sorry, I am having trouble connecting to my healthcare services. Please check if the backend server is running.",
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      {/* Thoughts Banner if active */}
      {activeThoughts && (
        <View style={styles.thoughtsBanner}>
          <View style={styles.thoughtsHeader}>
            <Text style={styles.thoughtsTitle}>🧠 Robin's Internal Reasoning</Text>
            <TouchableOpacity onPress={() => setActiveThoughts(null)}>
              <Text style={styles.thoughtsClose}>Dismiss</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.thoughtsText} numberOfLines={3}>{activeThoughts}</Text>
        </View>
      )}

      {/* Messages List */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.messagesList}
        renderItem={({ item }) => (
          <View style={[
            styles.messageWrapper,
            item.sender === "user" ? styles.userWrapper : styles.agentWrapper
          ]}>
            {item.sender === "agent" && (
              <Text style={styles.avatarLabel}>🤖</Text>
            )}
            <View style={[
              styles.messageBubble,
              item.sender === "user" ? styles.userBubble : styles.agentBubble
            ]}>
              <Text style={styles.messageText}>{item.text}</Text>
              
              {item.sender === "agent" && item.thoughts && (
                <TouchableOpacity 
                  style={styles.thoughtsToggle}
                  onPress={() => setActiveThoughts(item.thoughts || null)}
                >
                  <Text style={styles.thoughtsToggleText}>View agent logic ➔</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
        ListFooterComponent={loading ? (
          <View style={styles.typingContainer}>
            <ActivityIndicator size="small" color={Theme.colors.primary} />
            <Text style={styles.typingText}>Robin is analyzing logs & executing tools...</Text>
          </View>
        ) : null}
      />

      {/* Input Row */}
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.textInput}
          placeholder="Ask Robin to schedule, check records..."
          placeholderTextColor={Theme.colors.textMuted}
          value={input}
          onChangeText={setInput}
          onSubmitEditing={sendMessage}
          returnKeyType="send"
        />
        <TouchableOpacity 
          style={[styles.sendButton, !input.trim() && styles.sendButtonDisabled]} 
          onPress={sendMessage}
          disabled={!input.trim()}
        >
          <Text style={styles.sendButtonText}>➔</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.colors.background,
  },
  messagesList: {
    padding: 15,
    paddingTop: 50,
    paddingBottom: 20,
  },
  messageWrapper: {
    flexDirection: "row",
    marginBottom: 16,
    maxWidth: "85%",
  },
  userWrapper: {
    alignSelf: "flex-end",
  },
  agentWrapper: {
    alignSelf: "flex-start",
  },
  avatarLabel: {
    fontSize: 20,
    marginRight: 8,
    marginTop: 4,
  },
  messageBubble: {
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  userBubble: {
    backgroundColor: Theme.colors.secondary,
    borderTopRightRadius: 4,
  },
  agentBubble: {
    backgroundColor: Theme.colors.surface,
    borderColor: Theme.colors.surfaceGlassBorder,
    borderWidth: 1,
    borderTopLeftRadius: 4,
  },
  messageText: {
    color: Theme.colors.textPrimary,
    fontSize: 15,
    lineHeight: 20,
  },
  thoughtsToggle: {
    marginTop: 10,
    paddingTop: 8,
    borderTopColor: Theme.colors.divider,
    borderTopWidth: 1,
  },
  thoughtsToggleText: {
    color: Theme.colors.primary,
    fontSize: 11,
    fontWeight: "bold",
  },
  typingContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 30,
    marginVertical: 10,
  },
  typingText: {
    color: Theme.colors.textSecondary,
    fontSize: 12,
    marginLeft: 10,
    fontStyle: "italic",
  },
  inputContainer: {
    flexDirection: "row",
    padding: 15,
    backgroundColor: Theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: Theme.colors.divider,
    alignItems: "center",
  },
  textInput: {
    flex: 1,
    backgroundColor: Theme.colors.background,
    color: Theme.colors.textPrimary,
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 10,
    fontSize: 15,
    marginRight: 10,
    borderColor: Theme.colors.divider,
    borderWidth: 1,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Theme.colors.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  sendButtonDisabled: {
    backgroundColor: Theme.colors.textMuted,
    opacity: 0.5,
  },
  sendButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
  },
  thoughtsBanner: {
    backgroundColor: "#111827",
    borderBottomWidth: 1,
    borderBottomColor: Theme.colors.primary,
    padding: 12,
    paddingTop: 50,
  },
  thoughtsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  thoughtsTitle: {
    color: Theme.colors.primary,
    fontWeight: "bold",
    fontSize: 13,
  },
  thoughtsClose: {
    color: Theme.colors.textSecondary,
    fontSize: 12,
  },
  thoughtsText: {
    color: Theme.colors.textSecondary,
    fontSize: 12,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    lineHeight: 16,
  },
});
