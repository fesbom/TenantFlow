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
- **@google-cloud/storage**: Google Cloud Storage client for production file storage
- **Multi-tenant folder structure**: Files organized by clinic for data isolation
  - Development: Local filesystem storage in `/uploads/[clinicId]/[context]/...` structure
  - Production: Google Cloud Storage with signed URLs for secure access
- **Folder organization patterns**:
  - Clinic logos: `[clinicId]/profile/[timestamp]-[filename]`
  - Patient photos: `[clinicId]/patients/[patientId]/[timestamp]-[filename]`
  - Medical records: `[clinicId]/medical-records/[patientId]/[recordId]/[timestamp]-[filename]`

### Development Environment
- **Replit integration**: Custom Vite plugins for Replit development environment
- **Hot reload**: Full-stack development with automatic reloading
- **Error overlay**: Development error modal for debugging

## Recent Changes

### Multi-Tenant File Storage Refactoring (November 2025)

#### Objective
Refactored file storage infrastructure to support true multi-tenancy with isolated folder structures per clinic, ensuring data isolation and better organization.

#### Architecture Changes
- **ObjectStorageService Refactoring**:
  - Renamed `getPrivateObjectDir()` to `getBucketName()` - now returns only bucket name
  - Changed `uploadFile()` signature from `(buffer, filename, mimeType)` to `(buffer, fullObjectPath, mimeType)`
  - Callers now construct complete paths with clinic isolation
  - Simplified `deleteFile()` to use `getBucketName()` directly and extract paths from signed URLs
  
- **Folder Structure**:
  - **Clinic logos**: `[clinicId]/profile/[timestamp]-[filename]`
  - **Patient photos**: `[clinicId]/patients/[patientId]/[timestamp]-[filename]`
  - **Medical records**: `[clinicId]/medical-records/[patientId]/[recordId]/[timestamp]-[filename]`

#### Updated Endpoints
- **POST /api/patients/:id/photo**: Now constructs path with clinicId and patientId
- **POST /api/clinic/upload-logo**: Now constructs path with clinicId in profile folder
- **POST /api/medical-records**: Now constructs paths with clinicId, patientId, and recordId

#### Environment Configuration
- `PRIVATE_OBJECT_DIR` secret now contains **only the bucket name** (e.g., `dentalcare-fotos`)
- Previously contained bucket + folder path (e.g., `dentalcare-fotos/uploads_foto`)
- `GOOGLE_CREDENTIALS` secret contains the Google Cloud Service Account JSON

#### Development Environment
- Local filesystem mirrors production structure: `/uploads/[clinicId]/[context]/...`
- Ensures consistent behavior between development and production
- Automatic directory creation with recursive `mkdirSync`

### Patient Photo Management (October 2025)

#### Photo Upload Infrastructure
- **Database**: Added `photoUrl` column to patients table (TEXT, optional) - stores HTTPS signed URLs in production, `/uploads/` paths in development
- **Backend Endpoint**: `POST /api/patients/:id/photo` for photo uploads
  - Validates file type (JPG, PNG, WEBP)
  - Validates file size (max 5MB)
  - Uses multer for file handling
  - Environment-aware storage:
    - **Development** (`NODE_ENV !== 'production'`): Stores files in local `/uploads` directory with timestamp-filename pattern
    - **Production** (`NODE_ENV === 'production'`): Uploads to Replit Object Storage and saves signed HTTPS URL (100-year expiration) directly in database
    - No fallback to local storage in production - upload fails if Object Storage fails
  - Replaces old photo when uploading new one (deletes physical file from storage)
- **Photo Deletion**: `PUT /api/patients/:id` with `photoUrl: null` removes physical file from storage
  - Development: Deletes file from local filesystem
  - Production: Deletes file from Object Storage bucket using pathname extraction from signed URL
