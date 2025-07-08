# Demand Management API - JSON Body Examples

## 1. Create Demand
**Endpoint:** `POST /api/demands`
**Role Required:** CONSTRUCTION_MANAGER

```json
{
  "activity": "Foundation Work - Phase 1",
  "materialId": "clx1234567890abcdef",
  "quantity": 50,
  "unit": "bags",
  "sectionId": "clx0987654321fedcba",
  "notes": "Required for foundation concrete work",
  "remarks": "Urgent requirement for ongoing foundation work"
}
```

**Alternative Example:**
```json
{
  "activity": "Steel Reinforcement for Columns",
  "materialId": "clxabcdef1234567890",
  "quantity": 2000,
  "unit": "kg",
  "sectionId": "clx0987654321fedcba",
  "notes": "Steel bars for column reinforcement",
  "remarks": "Standard grade steel required"
}
```

---

## 2. Update Demand
**Endpoint:** `PUT /api/demands/:id`

```json
{
  "activity": "Foundation Work - Phase 1 (Updated)",
  "quantity": 75,
  "notes": "Updated requirement - increased quantity needed",
  "remarks": "Additional quantity required due to scope change"
}
```

**Alternative Example:**
```json
{
  "activity": "Steel Reinforcement for Columns - Revised",
  "quantity": 2500,
  "unit": "kg",
  "notes": "Increased quantity due to design changes",
  "remarks": "Additional steel required for extra columns"
}
```

---

## 3. Update Demand Status
**Endpoint:** `PATCH /api/demands/:id/status`

```json
{
  "status": "APPROVED"
}
```

**Other Status Values:**
```json
{
  "status": "PARTIALLY_APPROVED"
}
```

```json
{
  "status": "REJECTED"
}
```

```json
{
  "status": "FULFILLED_FROM_STORE"
}
```

```json
{
  "status": "COMPLETED"
}
```

---

## 4. Approve Demand
**Endpoint:** `POST /api/demands/:id/approve`
**Role Required:** PROJECT_MANAGER, SITE_INCHARGE, or ADMIN

```json
{
  "remarks": "Approved - Material requirement is justified for the foundation work. Budget allocation confirmed."
}
```

**Alternative Examples:**

**Project Manager Approval:**
```json
{
  "remarks": "Approved by PM - Budget allocated and timeline confirmed. Material quality specifications verified."
}
```

**Site Incharge Approval:**
```json
{
  "remarks": "Approved by Site Incharge - Site conditions verified. Storage space available. Delivery timeline acceptable."
}
```

**Admin Approval:**
```json
{
  "remarks": "Approved by Admin - All compliance requirements met. Vendor selection approved. Purchase order can be created."
}
```

---

## 5. Reject Demand
**Endpoint:** `POST /api/demands/:id/reject`
**Role Required:** PROJECT_MANAGER, SITE_INCHARGE, or ADMIN
**Note:** `remarks` field is MANDATORY for rejection

```json
{
  "remarks": "Rejected - Insufficient budget allocation. Alternative materials or reduced quantity required. Please revise the demand with cost-effective alternatives."
}
```

**Alternative Examples:**

**Budget Constraint:**
```json
{
  "remarks": "Rejected - Budget exceeded for this quarter. Please reduce quantity or defer to next quarter. Current budget allows only 30 bags maximum."
}
```

**Quality Issue:**
```json
{
  "remarks": "Rejected - Material specifications do not meet project standards. Please specify grade A cement instead of current specification."
}
```

**Timeline Issue:**
```json
{
  "remarks": "Rejected - Delivery timeline too aggressive. Supplier cannot meet 3-day delivery requirement. Please adjust timeline or find alternative supplier."
}
```

**Technical Issue:**
```json
{
  "remarks": "Rejected - Quantity calculation appears incorrect based on foundation area. Please recalculate and resubmit with accurate measurements."
}
```

---

## 6. Fulfill Demand from Head Store
**Endpoint:** `POST /api/demands/:id/fulfill`
**Role Required:** PROJECT_MANAGER or SITE_INCHARGE
**Prerequisites:** Demand must be APPROVED

```json
{
  "fromStoreId": "clxheadstore123456",
  "toStoreId": "clxcmstore654321",
  "quantity": 25,
  "notes": "Fulfilled from head store inventory. Delivered to CM store for immediate use."
}
```

**Alternative Examples:**

**Partial Fulfillment:**
```json
{
  "fromStoreId": "clxheadstore123456",
  "toStoreId": "clxcmstore654321",
  "quantity": 30,
  "notes": "Partial fulfillment - 30 bags transferred. Remaining 20 bags will be fulfilled when new stock arrives."
}
```

**Full Fulfillment:**
```json
{
  "fromStoreId": "clxheadstore123456",
  "toStoreId": "clxcmstore654321",
  "quantity": 50,
  "notes": "Complete fulfillment - All 50 bags transferred. Demand fully satisfied."
}
```

