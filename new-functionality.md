# Plan de Nuevas Funcionalidades: "Artis Nova DSP"

Este documento recoge propuestas para hacer la aplicación más atractiva, funcional y profesional, inspirándose en herramientas como Roon, REW y software de estudio de grabación.

> **Nota:** Ninguna funcionalidad se marca como completada `[x]` hasta que el usuario la valide explícitamente.

## 1. Integración Avanzada con REW y Calibración
*Objetivo: Convertir la app en una herramienta técnica potente similar a REW pero integrada.*

- [ ] **Importación Inteligente de Filtros REW**
    - Capacidad de arrastrar y soltar archivos de texto exportados de REW.
    - Parsing automático y conversión a configuración de CamillaDSP.
    - Visualización previa de la curva de corrección antes de aplicar.

- [ ] **Editor Gráfico de EQ (Parametric EQ Drawing)**
    - En lugar de introducir números (Gain, Q, Freq), una gráfica interactiva donde puedas arrastrar puntos de control con el ratón/dedo para modificar la curva en tiempo real.
    - Superposición visual de la respuesta teórica del filtro sobre la gráfica.

- [ ] **Target Curve Designer**
    - Herramienta para diseñar curvas "House Curve" (ej. Harman Curve) visualmente y generar los filtros necesarios automáticamente para adaptarse a ella.

## 2. Visualización y "Eye Candy" (Atractivo Visual)
*Objetivo: Hacer que la interfaz se sienta "viva" y premium.*

- [x] **Analizador de Espectro en Tiempo Real (RTA)**
    - Visualización FFT de 31 o 64 bandas que se mueve con la música.
    - Utilizar los datos de señal de CamillaDSP para animar barras de frecuencia en la UI.

- [x] **VU Meters "Vintage" Seleccionables**
    - Añadir "Skins" para los VU metros (ej. estilo McIntosh azul, estilo analógico cálido, estilo barra LED digital).
    - Opción de pantalla completa solo para los medidores.

## 3. Experiencia Roon y Metadatos
*Objetivo: Enriquecer la experiencia de "Now Playing".*

- [ ] **Carrusel de Artistas Similares / Bio**
    - Al pulsar en el artista, extraer biografía y artistas relacionados desde TheAudioDB/Last.fm y mostrarlos en un panel lateral o modal elegante.

- [ ] **Visualización de Letras Sincronizadas (Lyrics)**
    - Si el proveedor lo permite, hacer que las letras hagan scroll automático o mejorar la presentación tipográfica actual de las letras estáticas.

- [ ] **Explorador de Versiones (Deep Search)**
    - Botón "Ver otras versiones" que busque en Roon otras grabaciones de la misma composición (especialmente útil para Clásica y Jazz).

## 4. Funcionalidades para Audiófilos
*Objetivo: Herramientas de escucha crítica.*

- [ ] **Test A/B Ciego (Blind Testing)**
    - Un modo donde la app carga dos presets diferentes (A y B) pero oculta cuál es cuál.
    - Permite al usuario conmutar y votar cuál suena mejor sin sesgo psicológico.
    - Al final revela cuál era cuál.

- [ ] **Control de Loudness Dinámico (ISO 226)**
    - Implementación de curvas Fletcher-Munson que ajustan sutilmente graves y agudos cuando el volumen es bajo (modo "Noche") para mantener la percepción tonal.

- [ ] **Selector de Entradas Gráfico (Routing Matrix)**
    - Una matriz visual para enrutar canales si usas interfaces con múltiples entradas/salidas (ej. Motu/Focusrite), en lugar de editar configs a mano.

## 5. Sistema y Mantenimiento
*Objetivo: Robustez y control del hardware.*

- [ ] **Monitor de Salud del Sistema**
    - Gráficas pequeñas de CPU y Temperatura de la Raspberry Pi en el footer.
    - Alerta visual si la CPU pasa de cierto umbral (evitar glitches de audio).

- [ ] **Gestión de Snapshots/Backups**
    - Botón para "Congelar" el estado actual (Config + Filtros + Volumen) en un Snapshot con nombre (ej. "Configuración Perfecta Enero 2026") para poder restaurar si se rompe algo "jugando".
