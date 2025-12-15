/**
 * Servicio para detectar eventos regulatorios en noticias
 * Analiza títulos de noticias buscando menciones a:
 * - SEC (Securities and Exchange Commission)
 * - FDA (Food and Drug Administration)  
 * - FTC (Federal Trade Commission)
 * - DOJ (Department of Justice)
 * - EU regulators
 * - Patent litigation
 * - Antitrust
 */

export interface RegulatoryEvent {
  type: RegulatoryType;
  agency: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  impact: number; // -100 a +100
  keywords: string[];
  description: string;
}

export type RegulatoryType = 
  | 'sec_investigation'
  | 'sec_filing'
  | 'sec_approval'
  | 'fda_approval'
  | 'fda_rejection'
  | 'fda_trial'
  | 'ftc_investigation'
  | 'antitrust'
  | 'patent_win'
  | 'patent_loss'
  | 'lawsuit'
  | 'settlement'
  | 'eu_regulation'
  | 'china_regulation'
  | 'other';

// Patrones de detección de eventos regulatorios
const REGULATORY_PATTERNS: {
  pattern: RegExp;
  type: RegulatoryType;
  agency: string;
  baseImpact: number;
  sentiment: 'positive' | 'negative' | 'neutral';
  description: string;
}[] = [
  // SEC - Securities and Exchange Commission
  {
    pattern: /\b(sec|securities.+commission)\s+(investigat|probe|subpoena|charges?|su(es?|ing))/i,
    type: 'sec_investigation',
    agency: 'SEC',
    baseImpact: -40,
    sentiment: 'negative',
    description: 'Investigación SEC'
  },
  {
    pattern: /\b(sec|securities.+commission)\s+(approv|clear|green.?light)/i,
    type: 'sec_approval',
    agency: 'SEC',
    baseImpact: 25,
    sentiment: 'positive',
    description: 'Aprobación SEC'
  },
  {
    pattern: /\b(sec\s+filing|10-k|10-q|8-k|s-1\s+filing)/i,
    type: 'sec_filing',
    agency: 'SEC',
    baseImpact: 0,
    sentiment: 'neutral',
    description: 'Filing SEC'
  },
  
  // FDA - Food and Drug Administration
  {
    pattern: /\bfda\s+(approv|clear|green.?light|authoriz)/i,
    type: 'fda_approval',
    agency: 'FDA',
    baseImpact: 60,
    sentiment: 'positive',
    description: 'Aprobación FDA'
  },
  {
    pattern: /\bfda\s+(reject|den(y|ies|ied)|refuse|fail|warning\s+letter)/i,
    type: 'fda_rejection',
    agency: 'FDA',
    baseImpact: -60,
    sentiment: 'negative',
    description: 'Rechazo FDA'
  },
  {
    pattern: /\bfda\s+(trial|phase\s+[1-3]|clinical|study|submit)/i,
    type: 'fda_trial',
    agency: 'FDA',
    baseImpact: 15,
    sentiment: 'positive',
    description: 'Ensayo clínico FDA'
  },
  {
    pattern: /\bbreakthrough\s+(therapy|designation|status)/i,
    type: 'fda_approval',
    agency: 'FDA',
    baseImpact: 40,
    sentiment: 'positive',
    description: 'Designación breakthrough FDA'
  },
  
  // FTC - Federal Trade Commission
  {
    pattern: /\bftc\s+(investigat|probe|block|su(es?|ing)|challenge)/i,
    type: 'ftc_investigation',
    agency: 'FTC',
    baseImpact: -35,
    sentiment: 'negative',
    description: 'Investigación FTC'
  },
  {
    pattern: /\bftc\s+(approv|clear|allow)/i,
    type: 'ftc_investigation',
    agency: 'FTC',
    baseImpact: 30,
    sentiment: 'positive',
    description: 'Aprobación FTC'
  },
  
  // Antitrust
  {
    pattern: /\b(antitrust|anti-trust|monopol|anticompetitiv)\s*(investigat|probe|lawsuit|charges?|violat)/i,
    type: 'antitrust',
    agency: 'Antitrust',
    baseImpact: -45,
    sentiment: 'negative',
    description: 'Investigación antimonopolio'
  },
  {
    pattern: /\b(antitrust|anti-trust)\s*(clear|approv|settl)/i,
    type: 'antitrust',
    agency: 'Antitrust',
    baseImpact: 25,
    sentiment: 'positive',
    description: 'Resolución antimonopolio favorable'
  },
  
  // DOJ - Department of Justice
  {
    pattern: /\b(doj|justice\s+department|department\s+of\s+justice)\s+(investigat|probe|charges?|su(es?|ing)|indict)/i,
    type: 'sec_investigation',
    agency: 'DOJ',
    baseImpact: -50,
    sentiment: 'negative',
    description: 'Investigación DOJ'
  },
  
  // Patent litigation
  {
    pattern: /\bpatent\s+(win|victory|rul(es?|ed|ing)\s+in\s+favor|upheld)/i,
    type: 'patent_win',
    agency: 'Patent',
    baseImpact: 30,
    sentiment: 'positive',
    description: 'Victoria en patente'
  },
  {
    pattern: /\bpatent\s+(loss|defeat|invalid|infring|violat|rul(es?|ed|ing)\s+against)/i,
    type: 'patent_loss',
    agency: 'Patent',
    baseImpact: -30,
    sentiment: 'negative',
    description: 'Derrota en patente'
  },
  
  // Lawsuits
  {
    pattern: /\b(lawsuit|class.?action|litigation|legal\s+action)\s*(filed|faces?|hit)/i,
    type: 'lawsuit',
    agency: 'Legal',
    baseImpact: -25,
    sentiment: 'negative',
    description: 'Demanda presentada'
  },
  {
    pattern: /\b(settl(es?|ed|ement)|dismiss(es?|ed)|wins?\s+(lawsuit|case))/i,
    type: 'settlement',
    agency: 'Legal',
    baseImpact: 15,
    sentiment: 'positive',
    description: 'Resolución legal favorable'
  },
  
  // EU Regulation
  {
    pattern: /\b(eu|european\s+(commission|union))\s*(fine[sd]?|penalt|investigat|probe|antitrust)/i,
    type: 'eu_regulation',
    agency: 'EU',
    baseImpact: -35,
    sentiment: 'negative',
    description: 'Regulación EU negativa'
  },
  {
    pattern: /\b(eu|european\s+(commission|union))\s*(approv|clear|allow)/i,
    type: 'eu_regulation',
    agency: 'EU',
    baseImpact: 25,
    sentiment: 'positive',
    description: 'Aprobación EU'
  },
  
  // China Regulation
  {
    pattern: /\bchina\s*(ban|block|restrict|fine[sd]?|crackdown|investigat)/i,
    type: 'china_regulation',
    agency: 'China',
    baseImpact: -35,
    sentiment: 'negative',
    description: 'Restricción China'
  },
  {
    pattern: /\bchina\s*(approv|allow|lift\s*ban)/i,
    type: 'china_regulation',
    agency: 'China',
    baseImpact: 30,
    sentiment: 'positive',
    description: 'Aprobación China'
  },
];