**With Detailed Notes:**
```json
{
  "fromStoreId": "clxheadstore123456",
  "toStoreId": "clxcmstore654321",
  "quantity": 25,
  "notes": "Fulfilled from head store inventory. Quality checked before transfer. Delivered to CM store for immediate use in foundation work. Transport arranged by site logistics team."
}
```

---

## Response Examples

### Successful Demand Creation Response:
```json
{
  "message": "Demand created successfully",
  "demand": {
    "id": "clxdemand123456789",
    "referenceNumber": "DEM001001001",
    "activity": "Foundation Work - Phase 1",
    "materialId": "clx1234567890abcdef",
    "quantity": 50,
    "unit": "bags",
    "sectionId": "clx0987654321fedcba",
    "notes": "Required for foundation concrete work",
    "remarks": "Urgent requirement for ongoing foundation work",
    "status": "REQUEST_SENT",
    "quantityFulfilled": 0,
    "quantityRemaining": 50,
    "isDeleted": false,
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z",
    "createdBy": "clxuser123456789",
    "updatedBy": null,
    "section": {
      "id": "clx0987654321fedcba",
      "name": "Section A",
      "code": "SEC001001",
      "project": {
        "id": "clxproject123456",
        "name": "Residential Complex",
        "code": "PR001"
      }
    },
    "material": {
      "id": "clx1234567890abcdef",
      "name": "Portland Cement",
      "unit": "bags",
      "description": "Standard Portland cement for construction"
    },
    "creator": {
      "id": "clxuser123456789",
      "name": "John Doe",
      "email": "john.doe@company.com",
      "role": "CONSTRUCTION_MANAGER"
    }
  }
}
```

### Successful Approval Response:
```json
{
  "message": "Demand approved successfully",
  "data": {
    "approval": {
      "id": "clxapproval123456",
      "demandId": "clxdemand123456789",
      "userId": "clxuser987654321",
      "status": "APPROVED",
      "remarks": "Approved - Material requirement is justified for the foundation work. Budget allocation confirmed.",
      "createdAt": "2024-01-15T11:00:00.000Z",
      "user": {
        "id": "clxuser987654321",
        "name": "Jane Smith",
        "role": "PROJECT_MANAGER"
      }
    },
    "demand": {
      "id": "clxdemand123456789",
      "referenceNumber": "DEM001001001",
      "status": "PARTIALLY_APPROVED",
      "approvals": [
        {
          "id": "clxapproval123456",
          "userId": "clxuser987654321",
          "status": "APPROVED",
          "remarks": "Approved - Material requirement is justified for the foundation work. Budget allocation confirmed.",
          "createdAt": "2024-01-15T11:00:00.000Z",
          "user": {
            "id": "clxuser987654321",
            "name": "Jane Smith",
            "role": "PROJECT_MANAGER"
          }
        }
      ]
    },
    "newStatus": "PARTIALLY_APPROVED"
  }
}
```

### Successful Fulfillment Response:
```json
{
  "message": "Demand fulfilled successfully",
  "data": {
    "fulfillment": {
      "id": "clxfulfillment123456",
      "demandId": "clxdemand123456789",
      "fromStoreId": "clxheadstore123456",
      "toStoreId": "clxcmstore654321",
      "quantity": 25,
      "fulfilledAt": "2024-01-15T14:30:00.000Z",
      "fromStore": {
        "id": "clxheadstore123456",
        "name": "Head Store - Section A",
        "type": "HEAD_STORE"
      },
      "toStore": {
        "id": "clxcmstore654321",
        "name": "CM Store - John Doe",
        "type": "CM_STORE"
      }
    },
    "demand": {
      "id": "clxdemand123456789",
      "referenceNumber": "DEM001001001",
      "status": "FULFILLED_FROM_STORE",
      "quantityRemaining": 25,
      "quantityFulfilled": 25,
      "fulfillments": [
        {
          "id": "clxfulfillment123456",
          "fromStore": {
            "id": "clxheadstore123456",
            "name": "Head Store - Section A",
            "type": "HEAD_STORE"
          },
          "toStore": {
            "id": "clxcmstore654321",
            "name": "CM Store - John Doe",
            "type": "CM_STORE"
          },
          "quantity": 25,
          "fulfilledAt": "2024-01-15T14:30:00.000Z"
        }
      ]
    },
    "remainingQuantity": 25
  }
}
```

---

## Error Response Examples

### Unauthorized Access:
```json
{
  "status": "error",
  "message": "Only Construction Managers can create demands",
  "statusCode": 403
}
```

### Validation Error:
```json
{
  "status": "error",
  "message": "activity, sectionId, materialId, quantity, and unit are required",
  "statusCode": 400
}
```

### Insufficient Stock:
```json
{
  "status": "error",
  "message": "Insufficient stock in head store. Available: 15, Requested: 25",
  "statusCode": 400
}
```

### Already Approved:
```json
{
  "status": "error",
  "message": "You have already provided feedback for this demand",
  "statusCode": 400
}
``` 