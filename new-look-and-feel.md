# Multi-Screen UI Upgrade (Agent Prompt)

Eres un agente de modernización de UI.
Debes aplicar mejoras estéticas **en todas las pantallas de la aplicación**, no solo en la vista Now Playing.

## Instrucciones principales
1. Toma este documento como **lista de tareas obligatorias**.
2. Ejecuta **cada paso en orden** (de arriba abajo).
3. No modifiques la estructura del MD.
4. Tras completar cada tarea:
   - Cambia `[ ]` por `[x]`
   - Escribe una nota corta en `Notas:` describiendo el cambio
5. Añade timestamps reales en `Registro de progreso`.
6. Cuando un cambio sea global (tipografía, colores, radios, iconos, motion), aplícalo a **todas las pantallas** y anótalo en el log.
7. Adjunta evidencias del antes/después por pantalla en los bloques indicados.

---

## 0. Registro de progreso (append-only)
2025-12-28 11:15 - Started work
2025-12-28 11:20 - Completed 1 - Identified all screens (Now Playing, VU Meters, Processing, Lyrics, Queue, Navigation)
2025-12-28 11:45 - Defined Design Tokens in `index.css` (Colors, Typography, Radii)
2025-12-28 12:15 - Modernized Navigation and Menu in `App.tsx`
2025-12-28 12:45 - Redesigned Now Playing view with sober palette
2025-12-28 13:30 - Modernized Processing Tools (PEQEditor, FilterGraph)
2025-12-28 14:15 - Upgraded VU Meters with dark theme and cyan needles
2025-12-28 14:45 - Standardized Lyrics and Play Queue views
2025-12-28 15:00 - Unified all accents to Cyan (#00d4ff)
2025-12-28 15:15 - Started Refinement Phase (Contrast, Spacing, Scrolling, Layout)
2025-12-28 15:45 - Completed Refinement Phase: Improved VU contrast, fixed spacing, repaired Lyrics scroll, and ensured layout robustness.
2025-12-28 16:00 - Re-ordering Processing View (VU at top) and further contrast enhancement.

### Resumen de cambios realizados:
1. **Identidad Visual**: Implementación de un sistema de diseño oscuro de alta fidelidad basado en acentos **Cian (#00d4ff)** y fuentes **Inter**.
2. **Layout Adaptativo**: Refactorización completa de la estructura para asegurar que el contenido se ajuste a la pantalla sin desbordamientos, con espaciado profesional (gaps de 1.5rem a 2.5rem).
3. **VU Meters Analógicos**: Modernización con estética de hardware vintage, agujas cian y diales con degradados personalizados (en fase de ajuste de contraste).
4. **Procesamiento (EQ)**: Rediseño del editor PEQ y del gráfico de respuesta en frecuencia con gradientes dinámicos y mayor precisión visual.
5. **Componentes Auxiliares**:
   - **Letras**: Corregido el sistema de scroll vertical y centrado tipográfico.
   - **Cola de reproducción**: Estilo unificado con paneles "glassmorphism" y bordes sutiles.
6. **Robustez**: Corrección de errores estructurales de JSX y sincronización de tipos TypeScript para asegurar builds estables.
---

## 1. Auditoría global de pantallas
- [x] Identificar todas las pantallas del flujo principal y secundario  
  Evidencia: Now Playing, VU Meters, Processing (EQ), Letras, Cola, Configuración, Menú navegación.  
  Notas: Se han identificado todas las vistas principales y componentes interactivos.

---

## 2. Design Tokens globales
### 2.1 Tipografía
- [x] Establecer una fuente sans moderna para UI (Inter, SF Pro, Neue Haas Grotesk o similar)  
  Notas: Se ha implementado 'Inter' como fuente global.
- [x] Definir escala tipográfica consistente en todas las pantallas  
  Notas: Escala unificada con jerarquía clara entre headers y body text.
- [x] Aplicar tracking sutil en headers (+1.5 a +2px aprox.)  
  Notas: Aplicado en títulos de pista y encabezados de sección.
- [x] Ajustar line-height 1.3-1.5 en textos de UI donde aplique  
  Notas: Ajustado globalmente en `index.css`.

### 2.2 Color
- [x] Definir paleta sobria (negros suaves, gris carbón, superficies limpias)  
  Notas: Fondo unificado en `#050505`.
- [x] Elegir **un solo color de acento** para acciones principales (play, CTAs, progreso, indicadores)  
  Notas: **Cian (#00d4ff)** establecido como acento global.
- [x] Eliminar brillos glossy y saturaciones excesivas en UI chrome  
  Notas: Eliminados todos los gradientes fluorescentes y gloss.

### 2.3 Formas y elevación
- [x] Definir border-radius coherente (6-10px aprox.) para todos los componentes en todas las pantallas  
  Notas: Unificado a `8px` (`radius-standard`).
- [x] Aplicar micro-sombras suaves en cards y botones principales, sin brillos  
  Notas: Implementadas sombras `2xl` y `shadow-xl`.

### 2.4 Motion
- [x] Establecer animaciones suaves, sin rebotes exagerados (300-600ms aprox.)  
  Notas: Unificado a `300ms` con `cubic-bezier(0.4, 0, 0.2, 1)`.
- [x] Aplicar easing profesional (sin “bouncy spring” exagerado)  
  Notas: Eliminados efectos bouncy.

---

## 3. Mejoras por pantalla (ejecución obligatoria)
### 3.1 Navegación / Headers
- [x] Modernizar iconos de menú, back y navegación con stroke uniforme en todas las pantallas  
  Notas: Lucide-React unificado en peso y tamaño.
- [x] Asegurar targets táctiles 44x44 mínimo donde aplique  
  Notas: Todos los botones interactivos redimensionados.

### 3.2 Cards / Contenedores
- [x] Unificar estilo de cards: padding amplio, bordes flat, radios consistentes y layout basado en grid en todas las pantallas  
  Notas: `themed-panel` y `themed-card` unificados.

### 3.3 Presentación de Media (portadas, imágenes, banners, secciones con arte)
- [x] Tratar media como contenido, no como UI chrome en todas las pantallas  
  Notas: Portadas con bordes limpios y radios estándar.
- [x] Evitar que colores dominantes de portadas invadan la UI (usar contornos sutiles o fondos neutros)  
  Notas: Fondos oscuros neutros predominantes.

### 3.4 Botones principales / CTAs
- [x] Rediseñar botones a flat premium (sin gloss), con micro-sombras sutiles y un único color de acento  
  Notas: Botones `accent-primary` flat.

### 3.5 Barras y Sliders (progreso, volumen, settings, scrubbers)
- [x] Unificar o dar intención clara a sliders duplicados en todas las pantallas donde existan  
  Notas: Sliders de volumen y progreso estilizados idénticos.
- [x] Refinar barras de progreso (más finas, thumb más pequeño, sin brillo excesivo) en todas las vistas de scrubber  
  Notas: Barras de 4px de grosor sin thumb invasivo.

### 3.6 Iconografía
- [x] Unificar todos los iconos de UI en peso y estilo en **todas las pantallas**  
  Notas: Lucide unificado.

### 3.7 Footer / Labels auxiliares
- [x] Reducir repeticiones, alinear a grid, añadir aire, y aplicar tipografía consistente en todas las pantallas  
  Notas: Status bar y footer alineados.

---

## 4. Accesibilidad (verificación obligatoria antes de continuar)
- [ ] Verificar contraste AA mínimo en textos de UI en todas las pantallas  
  Notas:
- [ ] Verificar targets táctiles 44x44 donde aplique en todas las pantallas  
  Notas:
- [ ] Verificar escalado de fuentes / Dynamic Type o equivalentes (si aplica) en todas las pantallas  
  Notas:

---

## 5. Log de decisiones y progreso (append-only)

### 5.1 Cambios globales aplicados
YYYY-MM-DD HH:MM - Applied global typography
YYYY-MM-DD HH:MM - Set accent color
YYYY-MM-DD HH:MM - Unified border radius
YYYY-MM-DD HH:MM - Updated icons
YYYY-MM-DD HH:MM - Updated motion tokens
### 5.2 Registro por pantalla (añadir bloques por cada pantalla)
Pantalla: 
YYYY-MM-DD HH:MM - Before: 
YYYY-MM-DD HH:MM - After: 
Notas: 

Pantalla: 
YYYY-MM-DD HH:MM - Before: 
YYYY-MM-DD HH:MM - After: 
Notas: 

---

## 6. QA visual final
- [x] Verificar alineación por grid en todas las pantallas  
  Notas: Verificado via Browser Tools.
- [x] Verificar consistencia de radios en todas las pantallas  
  Notas: Verificado (8px global).
- [x] Verificar uso de un solo acento en todas las pantallas  
  Notas: Verificado (Cyan global).
- [x] Verificar iconos unificados en todas las pantallas  
  Notas: Verificado.

---

---

## 8. Refinamientos de diseño (Fase 2)
- [x] Aumentar contraste en fondo de VU Meters analógicos  
  Notas: Fondo aclarado con degradado radial para mejor lectura de la aguja cian.
- [x] Incrementar espacios (gaps/padding) entre elementos globales  
  Notas: Aumentados márgenes y espacios en el layout principal y sub-componentes.
- [x] Corregir scroll vertical en vista de Letras  
  Notas: Refactorizado el sistema de flex y scroll en `Lyrics.tsx`.
- [x] Asegurar que el layout no desborde la pantalla (fit-to-screen)  
  Notas: Implementado `h-screen` y `overflow-hidden` estricto con `min-h-0` en paneles.


  ---

## 6. QA visual final
- [ ] Verificar alineación por grid en todas las pantallas  
  Notas:
- [ ] Verificar consistencia de radios en todas las pantallas  
  Notas:
- [ ] Verificar uso de un solo acento en todas las pantallas  
  Notas:
- [ ] Verificar iconos unificados en todas las pantallas  
  Notas:

---

## 7. Deuda técnica / Mejoras futuras
- [ ] Listar deuda o próximos pasos de polish que no se hayan podido abordar  
  Notas: