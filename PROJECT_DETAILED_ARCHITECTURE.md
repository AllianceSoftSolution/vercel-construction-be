# Construction Backend - Detailed Project Architecture

## 1) Overview

This project is a TypeScript + Express backend for a construction operations platform. It handles:

- User authentication and role-driven access control
- Project/section/store setup
- Material demand lifecycle (request -> approval -> fulfillment)
- Purchase order lifecycle and vendor financial accounting
- Inventory and store transactions
- Analytics dashboards per user role
- Push notifications (Firebase) and email notifications (Nodemailer + EJS templates)

It also serves a built frontend from fe-dist through the same Express process.

## 2) Runtime Entry And HTTP Pipeline

Main server bootstrap: src/index.ts

Flow:

1. dotenv loads environment variables.
2. Express app is initialized.
3. Middlewares are applied:
- express.json()
- cors() + preflight handling
- express.urlencoded()
- morgan("dev") logging
4. Swagger docs are mounted at /api-docs via src/swagger.ts.
5. Static frontend assets are served from fe-dist.
6. API router is mounted at /api.
7. Non-/api routes serve fe-dist/index.html (SPA fallback).
8. Unknown routes create AppError(404).
9. globalErrorHandler returns standardized JSON error responses.

## 3) Tech Stack

- Runtime: Node.js
- Language: TypeScript (CommonJS output)
- HTTP framework: Express
- ORM/database: Prisma + PostgreSQL
- Auth: JWT + bcryptjs
- File upload: Multer in-memory + AWS S3 upload
- Notifications: Firebase Admin multicast notifications
- Email: Nodemailer + EJS templates
- API docs: swagger-jsdoc + swagger-ui-express
- Logging: morgan

Package scripts from package.json:

- dev: ts-node-dev --respawn --transpile-only src/index.ts
- build: rimraf dist && tsc
- start: node dist/src/index.js
- ts.check: typecheck via tsc

## 4) Folder Architecture

src/

- index.ts: App startup and middleware chain
- swagger.ts: OpenAPI setup
- routes/: route modules by domain
- controllers/: business logic per domain
- middlewares/: auth and upload handling
- utils/: shared infrastructure and helpers
- constants/: transaction constants/timezone
- templates/: EJS email templates
- scripts/: operational/maintenance scripts

prisma/

- schema.prisma: full data model + enums
- migrations/: database evolution history

## 5) API Surface (Route Map)

Main router: src/routes/index.ts mounts:

- /api/auth
- /api/projects
- /api/sections
- /api/stores
- /api/materials
- /api/material-caps
- /api/vendors
- /api/demands
- /api/assignments
- /api/purchase-orders
- /api/vendor-account
- /api/analytics

All domain routes are protected with JWT middleware except login and password-reset initiation/verification/reset endpoints.

## 6) Authentication And Authorization

### 6.1 JWT auth middleware

File: src/middlewares/auth.middleware.ts

- Reads Authorization: Bearer <token>
- Verifies token using JWT_SECRET
- Resolves user from DB and attaches req.user
- Rejects invalid/expired/missing token with 401

### 6.2 Roles

UserRole enum in Prisma:

- ADMIN
- SITE_INCHARGE
- PROJECT_MANAGER
- CONSTRUCTION_MANAGER
- STORE_INCHARGE
- ACCOUNTANT

There is also isHead flag on User for special head behavior (notably head accountant and head store incharge).

### 6.3 Authorization style in project

Authorization is mostly implemented in controllers via role checks + assignment checks, not via a centralized RBAC layer. This means each module enforces access logic close to business code.

## 7) Core Data Model (Prisma)

Main entities and purpose:

- User: identity, role, head flag, activity tracking relations
- Project: top-level construction project
- Section: subdivision under project
- Assignment tables:
  - SiteInchargeAssignment
  - ProjectManagerAssignment
  - ConstructionManagerAssignment
  - StoreInchargeAssignment
  - AccountantAssignment
- Store: HEAD_STORE / CM_STORE / SECTION_STORE
- StorePermission: granular permissions per store/user
- Material: stock item definitions
- MaterialCap: allowed quantity cap per material+section
- Demand: material request lifecycle
- DemandApproval: approvals/rejections on demands
- DemandFulfillment: transfers from head to section-level store
- PurchaseOrder: single-demand PO records + financial details
- StoreInventory: stock/reserved/available per store+material
- StoreTransaction: IN/OUT/TRANSFER inventory events
- Vendor, VendorAccount, VendorAccountTransaction, VendorPayment: payable tracking
- OTP: password reset OTP store with attempt throttling
- DeviceToken: push notification tokens per user
- AuditLog, ReferenceCounter

Notable schema design choices:

- Soft-delete flags are used heavily (isDeleted/isActive) instead of hard delete in most flows.
- Some models are hard deleted in controllers/scripts (mixed deletion strategy).
- PurchaseOrder is direct (no PO item table); each PO is for one demand/material/vendor.
- AccountantAssignment supports project-level head assignment by nullable sectionId.

