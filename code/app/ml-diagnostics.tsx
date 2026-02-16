/**
 * Página de Diagnóstico ML
 * Muestra pesos aprendidos, clasificadores de activos y estado del sistema ML
 */

import React from 'react';
import { MLDiagnosticsModal } from '../components/ml-diagnostics-modal/ml-diagnostics-modal';

export default function MLDiagnosticsPage() {
  return <MLDiagnosticsModal asPage />;
}
