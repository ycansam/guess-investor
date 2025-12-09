# Archivos de Datos JSON

Esta carpeta contiene los datos estáticos utilizados por la aplicación.

## Archivos

### `company-symbols.json`
Mapa de nombres de empresas a sus símbolos bursátiles.
- **spanish**: Empresas del IBEX 35 y otras españolas (.MC)
- **american**: Empresas estadounidenses (NASDAQ, NYSE)
- **european**: Empresas europeas (.PA, .DE, .L, .SW)

### `crypto-symbols.json`
Mapa de nombres de criptomonedas a sus símbolos.

### `stop-words.json`
Palabras que deben ignorarse al buscar activos:
- **verbs**: Verbos de acción
- **time**: Palabras relacionadas con tiempo
- **articles**: Artículos y preposiciones
- **finance**: Términos financieros genéricos
- **numbers**: Números escritos

### `financial-patterns.json`
Patrones para detectar si un mensaje es una petición financiera:
- **priceAndValue**: Patrones de precio/valor
- **realTimeData**: Patrones de datos en tiempo real
- **currentState**: Patrones de estado actual
- **actions**: Verbos de acción financiera
- **assets**: Tipos de activos
- **analysis**: Patrones de análisis
- **crypto**: Términos de criptomonedas

### `market-config.json`
Configuración de mercados y monedas:
- **cryptoNames**: Nombres completos de criptomonedas
- **europeanSuffixes**: Sufijos de bolsas europeas
- **currencyMapping**: Mapeo de símbolos a monedas (€, £, CHF, $)

### `api-config.json`
Configuración de APIs externas:
- **finnhub**: URLs y endpoints de Finnhub API
- **yahoo**: Configuración de Yahoo Finance
- **exchangeRate**: API de tasas de cambio
- **defaults**: Valores por defecto (límites de búsqueda, etc.)

## Cómo añadir nuevos datos

### Añadir una nueva empresa
Edita `company-symbols.json` y añade la entrada en la categoría correspondiente:
```json
{
  "spanish": {
    "nueva empresa": "SIMBOLO.MC"
  }
}
```

### Añadir una nueva criptomoneda
1. Edita `crypto-symbols.json`:
```json
{
  "nueva crypto": "SYMBOL"
}
```

2. Añade el nombre completo en `market-config.json`:
```json
{
  "cryptoNames": {
    "SYMBOL": "Nombre Completo"
  }
}
```
