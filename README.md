# Caza del Tesoro Cartesiano

Juego educativo sencillo para practicar el plano cartesiano en el navegador, optimizado para móvil.

## Cómo ejecutar

1. Descarga o copia todos los archivos en una carpeta llamada `caza-tesoro-cartesiano`.
2. Abre el archivo `index.html` en un navegador moderno (Chrome, Edge, Firefox, etc.).
3. Selecciona un nivel y toca en la cuadrícula para intentar encontrar la coordenada objetivo.

## Estructura

- `index.html`: Página principal del juego.
- `src/game.js`: Lógica principal del juego (niveles, objetivo actual, manejo de toques).
- `src/logic.js`: Generación de coordenadas y verificación de aciertos.
- `src/ui.js`: Construcción de la cuadrícula y manejo de eventos de clic/toque.
- `src/levels.js`: Metadatos de niveles (rangos y configuración).
- `mobile/layout.css`: Estilos responsive para móvil.
- `mobile/touch-controls.js`: Normalización básica de eventos táctiles.
- `assets/characters`, `assets/stickers`, `assets/maps`, `assets/ui`: Carpetas de recursos (placeholders).

## Notas

- No requiere servidor: basta con abrir `index.html`.
- Todo el código es JS plano (ES5/ES6) sin herramientas de build.
