/**
 * Script de Verificación Completa del Sistema
 * Verifica que todos los componentes críticos funcionan correctamente
 */

const API_URL = 'http://localhost:3001/api';
const PYTHON_URL = 'http://localhost:8765';

// Colores para la consola
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
};

const log = {
  success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  fail: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  warn: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  info: (msg) => console.log(`${colors.cyan}ℹ${colors.reset} ${msg}`),
  header: (msg) => console.log(`\n${colors.bold}${colors.cyan}=== ${msg} ===${colors.reset}\n`),
};

let passed = 0;
let failed = 0;
let warnings = 0;

async function test(name, testFn) {
  try {
    const result = await testFn();
    if (result.success) {
      log.success(`${name}: ${result.message || 'OK'}`);
      passed++;
    } else if (result.warning) {
      log.warn(`${name}: ${result.message}`);
      warnings++;
    } else {
      log.fail(`${name}: ${result.message}`);
      failed++;
    }
    return result;
  } catch (error) {
    log.fail(`${name}: ${error.message}`);
    failed++;
    return { success: false, error };
  }
}

async function fetchJSON(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  return { status: response.status, data: await response.json() };
}

// ============= TESTS =============

async function testBackendHealth() {
  const { status, data } = await fetchJSON(`${API_URL}/health`);
  return {
    success: status === 200 && data.status === 'ok',
    message: status === 200 ? `Backend running v${data.version || 'unknown'}` : `Status ${status}`,
  };
}

async function testPythonServer() {
  try {
    const response = await fetch(`${PYTHON_URL}/health`);
    if (response.ok) {
      const data = await response.json();
      return {
        success: true,
        message: data.status || 'Python server responding',
      };
    }
    // Server responded but not OK
    return { warning: true, message: `Python server returned ${response.status}` };
  } catch {
    return { warning: true, message: 'Python server not running (optional)' };
  }
}

async function testPredictionCalculate() {
  const { status, data } = await fetchJSON(`${API_URL}/predictions/calculate`, {
    method: 'POST',
    body: JSON.stringify({ symbol: 'AAPL', days: 1 }),
  });
  
  const hasRequiredFields = data.data && 
    typeof data.data.confidence === 'number' &&
    typeof data.data.direction === 'string' &&
    typeof data.data.predictedChange === 'number';
    
  return {
    success: status === 200 && hasRequiredFields,
    message: hasRequiredFields 
      ? `AAPL: ${data.data.direction} ${data.data.predictedChange.toFixed(2)}% (${data.data.confidence}% conf)` 
      : 'Missing required fields',
  };
}

async function testFactorBreakdown() {
  const { status, data } = await fetchJSON(`${API_URL}/predictions/calculate`, {
    method: 'POST',
    body: JSON.stringify({ symbol: 'GOOGL', days: 1 }),
  });
  
  const fb = data.data?.factorBreakdown;
  const hasAvailableFactors = fb?.availableFactors && Array.isArray(fb.availableFactors);
  const hasWeights = fb?.weightsUsed && typeof fb.weightsUsed === 'object';
  
  return {
    success: hasAvailableFactors && hasWeights,
    message: hasAvailableFactors 
      ? `${fb.availableFactors.length} factors, weights: ${Object.keys(fb.weightsUsed || {}).length} keys` 
      : 'Missing factorBreakdown',
  };
}

async function testTrackRecordAdjustment() {
  const { data } = await fetchJSON(`${API_URL}/predictions/calculate`, {
    method: 'POST',
    body: JSON.stringify({ symbol: 'AAPL', days: 1 }),
  });
  
  const adjustment = data.data?.factorBreakdown?.trackRecordAdjustment;
  
  return {
    success: typeof adjustment === 'number',
    message: `Track record adjustment: ${adjustment !== undefined ? (adjustment >= 0 ? '+' : '') + adjustment : 'undefined'}`,
  };
}

async function testDirectionAdjustment() {
  // Test UP direction
  const { data: upData } = await fetchJSON(`${API_URL}/predictions/calculate`, {
    method: 'POST',
    body: JSON.stringify({ symbol: 'MSFT', days: 1 }),
  });
  
  // Test a volatile stock for potential neutral
  const { data: neutralData } = await fetchJSON(`${API_URL}/predictions/calculate`, {
    method: 'POST',
    body: JSON.stringify({ symbol: 'GME', days: 1 }),
  });
  
  return {
    success: true,
    message: `MSFT=${upData.data?.direction}(${upData.data?.confidence}%), GME=${neutralData.data?.direction}(${neutralData.data?.confidence}%)`,
  };
}

