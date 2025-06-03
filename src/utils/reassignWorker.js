"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reassignAppointmentsMiddleware = reassignAppointmentsMiddleware;
const appointmentModel_1 = require("../src/models/appointmentModel");
const userModel_1 = require("../src/models/userModel");
const date_fns_1 = require("date-fns");
async function reassignAppointmentsMiddleware(req, res, next) {
    var _a, _b, _c, _d;
    try {
        const { sickWorkerId } = req.body;
        if (!sickWorkerId) {
            res.status(400).json({ message: 'sickWorkerId is required.' });
            return;
        }
        const [events, workers] = await Promise.all([
            appointmentModel_1.AppointmentModel.find(),
            userModel_1.UserModel.find({ role: 'worker' }),
        ]);
        const sickWorkers = [sickWorkerId];
        const updatedEvents = [];
        const appointmentsToReassign = events.filter((e) => { var _a; return e.ownerId === sickWorkerId && ((_a = e.title) === null || _a === void 0 ? void 0 : _a.startsWith('Booked Appointment')); });
        for (const appointment of appointmentsToReassign) {
            const start = (0, date_fns_1.parseISO)(appointment.start);
            const end = (0, date_fns_1.parseISO)(appointment.end);
            const availableWorker = workers.find((w) => w.id !== sickWorkerId &&
                !events.some((e) => e.ownerId === w.id &&
                    (0, date_fns_1.parseISO)(e.start) < end &&
                    (0, date_fns_1.parseISO)(e.end) > start));
            const doc = appointment.toObject();
            if (availableWorker) {
                const reassigned = {
                    title: `Booked Appointment with ${availableWorker.firstName}`,
                    description: doc.description,
                    start: doc.start,
                    end: doc.end,
                    calendarId: doc.calendarId,
                    ownerId: availableWorker.id.toString(),
                    clientId: (_a = doc.clientId) === null || _a === void 0 ? void 0 : _a.toString(),
                    clientName: doc.clientName,
                    sharedWith: (_b = doc.sharedWith) === null || _b === void 0 ? void 0 : _b.map((id) => id.toString()),
                    visibility: doc.visibility,
                };
                updatedEvents.push(reassigned);
            }
            else {
                for (const altWorker of workers.filter((w) => w.id !== sickWorkerId)) {
                    const candidateSlots = events.filter((e) => e.title === 'Available Slot' &&
                        !sickWorkers.includes(altWorker.id));
                    for (const slot of candidateSlots) {
                        const slotStart = (0, date_fns_1.parseISO)(slot.start);
                        const durationMinutes = (end.getTime() - start.getTime()) / 60000;
                        const slotEnd = (0, date_fns_1.addMinutes)(slotStart, durationMinutes);
                        const conflict = events.some((e) => e.ownerId === altWorker.id &&
                            (0, date_fns_1.parseISO)(e.start) < slotEnd &&
                            (0, date_fns_1.parseISO)(e.end) > slotStart);
                        if (!conflict) {
                            // Remove original appointment
                            events.splice(events.findIndex((e) => e.id === appointment.id), 1);
                            // Remove conflicting slots
                            const slotsToRemove = events.filter((e) => e.title === 'Available Slot' &&
                                (0, date_fns_1.parseISO)(e.start) >= slotStart &&
                                (0, date_fns_1.parseISO)(e.end) <= slotEnd);
                            const cleanedEvents = events.filter((e) => !slotsToRemove.includes(e));
                            const newAppointment = {
                                title: `Booked Appointment with ${altWorker.firstName}`,
                                description: doc.description,
                                start: (0, date_fns_1.format)(slotStart, 'yyyy-MM-dd HH:mm'),
                                end: (0, date_fns_1.format)(slotEnd, 'yyyy-MM-dd HH:mm'),
                                calendarId: doc.calendarId,
                                ownerId: altWorker.id.toString(),
                                clientId: (_c = doc.clientId) === null || _c === void 0 ? void 0 : _c.toString(),
                                clientName: doc.clientName,
                                sharedWith: (_d = doc.sharedWith) === null || _d === void 0 ? void 0 : _d.map((id) => id.toString()),
                                visibility: doc.visibility,
                            };
                            updatedEvents.push(newAppointment);
                            events.splice(0, events.length, ...cleanedEvents);
                            break;
                        }
                    }
                }
            }
        }
        // Delete all original booked appointments for sick worker
        await appointmentModel_1.AppointmentModel.deleteMany({
            ownerId: sickWorkerId,
            title: /Booked Appointment/,
        });
        // Insert reassigned appointments
        if (updatedEvents.length > 0) {
            await appointmentModel_1.AppointmentModel.insertMany(updatedEvents);
        }
        req.body.updatedEvents = updatedEvents;
        next();
    }
    catch (err) {
        console.error('Reassignment error:', err);
        res.status(500).json({
            status: 'fail',
            message: err instanceof Error ? err.message : 'Internal server error',
        });
    }
}
