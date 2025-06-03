"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateEventMiddleware = updateEventMiddleware;
const date_fns_1 = require("date-fns");
const appointmentModel_1 = require("../src/models/appointmentModel");
const userModel_1 = require("../src/models/userModel");
function normalizeToScheduleXFormat(datetime) {
    try {
        return (0, date_fns_1.format)((0, date_fns_1.parseISO)(datetime), 'yyyy-MM-dd HH:mm');
    }
    catch (_a) {
        return datetime;
    }
}
function generateAvailableSlotsBetween(start, end, idSeedStart) {
    const slots = [];
    let idSeed = idSeedStart;
    let current = new Date(start);
    while ((0, date_fns_1.addMinutes)(current, 60) <= end) {
        const slotEnd = (0, date_fns_1.addMinutes)(current, 60);
        if (slotEnd <= end) {
            slots.push({
                id: idSeed++,
                title: 'Available Slot',
                description: '',
                start: (0, date_fns_1.format)(current, 'yyyy-MM-dd HH:mm'),
                end: (0, date_fns_1.format)(slotEnd, 'yyyy-MM-dd HH:mm'),
                calendarId: 'available',
            });
        }
        current = slotEnd;
    }
    return { slots, nextId: idSeed };
}
async function updateEventMiddleware(req, res, next) {
    var _a, _b;
    try {
        const { eventData } = req.body;
        if (!eventData || !eventData.id || !eventData.start || !eventData.end) {
            res.status(400).json({ message: 'Missing event update data.' });
            return;
        }
        const formattedStart = normalizeToScheduleXFormat(eventData.start);
        const formattedEnd = normalizeToScheduleXFormat(eventData.end);
        const original = await appointmentModel_1.AppointmentModel.findById(eventData.id);
        if (!original) {
            res.status(404).json({ message: 'Original appointment not found.' });
            return;
        }
        // Remove the old appointment
        await appointmentModel_1.AppointmentModel.findByIdAndDelete(eventData.id);
        const originalStart = (0, date_fns_1.parseISO)(original.start);
        const originalEnd = (0, date_fns_1.parseISO)(original.end);
        const newStart = (0, date_fns_1.parseISO)(formattedStart);
        const newEnd = (0, date_fns_1.parseISO)(formattedEnd);
        // Remove any conflicting "Available Slot" entries
        await appointmentModel_1.AppointmentModel.deleteMany({
            title: 'Available Slot',
            $or: [
                {
                    start: { $gte: formattedStart, $lt: formattedEnd },
                },
                {
                    end: { $gt: formattedStart, $lte: formattedEnd },
                },
            ],
        });
        // Get the worker name again
        const assignedWorker = await userModel_1.UserModel.findById(original.ownerId);
        const dynamicTitle = assignedWorker
            ? `Booked Appointment with ${assignedWorker.firstName}`
            : 'Booked Appointment';
        // Save the updated appointment
        const updated = await appointmentModel_1.AppointmentModel.create({
            id: original.id,
            title: dynamicTitle,
            description: eventData.description || original.description || '',
            start: formattedStart,
            end: formattedEnd,
            calendarId: 'booked',
            ownerId: original.ownerId,
            clientId: original.clientId,
            clientName: (_b = (_a = eventData.clientName) !== null && _a !== void 0 ? _a : original.clientName) !== null && _b !== void 0 ? _b : 'Guest',
        });
        // Generate and insert free slots from before/after rescheduled range
        const idSeed = Date.now() + 1;
        const { slots: beforeSlots, nextId } = generateAvailableSlotsBetween(originalStart, newStart, idSeed);
        const { slots: afterSlots } = generateAvailableSlotsBetween(newEnd, originalEnd, nextId);
        if (beforeSlots.length)
            await appointmentModel_1.AppointmentModel.insertMany(beforeSlots);
        if (afterSlots.length)
            await appointmentModel_1.AppointmentModel.insertMany(afterSlots);
        req.body.updatedAppointment = updated;
        next();
    }
    catch (err) {
        console.error('Update event error:', err);
        res.status(500).json({ message: err instanceof Error ? err.message : 'Server error' });
        return;
    }
}
