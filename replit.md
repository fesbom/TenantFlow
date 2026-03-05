# replit.md

## Overview

This project is a multi-tenant dental clinic management system, designed as an MVP for small dental practices. It offers comprehensive features for practice management, including patient records, appointment scheduling, medical records, anamnesis questionnaires, budget management, WhatsApp AI customer service, and dentist availability/schedule management. Each clinic operates as an isolated tenant, with robust role-based access control for administrators, dentists, and secretaries to ensure data security and proper access levels.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript and Vite.
- **UI**: Shadcn/ui (built on Radix UI) with Tailwind CSS.
- **State Management**: TanStack Query for server state, custom hooks for authentication.
- **Routing**: Wouter for client-side routing.
- **Forms**: React Hook Form with Zod validation.

### Backend
- **Runtime**: Node.js with Express.js REST API.
- **Language**: TypeScript with ES modules.
- **Authentication**: JWT-based with role-based access control.
- **File Upload**: Multer for image uploads (local storage in dev, cloud storage in prod).
- **API Structure**: RESTful endpoints organized by resource.

### Database
- **ORM**: Drizzle ORM with PostgreSQL dialect.
- **Multi-tenancy**: Clinic-based isolation using `clinic_id` foreign keys.
- **Schema**: Relational design for clinics, users, patients, appointments, medical records, anamnesis, and budgets.
- **Migration**: Drizzle Kit for schema management.

### Authentication & Authorization
- **Strategy**: JWT tokens in localStorage with automatic header injection.
- **Roles**: Three-tier system (admin, dentist, secretary) with route-level permissions.
- **Security**: Password hashing with bcryptjs, middleware-based route protection.
- **Multi-tenant**: Clinic-scoped access control ensuring data isolation.

### Component Architecture
- **Layout**: Responsive sidebar navigation with role-based menu filtering.
- **Modals**: Reusable components for CRUD operations.
- **Forms**: Standardized patterns with validation and error handling.
- **Tables**: Consistent data presentation with search, filtering, and actions.

### Data Flow
- **Client-Server**: React Query handles caching, synchronization, and optimistic updates.
- **Error Handling**: Centralized error boundaries with toast notifications.
- **Loading States**: Consistent indicators across data operations.

### File Storage
- Multi-tenant file storage (e.g., patient photos, clinic logos) organized by `clinicId` in a structured folder hierarchy.
- Development uses local filesystem, production uses Google Cloud Storage with signed URLs.
- Security measures include ID validation and filename sanitization to prevent path traversal.

### WhatsApp Integration
- Uses Evolution API (Railway) for multi-tenant WhatsApp messaging with Gemini AI.
- Per-clinic configuration: `evolutionInstanceName`, `evolutionApiKey`, `evolutionConnectedPhone` stored in the `clinics` table.
- Global fallback env vars: `EVO_URL`, `EVO_KEY`, `EVO_INSTANCE` used when a clinic has no per-clinic config.
- Webhook (`/webhook/evolution`) resolves the clinic by `data.instance` field; falls back to `WHATSAPP_CLINIC_ID` env var.
- `evolutionService.ts` provides `buildClinicConfig()`, `sendEvolutionMessageForClinic()`, `getEvolutionInstanceStatus()`, `generateQRCodeForClinic()` for per-clinic operation.
- Admin can configure instance name/API key and scan QR code from the Settings → WhatsApp section.
- Support page shows a WhatsApp connection status pill (connected/disconnected).
- Storage: `getClinicByEvolutionInstance(instanceName)` resolves clinic from webhook payload instance name.

## External Dependencies

### Core Framework
- **@neondatabase/serverless**: Neon PostgreSQL serverless database connection.
- **drizzle-orm**: Type-safe ORM for PostgreSQL.
- **@tanstack/react-query**: Server state management.
- **express**: Node.js web application framework.
- **jsonwebtoken**: JWT token handling.
- **bcryptjs**: Password hashing.

### UI and Styling
- **@radix-ui/***: Accessible UI primitives.
- **tailwindcss**: Utility-first CSS framework.
- **class-variance-authority**: Component variant management.
- **lucide-react**: Icon library.

### Development Tools
- **vite**: Build tool and development server.
- **typescript**: Type safety.
- **drizzle-kit**: Database schema management.
- **tsx**: TypeScript execution for Node.js.

### File Upload and Storage
- **multer**: Multipart form data handling.
- **@google-cloud/storage**: Google Cloud Storage client for production.

### WhatsApp API
- **axios**: HTTP client for Z-API integration.