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
YYYY-MM-DD HH:MM - Started work
YYYY-MM-DD HH:MM - Completed <número_de_paso> - <descripción>
---

## 1. Auditoría global de pantallas
- [ ] Identificar todas las pantallas del flujo principal y secundario  
  Evidencia: _listar pantallas aquí_  
  Notas:

---

## 2. Design Tokens globales
### 2.1 Tipografía
- [ ] Establecer una fuente sans moderna para UI (Inter, SF Pro, Neue Haas Grotesk o similar)  
  Notas:
- [ ] Definir escala tipográfica consistente en todas las pantallas  
  Notas:
- [ ] Aplicar tracking sutil en headers (+1.5 a +2px aprox.)  
  Notas:
- [ ] Ajustar line-height 1.3-1.5 en textos de UI donde aplique  
  Notas:

### 2.2 Color
- [ ] Definir paleta sobria (negros suaves, gris carbón, superficies limpias)  
  Notas:
- [ ] Elegir **un solo color de acento** para acciones principales (play, CTAs, progreso, indicadores)  
  Notas:
- [ ] Eliminar brillos glossy y saturaciones excesivas en UI chrome  
  Notas:

### 2.3 Formas y elevación
- [ ] Definir border-radius coherente (6-10px aprox.) para todos los componentes en todas las pantallas  
  Notas:
- [ ] Aplicar micro-sombras suaves en cards y botones principales, sin brillos  
  Notas:

### 2.4 Motion
- [ ] Establecer animaciones suaves, sin rebotes exagerados (300-600ms aprox.)  
  Notas:
- [ ] Aplicar easing profesional (sin “bouncy spring” exagerado)  
  Notas:

---

## 3. Mejoras por pantalla (ejecución obligatoria)
### 3.1 Navegación / Headers
- [ ] Modernizar iconos de menú, back y navegación con stroke uniforme en todas las pantallas  
  Notas:
- [ ] Asegurar targets táctiles 44x44 mínimo donde aplique  
  Notas:

### 3.2 Cards / Contenedores
- [ ] Unificar estilo de cards: padding amplio, bordes flat, radios consistentes y layout basado en grid en todas las pantallas  
  Notas:

### 3.3 Presentación de Media (portadas, imágenes, banners, secciones con arte)
- [ ] Tratar media como contenido, no como UI chrome en todas las pantallas  
  Notas:
- [ ] Evitar que colores dominantes de portadas invadan la UI (usar contornos sutiles o fondos neutros)  
  Notas:

### 3.4 Botones principales / CTAs
- [ ] Rediseñar botones a flat premium (sin gloss), con micro-sombras sutiles y un único color de acento  
  Notas:

### 3.5 Barras y Sliders (progreso, volumen, settings, scrubbers)
- [ ] Unificar o dar intención clara a sliders duplicados en todas las pantallas donde existan  
  Notas:
- [ ] Refinar barras de progreso (más finas, thumb más pequeño, sin brillo excesivo) en todas las vistas de scrubber  
  Notas:

### 3.6 Iconografía
- [ ] Unificar todos los iconos de UI en peso y estilo en **todas las pantallas**  
  Notas:

### 3.7 Footer / Labels auxiliares
- [ ] Reducir repeticiones, alinear a grid, añadir aire, y aplicar tipografía consistente en todas las pantallas  
  Notas:

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