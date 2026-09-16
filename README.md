# Prueba técnica - API + Cliente Web

Aplicación full-stack para gestionar pedidos, clientes, productos y reportes de ventas.

## Stack

- Backend: Node.js + Express + TypeScript
- Base de datos: PostgreSQL
- Frontend: React + TypeScript + Vite

## Estructura del proyecto

- `api/`: API REST para pedidos y reportes
- `web/`: cliente web para gestión del sistema
- `db/`: migraciones e ingest de datos
- `docker-compose.yml`: levantar PostgreSQL

## Requisitos

- Node.js 20+
- npm
- Docker + Docker Compose

## Instalación

1. Clona el proyecto.
2. Levanta la base de datos:

```bash
docker compose up -d
```

3. Instala dependencias del backend:

```bash
cd api
npm install
```

4. Instala dependencias del frontend:

```bash
cd ../web
npm install
```

5. Inicia la API:

```bash
cd ../api
npm start
```

6. Inicia el cliente:

```bash
cd ../web
npm run dev -- --host 0.0.0.0
```

## Endpoints principales

- `GET /orders`
- `GET /orders/:id`
- `POST /orders`
- `POST /orders/:id/apply-discounts`
- `GET /reports/top-customers`

## Variables de entorno

Crea un archivo `.env` en `api/` con:

```env
PORT=4000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/pedidos
```

## Base de datos

La base de datos se carga con scripts ubicados en `db/ingest` y se usa PostgreSQL en Docker.

## Flujo principal

- Registrar clientes y productos
- Crear órdenes con items
- Consultar listado y detalle
- Aplicar cupones a una orden
- Consultar top clientes por ventas

## Desarrollo

- Backend: `cd api && npm start`
- Frontend: `cd web && npm run dev -- --host 0.0.0.0`
- Build frontend: `cd web && npm run build`

## Estado

Proyecto preparado para pruebas técnicas con API REST + frontend interactivo.
