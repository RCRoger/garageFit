# Guía para agentes de IA

## Propósito y límites

Parking Fit Simulator es una aplicación web cliente para estudiar el ajuste de un vehículo en una plaza y explorar maniobras de aparcamiento. No controla vehículos, no recibe datos de sensores y no es un sistema certificado de conducción autónoma. No describas sus resultados como una garantía de seguridad o viabilidad en el mundo real.

Los resultados dependen de dimensiones, obstáculos y ajustes introducidos o conocidos. El catálogo puede carecer de datos; conserva los valores desconocidos como `null` y no inventes dimensiones. Los datos iniciales del simulador son ejemplos editables, no representan un vehículo concreto.

## Comandos

- `npm ci`: instalar exactamente las dependencias del lockfile.
- `npm run dev`: iniciar Vite en modo desarrollo.
- `npm test`: ejecutar las pruebas con Vitest.
- `npm run typecheck`: comprobar tipos TypeScript.
- `npm run build`: comprobar tipos y generar `dist/`.
- `docker build -t parking-fit-simulator .`: construir la imagen de producción.
- `docker run --rm -p 8080:80 parking-fit-simulator`: servir la aplicación en `http://localhost:8080`.

El proyecto usa TypeScript estricto. Al cambiar lógica o esquemas, ejecuta las pruebas afectadas y `npm run typecheck`; antes de cerrar cambios, ejecuta también `npm run build`.

## Arquitectura

- `src/app/App.tsx`: composición de la aplicación.
- `src/components/`: interfaz React, organizada por configuración, maniobras, simulador, proyectos, vehículos y resultados.
- `src/domain/geometry/`: vectores, polígonos y transformaciones geométricas.
- `src/domain/collision/`: intersecciones, distancias, ajuste del vehículo y análisis de puertas.
- `src/domain/maneuver/`: planificación y evaluación de entrada/salida; sus pruebas están junto al dominio.
- `src/domain/doors/`: geometría y barrido de puertas.
- `src/features/`: casos de uso de informes y búsqueda de vehículos.
- `src/hooks/`: integración reactiva de análisis de dominio con la interfaz.
- `src/stores/`: estado cliente Zustand para simulación, proyectos y biblioteca de vehículos.
- `src/infrastructure/persistence/`: persistencia local en IndexedDB y repositorio de proyectos.
- `src/infrastructure/vehicle-database/`: catálogo local de vehículos.
- `src/types/`: esquemas Zod y tipos compartidos, incluido el formato de proyecto.

Mantén la lógica geométrica y de planificación en `domain`, sin depender de React, DOM ni stores. Las vistas deben usar las capas existentes y los esquemas Zod compartidos para validar datos.

## Invariantes del modelo

- Las distancias y dimensiones se expresan en centímetros.
- La plaza rectangular usa origen `(0, 0)` en su esquina superior izquierda; X es anchura e Y es longitud.
- La posición del vehículo es el centro de su huella. Un ángulo de `0°` orienta el morro hacia `-Y`; los ángulos positivos avanzan en sentido horario.
- La huella usa la anchura de espejos plegados cuando se conoce; de lo contrario usa la anchura de carrocería.
- El análisis de ajuste (`domain/collision/analysis.ts`) y el planificador (`domain/maneuver/maneuver.ts`) son comprobaciones distintas. No infieras que una entrada viable implica una salida viable, ni al contrario.
- La holgura configurable (`minimumObstacleClearance`) se expresa en cm, admite `0–100` y su valor predeterminado es `10`. Se aplica al planificador frente a obstáculos; no se debe confundir con el margen de confort del análisis de ajuste, el límite de la plaza o el barrido de puertas. Con `0` se desactiva el margen adicional, pero no la detección de solapamientos.
- La optimización puede preferir hasta 30 cm de separación de obstáculos; esa preferencia no sustituye al mínimo configurado.
- Los estados `viable`, `not-viable` y `not-verified` describen el resultado del modelo y la búsqueda, no una garantía de maniobra real.

Al cambiar un cálculo, revisa todas las superficies que consumen su resultado: entrada y salida, estado de resultados, informes y pruebas relacionadas.

## Configuración y persistencia

- Los esquemas Zod de `src/types/domain.ts` son la fuente de verdad para rangos, valores predeterminados y validación de datos de dominio.
- Los proyectos serializan una instantánea validada en `src/types/project.ts`. Mantén compatibilidad al importar proyectos antiguos: los campos nuevos deben tener valores predeterminados cuando sea adecuado y cubrirse con pruebas.
- El almacenamiento del navegador es local a cada origen mediante IndexedDB; no existe un backend ni sincronización remota.
- Si cambia el catálogo de vehículos, conserva la atribución y las condiciones de licencia documentadas en `VEHICLE-DATA-NOTICE.md`; la generación se describe allí.

## Convenciones de cambios

- Conserva los patrones, el idioma y la terminología existentes en la interfaz (principalmente español).
- Prefiere cambios pequeños y tipados. Evita conversiones de tipo inseguras y no ocultes errores con valores por defecto silenciosos.
- Actualiza las pruebas de dominio, esquemas, persistencia o informes según la superficie modificada.
- No añadas dependencias si la plataforma y las dependencias existentes resuelven el problema.
- `Dockerfile` construye la aplicación estática y `nginx.conf` la sirve. No introduzcas lógica de servidor ni afirmes que los datos persisten dentro del contenedor: la persistencia de usuario reside en el navegador.