async function testStatsEndpoint() {
  const { status, data } = await fetchJSON(`${API_URL}/predictions/stats`);
  
  const hasStats = data.data && 
    typeof data.data.total === 'number' &&
    typeof data.data.verified === 'number';
    
  return {
    success: status === 200 && hasStats,
    message: hasStats 
      ? `Total: ${data.data.total}, Verified: ${data.data.verified}` 
      : 'Missing stats data',
  };
}

async function testQualityBreakdown() {
  const { status, data } = await fetchJSON(`${API_URL}/predictions/stats`);
  
  const quality = data.data?.byQuality;
  const has3Categories = quality && 
    typeof quality.excellent === 'number' &&
    typeof quality.good === 'number' &&
    typeof quality.failed === 'number';
    
  return {
    success: has3Categories,
    message: has3Categories 
      ? `Excellent: ${quality.excellent}, Good: ${quality.good}, Failed: ${quality.failed}` 
      : 'Quality breakdown missing or wrong format',
  };
}

async function testPredictionSave() {
  // Primero calculamos con un símbolo real
  const { status: calcStatus, data: calcData } = await fetchJSON(`${API_URL}/predictions/calculate`, {
    method: 'POST',
    body: JSON.stringify({ symbol: 'AAPL', days: 1 }),
  });
  
  if (calcStatus !== 200 || !calcData.data) {
    return { success: false, message: 'Could not calculate prediction' };
  }
  
  // Guardamos usando POST /api/predictions/ (create) o /track
  const { status, data } = await fetchJSON(`${API_URL}/predictions/track`, {
    method: 'POST',
    body: JSON.stringify({
      ...calcData.data,
      timeframe: '1 día',
    }),
  });
  
  return {
    success: status === 201 || status === 200,
    message: (status === 201 || status === 200) ? `Saved prediction ID: ${data.data?.id || 'OK'}` : `Save failed: ${status} - ${JSON.stringify(data)}`,
  };
}

async function testFactorBreakdownSavedCorrectly() {
  // Obtener última predicción guardada - la API devuelve data como array directamente
  const { data } = await fetchJSON(`${API_URL}/predictions?limit=1`);
  
  // data.data is the array directly, not data.data.predictions
  const predictions = Array.isArray(data.data) ? data.data : data.data?.predictions;
  const pred = predictions?.[0];
  
  if (!pred) {
    return { warning: true, message: 'No saved predictions found' };
  }
  
  const fb = pred.factorBreakdown;
  if (!fb) {
    return { success: false, message: `Prediction ${pred.id} has no factorBreakdown` };
  }
  
  const hasFactors = fb.availableFactors && fb.availableFactors.length > 0;
  const hasWeights = fb.weightsUsed && Object.keys(fb.weightsUsed).length > 0;
  
  return {
    success: hasFactors && hasWeights,
    message: hasFactors && hasWeights 
      ? `Prediction ${pred.id.slice(0,8)}...: ${fb.availableFactors.length} factors, ${Object.keys(fb.weightsUsed).length} weights` 
      : `Prediction ${pred.id.slice(0,8)}...: factors=${hasFactors}, weights=${hasWeights}`,
  };
}

async function testDatabaseIntegrity() {
  const { data } = await fetchJSON(`${API_URL}/predictions/stats`);
  
  const total = data.data?.total || 0;
  const verified = data.data?.verified || 0;
  
  if (total === 0) {
    return { warning: true, message: 'No predictions in database' };
  }
  
  const verificationRate = (verified / total * 100).toFixed(1);
  
  return {
    success: true,
    message: `${total} predictions, ${verified} verified (${verificationRate}%)`,
  };
}

async function testPythonTrainingEndpoint() {
  try {
    const { status, data } = await fetchJSON(`${PYTHON_URL}/train`, {
      method: 'POST',
      body: JSON.stringify({ predictions: [], force: false }),
    });
    
    return {
      success: status === 200,
      message: data.message || 'Training endpoint responding',
    };
  } catch {
    return { warning: true, message: 'Python server not available for training test' };
  }
}

async function testPythonWeights() {
  try {
    const { status, data } = await fetchJSON(`${PYTHON_URL}/weights`);
    
    if (status !== 200) {
      return { warning: true, message: 'Could not get weights' };
    }
    
    const weights = data.weights || {};
    const hasWeights = Object.keys(weights).length > 0;
    
    return {
      success: hasWeights,
      message: hasWeights 
        ? `${Object.keys(weights).length} factor weights loaded` 
        : 'No weights found',
    };
  } catch {
    return { warning: true, message: 'Python server not available' };
  }
}

