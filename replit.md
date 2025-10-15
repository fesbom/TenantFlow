# replit.md

## Overview

This is a multi-tenant dental clinic management system designed as an MVP for small dental practices. The application provides comprehensive practice management features including patient records, appointment scheduling, medical records, anamnesis questionnaires, and budget management. Each clinic operates as an isolated tenant with role-based access control for administrators, dentists, and secretaries.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript using Vite as the build tool
- **UI Library**: Shadcn/ui components built on Radix UI primitives with Tailwind CSS for styling
- **State Management**: TanStack Query (React Query) for server state management with custom hooks for authentication
- **Routing**: Wouter for lightweight client-side routing
- **Form Handling**: React Hook Form with Zod validation schemas

### Backend Architecture
- **Runtime**: Node.js with Express.js REST API
- **Language**: TypeScript with ES modules
- **Authentication**: JWT-based authentication with role-based access control middleware
- **File Upload**: Multer for handling image uploads with local storage
- **API Structure**: RESTful endpoints organized by resource (patients, appointments, medical records, etc.)

### Database Design
- **ORM**: Drizzle ORM with PostgreSQL dialect
- **Multi-tenancy**: Clinic-based isolation using `clinic_id` foreign keys across all tenant data tables
- **Schema**: Comprehensive relational design covering clinics, users, patients, appointments, medical records, anamnesis, and budgets
- **Migration**: Drizzle Kit for schema management and migrations

### Authentication & Authorization
- **Strategy**: JWT tokens stored in localStorage with automatic header injection
- **Roles**: Three-tier system (admin, dentist, secretary) with route-level permissions
- **Security**: Password hashing with bcryptjs and middleware-based route protection
- **Multi-tenant**: Clinic-scoped access control ensuring data isolation

### Component Architecture
- **Layout**: Responsive sidebar navigation with role-based menu filtering
- **Modals**: Reusable modal components for CRUD operations
- **Forms**: Standardized form patterns with validation and error handling
- **Tables**: Consistent data presentation with search, filtering, and actions

### Data Flow
- **Client-Server**: React Query handles caching, synchronization, and optimistic updates
- **Error Handling**: Centralized error boundaries with toast notifications
- **Loading States**: Consistent loading indicators across all data operations

## External Dependencies

### Core Framework Dependencies
- **@neondatabase/serverless**: Neon PostgreSQL serverless database connection
- **drizzle-orm**: Type-safe ORM with PostgreSQL support
- **@tanstack/react-query**: Server state management and caching
- **express**: Node.js web application framework
- **jsonwebtoken**: JWT token generation and verification
- **bcryptjs**: Password hashing and verification

### UI and Styling
- **@radix-ui/***: Comprehensive set of accessible UI primitives
- **tailwindcss**: Utility-first CSS framework
- **class-variance-authority**: Component variant management
- **lucide-react**: Icon library for consistent iconography

### Development Tools
- **vite**: Fast build tool and development server
- **typescript**: Type safety across the full stack
- **drizzle-kit**: Database schema management and migrations
- **tsx**: TypeScript execution for Node.js development

### File Upload and Storage
- **multer**: Multipart form data handling for file uploads
- **Local storage**: File system storage for images (MVP implementation)

### Development Environment
- **Replit integration**: Custom Vite plugins for Replit development environment
- **Hot reload**: Full-stack development with automatic reloading
- **Error overlay**: Development error modal for debugging

## Recent Changes

### Appointment Scheduling Enhancements (October 2025)

#### Default Appointment Duration per Dentist
- Added `defaultAppointmentDuration` field to users table (optional, in minutes)
- User form displays duration input when role is "dentist"
- Appointment modal auto-fills duration when dentist is selected (fallback to 60 minutes)
- Backend route: `PUT /api/users/:id` to update user preferences

#### Flexible Appointment Duration
- **Calendar Configuration**: 10-minute intervals (step=10, timeslots=6) for better granularity
- **Frontend Validation**:
  - Minimum: 5 minutes
  - Maximum: Calculated dynamically to midnight (allows appointments ending exactly at 00:00)
  - No fixed step restrictions - users can input any duration value
- **Backend Validation**:
  - POST/PUT `/api/appointments` validates duration bounds
  - Uses `setHours(24,0,0,0)` with `Math.ceil` for accurate midnight boundary calculation
  - Prevents appointments from extending beyond midnight with appropriate error messages
- **Bug Fix**: Corrected midnight boundary calculation to allow appointments ending at exactly 00:00 (previously blocked at 23:59)