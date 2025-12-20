/**
 * Configuración de tema para la aplicación
 * Dark Mode por defecto
 */

export const colors = {
  // Fondos principales
  background: '#0f0f0f',
  backgroundSecondary: '#1a1a1a',
  backgroundTertiary: '#252525',
  surface: '#1e1e1e',
  surfaceHover: '#2a2a2a',
  
  // Bordes
  border: '#2e2e2e',
  borderLight: '#3a3a3a',
  
  // Textos
  text: '#ffffff',
  textSecondary: '#a0a0a0',
  textTertiary: '#6b7280',
  textMuted: '#525252',
  
  // Colores de acento
  primary: '#6366f1', // Indigo
  primaryHover: '#818cf8',
  primaryLight: 'rgba(99, 102, 241, 0.15)',
  
  // Estados
  success: '#10b981',
  successLight: 'rgba(16, 185, 129, 0.15)',
  successBg: '#052e1c',
  
  danger: '#ef4444',
  dangerLight: 'rgba(239, 68, 68, 0.15)',
  dangerBg: '#2d1515',
  
  warning: '#f59e0b',
  warningLight: 'rgba(245, 158, 11, 0.15)',
  warningBg: '#2d2006',
  
  info: '#3b82f6',
  infoLight: 'rgba(59, 130, 246, 0.15)',
  
  neutral: '#6b7280',
  neutralLight: 'rgba(107, 114, 128, 0.15)',
  
  // Específicos de UI
  cardBackground: '#1a1a1a',
  inputBackground: '#252525',
  inputBorder: '#3a3a3a',
  
  // Tab bar
  tabBarBackground: '#0f0f0f',
  tabBarBorder: '#2e2e2e',
  tabActive: '#6366f1',
  tabInactive: '#6b7280',
  
  // Status bar
  statusBar: '#0f0f0f',
  
  // Overlay
  overlay: 'rgba(0, 0, 0, 0.7)',
  
  // Badges
  badgeBackground: '#252525',
  
  // Checkbox
  checkboxBorder: '#4b5563',
  checkboxChecked: '#6366f1',
};

// Colores para gráficos y datos de mercado
export const marketColors = {
  up: '#10b981',
  upLight: 'rgba(16, 185, 129, 0.15)',
  down: '#ef4444',
  downLight: 'rgba(239, 68, 68, 0.15)',
  neutral: '#6b7280',
  neutralLight: 'rgba(107, 114, 128, 0.15)',
};

// Sombras (menos pronunciadas en dark mode)
export const shadows = {
  small: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 2,
  },
  medium: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 4,
  },
  large: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 8,
  },
};

export default { colors, marketColors, shadows };