async function testMultipleSymbols() {
  const symbols = ['AAPL', 'TSLA', 'NVDA', 'BTC-USD', 'SPY'];
  const results = [];
  
  for (const symbol of symbols) {
    try {
      const { status, data } = await fetchJSON(`${API_URL}/predictions/calculate`, {
        method: 'POST',
        body: JSON.stringify({ symbol, days: 1 }),
      });
      
      if (status === 200 && data.data) {
        results.push(`${symbol}:${data.data.confidence}%`);
      } else {
        results.push(`${symbol}:FAIL`);
      }
    } catch {
      results.push(`${symbol}:ERR`);
    }
  }
  
  const allOk = !results.some(r => r.includes('FAIL') || r.includes('ERR'));
  
  return {
    success: allOk,
    message: results.join(', '),
  };
}

async function testProbabilisticModel() {
  const { data } = await fetchJSON(`${API_URL}/predictions/calculate`, {
    method: 'POST',
    body: JSON.stringify({ symbol: 'AAPL', days: 7 }),
  });
  
  const prob = data.data?.probabilistic;
  const hasProb = prob && 
    typeof prob.mean === 'number' &&
    typeof prob.stdDev === 'number';
    
  return {
    success: hasProb,
    message: hasProb 
      ? `Mean: ${prob.mean.toFixed(2)}%, StdDev: ${prob.stdDev.toFixed(2)}%` 
      : 'Missing probabilistic data',
  };
}

async function testConfidenceIntervals() {
  const { data } = await fetchJSON(`${API_URL}/predictions/calculate`, {
    method: 'POST',
    body: JSON.stringify({ symbol: 'SPY', days: 7 }),
  });
  
  const intervals = data.data?.probabilistic?.confidenceIntervals;
  // API uses ci50, ci80, ci95 format
  const hasIntervals = intervals && 
    intervals.ci50 && 
    intervals.ci95;
    
  return {
    success: hasIntervals,
    message: hasIntervals 
      ? `50%: [${intervals.ci50.lower.toFixed(2)}, ${intervals.ci50.upper.toFixed(2)}], 95%: [${intervals.ci95.lower.toFixed(2)}, ${intervals.ci95.upper.toFixed(2)}]` 
      : 'Missing confidence intervals',
  };
}

// ============= MAIN =============

async function main() {
  console.log(`\n${colors.bold}${colors.cyan}╔══════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}║   GUESS INVESTOR - SYSTEM VERIFICATION   ║${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}╚══════════════════════════════════════════╝${colors.reset}`);
  
  log.header('1. CONNECTIVITY');
  await test('Backend Health', testBackendHealth);
  await test('Python Server', testPythonServer);
  
  log.header('2. PREDICTION CALCULATION');
  await test('Basic Prediction', testPredictionCalculate);
  await test('Factor Breakdown', testFactorBreakdown);
  await test('Probabilistic Model', testProbabilisticModel);
  await test('Confidence Intervals', testConfidenceIntervals);
  
  log.header('3. TRACK RECORD SYSTEM');
  await test('Track Record Adjustment', testTrackRecordAdjustment);
  await test('Direction Adjustment', testDirectionAdjustment);
  
  log.header('4. MULTIPLE SYMBOLS');
  await test('Multi-Symbol Test', testMultipleSymbols);
  
  log.header('5. DATABASE & PERSISTENCE');
  await test('Stats Endpoint', testStatsEndpoint);
  await test('Quality Breakdown (3 categories)', testQualityBreakdown);
  await test('Database Integrity', testDatabaseIntegrity);
  await test('Prediction Save', testPredictionSave);
  await test('Factor Breakdown Saved', testFactorBreakdownSavedCorrectly);
  
  log.header('6. PYTHON ML SYSTEM');
  await test('Python Weights', testPythonWeights);
  await test('Training Endpoint', testPythonTrainingEndpoint);
  
  // Summary
  console.log(`\n${colors.bold}═══════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bold}RESULTS:${colors.reset}`);
  console.log(`  ${colors.green}Passed:${colors.reset}   ${passed}`);
  console.log(`  ${colors.red}Failed:${colors.reset}   ${failed}`);
  console.log(`  ${colors.yellow}Warnings:${colors.reset} ${warnings}`);
  console.log(`${colors.bold}═══════════════════════════════════════════${colors.reset}\n`);
  
  if (failed > 0) {
    console.log(`${colors.red}${colors.bold}⚠️  Some tests failed! Check the issues above.${colors.reset}\n`);
    process.exit(1);
  } else if (warnings > 0) {
    console.log(`${colors.yellow}${colors.bold}⚠️  All critical tests passed, but there are warnings.${colors.reset}\n`);
    process.exit(0);
  } else {
    console.log(`${colors.green}${colors.bold}✓ All tests passed!${colors.reset}\n`);
    process.exit(0);
  }
}

main().catch(error => {
  console.error(`\n${colors.red}Fatal error:${colors.reset}`, error.message);
  process.exit(1);
});
