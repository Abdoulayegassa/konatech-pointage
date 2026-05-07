# Konatech Attendance - Initial Scaffold Scope

## Product Modules

- employee directory and activation status
- schedules and expected working windows
- employee check-in and check-out
- attendance history and monthly export entry point
- lateness and absence tracking
- admin dashboard overview

## Technical Architecture

- `apps/frontend`: Next.js App Router, Tailwind CSS, reusable UI primitives
- `apps/backend`: NestJS modular API, Prisma, PostgreSQL
- local PostgreSQL via Docker Compose
- environment split by application for predictable local setup

## First Delivery Goal

- clean monorepo scaffold
- backend modules ready for feature growth
- frontend dashboard consuming backend HTTP endpoints
- verified local API-to-UI connectivity

## Next Functional Iterations

- authentication and role-based access
- real dashboard metrics from attendance records
- CSV/XLS monthly export
- employee self-service screens

## Smart Security Layer (New)

The system includes an optional smart security layer to enhance attendance validation without degrading user experience.

### Features

- GPS-based geolocation detection during check-in
- Distance calculation from company location (geofencing)
- Conditional verification logic:
  - inside allowed radius → normal check-in
  - outside allowed radius → photo required
  - GPS unavailable → photo fallback
- Storage of GPS metadata (latitude, longitude, distance)
- Storage of verification method (NONE, GPS, PHOTO)

### Goals

- improve security without adding friction
- maintain fast QR-based workflow
- support mobile-first usage

### Constraints

- does not replace existing attendance flow
- remains optional via environment configuration

## Product Positioning

Konatech Attendance is a smart, QR-based attendance system with adaptive security, designed to be faster and more user-friendly than traditional GPS + photo + PIN solutions.
