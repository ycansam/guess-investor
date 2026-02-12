/**
 * Investment Notes Screen - Simplificado
 * 
 * Solo 3 parámetros de dinero:
 * - Dinero invertido
 * - Beneficio esperado
 * - Pérdida esperada
 * 
 * Resultado: beneficiado o pérdida
 * Nota de texto opcional
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
  notesService,
  ResultadoTipo,
  WalletTotals,
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
  border: '#333355',
};

// Formato de moneda
const formatMoney = (value: number): string => {
  return `€${value.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// Nombres de meses en español
const MONTH_NAMES_SHORT = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
];
const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

type FilterType = 'all' | 'open' | 'profit' | 'loss';

// ============================================================================
// COMPONENTE: Resumen del Wallet
// ============================================================================

const WalletSummary = ({ wallet }: { wallet: WalletTotals }) => {
  const balanceColor = wallet.balance >= 0 ? COLORS.green : COLORS.red;

  return (
    <View style={styles.walletCard}>
      <Text style={styles.walletTitle}>💰 Mi Wallet</Text>
      
      <View style={styles.walletRow}>
        <View style={styles.walletItem}>
          <Text style={styles.walletLabel}>Beneficios</Text>
          <Text style={[styles.walletValue, { color: COLORS.green }]}>
            +{formatMoney(wallet.totalBeneficios)}
          </Text>
          <Text style={styles.walletCount}>{wallet.countBeneficios} operaciones</Text>
        </View>
        
        <View style={styles.walletItem}>
          <Text style={styles.walletLabel}>Pérdidas</Text>
          <Text style={[styles.walletValue, { color: COLORS.red }]}>
            -{formatMoney(wallet.totalPerdidas)}
          </Text>
          <Text style={styles.walletCount}>{wallet.countPerdidas} operaciones</Text>
        </View>
      </View>

      <View style={styles.walletBalance}>
        <Text style={styles.walletBalanceLabel}>Balance Total</Text>
        <Text style={[styles.walletBalanceValue, { color: balanceColor }]}>
          {wallet.balance >= 0 ? '+' : ''}{formatMoney(wallet.balance)}
        </Text>
      </View>

      <Text style={styles.walletAbiertas}>
        📊 {wallet.countAbiertas} posiciones abiertas
      </Text>
    </View>
  );
};

// ============================================================================
// COMPONENTE: Resumen Mensual (al lado del wallet)
// ============================================================================

interface MonthData {
  month: number;
  year: number;
  gain: number;
  loss: number;
  balance: number;
  ops: number;
}

function computeMonthlyData(notes: InvestmentNote[]): MonthData[] {
  const closedNotes = notes.filter(n => n.resultado && n.resultadoFinal !== null);
  const map = new Map<string, MonthData>();

  for (const note of closedNotes) {
    const d = new Date(note.updatedAt);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (!map.has(key)) {
      map.set(key, { month: d.getMonth(), year: d.getFullYear(), gain: 0, loss: 0, balance: 0, ops: 0 });
    }
    const entry = map.get(key)!;
    if (note.resultado === 'beneficiado') {
      entry.gain += note.resultadoFinal!;
    } else {
      entry.loss += note.resultadoFinal!;
    }
    entry.balance = entry.gain - entry.loss;
    entry.ops++;
  }

  // Ordenar por fecha descendente
  return Array.from(map.values()).sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    return b.month - a.month;
  });
}

const MonthlyStats = ({ notes }: { notes: InvestmentNote[] }) => {
  const [showHistory, setShowHistory] = useState(false);
  const now = new Date();
  const allMonths = computeMonthlyData(notes);

  // Mes actual y anterior
  const currentMonth = allMonths.find(m => m.month === now.getMonth() && m.year === now.getFullYear())
    || { month: now.getMonth(), year: now.getFullYear(), gain: 0, loss: 0, balance: 0, ops: 0 };

  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonth = allMonths.find(m => m.month === prevDate.getMonth() && m.year === prevDate.getFullYear());

  // Calcular variación vs mes anterior
  let changePercent: number | null = null;
  let changeValue: number | null = null;
  if (prevMonth && prevMonth.balance !== 0) {
    changeValue = currentMonth.balance - prevMonth.balance;
    changePercent = (changeValue / Math.abs(prevMonth.balance)) * 100;
  } else if (prevMonth) {
    changeValue = currentMonth.balance - prevMonth.balance;
  }

  const balanceColor = currentMonth.balance >= 0 ? COLORS.green : COLORS.red;
  const historyMonths = allMonths.filter(m => !(m.month === now.getMonth() && m.year === now.getFullYear()));

  return (
    <View style={msStyles.container}>
      <Text style={msStyles.title}>📅 Este Mes</Text>
      <Text style={msStyles.monthName}>{MONTH_NAMES[currentMonth.month]}</Text>

      {/* Balance del mes actual */}
      <Text style={[msStyles.balance, { color: balanceColor }]}>
        {currentMonth.balance >= 0 ? '+' : ''}{formatMoney(currentMonth.balance)}
      </Text>

      {/* Desglose mini */}
      <View style={msStyles.miniRow}>
        <Text style={[msStyles.miniVal, { color: COLORS.green }]}>+{formatMoney(currentMonth.gain)}</Text>
        <Text style={msStyles.miniSep}>|</Text>
        <Text style={[msStyles.miniVal, { color: COLORS.red }]}>-{formatMoney(currentMonth.loss)}</Text>
      </View>
      <Text style={msStyles.opsCount}>{currentMonth.ops} operaciones</Text>

      {/* Comparación vs mes anterior */}
      {prevMonth && (
        <View style={msStyles.compareBox}>
          <Text style={msStyles.compareLabel}>vs {MONTH_NAMES_SHORT[prevMonth.month]}</Text>
          <View style={msStyles.compareValues}>
            {changeValue !== null && (
              <Text style={[msStyles.compareAmount, { color: changeValue >= 0 ? COLORS.green : COLORS.red }]}>
                {changeValue >= 0 ? '▲' : '▼'} {formatMoney(Math.abs(changeValue))}
              </Text>
            )}
            {changePercent !== null && (
              <Text style={[msStyles.comparePercent, { color: changePercent >= 0 ? COLORS.green : COLORS.red }]}>
                {changePercent >= 0 ? '+' : ''}{changePercent.toFixed(1)}%
              </Text>
            )}
          </View>
        </View>
      )}

      {/* Ver meses anteriores */}
      {historyMonths.length > 0 && (
        <>
          <Pressable
            style={msStyles.historyToggle}
            onPress={() => setShowHistory(!showHistory)}
          >
            <Text style={msStyles.historyToggleText}>
              {showHistory ? 'Ocultar historial' : 'Ver meses anteriores'}
            </Text>
            <Ionicons
              name={showHistory ? 'chevron-up' : 'chevron-down'}
              size={14}
              color={COLORS.blue}
            />
          </Pressable>

          {showHistory && (
            <View style={msStyles.historyList}>
              {historyMonths.map((m, i) => {
                const prev = historyMonths[i + 1];
                let pct: number | null = null;
                if (prev && prev.balance !== 0) {
                  pct = ((m.balance - prev.balance) / Math.abs(prev.balance)) * 100;
                }
                return (
                  <View key={`${m.year}-${m.month}`} style={msStyles.historyRow}>
                    <Text style={msStyles.historyMonth}>
                      {MONTH_NAMES_SHORT[m.month]} {m.year !== now.getFullYear() ? m.year : ''}
                    </Text>
                    <View style={msStyles.historyRight}>
                      <Text style={[
                        msStyles.historyBalance,
                        { color: m.balance >= 0 ? COLORS.green : COLORS.red },
                      ]}>
                        {m.balance >= 0 ? '+' : ''}{formatMoney(m.balance)}
                      </Text>
                      {pct !== null && (
                        <Text style={[
                          msStyles.historyPct,
                          { color: pct >= 0 ? COLORS.green : COLORS.red },
                        ]}>
                          {pct >= 0 ? '▲' : '▼'}{Math.abs(pct).toFixed(0)}%
                        </Text>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </>
      )}
    </View>
  );
};

// Estilos del resumen mensual
const msStyles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 10,
    backgroundColor: COLORS.card,
    borderRadius: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 2,
  },
  monthName: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 6,
  },
  balance: {
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
  },
  miniRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
    gap: 6,
  },
  miniVal: {
    fontSize: 14,
    fontWeight: '600',
  },
  miniSep: {
    fontSize: 14,
    color: COLORS.border,
  },
  opsCount: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 4,
  },
  compareBox: {
    marginTop: 10,
    backgroundColor: COLORS.cardLight,
    borderRadius: 8,
    padding: 8,
    alignItems: 'center',
  },
  compareLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginBottom: 3,
  },
  compareValues: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  compareAmount: {
    fontSize: 14,
    fontWeight: '700',
  },
  comparePercent: {
    fontSize: 13,
    fontWeight: '700',
  },
  historyToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    gap: 4,
  },
  historyToggleText: {
    fontSize: 12,
    color: COLORS.blue,
    fontWeight: '600',
  },
  historyList: {
    marginTop: 8,
  },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border + '40',
  },
  historyMonth: {
    fontSize: 13,
    color: COLORS.text,
    fontWeight: '600',
  },
  historyRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  historyBalance: {
    fontSize: 13,
    fontWeight: '700',
  },
  historyPct: {
    fontSize: 11,
    fontWeight: '600',
  },
});


