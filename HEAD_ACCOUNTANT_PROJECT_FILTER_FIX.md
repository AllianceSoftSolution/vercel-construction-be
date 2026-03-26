# Head Accountant Project Filter Fix

## Issue Summary
Previously, Head Accountants could see Purchase Orders (POs) and Demands from ALL projects regardless of which projects they were assigned to. This has been corrected.

## Changes Made

### 1. Purchase Order Controller (`purchaseOrder.controller.ts`)
Fixed the following endpoints to filter by assigned projects for accountants:

#### `getPurchaseOrders`
- **Before**: Head Accountants (isHead=true) could see ALL POs
- **After**: Both Head and Regular Accountants see only POs from their assigned projects

#### `getPurchaseOrdersByVendor`
- **Before**: No role-based filtering
- **After**: Accountants can only see POs from vendors in their assigned projects

#### `getPurchaseOrderSummary`
- **Before**: No role-based filtering
- **After**: Accountants can only see summary data from their assigned projects

### 2. Demand Controller (`demand.controller.ts`)
Fixed the following endpoint:

#### `getDemands`
- **Before**: Head Accountants could see ALL demands
- **After**: Both Head and Regular Accountants see only demands from sections in their assigned projects

### 3. Analytics Controller (`analytics.controller.ts`)
Fixed helper functions used throughout analytics:

#### `getUserAccessibleSections`
- **Before**: Head Accountants could access ALL sections
- **After**: Both Head and Regular Accountants can only access sections in their assigned projects

#### `getUserAccessibleProjects`
- **Before**: Head Accountants could access ALL projects
- **After**: Both Head and Regular Accountants can only access their assigned projects

## How It Works Now

### Scenario 1: Head Accountant for Project-A
- **Assignments**: Assigned to Project-A only
- **Can See**: 
  - POs generated for Project-A
  - Demands from Project-A sections
  - Analytics for Project-A only
- **Cannot See**: POs, Demands, or Analytics from Project-B, Project-C, etc.

### Scenario 2: Head Accountant for Project-B
- **Assignments**: Assigned to Project-B only
- **Can See**: 
  - POs generated for Project-B
  - Demands from Project-B sections
  - Analytics for Project-B only
- **Cannot See**: POs, Demands, or Analytics from Project-A, Project-C, etc.

### Scenario 3: Super Head Accountant (All Projects)
- **Assignments**: Assigned to ALL projects (A, B, C, D, etc.)
- **Can See**: 
  - ALL POs from all projects
  - ALL Demands from all projects
  - ALL Analytics from all projects
- **Reason**: Has explicit assignments to all projects

### Scenario 4: Admin User
- **Assignments**: Not required
- **Can See**: Everything (no filtering applied)

## Testing Instructions

### Test 1: Project-Specific Head Accountant
1. Create a Head Accountant user (isHead=true)
2. Assign them to ONLY Project-A (create AccountantAssignment records for Project-A sections)
3. Login as this Head Accountant
4. Navigate to:
   - **Purchase Orders page** → Should see only Project-A POs
   - **Demands page** → Should see only Project-A demands
   - **Analytics/Dashboard** → Should see only Project-A data
   - **Vendor Accounts** (with Project-A filter) → Should see only Project-A vendor data
5. Try to access Project-B data → Should NOT be visible

### Test 2: Super Head Accountant (All Projects)
1. Create a Head Accountant user (isHead=true)
2. Assign them to ALL existing projects (create AccountantAssignment records for all project sections)
3. Login as this Head Accountant
4. Navigate to all pages → Should see data from ALL projects (A, B, C, etc.)

### Test 3: Regular Accountant
1. Create a Regular Accountant user (isHead=false)
2. Assign them to specific project sections
3. Login and verify they can only see data from their assigned sections/projects

### Test 4: Verify No Unauthorized Access
1. As Project-A Head Accountant, try to directly access:
   - PO details from Project-B
   - Demand details from Project-B
   - Vendor data filtered by Project-B
2. All should return filtered/empty results (not showing Project-B data)

## API Endpoints Affected

All the following endpoints now respect project assignments for accountants:

- `GET /api/purchase-orders` - List all POs (with pagination)
- `GET /api/purchase-orders/vendor` - POs by vendor
- `GET /api/purchase-orders/summary` - PO summary statistics
- `GET /api/demands` - List all demands (with pagination)
- `GET /api/analytics/*` - All analytics endpoints
- `GET /api/analytics/payments-by-project-section` - Payment analytics

## Database Changes Required
**None** - This fix uses existing `AccountantAssignment` table schema.

The assignment table structure:
```
AccountantAssignment {
  userId    - The accountant's user ID
  projectId - The project they're assigned to
  sectionId - The section they're assigned to
  isActive  - Whether the assignment is active
}
```

## Important Notes

1. **isHead flag**: The `isHead` field on the User model still exists and can be used to identify Head Accountants, but it NO LONGER grants access to all data by default.

2. **Assignment Required**: For an accountant (head or regular) to see any data, they MUST have `AccountantAssignment` records.

3. **No Assignments = No Data**: If an accountant has no active assignments, they will see empty results (not an error, just filtered out).

4. **Admin Override**: Admin users (role='ADMIN') can still see all data regardless of assignments.

## Migration/Rollout Steps

1. **Verify existing assignments**: Ensure all Head Accountants have proper `AccountantAssignment` records
2. **Create missing assignments**: If a Head Accountant should see all projects, create assignments for all projects
3. **Deploy backend changes**: Deploy the updated controller files
4. **Test thoroughly**: Follow the testing instructions above
5. **Monitor**: Check for any unexpected filtering issues in the first few days

## Files Modified

1. `construction-be/src/controllers/purchaseOrder.controller.ts`
2. `construction-be/src/controllers/demand.controller.ts`
3. `construction-be/src/controllers/analytics.controller.ts`

---

**Note**: No frontend changes are required. The filtering happens on the backend, so the frontend will automatically display only the filtered data.