- **Object Storage Service** (`server/objectStorage.ts`):
  - Wrapper for `@google-cloud/storage` client
  - Uses Google Cloud Service Account credentials from `GOOGLE_CREDENTIALS` secret
  - Requires `PRIVATE_OBJECT_DIR` environment variable containing only the bucket name (e.g., `dentalcare-fotos`)
  - **getBucketName()**: Returns bucket name from environment variable
  - **uploadFile(buffer, fullObjectPath, mimeType)**: Accepts full object path as parameter, returns signed HTTPS URL (7-day expiration)
  - **deleteFile(url)**: Extracts object path from HTTPS signed URLs and deletes from bucket
  - **Multi-tenant structure**: Callers are responsible for constructing paths with clinic isolation
- **Dependencies**: Installed `react-cropper`, `cropperjs`, and `@google-cloud/storage`

#### PhotoUpload Component
- **Upload Methods**:
  - File upload from device
  - Webcam capture with live preview
- **Image Editing**:
  - Cropping with 4:3 aspect ratio
  - Canvas-based processing at 800x600 resolution
  - JPEG output with 0.9 quality
- **Features**:
  - Photo removal functionality
  - Client-side validation (type, size)
  - Error handling with user feedback via toasts
  - Async blob conversion for proper error catching
- **Integration**: Embedded in patient modal form

#### Photo Display Locations
- **Patient List**: 40x40px circular thumbnail next to patient name with User icon fallback
- **Calendar Events**: 20x20px miniature in event component alongside patient name
- **Dashboard Birthdays**: 40x40px photo with pink border and cake badge overlay in corner
- **Medical Records Modal**: 64x64px photo in patient info header section
- All displays include appropriate test IDs and graceful fallbacks when no photo exists

#### Batch Photo Upload (October 2025)
- **Backend Endpoint**: `GET /api/patients/by-external-id/:externalId` for patient lookup
  - Returns patient object matching the provided external_id
  - Clinic-scoped query ensures multi-tenant isolation
  - Protected by authentication middleware
  - Strips leading zeros from external_id (e.g., "0000007683" → "7683") for reliable matching
- **Batch Upload Page**: `/batch-upload` accessible to admin and secretary roles
  - File Selection: Multi-file input accepting JPG, PNG, WEBP formats
  - Filename Convention: Uses `{external_id}.jpg` pattern to match patients
  - Validation: Client-side checks for file type and 5MB size limit
  - Sequential Processing: Each file is processed one at a time with status tracking
  - Real-time Feedback: Individual file status updates (pending → searching → uploading → success/error)
  - Accurate Summary: Uses local counters to track success/error counts (not stale state)
  - Error Handling: Clear error messages for patient not found, upload failures, and validation errors
- **Integration**: Menu item "Upload Fotos" in sidebar with Images icon
- **Reuse**: Leverages existing `POST /api/patients/:id/photo` endpoint for actual photo uploads
  - Automatically uses environment-appropriate storage (local filesystem with timestamp-filename in development, Object Storage with signed HTTPS URLs in production)
  - Inherits all validation and error handling from individual photo upload endpoint
  - Database receives and stores the signed HTTPS URL directly from uploadFile() method

### Dashboard Birthday Timezone Fix (October 2025)

#### Bug Description
The dashboard birthday list was displaying patients whose birthdays are tomorrow instead of today, due to timezone differences between the server (UTC) and Brazilian clinics (America/Sao_Paulo timezone).

#### Solution Implementation
- **Database-Level Timezone Handling**: All date comparison logic moved to PostgreSQL using `NOW() AT TIME ZONE 'America/Sao_Paulo'`
- **server/storage.ts Changes**:
  - Added `PaginatedResponse<T>` interface for typed paginated responses
  - Updated `getBirthdayPatients` signature to accept pagination parameters instead of date
  - SQL query uses `EXTRACT(MONTH/DAY FROM birthDate)` compared against localized timestamp
  - Returns paginated results with metadata (page, pageSize, totalCount, totalPages)
- **server/routes.ts Changes**:
  - Route `GET /api/dashboard/birthday-patients` extracts pagination from query parameters
  - Removed JavaScript-based date logic
  - Delegates all timezone handling to database layer
- **Result**: Birthday matching now correctly uses São Paulo local time, ensuring patients are shown on their actual birthday regardless of server timezone

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