// ============================================================================
// COMPONENTE: Resumen Anual por Meses
// ============================================================================

const YearlyOverview = ({ notes }: { notes: InvestmentNote[] }) => {
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());

  const allMonths = computeMonthlyData(notes);

  // Datos de los 12 meses del año seleccionado
  const yearMonths: MonthData[] = Array.from({ length: 12 }, (_, i) => {
    const found = allMonths.find(m => m.month === i && m.year === viewYear);
    return found || { month: i, year: viewYear, gain: 0, loss: 0, balance: 0, ops: 0 };
  });

  // Totales del año
  const yearGain = yearMonths.reduce((s, m) => s + m.gain, 0);
  const yearLoss = yearMonths.reduce((s, m) => s + m.loss, 0);
  const yearBalance = yearGain - yearLoss;
  const yearOps = yearMonths.reduce((s, m) => s + m.ops, 0);

  // Para barras proporcionales
  const maxAbs = Math.max(...yearMonths.map(m => Math.abs(m.balance)), 1);

  // Mejor y peor mes
  const bestMonth = yearMonths.reduce((best, m) => m.balance > best.balance ? m : best, yearMonths[0]);
  const worstMonth = yearMonths.reduce((worst, m) => m.balance < worst.balance ? m : worst, yearMonths[0]);

  // Años disponibles
  const availableYears = [...new Set(allMonths.map(m => m.year))].sort((a, b) => b - a);
  if (!availableYears.includes(now.getFullYear())) availableYears.unshift(now.getFullYear());

  return (
    <View style={yrStyles.container}>
      {/* Header con navegación de año */}
      <View style={yrStyles.header}>
        <Text style={yrStyles.title}>📊 Resumen Anual</Text>
        <View style={yrStyles.yearNav}>
          <Pressable
            onPress={() => setViewYear(viewYear - 1)}
            style={yrStyles.yearNavBtn}
          >
            <Ionicons name="chevron-back" size={16} color={COLORS.text} />
          </Pressable>
          <Text style={yrStyles.yearLabel}>{viewYear}</Text>
          <Pressable
            onPress={() => setViewYear(viewYear + 1)}
            style={[yrStyles.yearNavBtn, viewYear >= now.getFullYear() && { opacity: 0.3 }]}
            disabled={viewYear >= now.getFullYear()}
          >
            <Ionicons name="chevron-forward" size={16} color={COLORS.text} />
          </Pressable>
        </View>
      </View>

      {/* Totales del año */}
      <View style={yrStyles.totalRow}>
        <View style={yrStyles.totalItem}>
          <Text style={[yrStyles.totalValue, { color: COLORS.green }]}>+{formatMoney(yearGain)}</Text>
          <Text style={yrStyles.totalLabel}>Ganancias</Text>
        </View>
        <View style={[yrStyles.totalItem, yrStyles.totalCenter]}>
          <Text style={[yrStyles.totalValueBig, { color: yearBalance >= 0 ? COLORS.green : COLORS.red }]}>
            {yearBalance >= 0 ? '+' : ''}{formatMoney(yearBalance)}
          </Text>
          <Text style={yrStyles.totalLabel}>{yearOps} ops</Text>
        </View>
        <View style={yrStyles.totalItem}>
          <Text style={[yrStyles.totalValue, { color: COLORS.red }]}>-{formatMoney(yearLoss)}</Text>
          <Text style={yrStyles.totalLabel}>Pérdidas</Text>
        </View>
      </View>

      {/* Gráfico de barras por mes */}
      <View style={yrStyles.chartContainer}>
        {yearMonths.map((m, i) => {
          const barHeight = Math.abs(m.balance) / maxAbs;
          const isPositive = m.balance >= 0;
          const isCurrent = i === now.getMonth() && viewYear === now.getFullYear();
          const hasData = m.ops > 0;

          return (
            <View key={i} style={yrStyles.barColumn}>
              {/* Barra */}
              <View style={yrStyles.barTrack}>
                {hasData && (
                  <View
                    style={[
                      yrStyles.bar,
                      {
                        height: `${Math.max(barHeight * 100, 8)}%`,
                        backgroundColor: isPositive ? COLORS.green : COLORS.red,
                        alignSelf: 'flex-end',
                      },
                    ]}
                  />
                )}
              </View>
              {/* Valor */}
              {hasData && (
                <Text style={[
                  yrStyles.barValue,
                  { color: isPositive ? COLORS.green : COLORS.red },
                ]}>
                  {m.balance >= 0 ? '+' : ''}{m.balance.toFixed(0)}
                </Text>
              )}
              {/* Label del mes */}
              <Text style={[
                yrStyles.barLabel,
                isCurrent && { color: COLORS.blue, fontWeight: '700' },
              ]}>
                {MONTH_NAMES_SHORT[i]}
              </Text>
            </View>
          );
        })}
      </View>

      {/* Mejor / Peor mes */}
      {yearOps > 0 && (
        <View style={yrStyles.extremesRow}>
          {bestMonth.ops > 0 && (
            <View style={[yrStyles.extremeBox, { backgroundColor: COLORS.green + '15' }]}>
              <Text style={yrStyles.extremeLabel}>🏆 Mejor mes</Text>
              <Text style={[yrStyles.extremeMonth, { color: COLORS.green }]}>
                {MONTH_NAMES_SHORT[bestMonth.month]}
              </Text>
              <Text style={[yrStyles.extremeValue, { color: COLORS.green }]}>
                +{formatMoney(bestMonth.balance)}
              </Text>
            </View>
          )}
          {worstMonth.ops > 0 && worstMonth.balance < 0 && (
            <View style={[yrStyles.extremeBox, { backgroundColor: COLORS.red + '15' }]}>
              <Text style={yrStyles.extremeLabel}>📉 Peor mes</Text>
              <Text style={[yrStyles.extremeMonth, { color: COLORS.red }]}>
                {MONTH_NAMES_SHORT[worstMonth.month]}
              </Text>
              <Text style={[yrStyles.extremeValue, { color: COLORS.red }]}>
                {formatMoney(worstMonth.balance)}
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
};

// Estilos del resumen anual
const yrStyles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 10,
    backgroundColor: COLORS.card,
    borderRadius: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },
  yearNav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  yearNavBtn: {
    padding: 3,
    borderRadius: 6,
    backgroundColor: COLORS.cardLight,
  },
  yearLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
    minWidth: 36,
    textAlign: 'center',
  },
  totalRow: {
    flexDirection: 'row',
    backgroundColor: COLORS.cardLight,
    borderRadius: 8,
    padding: 6,
    marginBottom: 8,
  },
  totalItem: {
    flex: 1,
    alignItems: 'center',
  },
  totalCenter: {
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: COLORS.border,
  },
  totalValue: {
    fontSize: 12,
    fontWeight: '700',
  },
  totalValueBig: {
    fontSize: 15,
    fontWeight: '800',
  },
  totalLabel: {
    fontSize: 10,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  chartContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 70,
    gap: 1,
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
  },
  barTrack: {
    width: '100%',
    height: 42,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  bar: {
    width: '70%',
    borderRadius: 2,
    minHeight: 3,
  },
  barValue: {
    fontSize: 8,
    fontWeight: '700',
    marginTop: 1,
  },
  barLabel: {
    fontSize: 9,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  extremesRow: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 8,
  },
  extremeBox: {
    flex: 1,
    borderRadius: 6,
    padding: 5,
    alignItems: 'center',
  },
  extremeLabel: {
    fontSize: 10,
    color: COLORS.textSecondary,
  },
  extremeMonth: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 1,
  },
  extremeValue: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 1,
  },
});

