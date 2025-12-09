import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { ChatInput, ChatMessage, PredictionsList, QuickActions } from '../components';
import { geminiService } from '../services/gemini-service';
import { useChatStore } from '../store/chat-store';

type Tab = 'chat' | 'predictions';

export default function Index() {
  const [activeTab, setActiveTab] = useState<Tab>('chat');
  const flatListRef = useRef<FlatList>(null);
  
  const { 
    messages, 
    isLoading, 
    error, 
    predictions,
    sendMessage, 
    clearMessages,
    clearPredictions,
  } = useChatStore();

  // Auto-scroll cuando llegan nuevos mensajes
  useEffect(() => {
    if (messages.length > 0 && flatListRef.current) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length]);

  // Verificar si la API está configurada
  useEffect(() => {
    if (!geminiService.isConfigured()) {
      Alert.alert(
        '⚠️ Configuración Requerida',
        'Necesitas configurar tu API Key de Google Gemini (GRATIS).\n\n1. Ve a https://aistudio.google.com/apikey\n2. Crea una API Key\n3. Añádela al archivo .env como EXPO_PUBLIC_GEMINI_API_KEY',
        [{ text: 'Entendido' }]
      );
    }
  }, []);

  const handleSendMessage = async (content: string) => {
    await sendMessage(content);
  };

  const handleClearChat = () => {
    Alert.alert(
      'Limpiar Chat',
      '¿Estás seguro de que quieres borrar todo el historial?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Limpiar', style: 'destructive', onPress: clearMessages },
      ]
    );
  };

  const renderChatContent = () => (
    <View style={styles.chatContainer}>
      <QuickActions onAction={handleSendMessage} />
      
      {messages.length === 0 ? (
        <View style={styles.welcomeContainer}>
          <Text style={styles.welcomeEmoji}>🤖💰</Text>
          <Text style={styles.welcomeTitle}>Bienvenido a Guess Investor</Text>
          <Text style={styles.welcomeText}>
            Soy tu asistente de inversiones con IA.{'\n'}
            Pregúntame sobre cualquier activo:{'\n'}
            acciones, criptomonedas, forex, commodities...
          </Text>
          <View style={styles.tipContainer}>
            <Text style={styles.tipTitle}>💡 Ejemplos de preguntas:</Text>
            <Text style={styles.tipText}>• ¿Qué opinas de Bitcoin para esta semana?</Text>
            <Text style={styles.tipText}>• Analiza las acciones de Apple</Text>
            <Text style={styles.tipText}>• ¿Es buen momento para invertir en oro?</Text>
            <Text style={styles.tipText}>• Compara Tesla vs Nvidia</Text>
          </View>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <ChatMessage message={item} />}
          contentContainerStyle={styles.messagesList}
          showsVerticalScrollIndicator={false}
        />
      )}
      
      <ChatInput 
        onSend={handleSendMessage} 
        isLoading={isLoading}
        placeholder="Pregunta sobre inversiones..."
      />
    </View>
  );

  const renderPredictionsContent = () => (
    <PredictionsList 
      predictions={predictions} 
      onClear={predictions.length > 0 ? () => {
        Alert.alert(
          'Limpiar Predicciones',
          '¿Borrar todas las predicciones guardadas?',
          [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Limpiar', style: 'destructive', onPress: clearPredictions },
          ]
        );
      } : undefined}
    />
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTitle}>
          <Text style={styles.headerEmoji}>📈</Text>
          <Text style={styles.headerText}>Guess Investor</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'chat' && styles.activeTab]}
          onPress={() => setActiveTab('chat')}
        >
          <Ionicons 
            name="chatbubbles-outline" 
            size={20} 
            color={activeTab === 'chat' ? '#007AFF' : '#666'} 
          />
          <Text style={[styles.tabText, activeTab === 'chat' && styles.activeTabText]}>
            Chat
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'predictions' && styles.activeTab]}
          onPress={() => setActiveTab('predictions')}
        >
          <Ionicons 
            name="analytics-outline" 
            size={20} 
            color={activeTab === 'predictions' ? '#007AFF' : '#666'} 
          />
          <Text style={[styles.tabText, activeTab === 'predictions' && styles.activeTabText]}>
            Predicciones {predictions.length > 0 && `(${predictions.length})`}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {activeTab === 'chat' ? renderChatContent() : renderPredictionsContent()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  headerTitle: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerEmoji: {
    fontSize: 24,
    marginRight: 8,
  },
  headerText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  headerButton: {
    padding: 8,
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#F5F5F5',
    paddingVertical: 4,
    paddingHorizontal: 4,
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 10,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
  },
  activeTab: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
    marginLeft: 6,
  },
  activeTabText: {
    color: '#007AFF',
    fontWeight: '600',
  },
  chatContainer: {
    flex: 1,
  },
  messagesList: {
    paddingVertical: 16,
  },
  welcomeContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  welcomeEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  welcomeTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 12,
    textAlign: 'center',
  },
  welcomeText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  tipContainer: {
    backgroundColor: '#F0F7FF',
    padding: 16,
    borderRadius: 12,
    width: '100%',
  },
  tipTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
    marginBottom: 8,
  },
  tipText: {
    fontSize: 13,
    color: '#444',
    marginBottom: 4,
  },
});
