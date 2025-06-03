"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateSlotsMiddleware = generateSlotsMiddleware;
const date_fns_1 = require("date-fns");
function generateSlotsMiddleware(req, res, next) {
    const { year, month } = req.body;
    if (typeof year !== "number" || typeof month !== "number") {
        res
            .status(400)
            .json({ message: "Year and month must be provided as numbers." });
        return;
    }
    const daysInMonth = (0, date_fns_1.eachDayOfInterval)({
        start: (0, date_fns_1.startOfMonth)(new Date(year, month)),
        end: (0, date_fns_1.endOfMonth)(new Date(year, month)),
    });
    const slots = [];
    for (const date of daysInMonth) {
        const dayOfWeek = (0, date_fns_1.getDay)(date);
        let startHour = null;
        let endHour = null;
        if (dayOfWeek >= 1 && dayOfWeek <= 5) {
            startHour = 8;
            endHour = 16;
        }
        else if (dayOfWeek === 6) {
            startHour = 9;
            endHour = 13;
        }
        else {
            continue;
        }
        let current = new Date(date);
        current.setHours(startHour, 0, 0, 0);
        const end = new Date(date);
        end.setHours(endHour, 0, 0, 0);
        while (current < end) {
            const slotEnd = (0, date_fns_1.addMinutes)(current, 60);
            slots.push({
                title: "Available Slot",
                description: "",
                start: (0, date_fns_1.format)(current, "yyyy-MM-dd HH:mm"),
                end: (0, date_fns_1.format)(slotEnd, "yyyy-MM-dd HH:mm"),
                calendarId: "available",
            });
            current = slotEnd;
        }
    }
    req.body.slots = slots;
    next();
}
