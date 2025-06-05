import { Request, Response, NextFunction } from "express";
import { parseISO, format, addMinutes } from "date-fns";
import { AppointmentModel } from "../models/appointmentModel";
import { UserModel } from "../models/userModel";
import { IUser } from "../models/userModel";
import { ObjectId } from "mongodb";

interface AuthenticatedRequest extends Request {
  user?: IUser;
}

function normalizeToScheduleXFormat(datetime: string): string {
  try {
    return format(parseISO(datetime), "yyyy-MM-dd HH:mm");
  } catch {
    return datetime;
  }
}

export async function bookAppointmentMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const { eventData } = req.body;

    if (!eventData || !eventData.id || !eventData.start || !eventData.end) {
      return res.status(400).json({ message: "Missing required event data." });
    }

    const formattedStart = normalizeToScheduleXFormat(eventData.start);
    const formattedEnd = normalizeToScheduleXFormat(eventData.end);

    const original = await AppointmentModel.findById(eventData.id);
    if (!original) {
      return res
        .status(404)
        .json({ message: "Original appointment not found." });
    }

    const originalStart = parseISO(original.start);
    const originalEnd = parseISO(original.end);
    const newStart = parseISO(formattedStart);
    const newEnd = parseISO(formattedEnd);

    // Remove overlapping available slots
    await AppointmentModel.deleteMany({
      title: "Available Slot",
      $or: [
        {
          start: { $gte: formattedStart, $lt: formattedEnd },
        },
        {
          end: { $gt: formattedStart, $lte: formattedEnd },
        },
      ],
    });

    // Get the original assigned worker
    const workers = await UserModel.find({ role: "worker" });
    const assignedWorker = workers.find(
      (w) =>
        w.id?.toString?.() === original.ownerId?.toString?.() ||
        w._id?.toString?.() === original.ownerId?.toString?.()
    );

    const dynamicTitle = assignedWorker
      ? `Booked Appointment with ${assignedWorker.firstName}`
      : "Booked Appointment";

    // Update the appointment
    original.title = dynamicTitle;
    original.description = eventData.description || "";
    original.start = formattedStart;
    original.end = formattedEnd;
    original.calendarId = "booked";
    original.clientName =
      eventData.clientName ?? original.clientName ?? "Guest";

    await original.save();

    // Generate available slots to fill any gaps
    const idSeedStart = Date.now() + 1;

    const generateAvailableSlotsBetween = (
      start: Date,
      end: Date,
      idSeed: number
    ) => {
      const slots: any[] = [];
      let current = new Date(start);

      while (addMinutes(current, 60) <= end) {
        const slotEnd = addMinutes(current, 60);
        if (slotEnd <= end) {
          slots.push({
            id: idSeed++,
            title: "Available Slot",
            description: "",
            start: normalizeToScheduleXFormat(current.toISOString()),
            end: normalizeToScheduleXFormat(slotEnd.toISOString()),
            calendarId: "available",
          });
        }
        current = slotEnd;
      }

      return { slots, nextId: idSeed };
    };

    const { slots: beforeSlots, nextId: idAfterBefore } =
      generateAvailableSlotsBetween(originalStart, newStart, idSeedStart);

    const { slots: afterSlots } = generateAvailableSlotsBetween(
      newEnd,
      originalEnd,
      idAfterBefore
    );

    const allSlots = [...beforeSlots, ...afterSlots];
    if (allSlots.length > 0) {
      await AppointmentModel.insertMany(allSlots);
    }

    req.body.updatedAppointment = original;
    next();
  } catch (err) {
    console.error("Booking error:", err);
    res.status(500).json({
      message: err instanceof Error ? err.message : "Internal server error",
    });
  }
}
