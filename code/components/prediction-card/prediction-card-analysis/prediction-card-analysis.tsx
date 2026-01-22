import React, { useEffect, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { currencyService } from '../../../services/currency-service';
import { canTradeNow, getMarketHours, MarketHoursInfo } from '../../../services/market-hours-service';
import { InvestmentPrediction } from '../../../types';
import { styles } from './prediction-card-analysis.styles';

// Tooltips explicativos para usuarios no expertos
const TOOLTIPS: Record<string, { title: string; explanation: string }> = {
  sentiment: {
    title: '🌐 Sentimiento del Mercado',
    explanation: 'Mide el estado emocional de los inversores. Bullish (🐂) = optimismo. Bearish (🐻) = pesimismo. Se calcula con índices de miedo/codicia.',
  },
  vix: {
    title: '📊 VIX - Índice del Miedo',
    explanation: 'Volatilidad esperada. <18: Complacencia (⚠️). 18-25: Normal. >25: Miedo (oportunidad contrarian). Cuando está bajo, el mercado ignora riesgos.',
  },
  putCallRatio: {
    title: '📈 Put/Call Ratio',
    explanation: 'Compara opciones de venta vs compra. <0.7: Optimismo excesivo. >1.0: Mucho miedo (señal contrarian alcista).',
  },
  overallScore: {
    title: '🎯 Score Institucional',
    explanation: 'Puntuación combinada (-100 a +100). Positivo = señales alcistas. Negativo = señales bajistas. Combina VIX, Put/Call y otros indicadores.',
  },
  bearish: {
    title: '🐻 Bearish (Bajista)',
    explanation: 'Pesimismo en el mercado, se esperan bajadas. Un sentimiento bearish no siempre es malo - puede ser oportunidad de compra.',
  },
};

interface PredictionCardAnalysisProps {
  prediction: InvestmentPrediction;
}

// Factores esenciales por tipo de activo (se muestran aunque no tengan datos)
const ESSENTIAL_FACTORS: Record<string, string[]> = {
  stock: ['trend', 'technical', 'sentiment', 'news', 'macro', 'competitors', 'forex', 'institutional', 'seasonality', 'financials', 'expectations'],
  crypto: ['trend', 'technical', 'sentiment', 'news', 'macro', 'seasonality'],
  etf: ['trend', 'technical', 'macro', 'sentiment', 'seasonality'],
  index: ['trend', 'technical', 'macro', 'sentiment', 'seasonality'],
};

// Detectar tipo de activo y devolver factores esenciales
function getEssentialFactors(symbol: string): string[] {
  const upperSymbol = symbol.toUpperCase();
  
  if (upperSymbol.includes('-USD') || ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE'].some(c => upperSymbol.startsWith(c))) {
    return ESSENTIAL_FACTORS.crypto;
  }
  if (['SPY', 'QQQ', 'IWM', 'DIA', 'VTI', 'VOO'].includes(upperSymbol)) {
    return ESSENTIAL_FACTORS.etf;
  }
  if (['^GSPC', '^DJI', '^IXIC', '^RUT'].includes(upperSymbol)) {
    return ESSENTIAL_FACTORS.index;
  }
  return ESSENTIAL_FACTORS.stock;
}

export const PredictionCardAnalysis: React.FC<PredictionCardAnalysisProps> = ({ prediction }) => {
  const [marketInfo, setMarketInfo] = useState<MarketHoursInfo | null>(null);
  const [tradeStatus, setTradeStatus] = useState<{ canTrade: boolean; reason: string; suggestion: string } | null>(null);
  const [eurRate, setEurRate] = useState<number>(1);
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);

  // Componente de tooltip con hover para web y tap para móvil
  const TooltipWrapper: React.FC<{ tooltipKey: string; children: React.ReactNode }> = ({ tooltipKey, children }) => {
    const tooltip = TOOLTIPS[tooltipKey];
    const isWeb = Platform.OS === 'web';
    
    return (
      <View style={{ position: 'relative', zIndex: activeTooltip === tooltipKey ? 100 : 1 }}>
        <Pressable
          onHoverIn={isWeb ? () => setActiveTooltip(tooltipKey) : undefined}
          onHoverOut={isWeb ? () => setActiveTooltip(null) : undefined}
          onPress={() => setActiveTooltip(activeTooltip === tooltipKey ? null : tooltipKey)}
          style={{ flexDirection: 'row', alignItems: 'center' }}
        >
          {children}
          <Text style={{ fontSize: 11, marginLeft: 4, color: '#6366f1' }}>ⓘ</Text>
        </Pressable>
        
        {/* Tooltip flotante */}
        {activeTooltip === tooltipKey && tooltip && (
          <View style={styles.hoverTooltip}>
            <Text style={styles.hoverTooltipTitle}>{tooltip.title}</Text>
            <Text style={styles.hoverTooltipText}>{tooltip.explanation}</Text>
          </View>
        )}
      </View>
    );
  };

  // Obtener rate de conversión a EUR (usando la moneda real del activo, no adivinando por símbolo)
  useEffect(() => {
    if (prediction.symbol) {
      // Usar la moneda de la predicción si está disponible, sino detectar del símbolo
      const currency = (prediction as any).currency || currencyService.getCurrencyFromSymbol(prediction.symbol);
      currencyService.getExchangeRateToEUR(currency).then(setEurRate);
    }
  }, [prediction.symbol, (prediction as any).currency]);

  // Actualizar info del mercado automáticamente
  useEffect(() => {
    if (prediction.symbol) {
      const info = getMarketHours(prediction.symbol);
      const trade = canTradeNow(prediction.symbol);
      setMarketInfo(info);
      setTradeStatus(trade);

      // Actualizar cada minuto
      const interval = setInterval(() => {
        if (prediction.symbol) {
          setMarketInfo(getMarketHours(prediction.symbol));
          setTradeStatus(canTradeNow(prediction.symbol));
        }
      }, 60000);

      return () => clearInterval(interval);
    }
  }, [prediction.symbol]);

  if (!prediction.analysisData) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.label}>🧠 Análisis basado en datos reales:</Text>

      {/* Estado del Mercado */}
      {marketInfo && tradeStatus && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🏛️ Mercado:</Text>
          <View style={[
            styles.marketHoursContainer,
            { borderLeftColor: tradeStatus.canTrade ? '#4CAF50' : '#F44336' }
          ]}>
            <View style={styles.marketHoursHeader}>
              <Text style={styles.marketExchange}>{marketInfo.exchangeShort}</Text>
              <View style={[
                styles.marketStatusBadge,
                { backgroundColor: tradeStatus.canTrade ? '#E8F5E9' : '#FFEBEE' }
              ]}>
                <Text style={styles.marketStatusEmoji}>{marketInfo.statusEmoji}</Text>
                <Text style={[
                  styles.marketStatusText,
                  { color: tradeStatus.canTrade ? '#2E7D32' : '#C62828' }
                ]}>
                  {marketInfo.statusText}
                </Text>
              </View>
            </View>
            <View style={styles.marketHoursInfo}>
              <Text style={styles.marketHoursDetail}>
                🕐 Hora local: {marketInfo.localTime}
              </Text>
              <Text style={styles.marketHoursDetail}>
                📅 Horario: {marketInfo.regularHours}
              </Text>
              {marketInfo.hasExtendedHours && (
                <Text style={styles.marketHoursDetail}>
                  ⏰ Horario extendido disponible
                </Text>
              )}
            </View>
            <Text style={styles.marketNextEvent}>
              ➡️ {marketInfo.nextEvent}: {marketInfo.nextEventTime}
            </Text>
            <Text style={[
              styles.marketSuggestion,
              { color: tradeStatus.canTrade ? '#2E7D32' : '#666' }
            ]}>
              {tradeStatus.suggestion}
            </Text>
          </View>
        </View>
      )}

      {/* Desglose de Factores */}
      {prediction.analysisData?.factorBreakdown && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📊 Análisis de Factores:</Text>
          <View style={styles.factorBreakdownContainer}>
            {/* Tipo de activo */}
            <Text style={styles.factorAssetType}>
              {prediction.analysisData.factorBreakdown.assetGroupDescription}
            </Text>
            
            {/* Resumen de señales */}
            <View style={[
              styles.signalSummaryBadge,
              { backgroundColor: 
                prediction.analysisData.factorBreakdown.signalSummary === 'coherent_bullish' ? '#E8F5E9' :
                prediction.analysisData.factorBreakdown.signalSummary === 'coherent_bearish' ? '#FFEBEE' :
                prediction.analysisData.factorBreakdown.signalSummary === 'mixed' ? '#FFF3E0' :
                '#F5F5F5'
              }
            ]}>
              <Text style={[
                styles.signalSummaryText,
                { color: 
                  prediction.analysisData.factorBreakdown.signalSummary === 'coherent_bullish' ? '#2E7D32' :
                  prediction.analysisData.factorBreakdown.signalSummary === 'coherent_bearish' ? '#C62828' :
                  prediction.analysisData.factorBreakdown.signalSummary === 'mixed' ? '#E65100' :
                  '#666'
                }
              ]}>
                {prediction.analysisData.factorBreakdown.signalSummary === 'coherent_bullish' ? '🟢 Señales alcistas coherentes' :
                 prediction.analysisData.factorBreakdown.signalSummary === 'coherent_bearish' ? '🔴 Señales bajistas coherentes' :
                 prediction.analysisData.factorBreakdown.signalSummary === 'mixed' ? '🟠 Señales contradictorias' :
                 prediction.analysisData.factorBreakdown.signalSummary === 'insufficient' ? '⚪ Datos insuficientes' :
                 '⚪ Señales neutrales'}
              </Text>
            </View>

            {/* Barra de factores */}
            {prediction.analysisData?.factorBreakdown?.availableFactors && (
            <View style={styles.factorBarContainer}>
              {prediction.analysisData.factorBreakdown.availableFactors
                .filter(f => {
                  // Solo mostrar factores relevantes para este tipo de activo
                  const isRelevant = prediction.analysisData?.factorBreakdown?.relevantFactors?.includes(f.name);
                  if (!isRelevant) return false;
                  
                  // Factores esenciales siempre se muestran (con advertencia si no hay datos)
                  // Factores no esenciales solo se muestran si tienen datos
                  const essentialFactors = getEssentialFactors(prediction.symbol || '');
                  const isEssential = essentialFactors.includes(f.name);
                  
                  return f.hasData || isEssential;
                })
                .map((factor, index) => {
                  const essentialFactors = getEssentialFactors(prediction.symbol || '');
                  const isEssential = essentialFactors.includes(factor.name);
                  
                  return (
                    <View key={index} style={styles.factorItem}>
                      <View style={styles.factorHeader}>
                        <Text style={styles.factorName}>
                          {factor.name === 'trend' ? '📈 Tendencia' :
                           factor.name === 'sentiment' ? '💬 Sentimiento' :
                           factor.name === 'news' ? '📰 Noticias' :
                           factor.name === 'macro' ? '🌍 Macro' :
                           factor.name === 'competitors' ? '🏭 Competidores' :
                           factor.name === 'forex' ? '💱 Forex' :
                           factor.name === 'institutional' ? '🏛️ Institucionales' :
                           factor.name === 'seasonality' ? '📅 Estacionalidad' :
                           factor.name === 'financials' ? '💰 Financieros' :
                           factor.name === 'expectations' ? '🎯 Expectativas' :
                           factor.name === 'technical' ? '📈 Técnico' : factor.name}
                          {isEssential && !factor.hasData && ' ⚠️'}
                        </Text>
                        <Text style={[
                          styles.factorScore,
                          { color: !factor.hasData ? '#999' :
                                   factor.score > 15 ? '#4CAF50' :
                                   factor.score < -15 ? '#F44336' : '#FF9800' }
                        ]}>
                          {!factor.hasData ? (isEssential ? 'Sin datos' : 'N/D') :
                           factor.score > 0 ? `+${factor.score}` : factor.score}
                        </Text>
                      </View>
                      <View style={styles.factorBar}>
                        <View style={[
                          styles.factorBarFill,
                          { 
                            width: factor.hasData ? `${Math.min(100, Math.abs(factor.score) + 50)}%` : '0%',
                            backgroundColor: !factor.hasData ? '#E0E0E0' :
                                            factor.score > 15 ? '#4CAF50' :
                                            factor.score < -15 ? '#F44336' : '#FF9800',
                            opacity: factor.hasData ? 0.7 : 0.3,
                          }
                        ]} />
                      </View>
                      {isEssential && !factor.hasData && (
                        <Text style={{ fontSize: 9, color: '#E65100', fontStyle: 'italic', marginTop: 2 }}>
                          Este factor es importante pero no hay datos disponibles
                        </Text>
                      )}
                    </View>
                  );
                })}
            </View>
            )}

            {/* Explicación de confianza */}
            {prediction.analysisData?.factorBreakdown?.confidenceExplanation && (
            <Text style={styles.confidenceExplanation}>
              💡 {prediction.analysisData.factorBreakdown.confidenceExplanation}
            </Text>
            )}
          </View>
        </View>
      )}

      {/* Tendencia histórica */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📊 Tendencia histórica:</Text>
        {prediction.analysisData?.historical ? (
          <View style={styles.dataGrid}>
            <View style={styles.dataItem}>
              <Text style={styles.dataLabel}>Últimos 30 días</Text>
              <Text style={[
                styles.dataValue,
                { color: prediction.analysisData.historical.change30d >= 0 ? '#4CAF50' : '#F44336' }
              ]}>
                {prediction.analysisData.historical.change30d >= 0 ? '+' : ''}
                {prediction.analysisData.historical.change30d.toFixed(2)}%
              </Text>
            </View>
            <View style={styles.dataItem}>
              <Text style={styles.dataLabel}>Últimos 90 días</Text>
              <Text style={[
                styles.dataValue,
                { color: prediction.analysisData.historical.change90d >= 0 ? '#4CAF50' : '#F44336' }
              ]}>
                {prediction.analysisData.historical.change90d >= 0 ? '+' : ''}
                {prediction.analysisData.historical.change90d.toFixed(2)}%
              </Text>
            </View>
            <View style={styles.dataItem}>
              <Text style={styles.dataLabel}>Volatilidad</Text>
              <Text style={[
                styles.dataValue,
                { color: prediction.analysisData.historical.volatility > 40 ? '#F44336' :
                         prediction.analysisData.historical.volatility > 25 ? '#FF9800' : '#4CAF50' }
              ]}>
                {prediction.analysisData.historical.volatility.toFixed(1)}%
              </Text>
            </View>
          </View>
        ) : (
          <Text style={styles.text}>Sin datos históricos disponibles</Text>
        )}
      </View>

      {/* Indicadores Técnicos */}
      {prediction.analysisData?.technicalAnalysis && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📈 Indicadores Técnicos:</Text>
          <View style={styles.technicalContainer}>
            {/* Tendencia general */}
            <View style={styles.technicalHeader}>
              <Text style={[
                styles.technicalTrend,
                { color: prediction.analysisData.technicalAnalysis.trend.includes('bullish') ? '#4CAF50' :
                         prediction.analysisData.technicalAnalysis.trend.includes('bearish') ? '#F44336' : '#FF9800' }
              ]}>
                {prediction.analysisData.technicalAnalysis.trend === 'strong_bullish' ? '📈 Muy Alcista' :
                 prediction.analysisData.technicalAnalysis.trend === 'bullish' ? '📈 Alcista' :
                 prediction.analysisData.technicalAnalysis.trend === 'neutral' ? '➖ Neutral' :
                 prediction.analysisData.technicalAnalysis.trend === 'bearish' ? '📉 Bajista' : '📉 Muy Bajista'}
              </Text>
              <Text style={[
                styles.technicalScore,
                { color: prediction.analysisData.technicalAnalysis.score > 15 ? '#4CAF50' :
                         prediction.analysisData.technicalAnalysis.score < -15 ? '#F44336' : '#FF9800' }
              ]}>
                Score: {prediction.analysisData.technicalAnalysis.score > 0 ? '+' : ''}{prediction.analysisData.technicalAnalysis.score}
              </Text>
            </View>

            {/* Grid de indicadores */}
            <View style={styles.technicalGrid}>
              {/* RSI */}
              {prediction.analysisData.technicalAnalysis.rsi14 !== undefined && (
                <View style={styles.technicalItem}>
                  <Text style={styles.technicalLabel}>RSI (14)</Text>
                  <Text style={[
                    styles.technicalValue,
                    { color: prediction.analysisData.technicalAnalysis.rsiSignal === 'oversold' ? '#4CAF50' :
                             prediction.analysisData.technicalAnalysis.rsiSignal === 'overbought' ? '#F44336' : '#666' }
                  ]}>
                    {prediction.analysisData.technicalAnalysis.rsi14.toFixed(1)}
                    {prediction.analysisData.technicalAnalysis.rsiSignal === 'oversold' ? ' ⬇️' :
                     prediction.analysisData.technicalAnalysis.rsiSignal === 'overbought' ? ' ⬆️' : ''}
                  </Text>
                </View>
              )}

              {/* MACD */}
              <View style={styles.technicalItem}>
                <Text style={styles.technicalLabel}>MACD</Text>
                <Text style={[
                  styles.technicalValue,
                  { color: prediction.analysisData.technicalAnalysis.macdTrend === 'bullish' ? '#4CAF50' :
                           prediction.analysisData.technicalAnalysis.macdTrend === 'bearish' ? '#F44336' : '#666' }
                ]}>
                  {prediction.analysisData.technicalAnalysis.macdTrend === 'bullish' ? '📈 Alcista' :
                   prediction.analysisData.technicalAnalysis.macdTrend === 'bearish' ? '📉 Bajista' : '➖ Neutral'}
                </Text>
              </View>

              {/* SMA 200 */}
              <View style={styles.technicalItem}>
                <Text style={styles.technicalLabel}>vs SMA 200</Text>
                <Text style={[
                  styles.technicalValue,
                  { color: prediction.analysisData.technicalAnalysis.priceVsSMA200 === 'above' ? '#4CAF50' : '#F44336' }
                ]}>
                  {prediction.analysisData.technicalAnalysis.priceVsSMA200 === 'above' ? '⬆️ Encima' : '⬇️ Debajo'}
                </Text>
              </View>

              {/* SMA 50 */}
              <View style={styles.technicalItem}>
                <Text style={styles.technicalLabel}>vs SMA 50</Text>
                <Text style={[
                  styles.technicalValue,
                  { color: prediction.analysisData.technicalAnalysis.priceVsSMA50 === 'above' ? '#4CAF50' : '#F44336' }
                ]}>
                  {prediction.analysisData.technicalAnalysis.priceVsSMA50 === 'above' ? '⬆️ Encima' : '⬇️ Debajo'}
                </Text>
              </View>

              {/* Bollinger */}
              <View style={styles.technicalItem}>
                <Text style={styles.technicalLabel}>Bollinger</Text>
                <Text style={[
                  styles.technicalValue,
                  { color: prediction.analysisData.technicalAnalysis.bollingerPosition === 'below' ? '#4CAF50' :
                           prediction.analysisData.technicalAnalysis.bollingerPosition === 'above' ? '#F44336' : '#666' }
                ]}>
                  {prediction.analysisData.technicalAnalysis.bollingerPosition === 'above' ? '⬆️ Superior' :
                   prediction.analysisData.technicalAnalysis.bollingerPosition === 'below' ? '⬇️ Inferior' : '↔️ Dentro'}
                </Text>
              </View>

              {/* Volumen */}
              <View style={styles.technicalItem}>
                <Text style={styles.technicalLabel}>Volumen</Text>
                <Text style={[
                  styles.technicalValue,
                  { color: prediction.analysisData.technicalAnalysis.volumeSignal === 'high' ? '#2196F3' :
                           prediction.analysisData.technicalAnalysis.volumeSignal === 'low' ? '#9E9E9E' : '#666' }
                ]}>
                  {prediction.analysisData.technicalAnalysis.volumeSignal === 'high' ? '📊 Alto' :
                   prediction.analysisData.technicalAnalysis.volumeSignal === 'low' ? '📉 Bajo' : '➖ Normal'}
                </Text>
              </View>
            </View>

            {/* Cruces especiales */}
            {(prediction.analysisData.technicalAnalysis.goldenCross || prediction.analysisData.technicalAnalysis.deathCross) && (
              <View style={styles.technicalAlert}>
                {prediction.analysisData.technicalAnalysis.goldenCross && (
                  <Text style={[styles.technicalAlertText, { color: '#4CAF50' }]}>
                    ✨ Cruce Dorado detectado (SMA50 &gt; SMA200)
                  </Text>
                )}
                {prediction.analysisData.technicalAnalysis.deathCross && (
                  <Text style={[styles.technicalAlertText, { color: '#F44336' }]}>
                    ⚠️ Cruce Mortal detectado (SMA50 &lt; SMA200)
                  </Text>
                )}
              </View>
            )}

            {/* Señales activas */}
            {prediction.analysisData?.technicalAnalysis?.signals && prediction.analysisData.technicalAnalysis.signals.length > 0 && (
              <View style={styles.technicalSignals}>
                {prediction.analysisData.technicalAnalysis.signals.slice(0, 3).map((signal, index) => (
                  <Text key={index} style={styles.technicalSignal}>
                    🎯 {signal}
                  </Text>
                ))}
              </View>
            )}

            {/* Resumen */}
            <Text style={styles.technicalSummary}>{prediction.analysisData.technicalAnalysis.summary}</Text>
          </View>
        </View>
      )}

      {/* Sentimiento RRSS */}
      <View style={styles.section}>
        <TooltipWrapper tooltipKey="sentiment">
          <Text style={styles.sectionTitle}>🌐 Sentimiento del mercado:</Text>
        </TooltipWrapper>
        {prediction.analysisData?.sentiment ? (
          <View style={styles.sentimentContainer}>
            {/* Barra de sentimiento general */}
            <View style={styles.sentimentBar}>
              <View style={[
                styles.sentimentFill,
                {
                  width: `${prediction.analysisData.sentiment.score}%`,
                  backgroundColor: prediction.analysisData.sentiment.score >= 60 ? '#4CAF50' :
                                  prediction.analysisData.sentiment.score >= 40 ? '#FF9800' : '#F44336'
                }
              ]} />
            </View>
            <View style={styles.sentimentInfo}>
              <Pressable onPress={() => setActiveTooltip('bearish')}>
                <Text style={styles.sentimentScore}>
                  {prediction.analysisData.sentiment.score}%
                  {prediction.analysisData.sentiment.score >= 60 ? ' Bullish 🐂' :
                   prediction.analysisData.sentiment.score >= 40 ? ' Neutro 😐' : ' Bearish 🐻'}
                  <Text style={{ fontSize: 10, color: '#6366f1' }}> ⓘ</Text>
                </Text>
              </Pressable>
              <Text style={styles.sentimentSource}>
                Fuente: {prediction.analysisData.sentiment.source}
              </Text>
            </View>

            {/* VIX y Put/Call Ratio - Indicadores institucionales */}
            {(prediction.analysisData.sentiment.vix || prediction.analysisData.sentiment.putCallRatio) && (
              <View style={styles.institutionalSentiment}>
                {prediction.analysisData.sentiment.vix && (
                  <View style={styles.vixContainer}>
                    <TooltipWrapper tooltipKey="vix">
                      <Text style={styles.vixLabel}>📊 VIX (Índice del Miedo)</Text>
                    </TooltipWrapper>
                    <Text style={[
                      styles.vixValue,
                      { color: prediction.analysisData.sentiment.vix.sentiment === 'extreme_fear' ? '#F44336' :
                               prediction.analysisData.sentiment.vix.sentiment === 'fear' ? '#FF9800' :
                               prediction.analysisData.sentiment.vix.sentiment === 'neutral' ? '#9E9E9E' :
                               prediction.analysisData.sentiment.vix.sentiment === 'complacency' ? '#4CAF50' : '#2196F3' }
                    ]}>
                      {prediction.analysisData.sentiment.vix.value.toFixed(2)}
                      {prediction.analysisData.sentiment.vix.sentiment === 'extreme_fear' ? ' 😱 Pánico' :
                       prediction.analysisData.sentiment.vix.sentiment === 'fear' ? ' 😰 Miedo' :
                       prediction.analysisData.sentiment.vix.sentiment === 'neutral' ? ' 😐 Normal' :
                       prediction.analysisData.sentiment.vix.sentiment === 'complacency' ? ' 😌 Complacencia' : ' 😴 Calma extrema'}
                    </Text>
                  </View>
                )}
                {prediction.analysisData.sentiment.putCallRatio && (
                  <View style={styles.pcRatioContainer}>
                    <TooltipWrapper tooltipKey="putCallRatio">
                      <Text style={styles.pcRatioLabel}>📈 Put/Call Ratio (SPX)</Text>
                    </TooltipWrapper>
                    <Text style={[
                      styles.pcRatioValue,
                      { color: prediction.analysisData.sentiment.putCallRatio.sentiment === 'extreme_fear' ? '#F44336' :
                               prediction.analysisData.sentiment.putCallRatio.sentiment === 'bearish' ? '#FF9800' :
                               prediction.analysisData.sentiment.putCallRatio.sentiment === 'neutral' ? '#9E9E9E' :
                               prediction.analysisData.sentiment.putCallRatio.sentiment === 'bullish' ? '#4CAF50' : '#2196F3' }
                    ]}>
                      {prediction.analysisData.sentiment.putCallRatio.ratio.toFixed(2)}
                      {prediction.analysisData.sentiment.putCallRatio.sentiment === 'extreme_fear' ? ' 🐻 Muy bajista' :
                       prediction.analysisData.sentiment.putCallRatio.sentiment === 'bearish' ? ' 📉 Bajista' :
                       prediction.analysisData.sentiment.putCallRatio.sentiment === 'neutral' ? ' ➖ Neutral' :
                       prediction.analysisData.sentiment.putCallRatio.sentiment === 'bullish' ? ' 📈 Alcista' : ' 🚀 Muy alcista'}
                    </Text>
                  </View>
                )}
                {prediction.analysisData.sentiment.overallScore !== undefined && (
                  <Pressable onPress={() => setActiveTooltip('overallScore')}>
                    <Text style={[
                      styles.overallSentimentScore,
                      { color: prediction.analysisData.sentiment.overallScore > 20 ? '#4CAF50' :
                               prediction.analysisData.sentiment.overallScore > -20 ? '#FF9800' : '#F44336' }
                    ]}>
                      Score institucional: {prediction.analysisData.sentiment.overallScore > 0 ? '+' : ''}{prediction.analysisData.sentiment.overallScore}
                      <Text style={{ fontSize: 10, color: '#6366f1' }}> ⓘ</Text>
                    </Text>
                  </Pressable>
                )}
              </View>
            )}
          </View>
        ) : (
          <Text style={styles.text}>Sin datos de sentimiento disponibles</Text>
        )}
      </View>

      {/* Financials (solo acciones) */}
      {prediction.analysisData?.financials && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📈 Resultados financieros:</Text>
          <View style={styles.financialsContainer}>
            <View style={styles.financialsRow}>
              <View style={styles.financialItem}>
                <Text style={styles.financialLabel}>Ingresos</Text>
                <Text style={styles.financialValue}>{prediction.analysisData.financials.revenue}</Text>
              </View>
              <View style={styles.financialItem}>
                <Text style={styles.financialLabel}>Crec. Ingresos</Text>
                <Text style={[
                  styles.financialValue,
                  { color: prediction.analysisData.financials.revenueGrowth >= 0 ? '#4CAF50' : '#F44336' }
                ]}>
                  {prediction.analysisData.financials.revenueGrowth >= 0 ? '+' : ''}
                  {prediction.analysisData.financials.revenueGrowth.toFixed(1)}%
                </Text>
              </View>
              <View style={styles.financialItem}>
                <Text style={styles.financialLabel}>Beneficio</Text>
                <Text style={styles.financialValue}>{prediction.analysisData.financials.netIncome}</Text>
              </View>
            </View>
            <View style={styles.financialsRow}>
              <View style={styles.financialItem}>
                <Text style={styles.financialLabel}>Crec. Beneficio</Text>
                <Text style={[
                  styles.financialValue,
                  { color: prediction.analysisData.financials.earningsGrowth >= 0 ? '#4CAF50' : '#F44336' }
                ]}>
                  {prediction.analysisData.financials.earningsGrowth >= 0 ? '+' : ''}
                  {prediction.analysisData.financials.earningsGrowth.toFixed(1)}%
                </Text>
              </View>
              <View style={styles.financialItem}>
                <Text style={styles.financialLabel}>Margen Neto</Text>
                <Text style={[
                  styles.financialValue,
                  { color: prediction.analysisData.financials.profitMargin >= 10 ? '#4CAF50' :
                           prediction.analysisData.financials.profitMargin >= 5 ? '#FF9800' : '#F44336' }
                ]}>
                  {prediction.analysisData.financials.profitMargin.toFixed(1)}%
                </Text>
              </View>
              <View style={styles.financialItem}>
                <Text style={styles.financialLabel}>PER</Text>
                <Text style={[
                  styles.financialValue,
                  { color: prediction.analysisData.financials.peRatio > 0 && prediction.analysisData.financials.peRatio < 25
                      ? '#4CAF50'
                      : prediction.analysisData.financials.peRatio > 40 ? '#F44336' : '#FF9800' }
                ]}>
                  {prediction.analysisData.financials.peRatio > 0
                    ? prediction.analysisData.financials.peRatio.toFixed(1)
                    : 'N/A'}
                </Text>
              </View>
            </View>
            {/* Rating y precio objetivo */}
            <View style={styles.analystRow}>
              <View style={styles.ratingBadge}>
                <Text style={styles.ratingLabel}>Rating Analistas</Text>
                <Text style={[
                  styles.ratingValue,
                  { color: prediction.analysisData.financials.analystRating.includes('Compra') ? '#4CAF50' :
                           prediction.analysisData.financials.analystRating.includes('Venta') ? '#F44336' : '#FF9800' }
                ]}>
                  {prediction.analysisData.financials.analystRating}
                </Text>
              </View>
              {prediction.analysisData.financials.targetPrice > 0 && (
                <View style={styles.targetPriceContainer}>
                  <Text style={styles.targetPriceLabel}>Precio objetivo</Text>
                  <Text style={styles.targetPriceValue}>
                    €{prediction.analysisData.financials.targetPrice.toFixed(2)}
                  </Text>
                  <Text style={[
                    styles.targetPriceDiff,
                    { color: prediction.analysisData.financials.currentVsTarget >= 0 ? '#4CAF50' : '#F44336' }
                  ]}>
                    ({prediction.analysisData.financials.currentVsTarget >= 0 ? '+' : ''}
                    {prediction.analysisData.financials.currentVsTarget.toFixed(1)}%)
                  </Text>
                </View>
              )}
            </View>
            {/* Score general */}
            <View style={styles.overallScoreContainer}>
              <Text style={styles.overallScoreLabel}>Score Fundamentales</Text>
              <View style={styles.overallScoreBarBg}>
                <View style={[
                  styles.overallScoreBar,
                  {
                    width: `${prediction.analysisData.financials.overallScore}%`,
                    backgroundColor: prediction.analysisData.financials.overallScore >= 70 ? '#4CAF50' :
                                    prediction.analysisData.financials.overallScore >= 50 ? '#FF9800' : '#F44336'
                  }
                ]} />
              </View>
              <Text style={[
                styles.overallScoreValue,
                { color: prediction.analysisData.financials.overallScore >= 70 ? '#4CAF50' :
                         prediction.analysisData.financials.overallScore >= 50 ? '#FF9800' : '#F44336' }
              ]}>
                {prediction.analysisData.financials.overallScore}/100
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Noticias recientes */}
      {prediction.analysisData?.news && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📰 Noticias recientes:</Text>
          <View style={styles.newsContainer}>
            <View style={styles.newsHeader}>
              <Text style={[
                styles.newsSentiment,
                { color: prediction.analysisData.news.sentiment === 'positive' ? '#4CAF50' :
                         prediction.analysisData.news.sentiment === 'negative' ? '#F44336' : '#FF9800' }
              ]}>
                {prediction.analysisData.news.sentiment === 'positive' ? '📈 Positivo' :
                 prediction.analysisData.news.sentiment === 'negative' ? '📉 Negativo' : '➖ Neutral'}
              </Text>
              <Text style={styles.newsCount}>
                {prediction.analysisData.news.count} noticias analizadas
              </Text>
            </View>
            <Text style={styles.newsSummary}>{prediction.analysisData.news.summary}</Text>
          </View>
        </View>
      )}

      {/* Contexto macroeconómico */}
      {prediction.analysisData?.macro && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🌍 Contexto macroeconómico:</Text>
          <View style={styles.macroContainer}>
            <View style={styles.macroHeader}>
              <Text style={styles.macroRegion}>{prediction.analysisData.macro.region}</Text>
              <Text style={[
                styles.macroOutlook,
                { color: prediction.analysisData.macro.outlook === 'favorable' ? '#4CAF50' :
                         prediction.analysisData.macro.outlook === 'unfavorable' ? '#F44336' : '#FF9800' }
              ]}>
                {prediction.analysisData.macro.outlook === 'favorable' ? '✅ Favorable' :
                 prediction.analysisData.macro.outlook === 'unfavorable' ? '⚠️ Desfavorable' : '➖ Neutral'}
              </Text>
            </View>
            <Text style={styles.macroSummary}>{prediction.analysisData.macro.summary}</Text>
          </View>
        </View>
      )}

      {/* Análisis de competidores */}
      {prediction.analysisData?.competitors && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🏢 Competidores y sector:</Text>
          <View style={styles.competitorsContainer}>
            <View style={styles.competitorsHeader}>
              <Text style={styles.competitorsSector}>{prediction.analysisData.competitors.sector}</Text>
              <Text style={[
                styles.competitorsTrend,
                { color: prediction.analysisData.competitors.sectorTrend === 'bullish' ? '#4CAF50' :
                         prediction.analysisData.competitors.sectorTrend === 'bearish' ? '#F44336' : '#FF9800' }
              ]}>
                {prediction.analysisData.competitors.sectorTrend === 'bullish' ? '📈 Sector alcista' :
                 prediction.analysisData.competitors.sectorTrend === 'bearish' ? '📉 Sector bajista' : '➖ Sector neutro'}
              </Text>
            </View>
            <View style={styles.competitorsOutperform}>
              <Text style={[
                styles.outperformBadge,
                { backgroundColor: prediction.analysisData.competitors.outperforming ? '#E8F5E9' : '#FFF3E0' }
              ]}>
                <Text style={{ color: prediction.analysisData.competitors.outperforming ? '#4CAF50' : '#FF9800' }}>
                  {prediction.analysisData.competitors.outperforming ? '🏆 Supera a competidores' : '📊 En línea con competidores'}
                </Text>
              </Text>
            </View>
            <Text style={styles.competitorsNames}>
              Comparado con: {prediction.analysisData.competitors.competitorNames.join(', ')}
            </Text>
            <Text style={styles.competitorsSummary}>{prediction.analysisData.competitors.summary}</Text>
          </View>
        </View>
      )}

      {/* Tipos de cambio */}
      {prediction.analysisData?.forex && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>💱 Tipos de cambio:</Text>
          <View style={styles.forexContainer}>
            <View style={styles.forexHeader}>
              <Text style={styles.forexBaseCurrency}>Base: {prediction.analysisData.forex.baseCurrency}</Text>
              <Text style={[
                styles.forexTrend,
                { color: prediction.analysisData.forex.trend === 'eur_weak' ? '#4CAF50' :
                         prediction.analysisData.forex.trend === 'eur_strong' ? '#F44336' : '#FF9800' }
              ]}>
                {prediction.analysisData.forex.trend === 'eur_weak' ? '📈 EUR débil (favorable)' :
                 prediction.analysisData.forex.trend === 'eur_strong' ? '📉 EUR fuerte (desfavorable)' : '➖ Estable'}
              </Text>
            </View>
            <Text style={styles.forexPairs}>
              Pares analizados: {prediction.analysisData.forex.mainPairs.join(', ')}
            </Text>
            <Text style={styles.forexSummary}>{prediction.analysisData.forex.summary}</Text>
          </View>
        </View>
      )}

      {/* Inversores institucionales */}
      {prediction.analysisData?.institutional && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🏦 Grandes inversores:</Text>
          <View style={styles.institutionalContainer}>
            {/* Propiedad institucional */}
            {prediction.analysisData.institutional.ownershipPercent !== undefined && (
              <View style={styles.institutionalRow}>
                <View style={styles.institutionalItem}>
                  <Text style={styles.institutionalLabel}>Propiedad institucional</Text>
                  <Text style={styles.institutionalValue}>
                    {prediction.analysisData.institutional.ownershipPercent.toFixed(1)}%
                  </Text>
                </View>
                {prediction.analysisData.institutional.numberOfInstitutions !== undefined && (
                  <View style={styles.institutionalItem}>
                    <Text style={styles.institutionalLabel}>Nº de fondos</Text>
                    <Text style={styles.institutionalValue}>
                      {prediction.analysisData.institutional.numberOfInstitutions}
                    </Text>
                  </View>
                )}
                {prediction.analysisData.institutional.ownershipTrend && (
                  <View style={styles.institutionalItem}>
                    <Text style={styles.institutionalLabel}>Tendencia</Text>
                    <Text style={[
                      styles.institutionalValue,
                      { color: prediction.analysisData.institutional.ownershipTrend === 'increasing' ? '#4CAF50' :
                               prediction.analysisData.institutional.ownershipTrend === 'decreasing' ? '#F44336' : '#FF9800' }
                    ]}>
                      {prediction.analysisData.institutional.ownershipTrend === 'increasing' ? '📈 Aumentando' :
                       prediction.analysisData.institutional.ownershipTrend === 'decreasing' ? '📉 Disminuyendo' : '➖ Estable'}
                    </Text>
                  </View>
                )}
              </View>
            )}
            
            {/* Transacciones de insiders */}
            {prediction.analysisData.institutional.insiderTrend && (
              <View style={styles.insiderSection}>
                <Text style={[
                  styles.insiderBadge,
                  { backgroundColor: prediction.analysisData.institutional.insiderTrend === 'buying' ? '#E8F5E9' :
                                    prediction.analysisData.institutional.insiderTrend === 'selling' ? '#FFEBEE' : '#FFF3E0' }
                ]}>
                  <Text style={{
                    color: prediction.analysisData.institutional.insiderTrend === 'buying' ? '#4CAF50' :
                           prediction.analysisData.institutional.insiderTrend === 'selling' ? '#F44336' : '#FF9800'
                  }}>
                    {prediction.analysisData.institutional.insiderTrend === 'buying' ? '💰 Insiders comprando' :
                     prediction.analysisData.institutional.insiderTrend === 'selling' ? '📤 Insiders vendiendo' : '⚖️ Actividad equilibrada'}
                  </Text>
                </Text>
                {prediction.analysisData.institutional.insiderNetValue !== undefined && (
                  <Text style={styles.insiderValue}>
                    Valor neto: {prediction.analysisData.institutional.insiderNetValue >= 0 ? '+' : ''}
                    ${(prediction.analysisData.institutional.insiderNetValue / 1000000).toFixed(2)}M
                  </Text>
                )}
              </View>
            )}
            
            {/* Top holders */}
            {prediction.analysisData.institutional.topHolders?.length > 0 && (
              <Text style={styles.institutionalHolders}>
                Principales: {prediction.analysisData.institutional.topHolders.join(', ')}
              </Text>
            )}
            
            <Text style={styles.institutionalSummary}>{prediction.analysisData.institutional.summary}</Text>
          </View>
        </View>
      )}

      {/* Estacionalidad */}
      {prediction.analysisData?.seasonality && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📅 Estacionalidad:</Text>
          <View style={styles.seasonalityContainer}>
            <View style={styles.seasonalityHeader}>
              <Text style={styles.seasonalitySector}>{prediction.analysisData.seasonality.sector}</Text>
              <Text style={[
                styles.seasonalityScore,
                { color: prediction.analysisData.seasonality.score > 15 ? '#4CAF50' :
                         prediction.analysisData.seasonality.score < -15 ? '#F44336' : '#FF9800' }
              ]}>
                {prediction.analysisData.seasonality.score > 15 ? '📈 Favorable' :
                 prediction.analysisData.seasonality.score < -15 ? '📉 Desfavorable' : '➖ Neutral'}
              </Text>
            </View>
            {prediction.analysisData.seasonality.region && prediction.analysisData.seasonality.region !== 'global' && (
              <View style={styles.seasonalityMetaRow}>
                <Text style={styles.seasonalityRegion}>
                  {prediction.analysisData.seasonality.region}
                </Text>
              </View>
            )}
            {prediction.analysisData?.seasonality?.events && prediction.analysisData.seasonality.events.length > 0 && (
              <View style={styles.seasonalityEvents}>
                {prediction.analysisData.seasonality.events.map((event, index) => (
                  <Text key={index} style={styles.seasonalityEvent}>
                    🎯 {event}
                  </Text>
                ))}
              </View>
            )}
            <Text style={styles.seasonalitySummary}>{prediction.analysisData.seasonality.summary}</Text>
          </View>
        </View>
      )}

      {/* Conclusión */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>💡 Conclusión:</Text>
        <Text style={styles.conclusionText}>
          {prediction.analysisData?.historical && prediction.analysisData?.sentiment ? (
            prediction.analysisData.historical.change30d >= 0 && prediction.analysisData.sentiment.score >= 50
              ? `La tendencia a 30 días es positiva (+${prediction.analysisData.historical.change30d.toFixed(1)}%) y el sentimiento social es ${prediction.analysisData.sentiment.score >= 60 ? 'optimista' : 'neutro'} (${prediction.analysisData.sentiment.score}%), lo que sugiere momentum alcista.`
              : prediction.analysisData.historical.change30d < 0 && prediction.analysisData.sentiment.score < 50
                ? `La tendencia a 30 días es negativa (${prediction.analysisData.historical.change30d.toFixed(1)}%) y el sentimiento social es ${prediction.analysisData.sentiment.score < 40 ? 'pesimista' : 'neutro'} (${prediction.analysisData.sentiment.score}%), lo que sugiere presión bajista.`
                : `Señales mixtas: tendencia ${prediction.analysisData.historical.change30d >= 0 ? 'positiva' : 'negativa'} (${prediction.analysisData.historical.change30d.toFixed(1)}%) pero sentimiento ${prediction.analysisData.sentiment.score >= 50 ? 'positivo' : 'negativo'} (${prediction.analysisData.sentiment.score}%). Se recomienda cautela.`
          ) : (
            prediction.reasoning.replace(/```json[\s\S]*?```/g, '').trim().substring(0, 300)
          )}
        </Text>
      </View>

      {/* AUDITORÍA - Verificación de datos */}
      {prediction.analysisData?.audit && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🔍 Auditoría - Verificar datos:</Text>
          <Text style={styles.auditSubtitle}>
            Puedes verificar cada dato haciendo clic en los enlaces:
          </Text>
          
          {/* Fuentes de datos */}
          {prediction.analysisData?.audit?.dataSources && (
          <View style={styles.auditSourcesContainer}>
            {prediction.analysisData.audit.dataSources.map((source, index) => (
              <View key={index} style={styles.auditSourceItem}>
                <Text style={styles.auditSourceName}>📊 {source.name}</Text>
                <Text style={styles.auditSourceValue}>{source.rawValue}</Text>
                <Text 
                  style={styles.auditSourceUrl}
                  onPress={() => {
                    // En React Native Web esto abre el enlace
                    if (typeof window !== 'undefined') {
                      window.open(source.url, '_blank');
                    }
                  }}
                >
                  🔗 Verificar →
                </Text>
              </View>
            ))}
          </View>
          )}

          {/* Cálculo paso a paso */}
          {prediction.analysisData?.audit?.calculationSteps && (
          <>
          <Text style={styles.auditCalcTitle}>📐 Cálculo matemático:</Text>
          <View style={styles.auditCalcContainer}>
            {prediction.analysisData.audit.calculationSteps.map((step, index) => (
              <View key={index} style={styles.auditCalcStep}>
                <Text style={styles.auditStepName}>{step.step}</Text>
                <Text style={styles.auditStepFormula}>{step.formula}</Text>
                <Text style={styles.auditStepResult}>= {step.result}</Text>
              </View>
            ))}
          </View>
          </>
          )}

          {/* Fórmula final */}
          {prediction.currentPrice && prediction.predictedChange !== undefined && (
          <View style={styles.auditFinalFormula}>
            <Text style={styles.auditFormulaTitle}>Fórmula del precio objetivo:</Text>
            <Text style={styles.auditFormulaText}>
              {(() => {
                const basePrice = prediction.currentPrice * eurRate;
                const targetPrice = basePrice * (1 + prediction.predictedChange / 100);
                return `Precio objetivo = ${basePrice.toFixed(2)} × (1 + ${prediction.predictedChange.toFixed(2)}%) = ${targetPrice.toFixed(2)} EUR`;
              })()}
            </Text>
          </View>
          )}
        </View>
      )}
    </View>
  );
};
