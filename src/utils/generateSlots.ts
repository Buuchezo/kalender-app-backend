import {
  addMinutes,
  eachDayOfInterval,
  endOfMonth,
  format,
  getDay,
  startOfMonth,
} from "date-fns";
import { Request, Response, NextFunction } from "express";
import { AppointmentModel } from "../models/appointmentModel";
export interface CalendarEventInput {
  title: string;
  description: string;
  start: string;
  end: string;
  calendarId: string;
}

export async function generateSlotsMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { year, month } = req.body;

    if (typeof year !== "number" || typeof month !== "number") {
      res
        .status(400)
        .json({ message: "Year and month must be provided as numbers." });
      return;
    }

    const monthStart = new Date(year, month, 1);
    const monthEnd = endOfMonth(monthStart);

    // 🔍 Check if slots already exist for this month
    const existing = await AppointmentModel.find({
      start: { $gte: monthStart, $lte: monthEnd },
      calendarId: "available",
    });

    if (existing.length > 0) {
      res.status(200).json({
        message: "Slots already exist for this month. No new slots generated.",
        data: { appointments: existing },
      });
      return;
    }

    const daysInMonth = eachDayOfInterval({
      start: startOfMonth(monthStart),
      end: monthEnd,
    });

    const slots = [];

    for (const date of daysInMonth) {
      const dayOfWeek = getDay(date); // 0 = Sunday, 6 = Saturday

      let startHour: number | null = null;
      let endHour: number | null = null;

      if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        // Weekdays
        startHour = 8;
        endHour = 16;
      } else if (dayOfWeek === 6) {
        // Saturday
        startHour = 9;
        endHour = 13;
      } else {
        // Sunday - skip
        continue;
      }

      let current = new Date(date);
      current.setHours(startHour, 0, 0, 0);
      const end = new Date(date);
      end.setHours(endHour, 0, 0, 0);

      while (current < end) {
        const slotStart = new Date(current);
        const slotEnd = addMinutes(slotStart, 60);

        slots.push({
          title: "Available Slot",
          description: "",
          start: slotStart, // ✅ stored as Date object
          end: slotEnd, // ✅ stored as Date object
          calendarId: "available",
          remainingCapacity: 3,
          formattedStart: format(slotStart, "yyyy-MM-dd HH:mm"), // 🟢 for ScheduleX/frontend
          formattedEnd: format(slotEnd, "yyyy-MM-dd HH:mm"),
        });

        current = slotEnd;
      }
    }

    req.body.slots = slots;
    next();
  } catch (err) {
    console.error("Slot generation error:", err);
    res
      .status(500)
      .json({ message: "Internal server error while generating slots." });
  }
}