## 8) Domain Workflow Details

### 8.1 Auth + user management (auth.controller.ts)

Capabilities:

- Register user (admin-protected after first user)
- Login and JWT issuance (90d token)
- Password change
- Password reset via OTP + tokenized reset flow
- User CRUD + activate/deactivate
- Role change with assignment cleanup
- Device token save/remove

Important behavior:

- Head accountant creation requires projectIds.
- Existing user can be upgraded to head accountant with project assignments.
- Role change deactivates all prior assignments.
- If changing from CONSTRUCTION_MANAGER, CM store stock is transferred and CM stores are deactivated.

### 8.2 Projects (project.controller.ts)

Capabilities:

- Create/get/list/update/delete/activate/deactivate projects
- Auto or custom code generation
- Role-scoped project visibility
- Project analytics in detail view:
  - total amount spent
  - section-wise amount spent
  - aggregated material cap analytics vs demand/PO usage
  - associated members across assignment roles

### 8.3 Sections (section.controller.ts)

Capabilities:

- Create/get/list/update/delete/activate/deactivate sections
- Auto code generation from project
- Optional auto creation of SECTION_STORE when creating section
- Optional initial store permissions payload
- Detailed section view returns:
  - stores and assignees
  - recent demands
  - spend totals
  - material cap usage analytics

### 8.4 Assignments (assignment.controller.ts)

Capabilities:

- Assign/unassign Site Incharge by section list per project
- Assign Project Manager per section
- Assign Construction Manager and optional SECTION_STORE creation
- Assign Store Incharge per store
- Assign Accountant by section list per project
- Deactivate assignments (generic endpoint)
- Create and assign new project manager user
- Role-based user listing for assignment screens
- Section assignment status helpers for Site Incharge and Accountant

Notable logic:

- Construction manager deactivation can transfer stock from CM_STORE to HEAD_STORE.

### 8.5 Materials + caps

material.controller.ts:

- CRUD + activate/deactivate
- uniqueness checks for material name

materialCap.controller.ts:

- Upsert caps for section
- Update caps with soft-deletion of removed materials
- Project-level cap aggregation
- Validation that cap unit matches material base unit

### 8.6 Demands (demand.controller.ts)

Lifecycle:

1. CONSTRUCTION_MANAGER creates demand (REQUEST_SENT)
2. PROJECT_MANAGER/SITE_INCHARGE/ADMIN approve or reject
3. After approvals:
- 1 approval => PARTIALLY_APPROVED
- 2 approvals => APPROVED
- any rejection => REJECTED
4. Fulfillment from HEAD_STORE -> CM/SECTION store updates inventory and demand quantities
5. Demand transitions to FULFILLED_FROM_STORE or COMPLETED

Other behavior:

- Demand listing is heavily role-filtered by assignments/head rules.
- Demand detail includes computed stock snapshot of relevant head + section-level store material availability.

### 8.7 Stores and inventory (store.controller.ts)

Capabilities:

- Create/get/list/update/delete/activate/deactivate stores
- Store types: HEAD_STORE, SECTION_STORE, CM_STORE
- Enforces one HEAD_STORE per project
- stockIn and stockOut operations with transaction logging
- Project inventory rollup with material-level usage analytics
- Personnel assignment helpers
- Store permissions CRUD
- Cleanup utility to hard-delete empty auto-created section stores

Inventory model behavior:

- StoreInventory tracks stock/reserved/available.
- StoreTransaction is append-only event trail for IN/OUT with references.
- stockIn from PO can complete PO status.
- stockOut for demand updates demand fulfilled/remaining quantities.

### 8.8 Purchase Orders (purchaseOrder.controller.ts)

Capabilities:

- Create/list/get/update/delete PO
- Query by vendor and summary endpoints
- Demand PO coverage statistics
- Status transition endpoint with transition rules
- Add amount with bill upload (S3), auto status CONFIRMED
- Update amount within 24-hour window

Business rules:

- PO creation allowed for SITE_INCHARGE/ADMIN only.
- Demand must be in approved/in-progress states for PO creation.
- Quantity above demand requires notes.
- Demand status is recomputed from aggregate PO quantity:
  - 0 => APPROVED
  - < demand => PARTIALLY_PO_CREATED
  - >= demand => PO_CREATED

PO status state machine:

- CREATED -> CONFIRMED | ORDER_PLACED | CANCELLED
- CONFIRMED -> ORDER_PLACED | CANCELLED
- ORDER_PLACED -> IN_TRANSIT | CANCELLED
- IN_TRANSIT -> IN_STORE | CANCELLED
- IN_STORE -> COMPLETED
- COMPLETED/CANCELLED are terminal

### 8.9 Vendor account + payments (vendorAccount.controller.ts)

Capabilities:

