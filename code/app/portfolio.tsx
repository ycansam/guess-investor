/**
 * Investment Notes Screen
 * 
 * Bloc de notas para inversiones:
 * - Apuntes sobre activos que te interesan
 * - Tesis de inversión
 * - Precios de referencia (target, entry, stop loss)
 * - Estados: watching, bought, sold, archived
 */

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  CreateNoteInput,
  InvestmentNote,
  NotesData,
  NoteStatus,
  notesService,
} from '../services/notes-service';

// Colores del tema oscuro
const COLORS = {
  background: '#0a0a1a',
  card: '#1a1a2e',
  cardLight: '#252547',
  text: '#ffffff',
  textSecondary: '#9ca3af',
  green: '#4CAF50',
  red: '#F44336',
  orange: '#FF9800',
  blue: '#2196F3',
  purple: '#9C27B0',
  yellow: '#FFC107',
  border: '#333355',
};

// Configuración de estados
const STATUS_CONFIG: Record<NoteStatus, { label: string; emoji: string; color: string }> = {
  watching: { label: 'Observando', emoji: '👀', color: COLORS.blue },
  bought: { label: 'Comprado', emoji: '✅', color: COLORS.green },
  sold: { label: 'Vendido', emoji: '💰', color: COLORS.purple },
  archived: { label: 'Archivado', emoji: '📦', color: COLORS.textSecondary },
};

