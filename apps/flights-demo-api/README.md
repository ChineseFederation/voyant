# `flights-demo-api`

Standalone HTTP service that mocks a flight supplier/GDS provider so starters
and examples can exercise the full flight booking flow without external
credentials. This is a demo/reference supplier-integration surface, not an
airline or flight-operator deployment. It mirrors `FlightConnectorAdapter` 1:1
over REST so local project customizations can implement the adapter interface
against this service.

Owns its own Postgres database — orders persist here, not in the
starter's primary DB. Replace it with a real GDS connector through project
configuration, with no starter tables to drop.

## Run

```bash
cp .env.example .env        # default points at the docker-compose Postgres
docker compose up -d        # spins up Postgres on :5435
pnpm db:migrate             # creates demo_flight_orders
pnpm dev                    # listens on :3320 by default
```

From the repository root or the packaged operator starter root, the equivalent
commands are:

```bash
cp apps/flights-demo-api/.env.example apps/flights-demo-api/.env
docker compose -f apps/flights-demo-api/docker-compose.yml up -d
pnpm --dir apps/flights-demo-api install
pnpm --dir apps/flights-demo-api db:migrate
pnpm --dir apps/flights-demo-api dev
```

Then in your starter (e.g. `apps/operator/.env` in the repository, or
`.env` in a packaged starter):

```
FLIGHTS_DEMO_API_URL=http://localhost:3320
```

The service fails fast on startup if its Postgres isn't reachable, so a
missing or misconfigured `FLIGHTS_DEMO_DATABASE_URL` surfaces immediately
rather than at first request.

## Endpoints

| Method | Path                              | Adapter method   |
| ------ | --------------------------------- | ---------------- |
| POST   | `/search`                         | `searchFlights`  |
| POST   | `/price`                          | `priceOffer`     |
| POST   | `/book`                           | `bookFlight`     |
| GET    | `/orders?cursor&limit&q&status`   | `listOrders`     |
| GET    | `/orders/:orderId`                | `getOrder`       |
| POST   | `/orders/:orderId/cancel`         | `cancelOrder`    |
| POST   | `/ancillaries`                    | `getAncillaries` |
| POST   | `/seatmap`                        | `getSeatMap`     |
| POST   | `/seat-selection`                 | `selectSeats`    |
| GET    | `/health`                         | (liveness probe) |
