/**
 * AlertsModal
 * Modal para gestionar alertas de precio
 */

import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { alertsService, PriceAlert } from '../../services/alerts-service';

const DARK = {
  bg: '#0a0a0a',
  bgCard: '#111111',
  bgSecondary: '#1a1a1a',
  border: '#2a2a2a',
  text: '#ffffff',
  textSecondary: '#9ca3af',
  textMuted: '#6b7280',
  accent: '#6366f1',
  green: '#4CAF50',
  red: '#F44336',
  orange: '#FF9800',
  yellow: '#FFC107',
};

interface AlertsModalProps {
  visible: boolean;
  onClose: () => void;
  // Opcional: para crear alerta desde predicción
  initialSymbol?: string;
  initialAssetName?: string;
  initialPrice?: number;
  initialTargetPrice?: number;
  initialDirection?: 'up' | 'down';
}

type Tab = 'active' | 'triggered' | 'create';

export function AlertsModal({
  visible,
  onClose,
  initialSymbol,
  initialAssetName,
  initialPrice,
  initialTargetPrice,
  initialDirection,
}: AlertsModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>(initialSymbol ? 'create' : 'active');
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [triggeredAlerts, setTriggeredAlerts] = useState<PriceAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state para crear alerta
  const [symbol, setSymbol] = useState(initialSymbol || '');
  const [assetName, setAssetName] = useState(initialAssetName || '');
  const [currentPrice, setCurrentPrice] = useState(initialPrice?.toString() || '');
  const [targetPrice, setTargetPrice] = useState(initialTargetPrice?.toString() || '');
  const [percentChange, setPercentChange] = useState('');
  const [condition, setCondition] = useState<'above' | 'below'>(initialDirection === 'down' ? 'below' : 'above');
  const [usePercent, setUsePercent] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (visible) {
      loadAlerts();
      // Reset form si viene con datos iniciales
      if (initialSymbol) {
        setSymbol(initialSymbol);
        setAssetName(initialAssetName || '');
        setCurrentPrice(initialPrice?.toString() || '');
        setTargetPrice(initialTargetPrice?.toString() || '');
        setCondition(initialDirection === 'down' ? 'below' : 'above');
        setActiveTab('create');
      }
    }
  }, [visible, initialSymbol]);

  const loadAlerts = async () => {
    setLoading(true);
    setError(null);
    try {
      const [active, triggered] = await Promise.all([
        alertsService.getActiveAlerts(),
        alertsService.getTriggeredAlerts(10),
      ]);
      setAlerts(active);
      setTriggeredAlerts(triggered);
    } catch (err: any) {
      setError(err.message || 'Error al cargar alertas');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!symbol.trim()) {
      Alert.alert('Error', 'Ingresa un símbolo');
      return;
    }
    if (!currentPrice || isNaN(parseFloat(currentPrice))) {
      Alert.alert('Error', 'Ingresa el precio actual');
      return;
    }
    if (!usePercent && (!targetPrice || isNaN(parseFloat(targetPrice)))) {
      Alert.alert('Error', 'Ingresa el precio objetivo');
      return;
    }
    if (usePercent && (!percentChange || isNaN(parseFloat(percentChange)))) {
      Alert.alert('Error', 'Ingresa el porcentaje de cambio');
      return;
    }

    setCreating(true);
    try {
      await alertsService.createAlert({
        symbol: symbol.toUpperCase(),
        assetName: assetName || symbol.toUpperCase(),
        currentPrice: parseFloat(currentPrice),
        targetPrice: usePercent ? undefined : parseFloat(targetPrice),
        percentChange: usePercent ? parseFloat(percentChange) : undefined,
        condition,
      });
      
      // Limpiar form y recargar
      setSymbol('');
      setAssetName('');
      setCurrentPrice('');
      setTargetPrice('');
      setPercentChange('');
      
      await loadAlerts();
      setActiveTab('active');
      Alert.alert('✅ Éxito', 'Alerta creada correctamente');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'No se pudo crear la alerta');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (alert: PriceAlert) => {
    Alert.alert(
      'Eliminar Alerta',
      `¿Eliminar alerta para ${alert.symbol}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              await alertsService.deleteAlert(alert.id);
              await loadAlerts();
            } catch (err: any) {
              Alert.alert('Error', err.message);
            }
          },
        },
      ]
    );
  };

  const renderTabs = () => (
    <View style={styles.tabs}>
      {(['active', 'triggered', 'create'] as Tab[]).map((tab) => (
        <Pressable
          key={tab}
          style={[styles.tab, activeTab === tab && styles.tabActive]}
          onPress={() => setActiveTab(tab)}
        >
          <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
            {tab === 'active' ? '🔔 Activas' : tab === 'triggered' ? '✅ Disparadas' : '➕ Crear'}
          </Text>
        </Pressable>
      ))}
    </View>
  );

  const renderAlertItem = (alert: PriceAlert, showDelete = true) => {
    const isTriggered = alert.isTriggered;
    const conditionText = alert.percentChange
      ? `${alert.condition === 'above' ? '↑' : '↓'} ${alert.percentChange}%`
      : `${alert.condition === 'above' ? '>' : '<'} ${alert.targetPrice?.toFixed(2)}`;

    return (
      <View key={alert.id} style={[styles.alertItem, isTriggered && styles.alertTriggered]}>
        <View style={styles.alertHeader}>
          <Text style={styles.alertSymbol}>{alert.symbol}</Text>
          <View style={[styles.conditionBadge, alert.condition === 'above' ? styles.badgeUp : styles.badgeDown]}>
            <Text style={styles.conditionText}>{conditionText}</Text>
          </View>
        </View>
        
        <Text style={styles.alertAsset}>{alert.assetName}</Text>
        
        {isTriggered && alert.triggeredPrice && (
          <Text style={styles.triggeredText}>
            ✅ Disparada a {alert.triggeredPrice.toFixed(2)}
          </Text>
        )}
        
        <View style={styles.alertFooter}>
          <Text style={styles.alertDate}>
            {new Date(alert.createdAt).toLocaleDateString()}
          </Text>
          {showDelete && !isTriggered && (
            <Pressable onPress={() => handleDelete(alert)} style={styles.deleteBtn}>
              <Text style={styles.deleteBtnText}>🗑️</Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  };

  const renderActiveAlerts = () => (
    <ScrollView style={styles.content}>
      {loading ? (
        <ActivityIndicator color={DARK.accent} size="large" style={{ marginTop: 40 }} />
      ) : error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : alerts.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🔕</Text>
          <Text style={styles.emptyText}>No tienes alertas activas</Text>
          <Pressable style={styles.createBtn} onPress={() => setActiveTab('create')}>
            <Text style={styles.createBtnText}>Crear Alerta</Text>
          </Pressable>
        </View>
      ) : (
        alerts.map((alert) => renderAlertItem(alert))
      )}
    </ScrollView>
  );

  const renderTriggeredAlerts = () => (
    <ScrollView style={styles.content}>
      {loading ? (
        <ActivityIndicator color={DARK.accent} size="large" style={{ marginTop: 40 }} />
      ) : triggeredAlerts.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>📭</Text>
          <Text style={styles.emptyText}>No hay alertas disparadas</Text>
        </View>
      ) : (
        triggeredAlerts.map((alert) => renderAlertItem(alert, false))
      )}
    </ScrollView>
  );

  const renderCreateForm = () => (
    <ScrollView style={styles.content}>
      <View style={styles.formGroup}>
        <Text style={styles.label}>Símbolo *</Text>
        <TextInput
          style={styles.input}
          value={symbol}
          onChangeText={setSymbol}
          placeholder="AAPL, MSFT, BTC-USD..."
          placeholderTextColor={DARK.textMuted}
          autoCapitalize="characters"
        />
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Nombre del Activo</Text>
        <TextInput
          style={styles.input}
          value={assetName}
          onChangeText={setAssetName}
          placeholder="Apple Inc."
          placeholderTextColor={DARK.textMuted}
        />
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Precio Actual *</Text>
        <TextInput
          style={styles.input}
          value={currentPrice}
          onChangeText={setCurrentPrice}
          placeholder="150.00"
          placeholderTextColor={DARK.textMuted}
          keyboardType="decimal-pad"
        />
      </View>

      {/* Toggle tipo de alerta */}
      <View style={styles.toggleRow}>
        <Pressable
          style={[styles.toggleBtn, !usePercent && styles.toggleActive]}
          onPress={() => setUsePercent(false)}
        >
          <Text style={[styles.toggleText, !usePercent && styles.toggleTextActive]}>
            💰 Precio
          </Text>
        </Pressable>
        <Pressable
          style={[styles.toggleBtn, usePercent && styles.toggleActive]}
          onPress={() => setUsePercent(true)}
        >
          <Text style={[styles.toggleText, usePercent && styles.toggleTextActive]}>
            📊 Porcentaje
          </Text>
        </Pressable>
      </View>

      {!usePercent ? (
        <View style={styles.formGroup}>
          <Text style={styles.label}>Precio Objetivo *</Text>
          <TextInput
            style={styles.input}
            value={targetPrice}
            onChangeText={setTargetPrice}
            placeholder="160.00"
            placeholderTextColor={DARK.textMuted}
            keyboardType="decimal-pad"
          />
        </View>
      ) : (
        <View style={styles.formGroup}>
          <Text style={styles.label}>Cambio % *</Text>
          <TextInput
            style={styles.input}
            value={percentChange}
            onChangeText={setPercentChange}
            placeholder="5"
            placeholderTextColor={DARK.textMuted}
            keyboardType="decimal-pad"
          />
        </View>
      )}

      {/* Condición */}
      <View style={styles.formGroup}>
        <Text style={styles.label}>Condición</Text>
        <View style={styles.conditionRow}>
          <Pressable
            style={[styles.conditionBtn, condition === 'above' && styles.conditionUp]}
            onPress={() => setCondition('above')}
          >
            <Text style={[styles.conditionBtnText, condition === 'above' && styles.conditionBtnTextActive]}>
              📈 Sube {usePercent ? '%' : 'a'}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.conditionBtn, condition === 'below' && styles.conditionDown]}
            onPress={() => setCondition('below')}
          >
            <Text style={[styles.conditionBtnText, condition === 'below' && styles.conditionBtnTextActive]}>
              📉 Baja {usePercent ? '%' : 'a'}
            </Text>
          </Pressable>
        </View>
      </View>

      <Pressable
        style={[styles.submitBtn, creating && styles.submitBtnDisabled]}
        onPress={handleCreate}
        disabled={creating}
      >
        {creating ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={styles.submitBtnText}>🔔 Crear Alerta</Text>
        )}
      </Pressable>
    </ScrollView>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>🔔 Alertas de Precio</Text>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </Pressable>
          </View>

          {renderTabs()}

          {activeTab === 'active' && renderActiveAlerts()}
          {activeTab === 'triggered' && renderTriggeredAlerts()}
          {activeTab === 'create' && renderCreateForm()}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: DARK.bg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    minHeight: '70%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: DARK.border,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: DARK.text,
  },
  closeBtn: {
    padding: 8,
  },
  closeBtnText: {
    color: DARK.textSecondary,
    fontSize: 20,
  },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: DARK.border,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: DARK.accent,
  },
  tabText: {
    color: DARK.textSecondary,
    fontSize: 13,
  },
  tabTextActive: {
    color: DARK.accent,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  alertItem: {
    backgroundColor: DARK.bgCard,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: DARK.border,
  },
  alertTriggered: {
    borderColor: DARK.green,
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
  },
  alertHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  alertSymbol: {
    fontSize: 16,
    fontWeight: 'bold',
    color: DARK.text,
  },
  conditionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeUp: {
    backgroundColor: 'rgba(76, 175, 80, 0.2)',
  },
  badgeDown: {
    backgroundColor: 'rgba(244, 67, 54, 0.2)',
  },
  conditionText: {
    color: DARK.text,
    fontSize: 12,
    fontWeight: '600',
  },
  alertAsset: {
    color: DARK.textSecondary,
    fontSize: 13,
    marginBottom: 6,
  },
  triggeredText: {
    color: DARK.green,
    fontSize: 13,
    marginTop: 4,
  },
  alertFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  alertDate: {
    color: DARK.textMuted,
    fontSize: 11,
  },
  deleteBtn: {
    padding: 4,
  },
  deleteBtnText: {
    fontSize: 16,
  },
  emptyState: {
    alignItems: 'center',
    marginTop: 60,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyText: {
    color: DARK.textSecondary,
    fontSize: 16,
    marginBottom: 20,
  },
  createBtn: {
    backgroundColor: DARK.accent,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  createBtnText: {
    color: '#fff',
    fontWeight: '600',
  },
  errorText: {
    color: DARK.red,
    textAlign: 'center',
    marginTop: 40,
  },
  formGroup: {
    marginBottom: 16,
  },
  label: {
    color: DARK.textSecondary,
    fontSize: 13,
    marginBottom: 6,
  },
  input: {
    backgroundColor: DARK.bgSecondary,
    borderWidth: 1,
    borderColor: DARK.border,
    borderRadius: 8,
    padding: 12,
    color: DARK.text,
    fontSize: 16,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  toggleBtn: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    backgroundColor: DARK.bgSecondary,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: DARK.border,
  },
  toggleActive: {
    borderColor: DARK.accent,
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
  },
  toggleText: {
    color: DARK.textSecondary,
    fontSize: 14,
  },
  toggleTextActive: {
    color: DARK.accent,
    fontWeight: '600',
  },
  conditionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  conditionBtn: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    backgroundColor: DARK.bgSecondary,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: DARK.border,
  },
  conditionUp: {
    borderColor: DARK.green,
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
  },
  conditionDown: {
    borderColor: DARK.red,
    backgroundColor: 'rgba(244, 67, 54, 0.1)',
  },
  conditionBtnText: {
    color: DARK.textSecondary,
    fontSize: 14,
  },
  conditionBtnTextActive: {
    color: DARK.text,
    fontWeight: '600',
  },
  submitBtn: {
    backgroundColor: DARK.accent,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
