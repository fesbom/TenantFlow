# Design Guidelines: Multi-Tenant Dental Clinic Management System

## Design Approach
**System Selected:** Material Design adapted for healthcare productivity
**Justification:** Data-heavy healthcare application requiring proven patterns for tables, forms, and real-time updates. Material's elevation system and component library perfectly suits multi-tenant dashboard requirements.

**Key Principles:**
- Information hierarchy through elevation and spacing
- Consistent interaction patterns across tables, forms, and chat
- Professional medical-grade reliability in visual language
- Efficient data density without overwhelming users

## Typography

**Font Stack:** Inter (primary), Roboto Mono (data/numbers)
- **Headings:** Inter, weights 600-700
  - H1: 2.5rem (page titles, clinic name)
  - H2: 2rem (section headers, patient names)
  - H3: 1.5rem (card titles, table headers)
  - H4: 1.25rem (form sections)
- **Body:** Inter, weight 400-500
  - Base: 1rem (forms, descriptions)
  - Small: 0.875rem (table data, metadata)
  - Tiny: 0.75rem (labels, timestamps)
- **Data/Numbers:** Roboto Mono, weight 500 (appointment times, patient IDs)

## Layout System

**Spacing Primitives:** Tailwind units 2, 4, 6, 8, 12
- Component padding: p-4, p-6
- Section gaps: gap-4, gap-6
- Page margins: m-6, m-8
- Card spacing: space-y-4

**Grid Structure:**
- Sidebar: 280px fixed (collapsed: 64px icon-only)
- Main content: flex-1 with max-width constraints
- Chat panel: 360px fixed (toggleable)
- Responsive: Stack to single column below md breakpoint

## Component Library

### Navigation
**Sidebar (Persistent Left):**
- Fixed 280px width with clinic logo at top
- Icon + label menu items grouped by function (Patients, Appointments, Billing, Reports, Settings)
- Active state with teal accent border-left indicator
- User profile/tenant switcher at bottom
- Collapse to icon-only (64px) on mobile

**Top Bar:**
- Global search (center-aligned, expandable)
- Notification bell with badge count
- Quick actions dropdown
- User avatar with clinic/role context

### Data Tables
**Structure:**
- Sticky header rows with sort indicators
- Zebra striping (subtle elevation difference)
- Row hover state with slight elevation lift
- Action buttons (right-aligned) revealed on row hover
- Pagination with page size selector at bottom
- Column filters in header (icon toggles filter panel)
- Minimum 8-10 visible rows before scrolling

**Variants:**
- Patient list: Photo thumbnail, name, contact, last visit, status badge
- Appointments: Time, patient, dentist, procedure type, status
- Billing: Invoice ID, patient, amount, payment status, actions

### Forms
**Layout Pattern:**
- Two-column grid on desktop (grid-cols-2 gap-6)
- Single column on mobile
- Section dividers with H4 labels
- Required field asterisks in labels

**Input Components:**
- Text/email/tel inputs: Full-width, border with focus ring
- Dropdowns: Custom styled with chevron, searchable for long lists
- Date/time pickers: Calendar popup with time slots
- Multi-select: Pill-style tags with remove icons
- Radio/checkbox groups: Vertical stack with clear labels
- File upload: Drag-drop zone with file preview thumbnails

**Validation:**
- Inline error messages below fields
- Success checkmarks for validated fields
- Disabled submit until required fields complete

### Real-Time Chat Interface (WhatsApp)
**Layout:**
- Fixed right panel (360px) or modal overlay on mobile
- Patient context header (name, photo, phone)
- Message thread (scrollable center area)
- Input box at bottom with send button

**Message Components:**
- Outgoing (clinic): Right-aligned, teal background, white text
- Incoming (patient): Left-aligned, light gray background
- Timestamps: Small, muted, below messages every 5 minutes
- Status indicators: Sent (checkmark), Read (double checkmark)
- Quick replies: Pill buttons above input for common responses
- Media attachments: Inline image/PDF previews with download icons

**Features:**
- Active typing indicator (three dots animation)
- Unread message counter badge on chat toggle
- Search messages within conversation
- Template message selector for common responses

### Cards & Panels
**Dashboard Cards:**
- Elevated containers with rounded corners
- Header with icon + title + action menu
- Content area with appropriate padding
- Footer with metadata or action links

**Stat Cards:**
- Large number display (2.5rem)
- Label below with trend indicator (up/down arrow + percentage)
- Small sparkline graph for historical context

### Overlays
**Modals:**
- Max-width 640px for forms, 800px for complex data
- Backdrop blur with 40% opacity overlay
- Close X in top-right, optional header actions
- Sticky footer for action buttons

**Dialogs:**
- Confirmation prompts: 400px max-width
- Warning/error states with icon indicators
- Clear primary/secondary action buttons

## Images

**No Hero Image Required** - This is a dashboard application.

**Image Usage:**
1. **Patient Profile Photos:** 40px circular avatars in lists, 120px in detail views
2. **Dental Chart Diagrams:** Tooth numbering overlays in treatment planning sections
3. **X-Ray/Scan Thumbnails:** 200x150px previews in patient records with lightbox expansion
4. **Empty States:** Simple line illustrations for "No appointments today" or "No messages" screens
5. **Clinic Logo:** SVG format, 180x50px in sidebar header

All medical imagery should maintain professional, clinical aesthetic without being graphic.

## Animations
**Minimal, purposeful only:**
- Sidebar expand/collapse: 200ms ease
- Table row hover elevation: 150ms ease
- Chat message appearance: Fade-in 100ms
- Loading spinners for async operations