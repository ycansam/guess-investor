import React, { useCallback, useMemo, useRef, useState } from 'react';
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

const ITEMS_PER_PAGE = 42; // 3 columns x 14 rows
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
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const lastLoadTime = useRef(0);

  // Filtrar predicciones que no tienen datos válidos (sin precio actual o objetivo)
  const validPredictions = useMemo(() => {
    return predictions.filter(p => 
      p.currentPrice && p.currentPrice > 0 && 
      (p.predictedPriceMax || p.predictedPriceMin || p.predictedPrice)
    );
  }, [predictions]);

  // Predicciones visibles según paginación (page * 42)
  const visiblePredictions = useMemo(() => {
    const count = page * ITEMS_PER_PAGE;
    return validPredictions.slice(0, count);
  }, [validPredictions, page]);

  const hasMore = visiblePredictions.length < validPredictions.length;

  // Cargar más items al hacer scroll - siempre +42
  const loadMore = useCallback(() => {
    const now = Date.now();
    // Debounce: mínimo 300ms entre cargas
    if (isLoading || !hasMore || (now - lastLoadTime.current) < 300) return;
    
    lastLoadTime.current = now;
    setIsLoading(true);
    
    // Cargar inmediatamente
    setPage(p => p + 1);
    
    // Reset loading después de un pequeño delay
    setTimeout(() => {
      setIsLoading(false);
    }, 100);
  }, [hasMore, isLoading]);

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
        {isLoading ? (
          <ActivityIndicator size="small" color="#6366f1" />
        ) : (
          <Text style={styles.loadMoreText}>↓ Desliza para cargar más ({visiblePredictions.length}/{validPredictions.length})</Text>
        )}
      </View>
    );
  }, [hasMore, isLoading, visiblePredictions.length, validPredictions.length]);

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
        <Text style={styles.title}>🎯 Predicciones ({validPredictions.length})</Text>
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
