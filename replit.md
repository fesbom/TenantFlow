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