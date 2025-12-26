// Script de prueba para la API
async function test() {
  try {
    console.log('Testing /api/predictions/calculate...');
    
    const response = await fetch('http://localhost:3001/api/predictions/calculate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol: 'AAPL', days: 7 }),
    });
    
    const data = await response.json();
    console.log('Status:', response.status);
    console.log('Response:', JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error:', error.message);
  }
}

test();
