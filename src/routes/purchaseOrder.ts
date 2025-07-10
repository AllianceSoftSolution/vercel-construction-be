import express from 'express';
import {
  createPurchaseOrder,
  getPurchaseOrders,
  getPurchaseOrder,
  updatePurchaseOrder,
  deletePurchaseOrder,
  getPurchaseOrdersByVendor,
  getPurchaseOrderSummary,
  getDemandPOStatistics
} from '../controllers/purchaseOrder.controller';
import protect from '../middlewares/auth.middleware';

const router = express.Router();

// Purchase Order routes (all protected)
router.post('/', protect, createPurchaseOrder);
router.get('/', protect, getPurchaseOrders);
router.get('/summary', protect, getPurchaseOrderSummary);
router.get('/vendor', protect, getPurchaseOrdersByVendor);
router.get('/:id', protect, getPurchaseOrder);
router.put('/:id', protect, updatePurchaseOrder);
router.delete('/:id', protect, deletePurchaseOrder);
router.get('/demand/:demandId/statistics', protect, getDemandPOStatistics);

export default router; 