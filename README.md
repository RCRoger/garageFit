# Parking Fit Simulator

Simulador web cliente para visualizar el ajuste de un vehículo en una plaza, analizar obstáculos y puertas, explorar maniobras e imprimir informes. Es una herramienta de estimación geométrica; **no controla vehículos ni certifica que una maniobra sea segura en condiciones reales**.

## Desarrollo

Requiere Node.js y npm. Desde la raíz del proyecto:

```sh
npm ci
npm run dev
```

Validaciones:

```sh
npm test
npm run typecheck
npm run build
```

La aplicación está implementada con React, TypeScript, Vite, Zustand y Zod. Los datos de proyectos, vehículos personalizados y favoritos se guardan en IndexedDB en el navegador. No hay un servicio backend.

## Idioma y tema

La interfaz comienza en catalán y permite seleccionar catalán, inglés o castellano, incluido el idioma de los informes imprimibles. El tema claro u oscuro y el idioma seleccionado se guardan en el almacenamiento local del navegador.

## Docker

Construye la imagen de producción y publica el servidor web en el puerto local 8080:

```sh
docker build -t parking-fit-simulator .
docker run --rm -p 8080:80 parking-fit-simulator
```

Abre `http://localhost:8080`. La imagen compila la aplicación y sirve `dist/` con Nginx.

## Documentación para agentes

Consulta [`AGENTS.md`](AGENTS.md) para la arquitectura, convenciones, reglas geométricas, límites del simulador y criterios de validación.

## Catálogo de vehículos

El catálogo incluido contiene datos adaptados de terceros. Consulta [`VEHICLE-DATA-NOTICE.md`](VEHICLE-DATA-NOTICE.md) para atribución, licencia y regeneración.
