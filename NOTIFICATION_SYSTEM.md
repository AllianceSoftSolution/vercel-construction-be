# Comprehensive Notification System Implementation

## Overview
This document outlines the comprehensive notification system implemented for the construction management application, following the hierarchy-based notification pattern as requested.

## Notification Service Architecture

### Core Components
1. **NotificationService** (`src/utils/notificationService.ts`) - Main service class handling all notification logic
2. **Firebase Integration** (`src/utils/firebase.ts`) - Handles push notifications via Firebase
3. **Base Notification Utils** (`src/utils/notification.ts`) - Core notification sending functions

## Hierarchy-Based Notification Pattern

### User Roles and Hierarchy
- **ADMIN** - Top level, receives notifications for all major events
- **PROJECT_MANAGER** - Manages sections and receives section-level notifications
- **SITE_INCHARGE** - Manages site operations and receives section-level notifications
- **CONSTRUCTION_MANAGER** - Creates demands and receives demand-related notifications
- **STORE_INCHARGE** - Manages stores and receives store-related notifications
- **ACCOUNTANT** - Handles financial operations (only head accountants receive notifications)

## Notification Events and Recipients

### 1. Demand Creation
**Trigger**: When a Construction Manager creates a demand
**Recipients**:
- Project Manager of the section
- Site Incharge assigned to the section
- Admin users
**Message**: "Demand {referenceNumber} created for section {sectionName} in project {projectName} by {CMName}"

### 2. Demand Approval/Rejection
**Trigger**: When a demand is approved or rejected by PM/Site Incharge/Admin
**Recipients**:
- Construction Manager who created the demand
- Top-level users associated with the section (PM, Site Incharge)
**Message**: "Demand {referenceNumber} for section {sectionName} was {approved/rejected} by {approverName}"

### 3. Purchase Order Creation
**Trigger**: When a Purchase Order is created for a demand
**Recipients**:
- Construction Manager who created the original demand
- Top-level section users (PM, Site Incharge)
- Admin users
**Message**: "PO {referenceNumber} created for demand {demandReference} from vendor {vendorName}"

### 4. Store Transactions
**Trigger**: When stock in/out operations are performed
**Recipients**:
- Top-level users associated with the section (PM, Site Incharge)
- Admin users
**Message**: "{IN/OUT} transaction for {quantity} {materialName} in {storeName}"

### 5. User Assignments
**Trigger**: When users are assigned to sections/stores
**Recipients**:
- Top-level users associated with the section (PM, Site Incharge)
- Admin users
**Message**: "{userName} ({role}) assigned to section {sectionName} by {assignerName}"

### 6. Accountant Events
**Trigger**: Vendor creation, payment events, financial operations
**Recipients**:
- Head accountants only (isHead: true)
- Admin users
**Message**: Various accountant-related messages

### 7. Vendor Payments
**Trigger**: When payments are made to vendors
**Recipients**:
- Head accountants only (isHead: true)
- Admin users
**Message**: "Payment of {amount} made to vendor {vendorName}"

### 8. Material Cap Updates
**Trigger**: When material caps are updated for sections
**Recipients**:
- Top-level users associated with the section (PM, Site Incharge)
- Admin users
**Message**: "Material cap for {materialName} in section {sectionName} updated to {cap}"

## Implementation Details

### NotificationService Methods

#### Core Utility Methods
- `getTopLevelSectionUsers(sectionId)` - Gets only top-level users (PM, Site Incharge) for a section
- `getSectionNotificationUsers(sectionId)` - Gets all users associated with a section (for backward compatibility)
- `getAdminUsers()` - Gets all admin users
- `getHeadAccountantUsers()` - Gets only head accountants (isHead: true)
- `getAccountantUsers()` - Gets all accountant users (for backward compatibility)
- `sendNotificationsToUsers(userIds, title, body, data)` - Sends notifications to multiple users

