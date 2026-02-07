import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, NativeScrollEvent, NativeSyntheticEvent, Platform, ScrollView, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { InvestmentPrediction } from '../../../types';
import { AlertsModal } from '../../alerts-modal';
import { PredictionAnalysisModal } from '../../prediction-analysis-modal';
import { PredictionCard } from '../../prediction-card';
import { styles } from './predictions-list-content.styles';

const BREAKPOINTS = {
  tablet: 768,
  desktop: 1024,
};

const ITEMS_PER_PAGE = 24; // 3 columns x 8 rows
const NUM_COLUMNS = 3;

interface PredictionsListContentProps {
  predictions: InvestmentPrediction[];
  onClear?: () => void;
  onRemove?: (id: string) => void;
  onClose?: () => void;
}

export const PredictionsListContent: React.FC<PredictionsListContentProps> = ({
  predictions,
  onClear,
  onRemove,
  onClose,
}) => {
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= BREAKPOINTS.desktop;
  
  const [selectedPrediction, setSelectedPrediction] = useState<InvestmentPrediction | null>(null);
  const [alertPrediction, setAlertPrediction] = useState<InvestmentPrediction | null>(null);
  const [displayCount, setDisplayCount] = useState(ITEMS_PER_PAGE);
  const [loadingMore, setLoadingMore] = useState(false);

  // Predicciones visibles según paginación
  const visiblePredictions = useMemo(() => {
    return predictions.slice(0, displayCount);
  }, [predictions, displayCount]);

  const hasMore = displayCount < predictions.length;

  // Cargar más items al hacer scroll
  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    
    setLoadingMore(true);
    // Simular pequeño delay para smooth UX
    setTimeout(() => {
      setDisplayCount(prev => Math.min(prev + ITEMS_PER_PAGE, predictions.length));
      setLoadingMore(false);
    }, 100);
  }, [loadingMore, hasMore, predictions.length]);

  // Calcular ancho de cada columna en desktop
  const columnWidth = useMemo(() => {
    if (!isDesktop) return '100%';
    const containerPadding = 32; // 16px padding on each side
    const gap = 16; // gap between columns
    const availableWidth = Math.min(width - containerPadding, 1400);
    return (availableWidth - (gap * (NUM_COLUMNS - 1))) / NUM_COLUMNS;
  }, [isDesktop, width]);

  // Render item para FlatList (mobile)
  const renderItem = useCallback(({ item }: { item: InvestmentPrediction }) => (
    <PredictionCard 
      prediction={item} 
      onRemove={onRemove}
      onAnalysis={() => setSelectedPrediction(item)}
      onAlert={() => setAlertPrediction(item)}
    />
  ), [onRemove]);

  // Render item para grid (desktop)
  const renderGridItem = useCallback((item: InvestmentPrediction) => (
    <View key={item.id} style={{ width: columnWidth, marginBottom: 16 }}>
      <PredictionCard 
        prediction={item} 
        onRemove={onRemove}
        onAnalysis={() => setSelectedPrediction(item)}
        onAlert={() => setAlertPrediction(item)}
      />
    </View>
  ), [columnWidth, onRemove]);

  // Footer con indicador de carga
  const renderFooter = useCallback(() => {
    if (!hasMore) return null;
    return (
      <View style={styles.loadingFooter}>
        {loadingMore ? (
          <ActivityIndicator size="small" color="#6366f1" />
        ) : (
          <Text style={styles.loadMoreText}>Scroll para cargar más...</Text>
        )}
      </View>
    );
  }, [hasMore, loadingMore]);

  return (
    <View style={styles.container}>
      {/* Modal de análisis detallado */}
      {selectedPrediction && (
        <PredictionAnalysisModal
          prediction={selectedPrediction}
          onClose={() => setSelectedPrediction(null)}
        />
      )}

      {/* Modal de alertas */}
      <AlertsModal
        visible={alertPrediction !== null}
        onClose={() => setAlertPrediction(null)}
        initialSymbol={alertPrediction?.symbol}
        initialAssetName={alertPrediction?.asset}
        initialPrice={alertPrediction?.currentPrice}
        initialTargetPrice={alertPrediction?.predictedPriceMax}
        initialDirection={alertPrediction?.direction === 'up' ? 'up' : 'down'}
      />

      <View style={styles.header}>
        <Text style={styles.title}>🎯 Predicciones ({predictions.length})</Text>
        <View style={styles.headerActions}>
          {onClear && (
            <TouchableOpacity onPress={onClear}>
              <Text style={styles.clearButton}>Limpiar</Text>
            </TouchableOpacity>
          )}
          {onClose && (
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {isDesktop ? (
        // Desktop: Grid de 3 columnas con scroll
        <ScrollView 
          style={styles.desktopScrollContainer}
          contentContainerStyle={styles.desktopScrollContent}
          onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
            const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
            const isCloseToBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 200;
            if (isCloseToBottom) {
              loadMore();
            }
          }}
          scrollEventThrottle={400}
        >
          <View style={styles.gridContainer}>
            {visiblePredictions.map(renderGridItem)}
          </View>
          {renderFooter()}
        </ScrollView>
      ) : (
        // Mobile: Lista vertical
        <FlatList
          data={visiblePredictions}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={renderFooter}
        />
      )}
    </View>
  );
};