- Vendor account statement (optionally project-scoped)
- Add vendor payment (DEBIT transaction + vendor payment record)
- Payment and transaction listings
- Account summary per vendor
- Full account overview with role/project/section scoping
- Payables summary cards
- Payables summary by project

Financial model:

- PO amount addition creates CREDIT transaction in vendor account.
- Vendor payment creates DEBIT transaction.
- balance = totalCredited - totalDebited.
- Positive balance indicates payable (owed to vendor).

### 8.10 Analytics dashboards (analytics.controller.ts)

Provides per-role dashboard payloads:

- Admin dashboard
- Site incharge dashboard
- Project manager dashboard
- Construction manager dashboard
- Store incharge dashboard
- Accountant dashboard

Common pattern:

- Compute accessible section/project IDs from assignments and isHead.
- Aggregate summary cards + chart datasets (demand status, vendor distribution, spend, etc).

Also exposes payments grouped by project and section for charting.

## 9) Notification Architecture

Files:

- src/utils/firebase.ts
- src/utils/notification.ts
- src/utils/notificationService.ts

Flow:

1. Device tokens are stored per user.
2. Events call NotificationService methods.
3. Notification service resolves recipient users by role and assignment hierarchy.
4. sendNotificationToUserSafe sends multicast push notifications through Firebase Admin.

Event types include:

- demand created/approved/rejected
- PO created
- store transaction
- user assignment
- accountant events
- vendor payment
- material cap updates

## 10) Email Architecture

File: src/utils/email.ts

- Uses Nodemailer (Gmail credentials from env)
- Renders templates from src/templates/*.ejs

Used in auth flows:

- welcome email on user creation
- OTP for password reset
- password reset success confirmation

## 11) File Upload Architecture

Files:

- src/middlewares/s3UploadMiddleware.ts
- src/utils/s3Upload.ts

Flow:

1. Multer stores incoming files in memory.
2. Middleware uploads each field file to S3.
3. Uploaded URLs are attached as req.filesFromS3.
4. Controllers persist URLs (proofOfBill/proofOfPayment).

## 12) Query + Pagination Pattern

Utility: src/utils/buildQueryOptions.ts

Reusable pattern across list endpoints:

- extract query params (search, filters, sort, page, limit)
- build Prisma where/orderBy/skip/take
- return pagination metadata via buildPaginationMeta

## 13) Code/Reference Generation

Utility: src/utils/generateCode.ts

Generates unique codes for:

- Project: PR###
- Section: SEC-<ProjectCode>-###
- Demand: DEM-<ProjectCode>-###
- PO: PO-<project>-<section>-<demand>/<###>
- Employee IDs: EMP-<role-prefix>-n

## 14) Operational Scripts

Examples in src/scripts:

- createSystemAdmin.ts: bootstrap admin account
- resetDbAndCreateAdmin.ts: truncate/reset data + recreate admin
- seedDummyData.ts: sample data setup
- backfillPaymentProjectIds.ts: migration helper for old payment data
- sendNotificationToUser.ts: manual push test

## 15) Security And Data Integrity Observations

Strengths:

- JWT auth on almost all routes
- role + assignment based access checks in core controllers
- transactional updates for critical flows (inventory/finance)
- password strength checks in reset/change flows

Current risks / technical debt:

- Authorization logic is distributed; policy drift can occur across controllers.
- Mixed soft-delete/hard-delete strategy may create reporting inconsistency.
- Some filtering/aggregation paths are complex and may need regression tests.
- README is currently placeholder and does not describe setup.

## 16) End-To-End Business Flow (Typical)

1. Admin creates project, sections, stores, materials, vendors, users.
2. Admin assigns SI/PM/CM/Store Incharge/Accountant to sections/stores/projects.
3. CM creates demand.
4. PM/SI approve demand.
5. SI/Admin creates PO(s) for approved demand.
6. Accountant/Admin adds PO amount with bill proof, vendor account gets credited.
7. Stock-in receives material into store and updates inventory/PO status.
8. Payments to vendor are recorded (debit), reducing vendor balance.
9. Dashboards show role-scoped analytics over these entities.

## 17) Environment Variables (Required By Code)

From code usage, these are expected:

- PORT
- DATABASE_URL
- JWT_SECRET
- NODE_ENV
- GMAIL_USER
- GMAIL_PASS
- AWS_REGION
- AWS_ACCESS_KEY_ID
- AWS_SECRET_ACCESS_KEY
- AWS_BUCKET_NAME

Firebase service account JSON is expected at:

- src/config/radc-a6ce0-firebase-adminsdk-fbsvc-c5f458f8f6.json

## 18) Recommended Next Improvements

1. Add a real README with setup, env template, and migration steps.
2. Introduce centralized authorization policy helpers to reduce duplicated role logic.
3. Add automated tests for demand/PO/finance state transitions.
4. Standardize deletion policy across modules (soft vs hard) and document it.
5. Add API contract docs per route (request/response examples).