export interface RegulatoryAnalysis {
  events: RegulatoryEvent[];
  hasRegulatoryNews: boolean;
  overallImpact: number;
  summary: string;
}

class RegulatoryEventsService {
  /**
   * Analiza un array de títulos de noticias buscando eventos regulatorios
   */
  analyzeNews(newsTitles: string[]): RegulatoryAnalysis {
    const events: RegulatoryEvent[] = [];
    
    for (const title of newsTitles) {
      const titleLower = title.toLowerCase();
      
      for (const pattern of REGULATORY_PATTERNS) {
        if (pattern.pattern.test(titleLower)) {
          // Evitar duplicados del mismo tipo
          const existingEvent = events.find(e => e.type === pattern.type);
          if (!existingEvent) {
            events.push({
              type: pattern.type,
              agency: pattern.agency,
              sentiment: pattern.sentiment,
              impact: pattern.baseImpact,
              keywords: this.extractKeywords(title, pattern.pattern),
              description: pattern.description
            });
          }
        }
      }
    }
    
    // Calcular impacto total
    const overallImpact = events.length > 0 
      ? Math.round(events.reduce((sum, e) => sum + e.impact, 0) / events.length)
      : 0;
    
    // Generar resumen
    const summary = this.generateSummary(events);
    
    return {
      events,
      hasRegulatoryNews: events.length > 0,
      overallImpact,
      summary
    };
  }

  /**
   * Extrae keywords relevantes del título
   */
  private extractKeywords(title: string, pattern: RegExp): string[] {
    const match = title.match(pattern);
    return match ? [match[0]] : [];
  }

  /**
   * Genera resumen textual
   */
  private generateSummary(events: RegulatoryEvent[]): string {
    if (events.length === 0) return 'Sin eventos regulatorios';
    
    const parts = events.map(e => {
      const emoji = e.sentiment === 'positive' ? '✅' : 
                    e.sentiment === 'negative' ? '⚠️' : '📋';
      return `${emoji} ${e.description}`;
    });
    
    return parts.join(' | ');
  }

  /**
   * Formatea para el prompt de IA
   */
  formatForAI(analysis: RegulatoryAnalysis): string {
    if (!analysis.hasRegulatoryNews) {
      return 'REGULATORY_EVENTS: Sin eventos regulatorios detectados';
    }
    
    const lines: string[] = ['REGULATORY_EVENTS:'];
    
    for (const event of analysis.events) {
      const emoji = event.sentiment === 'positive' ? '✅' : 
                    event.sentiment === 'negative' ? '⚠️' : '📋';
      lines.push(`  ${emoji} ${event.agency}: ${event.description} (impacto: ${event.impact > 0 ? '+' : ''}${event.impact})`);
    }
    
    lines.push(`  Impacto total regulatorio: ${analysis.overallImpact > 0 ? '+' : ''}${analysis.overallImpact}`);
    
    return lines.join('\n');
  }
}

export const regulatoryEventsService = new RegulatoryEventsService();
