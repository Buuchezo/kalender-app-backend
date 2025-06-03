"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bookAppointmentMiddleware = bookAppointmentMiddleware;
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
async function bookAppointmentMiddleware(req, res, next) {
    var _a, _b, _c;
    try {
        const { eventData } = req.body;
        if (!eventData || !eventData.start || !eventData.end) {
            return res.status(400).json({ message: 'Missing required event data.' });
        }
        const formattedStart = normalizeToScheduleXFormat(eventData.start);
        const formattedEnd = normalizeToScheduleXFormat(eventData.end);
        const [events, workers] = await Promise.all([
            appointmentModel_1.AppointmentModel.find(),
            userModel_1.UserModel.find({ role: 'worker' }),
        ]);
        const user = eventData.clientId && typeof eventData.clientId === 'string'
            ? await userModel_1.UserModel.findById(eventData.clientId)
            : null;
        const overlapping = events.filter((e) => {
            var _a;
            return ((_a = e.title) === null || _a === void 0 ? void 0 : _a.startsWith('Booked Appointment')) &&
                (0, date_fns_1.parseISO)(e.start) < (0, date_fns_1.parseISO)(formattedEnd) &&
                (0, date_fns_1.parseISO)(e.end) > (0, date_fns_1.parseISO)(formattedStart);
        });
        const freeWorker = workers.find((worker) => !overlapping.some((appt) => appt.ownerId === worker.id));
        if (!freeWorker) {
            // No worker available — delete the slot so it's no longer bookable
            await appointmentModel_1.AppointmentModel.findOneAndDelete({
                title: 'Available Slot',
                start: formattedStart,
                end: formattedEnd,
                calendarId: 'available',
            });
            return res.status(409).json({ message: 'No available workers for this time slot.' });
        }
        // Worker available — update the slot to booked
        const updated = await appointmentModel_1.AppointmentModel.findOneAndUpdate({
            title: 'Available Slot',
            start: formattedStart,
            end: formattedEnd,
            calendarId: 'available',
        }, {
            $set: {
                title: `Booked Appointment with ${freeWorker.firstName}`,
                calendarId: 'booked',
                description: eventData.description || '',
                ownerId: freeWorker.id,
                clientId: (_a = eventData.clientId) !== null && _a !== void 0 ? _a : `guest-${Date.now()}`,
                clientName: (_c = (_b = eventData.clientName) !== null && _b !== void 0 ? _b : user === null || user === void 0 ? void 0 : user.firstName) !== null && _c !== void 0 ? _c : 'Guest',
            },
        }, { new: true });
        if (!updated) {
            return res.status(404).json({ message: 'Matching available slot not found.' });
        }
        req.body.updatedAppointment = updated;
        next();
    }
    catch (err) {
        console.error('Booking error:', err);
        res.status(500).json({
            message: err instanceof Error ? err.message : 'Internal server error',
        });
    }
}