// ============================================================================
// COMPONENTE: Filtros
// ============================================================================

const Filters = ({
  activeFilter,
  counts,
  onFilterChange,
}: {
  activeFilter: FilterType;
  counts: { all: number; open: number; profit: number; loss: number };
  onFilterChange: (filter: FilterType) => void;
}) => {
  const filters: { key: FilterType; label: string; emoji: string; color: string }[] = [
    { key: 'all', label: 'Todas', emoji: '📝', color: COLORS.text },
    { key: 'open', label: 'Abiertas', emoji: '⏳', color: COLORS.orange },
    { key: 'profit', label: 'Beneficio', emoji: '✅', color: COLORS.green },
    { key: 'loss', label: 'Pérdida', emoji: '❌', color: COLORS.red },
  ];

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filtersContainer}>
      {filters.map((filter) => {
        const isActive = activeFilter === filter.key;
        const count = counts[filter.key];

        return (
          <Pressable
            key={filter.key}
            style={[styles.filterButton, isActive && { backgroundColor: filter.color + '33' }]}
            onPress={() => onFilterChange(filter.key)}
          >
            <Text style={styles.filterEmoji}>{filter.emoji}</Text>
            <Text style={[styles.filterLabel, isActive && { color: filter.color }]}>
              {filter.label}
            </Text>
            <View style={[styles.filterBadge, { backgroundColor: filter.color }]}>
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
  onSetResult,
  onClearResult,
  onDelete,
}: {
  note: InvestmentNote;
  onEdit: () => void;
  onSetResult: () => void;
  onClearResult: () => void;
  onDelete: () => void;
}) => {
  const isClosed = note.resultado !== null;
  const isProfitable = note.resultado === 'beneficiado';

  return (
    <Pressable style={styles.noteCard} onPress={onEdit}>
      {/* Header */}
      <View style={styles.noteHeader}>
        <Text style={styles.noteSymbol}>{note.symbol}</Text>
        {isClosed ? (
          <View style={[
            styles.resultBadge,
            { backgroundColor: isProfitable ? COLORS.green + '33' : COLORS.red + '33' }
          ]}>
            <Text style={[
              styles.resultText,
              { color: isProfitable ? COLORS.green : COLORS.red }
            ]}>
              {isProfitable ? '✅ Beneficio' : '❌ Pérdida'}
            </Text>
          </View>
        ) : (
          <View style={[styles.resultBadge, { backgroundColor: COLORS.orange + '33' }]}>
            <Text style={[styles.resultText, { color: COLORS.orange }]}>
              ⏳ Abierta
            </Text>
          </View>
        )}
      </View>

      {/* Datos de dinero */}
      <View style={styles.moneyGrid}>
        <View style={styles.moneyItem}>
          <Text style={styles.moneyLabel}>💵 Invertido</Text>
          <Text style={styles.moneyValue}>{formatMoney(note.dineroInvertido)}</Text>
        </View>
        <View style={styles.moneyItem}>
          <Text style={styles.moneyLabel}>📈 Beneficio esp.</Text>
          <Text style={[styles.moneyValue, { color: COLORS.green }]}>
            +{formatMoney(note.beneficioEsperado)}
          </Text>
        </View>
        <View style={styles.moneyItem}>
          <Text style={styles.moneyLabel}>📉 Pérdida esp.</Text>
          <Text style={[styles.moneyValue, { color: COLORS.red }]}>
            -{formatMoney(note.perdidaEsperada)}
          </Text>
        </View>
      </View>

      {/* Resultado final si está cerrada */}
      {isClosed && note.resultadoFinal !== null && (
        <View style={[
          styles.resultFinal,
          { backgroundColor: isProfitable ? COLORS.green + '22' : COLORS.red + '22' }
        ]}>
          <Text style={styles.resultFinalLabel}>Resultado final:</Text>
          <Text style={[
            styles.resultFinalValue,
            { color: isProfitable ? COLORS.green : COLORS.red }
          ]}>
            {isProfitable ? '+' : '-'}{formatMoney(Math.abs(note.resultadoFinal))}
          </Text>
        </View>
      )}

      {/* Nota de texto */}
      {note.note && (
        <View style={styles.noteTextContainer}>
          <Text style={styles.noteText} numberOfLines={3}>{note.note}</Text>
        </View>
      )}

      {/* Acciones */}
      <View style={styles.noteActions}>
        {!isClosed ? (
          <Pressable style={[styles.actionButton, styles.actionButtonPrimary]} onPress={onSetResult}>
            <Text style={styles.actionButtonTextPrimary}>💰 Cerrar Posición</Text>
          </Pressable>
        ) : (
          <Pressable style={styles.actionButton} onPress={onClearResult}>
            <Text style={styles.actionButtonText}>🔄 Reabrir</Text>
          </Pressable>
        )}
        <Pressable style={styles.actionButton} onPress={onEdit}>
          <Text style={styles.actionButtonText}>✏️ Editar</Text>
        </Pressable>
        <Pressable 
          style={[styles.actionButton, { borderColor: COLORS.red }]} 
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
          <Text style={[styles.actionButtonText, { color: COLORS.red }]}>🗑️</Text>
        </Pressable>
      </View>
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
  const [dineroInvertido, setDineroInvertido] = useState('');
  const [beneficioEsperado, setBeneficioEsperado] = useState('');
  const [perdidaEsperada, setPerdidaEsperada] = useState('');
  const [noteText, setNoteText] = useState('');

  useEffect(() => {
    if (note) {
      setSymbol(note.symbol);
      setDineroInvertido(note.dineroInvertido.toString());
      setBeneficioEsperado(note.beneficioEsperado.toString());
      setPerdidaEsperada(note.perdidaEsperada.toString());
      setNoteText(note.note || '');
    } else {
      setSymbol('');
      setDineroInvertido('');
      setBeneficioEsperado('');
      setPerdidaEsperada('');
      setNoteText('');
    }
  }, [note, visible]);

  const handleSubmit = () => {
    if (!symbol) {
      Alert.alert('Error', 'El símbolo es requerido');
      return;
    }

    onSubmit({
      symbol: symbol.toUpperCase(),
      dineroInvertido: parseFloat(dineroInvertido) || 0,
      beneficioEsperado: parseFloat(beneficioEsperado) || 0,
      perdidaEsperada: parseFloat(perdidaEsperada) || 0,
      note: noteText || undefined,
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
            {/* Símbolo */}
            <Text style={styles.inputLabel}>Símbolo *</Text>
            <TextInput
              style={styles.input}
              placeholder="AAPL, BTC-USD, etc."
              placeholderTextColor={COLORS.textSecondary}
              value={symbol}
              onChangeText={setSymbol}
              autoCapitalize="characters"
              editable={!note}
            />

            {/* Dinero invertido */}
            <Text style={styles.inputLabel}>💵 Dinero Invertido (€)</Text>
            <TextInput
              style={styles.input}
              placeholder="1000.00"
              placeholderTextColor={COLORS.textSecondary}
              value={dineroInvertido}
              onChangeText={setDineroInvertido}
              keyboardType="decimal-pad"
            />

            {/* Beneficio esperado */}
            <Text style={styles.inputLabel}>📈 Beneficio Esperado (€)</Text>
            <TextInput
              style={styles.input}
              placeholder="200.00"
              placeholderTextColor={COLORS.textSecondary}
              value={beneficioEsperado}
              onChangeText={setBeneficioEsperado}
              keyboardType="decimal-pad"
            />

            {/* Pérdida esperada */}
            <Text style={styles.inputLabel}>📉 Pérdida Esperada (€)</Text>
            <TextInput
              style={styles.input}
              placeholder="100.00"
              placeholderTextColor={COLORS.textSecondary}
              value={perdidaEsperada}
              onChangeText={setPerdidaEsperada}
              keyboardType="decimal-pad"
            />

            {/* Notas */}
            <Text style={styles.inputLabel}>📝 Notas (opcional)</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Apuntes, razonamientos, etc."
              placeholderTextColor={COLORS.textSecondary}
              value={noteText}
              onChangeText={setNoteText}
              multiline
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
// COMPONENTE: Modal para Cerrar Posición
// ============================================================================

const ResultModal = ({
  visible,
  note,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  note: InvestmentNote | null;
  onClose: () => void;
  onSubmit: (resultado: ResultadoTipo, resultadoFinal: number) => void;
}) => {
  const [resultado, setResultado] = useState<ResultadoTipo | null>(null);
  const [amount, setAmount] = useState('');

  useEffect(() => {
    if (visible) {
      setResultado(null);
      setAmount('');
    }
  }, [visible]);

  const handleSubmit = () => {
    if (!resultado) {
      Alert.alert('Error', 'Selecciona si fue beneficio o pérdida');
      return;
    }
    
    const finalAmount = parseFloat(amount) || 0;
    if (finalAmount <= 0) {
      Alert.alert('Error', 'Introduce el importe del resultado');
      return;
    }

    onSubmit(resultado, finalAmount);
    onClose();
  };

  if (!note) return null;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <View style={styles.resultModalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>💰 Cerrar Posición</Text>
            <Pressable onPress={onClose}>
              <Ionicons name="close" size={24} color={COLORS.text} />
            </Pressable>
          </View>

          <View style={styles.resultModalBody}>
            <Text style={styles.resultSymbol}>{note.symbol}</Text>
            <Text style={styles.resultInvested}>
              Invertido: {formatMoney(note.dineroInvertido)}
            </Text>

            {/* Botones de resultado */}
            <Text style={[styles.inputLabel, { marginTop: 20 }]}>¿Cómo terminó?</Text>
            <View style={styles.resultButtons}>
              <Pressable
                style={[
                  styles.resultButton,
                  resultado === 'beneficiado' && styles.resultButtonProfit,
                ]}
                onPress={() => setResultado('beneficiado')}
              >
                <Text style={[
                  styles.resultButtonText,
                  resultado === 'beneficiado' && styles.resultButtonTextActive,
                ]}>
                  ✅ Beneficio
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.resultButton,
                  resultado === 'perdida' && styles.resultButtonLoss,
                ]}
                onPress={() => setResultado('perdida')}
              >
                <Text style={[
                  styles.resultButtonText,
                  resultado === 'perdida' && styles.resultButtonTextActive,
                ]}>
                  ❌ Pérdida
                </Text>
              </Pressable>
            </View>

            {/* Importe */}
            <Text style={styles.inputLabel}>
              {resultado === 'beneficiado' ? '💰 Importe ganado (€)' : '💸 Importe perdido (€)'}
            </Text>
            <TextInput
              style={styles.input}
              placeholder={resultado === 'beneficiado' 
                ? note.beneficioEsperado.toString()
                : note.perdidaEsperada.toString()
              }
              placeholderTextColor={COLORS.textSecondary}
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
            />
          </View>

          <Pressable 
            style={[
              styles.submitButton,
              resultado === 'beneficiado' && { backgroundColor: COLORS.green },
              resultado === 'perdida' && { backgroundColor: COLORS.red },
            ]} 
            onPress={handleSubmit}
          >
            <Text style={styles.submitButtonText}>Confirmar</Text>
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
  // Sidebar is always visible via layout
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notesData, setNotesData] = useState<NotesData | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');

  // Modales
  const [showModal, setShowModal] = useState(false);
  const [showResultModal, setShowResultModal] = useState(false);
  const [editingNote, setEditingNote] = useState<InvestmentNote | null>(null);
  const [closingNote, setClosingNote] = useState<InvestmentNote | null>(null);

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

  const handleSetResult = async (resultado: ResultadoTipo, resultadoFinal: number) => {
    if (!closingNote) return;
    
    const success = await notesService.setResult(closingNote.symbol, resultado, resultadoFinal);
    if (success) {
      loadData();
    } else {
      Alert.alert('Error', 'No se pudo cerrar la posición');
    }
  };

  const handleClearResult = async (symbol: string) => {
    const success = await notesService.clearResult(symbol);
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

  const openResultModal = (note: InvestmentNote) => {
    setClosingNote(note);
    setShowResultModal(true);
  };

  // Calcular contadores para filtros
  const counts = {
    all: notesData?.notes.length || 0,
    open: notesData?.notes.filter(n => !n.resultado).length || 0,
    profit: notesData?.notes.filter(n => n.resultado === 'beneficiado').length || 0,
    loss: notesData?.notes.filter(n => n.resultado === 'perdida').length || 0,
  };

  // Filtrar notas
  const filteredNotes = notesData?.notes.filter((note) => {
    switch (activeFilter) {
      case 'open': return !note.resultado;
      case 'profit': return note.resultado === 'beneficiado';
      case 'loss': return note.resultado === 'perdida';
      default: return true;
    }
  }) || [];

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
          <View style={styles.headerLeft}>
            <Text style={styles.headerTitle}>📝 Mis Notas</Text>
          </View>
          <Pressable style={styles.addButton} onPress={openCreateModal}>
            <Ionicons name="add" size={24} color={COLORS.text} />
          </Pressable>
        </View>

        {/* Wallet + Resumen Mensual + Resumen Anual */}
        <View style={styles.topRow}>
          {notesData?.wallet && <WalletSummary wallet={notesData.wallet} />}
          {notesData?.notes && <MonthlyStats notes={notesData.notes} />}
          {notesData?.notes && notesData.notes.some(n => n.resultado) && (
            <YearlyOverview notes={notesData.notes} />
          )}
        </View>

        {/* Filtros */}
        <Filters
          activeFilter={activeFilter}
          counts={counts}
          onFilterChange={setActiveFilter}
        />

        {/* Lista de notas */}
        {filteredNotes.length > 0 ? (
          filteredNotes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              onEdit={() => openEditModal(note)}
              onSetResult={() => openResultModal(note)}
              onClearResult={() => handleClearResult(note.symbol)}
              onDelete={() => handleDelete(note.symbol)}
            />
          ))
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📝</Text>
            <Text style={styles.emptyTitle}>Sin notas</Text>
            <Text style={styles.emptyText}>
              Añade notas sobre tus inversiones para hacer seguimiento
            </Text>
            <Pressable style={styles.emptyButton} onPress={openCreateModal}>
              <Text style={styles.emptyButtonText}>➕ Crear Nota</Text>
            </Pressable>
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Modal de crear/editar */}
      <NoteModal
        visible={showModal}
        note={editingNote}
        onClose={() => setShowModal(false)}
        onSubmit={handleCreateNote}
      />

      {/* Modal de resultado */}
      <ResultModal
        visible={showResultModal}
        note={closingNote}
        onClose={() => setShowResultModal(false)}
        onSubmit={handleSetResult}
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
    paddingHorizontal: 12,
    paddingTop: 16,
    paddingBottom: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
  },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.blue,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Top row (wallet + monthly + yearly)
  topRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 12,
    gap: 8,
  },

  // Wallet
  walletCard: {
    flex: 1,
    padding: 10,
    backgroundColor: COLORS.card,
    borderRadius: 12,
  },
  walletTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 8,
  },
  walletRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  walletItem: {
    flex: 1,
    alignItems: 'center',
  },
  walletLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  walletValue: {
    fontSize: 17,
    fontWeight: '700',
  },
  walletCount: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  walletBalance: {
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  walletBalanceLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  walletBalanceValue: {
    fontSize: 22,
    fontWeight: '700',
  },
  walletAbiertas: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 10,
  },

  // Filters
  filtersContainer: {
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginHorizontal: 4,
    borderRadius: 16,
    backgroundColor: COLORS.card,
  },
  filterEmoji: {
    fontSize: 12,
    marginRight: 4,
  },
  filterLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginRight: 4,
  },
  filterBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 8,
  },
  filterCount: {
    fontSize: 10,
    color: COLORS.text,
    fontWeight: '600',
  },

  // Note Card
  noteCard: {
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 14,
    backgroundColor: COLORS.card,
    borderRadius: 12,
  },
  noteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  noteSymbol: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
  },
  resultBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  resultText: {
    fontSize: 12,
    fontWeight: '600',
  },

  // Money Grid
  moneyGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  moneyItem: {
    flex: 1,
    backgroundColor: COLORS.cardLight,
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
  },
  moneyLabel: {
    fontSize: 10,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  moneyValue: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },

  // Result Final
  resultFinal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  resultFinalLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  resultFinalValue: {
    fontSize: 18,
    fontWeight: '700',
  },

  // Note Text
  noteTextContainer: {
    backgroundColor: COLORS.cardLight,
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  noteText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },

  // Actions
  noteActions: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  actionButtonPrimary: {
    backgroundColor: COLORS.blue,
    borderColor: COLORS.blue,
  },
  actionButtonText: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  actionButtonTextPrimary: {
    fontSize: 12,
    color: COLORS.text,
    fontWeight: '600',
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
    maxHeight: '85%',
  },
  resultModalContent: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '60%',
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
  resultModalBody: {
    padding: 20,
    alignItems: 'center',
  },
  resultSymbol: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 8,
  },
  resultInvested: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  resultButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
    marginBottom: 20,
    width: '100%',
  },
  resultButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: COLORS.cardLight,
    alignItems: 'center',
  },
  resultButtonProfit: {
    backgroundColor: COLORS.green,
  },
  resultButtonLoss: {
    backgroundColor: COLORS.red,
  },
  resultButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  resultButtonTextActive: {
    color: COLORS.text,
  },
  inputLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 6,
    marginTop: 12,
    alignSelf: 'flex-start',
    width: '100%',
  },
  input: {
    backgroundColor: COLORS.cardLight,
    borderRadius: 8,
    padding: 12,
    color: COLORS.text,
    fontSize: 16,
    width: '100%',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
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