// Formato de precio
const formatPrice = (value: number): string => {
  if (value >= 1000) {
    return `$${value.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `$${value.toFixed(value < 1 ? 4 : 2)}`;
};

// Formato de porcentaje
const formatPercent = (value: number): string => {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
};

// ============================================================================
// COMPONENTE: Filtros de Estado
// ============================================================================

const StatusFilters = ({
  activeFilter,
  counts,
  onFilterChange,
}: {
  activeFilter: NoteStatus | 'all';
  counts: Record<string, number>;
  onFilterChange: (filter: NoteStatus | 'all') => void;
}) => {
  const filters: (NoteStatus | 'all')[] = ['all', 'watching', 'bought', 'sold', 'archived'];
  const total = Object.values(counts).reduce((sum, c) => sum + c, 0);

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filtersContainer}>
      {filters.map((filter) => {
        const isActive = activeFilter === filter;
        const count = filter === 'all' ? total : counts[filter] || 0;
        const config = filter === 'all' 
          ? { label: 'Todas', emoji: '📝', color: COLORS.text }
          : STATUS_CONFIG[filter];

        return (
          <Pressable
            key={filter}
            style={[styles.filterButton, isActive && { backgroundColor: config.color + '33' }]}
            onPress={() => onFilterChange(filter)}
          >
            <Text style={styles.filterEmoji}>{config.emoji}</Text>
            <Text style={[styles.filterLabel, isActive && { color: config.color }]}>
              {config.label}
            </Text>
            <View style={[styles.filterBadge, { backgroundColor: config.color }]}>
              <Text style={styles.filterCount}>{count}</Text>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
};

// ============================================================================
// COMPONENTE: Tarjeta de Nota
// ============================================================================

const NoteCard = ({
  note,
  onEdit,
  onStatusChange,
  onDelete,
}: {
  note: InvestmentNote;
  onEdit: () => void;
  onStatusChange: (status: NoteStatus) => void;
  onDelete: () => void;
}) => {
  const statusConfig = STATUS_CONFIG[note.status];
  const [showStatusMenu, setShowStatusMenu] = useState(false);

  return (
    <Pressable style={styles.noteCard} onPress={onEdit}>
      {/* Header */}
      <View style={styles.noteHeader}>
        <View style={styles.noteHeaderLeft}>
          <Text style={styles.noteSymbol}>{note.symbol}</Text>
          <View style={[styles.statusBadge, { backgroundColor: statusConfig.color + '33' }]}>
            <Text style={styles.statusText}>{statusConfig.emoji} {statusConfig.label}</Text>
          </View>
        </View>
        <View style={styles.noteHeaderRight}>
          <Text style={styles.notePrice}>{formatPrice(note.currentPrice)}</Text>
          <Text style={[
            styles.noteDayChange,
            { color: note.dayChange >= 0 ? COLORS.green : COLORS.red }
          ]}>
            {formatPercent(note.dayChange)}
          </Text>
        </View>
      </View>

      <Text style={styles.noteName} numberOfLines={1}>{note.name}</Text>

      {/* Rating */}
      {note.rating && (
        <View style={styles.ratingContainer}>
          {[1, 2, 3, 4, 5].map((star) => (
            <Text key={star} style={styles.ratingStar}>
              {star <= note.rating! ? '⭐' : '☆'}
            </Text>
          ))}
        </View>
      )}

      {/* Thesis */}
      {note.thesis && (
        <View style={styles.thesisContainer}>
          <Text style={styles.thesisLabel}>💡 Tesis:</Text>
          <Text style={styles.thesisText} numberOfLines={2}>{note.thesis}</Text>
        </View>
      )}

      {/* Notes */}
      {note.notes && (
        <View style={styles.notesContainer}>
          <Text style={styles.notesText} numberOfLines={3}>{note.notes}</Text>
        </View>
      )}

      {/* Precios de referencia */}
      {(note.targetPrice || note.entryPrice || note.stopLoss) && (
        <View style={styles.pricesContainer}>
          {note.targetPrice && (
            <View style={[styles.priceTag, note.atTarget && styles.priceTagActive]}>
              <Text style={styles.priceTagLabel}>🎯 Target</Text>
              <Text style={styles.priceTagValue}>{formatPrice(note.targetPrice)}</Text>
              {note.distanceToTarget !== null && (
                <Text style={[
                  styles.priceTagDistance,
                  { color: note.distanceToTarget > 0 ? COLORS.green : COLORS.red }
                ]}>
                  {formatPercent(note.distanceToTarget)}
                </Text>
              )}
            </View>
          )}
          {note.entryPrice && (
            <View style={[styles.priceTag, note.atEntry && styles.priceTagActive]}>
              <Text style={styles.priceTagLabel}>📥 Entry</Text>
              <Text style={styles.priceTagValue}>{formatPrice(note.entryPrice)}</Text>
              {note.distanceToEntry !== null && (
                <Text style={[
                  styles.priceTagDistance,
                  { color: note.distanceToEntry < 0 ? COLORS.green : COLORS.orange }
                ]}>
                  {formatPercent(note.distanceToEntry)}
                </Text>
              )}
            </View>
          )}
          {note.stopLoss && (
            <View style={[styles.priceTag, note.atStopLoss && styles.priceTagDanger]}>
              <Text style={styles.priceTagLabel}>🛑 Stop</Text>
              <Text style={styles.priceTagValue}>{formatPrice(note.stopLoss)}</Text>
            </View>
          )}
        </View>
      )}

      {/* Alertas */}
      {(note.atTarget || note.atEntry || note.atStopLoss) && (
        <View style={styles.alertsContainer}>
          {note.atTarget && (
            <View style={[styles.alertBadge, { backgroundColor: COLORS.green }]}>
              <Text style={styles.alertText}>🎯 ¡Target alcanzado!</Text>
            </View>
          )}
          {note.atEntry && (
            <View style={[styles.alertBadge, { backgroundColor: COLORS.blue }]}>
              <Text style={styles.alertText}>📥 ¡Precio de entrada!</Text>
            </View>
          )}
          {note.atStopLoss && (
            <View style={[styles.alertBadge, { backgroundColor: COLORS.red }]}>
              <Text style={styles.alertText}>🛑 ¡Stop Loss!</Text>
            </View>
          )}
        </View>
      )}

      {/* Acciones */}
      <View style={styles.noteActions}>
        <Pressable 
          style={styles.noteActionButton} 
          onPress={() => setShowStatusMenu(true)}
        >
          <Text style={styles.noteActionText}>📋 Estado</Text>
        </Pressable>
        <Pressable style={styles.noteActionButton} onPress={onEdit}>
          <Text style={styles.noteActionText}>✏️ Editar</Text>
        </Pressable>
        <Pressable 
          style={[styles.noteActionButton, { borderColor: COLORS.red }]} 
          onPress={() => {
            Alert.alert(
              'Eliminar nota',
              `¿Eliminar la nota de ${note.symbol}?`,
              [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'Eliminar', style: 'destructive', onPress: onDelete },
              ]
            );
          }}
        >
          <Text style={[styles.noteActionText, { color: COLORS.red }]}>🗑️</Text>
        </Pressable>
      </View>

      {/* Menu de estado */}
      <Modal visible={showStatusMenu} transparent animationType="fade">
        <Pressable style={styles.menuOverlay} onPress={() => setShowStatusMenu(false)}>
          <View style={styles.menuContent}>
            <Text style={styles.menuTitle}>Cambiar estado</Text>
            {(Object.keys(STATUS_CONFIG) as NoteStatus[]).map((status) => {
              const config = STATUS_CONFIG[status];
              return (
                <Pressable
                  key={status}
                  style={[
                    styles.menuItem,
                    note.status === status && { backgroundColor: config.color + '33' }
                  ]}
                  onPress={() => {
                    onStatusChange(status);
                    setShowStatusMenu(false);
                  }}
                >
                  <Text style={styles.menuItemText}>
                    {config.emoji} {config.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Modal>
    </Pressable>
  );
};

// ============================================================================
// COMPONENTE: Modal para Crear/Editar Nota
// ============================================================================

const NoteModal = ({
  visible,
  note,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  note: InvestmentNote | null;
  onClose: () => void;
  onSubmit: (input: CreateNoteInput) => void;
}) => {
  const [symbol, setSymbol] = useState('');
  const [name, setName] = useState('');
  const [assetType, setAssetType] = useState<'stock' | 'crypto' | 'etf'>('stock');
  const [thesis, setThesis] = useState('');
  const [notes, setNotes] = useState('');
  const [targetPrice, setTargetPrice] = useState('');
  const [entryPrice, setEntryPrice] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [rating, setRating] = useState(0);

  useEffect(() => {
    if (note) {
      setSymbol(note.symbol);
      setName(note.name);
      setAssetType(note.assetType as 'stock' | 'crypto' | 'etf');
      setThesis(note.thesis || '');
      setNotes(note.notes || '');
      setTargetPrice(note.targetPrice?.toString() || '');
      setEntryPrice(note.entryPrice?.toString() || '');
      setStopLoss(note.stopLoss?.toString() || '');
      setRating(note.rating || 0);
    } else {
      setSymbol('');
      setName('');
      setAssetType('stock');
      setThesis('');
      setNotes('');
      setTargetPrice('');
      setEntryPrice('');
      setStopLoss('');
      setRating(0);
    }
  }, [note, visible]);

  const handleSubmit = () => {
    if (!symbol || !name) {
      Alert.alert('Error', 'Símbolo y nombre son requeridos');
      return;
    }

    onSubmit({
      symbol: symbol.toUpperCase(),
      name,
      assetType,
      thesis: thesis || undefined,
      notes: notes || undefined,
      targetPrice: targetPrice ? parseFloat(targetPrice) : undefined,
      entryPrice: entryPrice ? parseFloat(entryPrice) : undefined,
      stopLoss: stopLoss ? parseFloat(stopLoss) : undefined,
      rating: rating || undefined,
    });

    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {note ? '✏️ Editar Nota' : '📝 Nueva Nota'}
            </Text>
            <Pressable onPress={onClose}>
              <Ionicons name="close" size={24} color={COLORS.text} />
            </Pressable>
          </View>

          <ScrollView style={styles.modalBody}>
            {/* Símbolo y Nombre */}
            <View style={styles.inputRow}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={styles.inputLabel}>Símbolo *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="AAPL"
                  placeholderTextColor={COLORS.textSecondary}
                  value={symbol}
                  onChangeText={setSymbol}
                  autoCapitalize="characters"
                  editable={!note}
                />
              </View>
              <View style={{ flex: 2 }}>
                <Text style={styles.inputLabel}>Nombre *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Apple Inc."
                  placeholderTextColor={COLORS.textSecondary}
                  value={name}
                  onChangeText={setName}
                />
              </View>
            </View>

            {/* Tipo de Activo */}
            <Text style={styles.inputLabel}>Tipo</Text>
            <View style={styles.assetTypeRow}>
              {(['stock', 'crypto', 'etf'] as const).map((type) => (
                <Pressable
                  key={type}
                  style={[
                    styles.assetTypeButton,
                    assetType === type && styles.assetTypeButtonActive,
                  ]}
                  onPress={() => setAssetType(type)}
                >
                  <Text style={[
                    styles.assetTypeText,
                    assetType === type && styles.assetTypeTextActive,
                  ]}>
                    {type === 'stock' ? '📈 Stock' : type === 'crypto' ? '₿ Crypto' : '📊 ETF'}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Rating */}
            <Text style={styles.inputLabel}>Rating</Text>
            <View style={styles.ratingRow}>
              {[1, 2, 3, 4, 5].map((star) => (
                <Pressable key={star} onPress={() => setRating(star === rating ? 0 : star)}>
                  <Text style={styles.ratingStarLarge}>
                    {star <= rating ? '⭐' : '☆'}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Tesis */}
            <Text style={styles.inputLabel}>💡 Tesis de Inversión</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="¿Por qué te interesa este activo?"
              placeholderTextColor={COLORS.textSecondary}
              value={thesis}
              onChangeText={setThesis}
              multiline
            />

            {/* Notas */}
            <Text style={styles.inputLabel}>📝 Notas</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Apuntes, ideas, observaciones..."
              placeholderTextColor={COLORS.textSecondary}
              value={notes}
              onChangeText={setNotes}
              multiline
            />

            {/* Precios de referencia */}
            <Text style={styles.sectionTitle}>Precios de Referencia</Text>
            <View style={styles.inputRow}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={styles.inputLabel}>🎯 Target</Text>
                <TextInput
                  style={styles.input}
                  placeholder="200.00"
                  placeholderTextColor={COLORS.textSecondary}
                  value={targetPrice}
                  onChangeText={setTargetPrice}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={{ flex: 1, marginLeft: 8 }}>
                <Text style={styles.inputLabel}>📥 Entry</Text>
                <TextInput
                  style={styles.input}
                  placeholder="150.00"
                  placeholderTextColor={COLORS.textSecondary}
                  value={entryPrice}
                  onChangeText={setEntryPrice}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>

            <Text style={styles.inputLabel}>🛑 Stop Loss</Text>
            <TextInput
              style={styles.input}
              placeholder="130.00"
              placeholderTextColor={COLORS.textSecondary}
              value={stopLoss}
              onChangeText={setStopLoss}
              keyboardType="decimal-pad"
            />
          </ScrollView>

          <Pressable style={styles.submitButton} onPress={handleSubmit}>
            <Text style={styles.submitButtonText}>
              {note ? 'Guardar Cambios' : 'Crear Nota'}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
};

// ============================================================================
// PANTALLA PRINCIPAL
// ============================================================================

export default function NotesScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notesData, setNotesData] = useState<NotesData | null>(null);
  const [activeFilter, setActiveFilter] = useState<NoteStatus | 'all'>('all');

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editingNote, setEditingNote] = useState<InvestmentNote | null>(null);

  const loadData = useCallback(async () => {
    try {
      const data = await notesService.getAll();
      setNotesData(data);
    } catch (error) {
      console.error('Error loading notes:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleCreateNote = async (input: CreateNoteInput) => {
    const success = await notesService.upsert(input);
    if (success) {
      loadData();
    } else {
      Alert.alert('Error', 'No se pudo guardar la nota');
    }
  };

  const handleStatusChange = async (symbol: string, status: NoteStatus) => {
    const success = await notesService.updateStatus(symbol, status);
    if (success) {
      loadData();
    }
  };

  const handleDelete = async (symbol: string) => {
    const success = await notesService.delete(symbol);
    if (success) {
      loadData();
    }
  };

  const openEditModal = (note: InvestmentNote) => {
    setEditingNote(note);
    setShowModal(true);
  };

  const openCreateModal = () => {
    setEditingNote(null);
    setShowModal(true);
  };

  // Filtrar notas
  const filteredNotes = notesData?.notes.filter(
    (note) => activeFilter === 'all' || note.status === activeFilter
  ) || [];

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.blue} />
        <Text style={styles.loadingText}>Cargando notas...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={COLORS.blue}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={COLORS.text} />
          </Pressable>
          <Text style={styles.headerTitle}>📝 Mis Notas</Text>
          <Pressable style={styles.addButton} onPress={openCreateModal}>
            <Ionicons name="add" size={24} color={COLORS.text} />
          </Pressable>
        </View>

        {/* Filtros */}
        <StatusFilters
          activeFilter={activeFilter}
          counts={notesData?.counts || {}}
          onFilterChange={setActiveFilter}
        />

        {/* Lista de notas */}
        {filteredNotes.length > 0 ? (
          filteredNotes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              onEdit={() => openEditModal(note)}
              onStatusChange={(status) => handleStatusChange(note.symbol, status)}
              onDelete={() => handleDelete(note.symbol)}
            />
          ))
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📝</Text>
            <Text style={styles.emptyTitle}>
              {activeFilter === 'all' ? 'Sin notas' : `Sin notas "${STATUS_CONFIG[activeFilter].label}"`}
            </Text>
            <Text style={styles.emptyText}>
              Añade notas sobre activos que te interesen
            </Text>
            <Pressable style={styles.emptyButton} onPress={openCreateModal}>
              <Text style={styles.emptyButtonText}>➕ Crear Nota</Text>
            </Pressable>
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Modal */}
      <NoteModal
        visible={showModal}
        note={editingNote}
        onClose={() => setShowModal(false)}
        onSubmit={handleCreateNote}
      />
    </View>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: COLORS.textSecondary,
    marginTop: 12,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 16,
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.text,
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.blue,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Filters
  filtersContainer: {
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginHorizontal: 4,
    borderRadius: 20,
    backgroundColor: COLORS.card,
  },
  filterEmoji: {
    fontSize: 14,
    marginRight: 6,
  },
  filterLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginRight: 6,
  },
  filterBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  filterCount: {
    fontSize: 11,
    color: COLORS.text,
    fontWeight: '600',
  },

  // Note Card
  noteCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 16,
    backgroundColor: COLORS.card,
    borderRadius: 12,
  },
  noteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  noteHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  noteHeaderRight: {
    alignItems: 'flex-end',
  },
  noteSymbol: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 11,
    color: COLORS.text,
  },
  notePrice: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  noteDayChange: {
    fontSize: 12,
    fontWeight: '500',
  },
  noteName: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 8,
  },

  // Rating
  ratingContainer: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  ratingStar: {
    fontSize: 14,
    marginRight: 2,
  },

  // Thesis
  thesisContainer: {
    backgroundColor: COLORS.cardLight,
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  },
  thesisLabel: {
    fontSize: 12,
    color: COLORS.yellow,
    marginBottom: 4,
  },
  thesisText: {
    fontSize: 13,
    color: COLORS.text,
    lineHeight: 18,
  },

  // Notes
  notesContainer: {
    marginBottom: 8,
  },
  notesText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },

  // Prices
  pricesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  priceTag: {
    backgroundColor: COLORS.cardLight,
    borderRadius: 8,
    padding: 8,
    minWidth: 80,
  },
  priceTagActive: {
    borderWidth: 1,
    borderColor: COLORS.green,
  },
  priceTagDanger: {
    borderWidth: 1,
    borderColor: COLORS.red,
  },
  priceTagLabel: {
    fontSize: 10,
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  priceTagValue: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '600',
  },
  priceTagDistance: {
    fontSize: 11,
    fontWeight: '500',
  },

  // Alerts
  alertsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  alertBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  alertText: {
    fontSize: 11,
    color: COLORS.text,
    fontWeight: '600',
  },

  // Actions
  noteActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  noteActionButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  noteActionText: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },

  // Menu
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuContent: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    width: '80%',
  },
  menuTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 16,
    textAlign: 'center',
  },
  menuItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 8,
  },
  menuItemText: {
    fontSize: 15,
    color: COLORS.text,
  },

  // Empty State
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 32,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
  },
  emptyButton: {
    backgroundColor: COLORS.blue,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  emptyButtonText: {
    color: COLORS.text,
    fontWeight: '600',
    fontSize: 16,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.text,
  },
  modalBody: {
    padding: 20,
  },
  inputLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    backgroundColor: COLORS.cardLight,
    borderRadius: 8,
    padding: 12,
    color: COLORS.text,
    fontSize: 16,
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  inputRow: {
    flexDirection: 'row',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginTop: 20,
    marginBottom: 8,
  },
  assetTypeRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  assetTypeButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: COLORS.cardLight,
    alignItems: 'center',
  },
  assetTypeButtonActive: {
    backgroundColor: COLORS.blue,
  },
  assetTypeText: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  assetTypeTextActive: {
    color: COLORS.text,
    fontWeight: '600',
  },
  ratingRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  ratingStarLarge: {
    fontSize: 28,
  },
  submitButton: {
    margin: 20,
    backgroundColor: COLORS.blue,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  submitButtonText: {
    color: COLORS.text,
    fontWeight: '700',
    fontSize: 16,
  },
});
