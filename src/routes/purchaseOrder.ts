import express from 'express';
import * as purchaseOrderController from '../controllers/purchaseOrder.controller';

const router = express.Router();

// ... existing routes ...

// Accountant adds amount to a PO item
router.patch('/purchase-orders/items/:itemId/add-amount', purchaseOrderController.addPOItemAmount);

export default router; 