#### Event-Specific Methods
- `notifyDemandCreated(demandId)` - Demand creation notifications
- `notifyDemandApproval(demandId, approverId, status)` - Demand approval/rejection notifications
- `notifyPOCreated(poId)` - Purchase order creation notifications
- `notifyStoreTransaction(transactionId)` - Store transaction notifications
- `notifyUserAssignment(assignmentData)` - User assignment notifications
- `notifyAccountantEvent(eventData)` - Accountant-related event notifications
- `notifyVendorPayment(paymentId)` - Vendor payment notifications
- `notifyMaterialCap(materialCapId)` - Material cap update notifications

### Controller Updates

#### Demand Controller (`src/controllers/demand.controller.ts`)
- Updated `createDemand` to use `NotificationService.notifyDemandCreated()`
- Updated `approveDemand` to use `NotificationService.notifyDemandApproval()`
- Updated `rejectDemand` to use `NotificationService.notifyDemandApproval()`

#### Purchase Order Controller (`src/controllers/purchaseOrder.controller.ts`)
- Updated `createPurchaseOrder` to use `NotificationService.notifyPOCreated()`

#### Store Controller (`src/controllers/store.controller.ts`)
- Updated store creation to use `NotificationService.notifyStoreTransaction()`
- Updated stock in operations to use `NotificationService.notifyStoreTransaction()`
- Updated stock out operations to use `NotificationService.notifyStoreTransaction()`

#### Assignment Controller (`src/controllers/assignment.controller.ts`)
- Updated store incharge assignments to use `NotificationService.notifyUserAssignment()`

#### Vendor Controller (`src/controllers/vendor.controller.ts`)
- Updated vendor creation to use `NotificationService.notifyAccountantEvent()`

#### Vendor Account Controller (`src/controllers/vendorAccount.controller.ts`)
- Updated vendor payments to use `NotificationService.notifyVendorPayment()`

#### Material Cap Controller (`src/controllers/materialCap.controller.ts`)
- Updated material cap updates to use `NotificationService.notifyMaterialCap()`

## Notification Data Structure

Each notification includes:
- **Title**: Brief description of the event
- **Body**: Detailed message with relevant information
- **Data**: Additional metadata for the frontend
  - Event type
  - Related entity IDs
  - Section/Project information
  - User information

## Key Features

### 1. Proper Hierarchy Compliance
- Notifications follow the organizational hierarchy strictly
- Only top-level users (PM, Site Incharge) receive section-level notifications
- Construction Managers receive notifications for their own demands
- Head accountants receive notifications for financial events
- Admin users receive notifications for all major events

### 2. Comprehensive Coverage
- All major business events are covered
- Notifications include relevant context and metadata
- Proper recipient filtering based on hierarchy

### 3. Error Handling
- Safe notification sending with error handling
- Non-blocking notifications (don't affect main operations)
- Graceful degradation if notification fails

### 4. Scalability
- Efficient database queries for user retrieval
- Batch notification sending
- Configurable notification patterns

## Usage Examples

### Creating a Demand
```typescript
// In demand controller
await NotificationService.notifyDemandCreated(demand.id);
```

### Approving a Demand
```typescript
// In demand controller
await NotificationService.notifyDemandApproval(demandId, approverId, "APPROVED");
```

### Store Transaction
```typescript
// In store controller
await NotificationService.notifyStoreTransaction(transaction.id);
```

## Future Enhancements

1. **Notification Preferences**: Allow users to configure notification preferences
2. **Email Notifications**: Add email notification support
3. **Notification History**: Store notification history in database
4. **Real-time Updates**: WebSocket integration for real-time notifications
5. **Notification Templates**: Configurable notification message templates

## Testing

The notification system can be tested by:
1. Creating demands and verifying notifications are sent to correct top-level recipients
2. Approving/rejecting demands and checking notification delivery
3. Performing store operations and verifying top-level notifications
4. Testing accountant events and vendor payments with head accountants only
5. Verifying user assignment notifications to top-level users only

## Maintenance

- Monitor notification delivery success rates
- Review and update notification patterns as business requirements change
- Ensure proper error handling and logging
- Regular testing of notification delivery mechanisms 