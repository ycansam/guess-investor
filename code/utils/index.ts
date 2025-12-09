// Utilidades de IA
export { getErrorMessage, parseAIResponse } from './ai-response-utils';

// Utilidades de conversación
export { cleanConversationHistory, formatHistoryForGemini } from './conversation-utils';

// Utilidades de texto
export { extractDirectSymbols, extractWords, normalizeText } from './text-utils';

// Utilidades de mercado
export {
    convertPrices,
    createMarketDataFromFinnhub,
    createMarketDataFromYahoo, formatMarketDataForAI
} from './market-data-utils';

