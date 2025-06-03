import express from 'express'
import {
  getAllInternalEvents,
  createInternalEvent,
  getInternalEvent,
  deleteInternalEvent,
  updateInternalEvent,
} from '../controllers/internalEventsController'

const router = express.Router()

router.get('/', getAllInternalEvents)
router.get('/:id', getInternalEvent)
router.delete('/:id', deleteInternalEvent)
router.patch('/:id', updateInternalEvent)
router.post('/', createInternalEvent)

export default router
